import { AI_CODING_TIMEOUT_MS, AI_TIMEOUT_MS, AiProviderError, getAiProvider } from "@/lib/ai";
import { LeadingCleanGate, stripFiller } from "@/lib/ai/clean-reply";
import { resolveChatMode, resolveModeConfig } from "@/lib/ai/modes";
import { modeSystemPrompt } from "@/lib/ai/mode-prompts";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { generateReply } from "@/lib/ai/reply";
import {
  formatCodingFile,
  formatCodingTree,
  generateCodingFile,
  isExplicitCodeBuildRequest,
  isFollowUpSingleFileEdit,
  isMultiFileCodingRequest,
  planCodingTask,
  readCodingTaskProgress,
  type CodingTaskProgress,
} from "@/lib/ai/coding-task";
import {
  createAgentCheckpoint,
  createDefaultToolRegistry,
  executeNextAgentStep,
  readAgentCheckpoint,
  type AgentCheckpoint,
} from "@/lib/ai/agent";
import {
  formatAgentStepNote,
  isAgentTaskRequest,
  planAgentSteps,
  resolveAgentAction,
  stripAgentPrefix,
  synthesizeAgentAnswer,
} from "@/lib/ai/agent/runner";
import { Prisma } from "@/generated/prisma/client";
import type { AiErrorCode, AiHistoryMessage } from "@/lib/ai/types";
import { ApiError, apiErrors, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin, hashedClientId } from "@/lib/api/security";
import { createSseStream, SSE_HEADERS } from "@/lib/api/sse";
import { getApiUserId } from "@/lib/auth/api";
import { attachmentMeta, composePrompt, DEFAULT_TITLE, makeTitle } from "@/lib/chat/compose";
import { db } from "@/lib/db";
import { chatImageAttachment, loadChatImages } from "@/lib/image/store";
import {
  createCommandTagStreamFilter,
  executeChatCommands,
  executeChatCommandsWithState,
  extractWorkspaceFilesFromHistory,
  formatTerminalToolBlock,
  formatToolObservationForModel,
  parseSlashCommand,
  stripProximaCommandTags,
} from "@/lib/sandbox/chat-command-bridge";
import { createCommandPromptState } from "@/lib/sandbox/command-prompt";
import { IMAGE_LIMITS } from "@/lib/image/limits";
import { cleanIdentityLeaks, identitySystemSection } from "@/lib/identity";
import { memoryEnabled, memoryPrompt, relevantMemories, rememberMessage } from "@/lib/memory/store";
import { enforceRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { resolveSelectedSkills, skillPromptSection } from "@/lib/skills/runtime";
import { chatRequestSchema, LIMITS } from "@/lib/validation";

/**
 * POST /api/chat — send a message, receive the reply as a live stream (SSE).
 *
 * Signed in → saved to your conversation, limit 20 messages/minute.
 * Guest (landing-page demo) → not saved, max 500 characters, limit 5/minute.
 *
 * Events sent to the browser, in order:
 *   meta       { mode, answerMode, conversationId, title, userMessageId }
 *   status     { state: "thinking" | "waking", message? }
 *   reasoning  { text }   ← only if the browser asked (Settings → Show reasoning)
 *   file-preview { path, text } ← transient, unverified draft (never persisted)
 *   token      { text }   ← many of these; the answer as it is written
 *   done       { messageId, latencyMs, source, mode, text }  ← `text` is the final,
 *                                                         cleaned answer
 *   error      { code, message, retryable }            ← instead of done
 *
 * Answer text is stored; reasoning never touches the database. Incomplete replies
 * retain progress so the UI can offer a safe resume instead of presenting them as finished.
 */
export const maxDuration = 300; // seconds; hosting plans may enforce a lower limit

const WAKING_AFTER_MS = 4_000;
const HEARTBEAT_MS = 15_000;

const FRIENDLY_ERRORS: Record<AiErrorCode, string> = {
  timeout: "The engine took too long to answer. Please try again.",
  unavailable: "Couldn't reach the engine. It may be waking up — try again in a few seconds.",
  upstream: "The engine had a problem answering. Please try again.",
  bad_response: "The engine sent an unexpected answer. Please try again.",
  aborted: "The request was cancelled.",
};

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await getApiUserId();
  const input = chatRequestSchema.parse(await readJson(request, 512 * 1024));
  const attachments = input.attachments ?? [];
  const imageIds = (input.images ?? []).map((image) => image.id);
  const showReasoning = input.showReasoning === true;
  /** Fast / Thinking / Coding / Analyze — see src/lib/ai/modes.ts. */
  const mode = resolveChatMode(input.mode);
  const explicitAgentIntent = isAgentTaskRequest(input.message, input.agentMode);
  const multiFileIntent =
    !explicitAgentIntent &&
    isMultiFileCodingRequest(
      [input.message, ...attachments.map((attachment) => attachment.name)].join("\n"),
    );
  let answerMode = multiFileIntent ? "coding" : mode;
  const modeConfig = resolveModeConfig(answerMode);
  /** Temporary chats are never written to the database and never touch memory. */
  const temporary = input.temporary === true;
  if (
    input.codingContinue &&
    (!userId || temporary || !input.conversationId || !input.retry || !input.codingStep)
  ) {
    throw apiErrors.badRequest("Invalid coding continuation.");
  }
  if (input.agentContinue && (!userId || temporary || !input.conversationId || !input.retry)) {
    throw apiErrors.badRequest("Invalid agent continuation.");
  }

  // ── Guest demo rules ──
  if (!userId) {
    if (attachments.length) throw new ApiError(401, "sign_in_required", "Sign in to attach files.");
    if (imageIds.length) throw new ApiError(401, "sign_in_required", "Sign in to attach pictures.");
    if (input.conversationId) throw apiErrors.unauthorized();
    if (input.message.length > LIMITS.demoMessageMax) {
      throw apiErrors.badRequest(
        `Demo messages are limited to ${LIMITS.demoMessageMax} characters. Sign in for more.`,
      );
    }
  }

  // ── Rate limit ──
  const rate = userId
    ? await enforceRateLimit(
        `chat:user:${userId}`,
        RATE_LIMITS.chatUser,
        "You're sending messages quickly — please wait a moment (limit: 20 per minute).",
      )
    : await enforceRateLimit(
        `chat:guest:${hashedClientId(request)}`,
        RATE_LIMITS.chatGuest,
        "Demo limit reached (5 messages per minute). Sign in for more, or wait a moment.",
      );

  // Resolve only app-owned skills the signed-in user has installed, enabled,
  // and selected in Settings. The request carries IDs, never instructions or code.
  const skills = await resolveSelectedSkills(userId, input.skills ?? []);

  // ── Pictures belonging to this person ──
  // The browser only sends ids; the bytes (and the size) come from the database,
  // so a message can't pretend to include a picture it doesn't own.
  const pictures = userId && imageIds.length ? await loadChatImages(userId, imageIds) : [];
  if (imageIds.length && pictures.length !== imageIds.length) {
    throw apiErrors.badRequest("One of those pictures is no longer available. Please attach it again.");
  }
  const messageAttachments = [
    ...attachmentMeta(attachments),
    ...pictures.map((picture) => chatImageAttachment(picture)),
  ];

  // ── Save the user's message (signed-in only) ──
  let conversationId: string | null = null;
  let title: string | null = null;
  let userMessageId: string | null = null;
  /** Turns read alongside the conversation, before this message was saved. */
  let priorMessages: {
    id: string;
    role: AiHistoryMessage["role"];
    content: string;
    attachments: Prisma.JsonValue | null;
  }[] = [];
  let resumedAssistant: { id: string; content: string; progress: unknown } | null = null;
  let resumeCodingProgress: CodingTaskProgress | null = null;
  let resumeAgentCheckpoint: AgentCheckpoint | null = null;

  if (userId && !temporary) {
    const userMessage = {
      role: "user" as const,
      content: input.message,
      ...(messageAttachments.length ? { attachments: messageAttachments } : {}),
    };

    if (input.conversationId) {
      const existing = await db.conversation.findFirst({
        where: { id: input.conversationId, userId },
        select: {
          id: true,
          title: true,
          _count: { select: { messages: true } },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            // Read the context now: after saving the new message, this is
            // exactly the history the AI needs. One fewer round-trip than a
            // separate query afterwards.
            take: Math.max(modeConfig.historyLimit, 2),
            select: { id: true, role: true, content: true, attachments: true, generationProgress: true },
          },
        },
      });
      if (!existing) throw apiErrors.notFound("Conversation not found");
      conversationId = existing.id;
      title =
        existing._count.messages === 0 && existing.title === DEFAULT_TITLE
          ? makeTitle(input.message)
          : existing.title;

      const last = existing.messages[0];
      const previous = existing.messages[1];
      const canResume =
        input.retry === true &&
        last?.role === "assistant" &&
        last.generationProgress !== null &&
        previous?.role === "user" &&
        previous.content === input.message;
      if (input.codingContinue && (!canResume || !readCodingTaskProgress(last?.generationProgress))) {
        throw new ApiError(
          409,
          "stale_checkpoint",
          "The coding checkpoint is no longer available. Reload the conversation before retrying.",
        );
      }
      if (input.agentContinue && (!canResume || !readAgentCheckpoint(last?.generationProgress))) {
        throw new ApiError(
          409,
          "stale_checkpoint",
          "The agent checkpoint is no longer available. Reload the conversation before retrying.",
        );
      }
      if (canResume) {
        resumedAssistant = { id: last.id, content: last.content, progress: last.generationProgress };
        resumeCodingProgress = readCodingTaskProgress(last.generationProgress);
        resumeAgentCheckpoint = readAgentCheckpoint(last.generationProgress);
        const savedMode = (last.generationProgress as { mode?: unknown } | null)?.mode;
        if (resumeCodingProgress || savedMode === "coding") answerMode = "coding";
        priorMessages = existing.messages.slice(2);
        userMessageId = previous.id;
      } else {
        priorMessages = existing.messages;
        if (input.retry && last?.role === "user" && last.content === input.message) {
          // Retry: the user's message is already saved — just answer it again.
          userMessageId = last.id;
        } else {
          const [created] = await db.$transaction([
            db.message.create({ data: { ...userMessage, conversationId }, select: { id: true } }),
            db.conversation.update({ where: { id: conversationId }, data: { title, updatedAt: new Date() } }),
          ]);
          userMessageId = created.id;
        }
      }
    } else {
      title = makeTitle(input.message);
      const created = await db.conversation.create({
        data: { userId, title, messages: { create: userMessage } },
        select: { id: true, messages: { select: { id: true } } },
      });
      conversationId = created.id;
      userMessageId = created.messages[0]?.id ?? null;
    }
  }

  // ── Context: the last 20 messages of this conversation ──
  // Signed in: read from the database (the browser can't rewrite its own history).
  // Guest: use the turns the demo sent (nothing is stored on the server).
  const history: AiHistoryMessage[] = [];
  if (userId && conversationId && !temporary) {
    // `priorMessages` is newest-first; the prompt wants oldest-first. On a
    // retry the last user message is the one being answered again, so it is
    // sent separately and must not be duplicated here.
    for (const m of priorMessages.slice().reverse()) {
      if (m.id === userMessageId) continue;
      history.push({ role: m.role, content: m.content });
    }
  } else if (input.history) {
    // Guests (and temporary chats) keep their context in the browser only.
    history.push(
      ...input.history.slice(-modeConfig.historyLimit).map(({ role, content }) => ({ role, content })),
    );
  }
  if (resumedAssistant && !resumeCodingProgress && !resumeAgentCheckpoint && resumedAssistant.content) {
    // A partial non-project reply is context for the resumed request, not a completed turn.
    history.push({ role: "assistant", content: resumedAssistant.content });
  }

  // Re-read only the most recent image-bearing user turn in this conversation's
  // context window. Never trust browser history for saved chats, and always
  // load bytes with the owner's ID. New attachments take precedence.
  let contextImageIds: string[] = [];
  if (userId && !imageIds.length) {
    if (conversationId && !temporary) {
      for (const turn of priorMessages) {
        if (turn.role !== "user" || turn.id === userMessageId || !Array.isArray(turn.attachments)) continue;
        const ids = turn.attachments
          .flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return [];
            return item.kind === "image" && typeof item.imageId === "string" ? [item.imageId] : [];
          })
          .slice(0, IMAGE_LIMITS.perMessage);
        if (ids.length) {
          contextImageIds = ids;
          break;
        }
      }
    } else if (temporary) {
      const lastWithImages = input.history
        ?.slice(-modeConfig.historyLimit)
        .reverse()
        .find((turn) => turn.role === "user" && turn.images?.length);
      contextImageIds = lastWithImages?.images?.map((image) => image.id) ?? [];
    }
  }
  const contextPictures =
    userId && contextImageIds.length ? await loadChatImages(userId, contextImageIds) : [];
  const providerPictures = pictures.length ? pictures : contextPictures;
  const imageContextNote = contextImageIds.length
    ? contextPictures.length === contextImageIds.length
      ? "\n\n[The provided picture(s) are from the most recent earlier image-bearing user message, not newly attached. Use them only if relevant to the current request.]"
      : "\n\n[Some or all pictures from the most recent earlier image-bearing message are no longer available. Do not guess details that require a missing image; ask for it again if needed.]"
    : "";

  // ── Memory (Settings → Memory; off unless the person turned it on) ──
  // Reading is a single indexed query; learning is deterministic (no AI call),
  // so neither one can delay the first token of the reply.
  const useMemory = Boolean(userId) && !temporary && (await memoryEnabled(userId!));
  const memories = useMemory ? await relevantMemories(userId!, input.message) : [];
  const memorySection = memories.length ? memoryPrompt(memories) : "";
  const identitySection = identitySystemSection();
  // The mode's rules are appended last, so they win over the general prompt.
  const skillSection = skillPromptSection(skills);
  const system = modeSystemPrompt(
    [SYSTEM_PROMPT, identitySection, memorySection, skillSection].filter(Boolean).join("\n\n"),
    answerMode,
  );

  // ── Stream the reply ──
  const provider = getAiProvider(answerMode);
  const prompt = composePrompt(input.message, attachments, pictures.length) + imageContextNote;
  const sessionId = conversationId ?? `demo-${input.demoSessionId ?? crypto.randomUUID()}`;

  const clientGone = new AbortController();
  const timeout = AbortSignal.timeout(answerMode === "coding" ? AI_CODING_TIMEOUT_MS() : AI_TIMEOUT_MS());
  const signal = AbortSignal.any([clientGone.signal, timeout]);
  const interruptedError = () =>
    timeout.aborted
      ? new AiProviderError("The generation deadline expired", "timeout")
      : new AiProviderError("Request was cancelled", "aborted");
  request.signal?.addEventListener("abort", () => clientGone.abort(), { once: true });

  const stream = createSseStream(
    async (sse) => {
      sse.send("meta", {
        mode: userId ? "user" : "guest",
        answerMode,
        conversationId,
        title,
        userMessageId,
        ...(resumedAssistant?.content ? { resumeText: resumedAssistant.content } : {}),
      });
      sse.send("status", { state: "thinking" });

      const started = Date.now();
      let raw = resumedAssistant?.content ?? "";
      let sentText = raw;
      let receivedAny = Boolean(raw);
      const gate = new LeadingCleanGate();

      const waking = setTimeout(() => {
        if (!receivedAny) {
          sse.send("status", {
            state: "waking",
            message: "Waking up the engine… the first reply can take up to a minute.",
          });
        }
      }, WAKING_AFTER_MS);
      const heartbeat = setInterval(() => sse.ping(), HEARTBEAT_MS);

      let assistantMessageId = resumedAssistant?.id ?? null;
      const persistAssistant = async (
        content: string,
        latencyMs: number | null,
        generationProgress: Prisma.InputJsonValue | typeof Prisma.DbNull,
      ) => {
        if (!conversationId || (!content && generationProgress === Prisma.DbNull)) return null;
        if (assistantMessageId) {
          await db.$transaction([
            db.message.update({
              where: { id: assistantMessageId },
              data: { content, latencyMs, generationProgress },
            }),
            db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
          ]);
          return assistantMessageId;
        }
        const [saved] = await db.$transaction([
          db.message.create({
            data: { conversationId, role: "assistant", content, latencyMs, generationProgress },
            select: { id: true },
          }),
          db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
        ]);
        assistantMessageId = saved.id;
        return saved.id;
      };
      const saveIncomplete = (content: string, progress: unknown) =>
        persistAssistant(content, null, progress as Prisma.InputJsonValue);
      const saveComplete = (content: string, latencyMs: number | null) =>
        persistAssistant(content, latencyMs, Prisma.DbNull);

      let codingProgress = resumeCodingProgress;
      let agentCheckpoint = resumeAgentCheckpoint;
      const directSlashCommand = !resumedAssistant ? parseSlashCommand(input.message) : null;
      const codeBuildIntent =
        isExplicitCodeBuildRequest(input.message) && !isFollowUpSingleFileEdit(input.message, history);
      const fileByFile = Boolean(
        !directSlashCommand &&
          !resumeAgentCheckpoint &&
          !explicitAgentIntent &&
          (resumeCodingProgress || (answerMode === "coding" && codeBuildIntent && !resumedAssistant)),
      );
      const runAgentLoop = Boolean(
        !directSlashCommand &&
          !fileByFile &&
          (resumeAgentCheckpoint || (explicitAgentIntent && !resumedAssistant)),
      );
      let executedAnyCommands = false;
      const finalAnswer = () =>
        directSlashCommand || fileByFile || runAgentLoop
          ? raw
          : executedAnyCommands
            ? stripProximaCommandTags(raw)
            : stripFiller(cleanIdentityLeaks(stripProximaCommandTags(raw)));

      try {
        if (directSlashCommand) {
          receivedAny = true;
          sse.send("status", { state: "thinking", message: `$ ${directSlashCommand}` });
          const workspaceFiles = extractWorkspaceFilesFromHistory(history);
          const { runs } = await executeChatCommands([directSlashCommand], workspaceFiles);
          const cards = runs.map((r) => formatTerminalToolBlock(r, { expanded: true })).join("\n\n");
          raw = cards;
          sentText = cards;
          sse.send("token", { text: cards });
        } else if (fileByFile) {
          const codingRequest = {
            message: prompt,
            sessionId,
            signal,
            history,
            showReasoning: false,
            mode: "coding" as const,
            images: providerPictures,
            system: modeSystemPrompt(
              [SYSTEM_PROMPT, identitySection, memorySection, skillSection].filter(Boolean).join("\n\n"),
              "coding",
            ),
          };
          if (!codingProgress) {
            receivedAny = true;
            sse.send("status", { state: "thinking", message: "Planning the project files…" });
            const files = await planCodingTask(provider, codingRequest);
            codingProgress = {
              kind: "multi-file-coding",
              version: 1,
              state: "planned",
              files,
              completedFiles: [],
              currentFile: null,
            };
          }
          codingProgress = { ...codingProgress, state: "in-progress", currentFile: null };
          if (!raw) {
            const tree = formatCodingTree(codingProgress.files);
            await saveIncomplete(tree, codingProgress as unknown as Prisma.InputJsonValue);
            raw = tree;
            sentText = raw;
            sse.send("token", { text: tree });
          } else {
            await saveIncomplete(raw, codingProgress as unknown as Prisma.InputJsonValue);
          }

          for (const [index, file] of codingProgress.files.entries()) {
            if (codingProgress.completedFiles.includes(file.path)) continue;
            if (signal.aborted) throw interruptedError();
            receivedAny = true;
            codingProgress = { ...codingProgress, state: "in-progress", currentFile: file.path };
            await saveIncomplete(raw, codingProgress as unknown as Prisma.InputJsonValue);
            sse.send("status", {
              state: "thinking",
              message: `Writing file ${index + 1} of ${codingProgress.files.length}: ${file.path}`,
            });
            const code = await generateCodingFile(provider, codingRequest, {
              file,
              files: codingProgress.files,
              completedFiles: codingProgress.completedFiles,
              completedContent: raw,
              onDraft: (text) => sse.send("file-preview", { path: file.path, text }),
              onActivity: () =>
                sse.send("status", { state: "thinking", message: `Continuing ${file.path}…` }),
              onRepair: () =>
                sse.send("status", {
                  state: "thinking",
                  message: `Fixing the format of ${file.path} before continuing…`,
                }),
            });
            const fileText = formatCodingFile(file.path, code);
            const nextRaw = raw + fileText;
            const nextProgress: CodingTaskProgress = {
              ...codingProgress,
              state: "in-progress",
              completedFiles: [...codingProgress.completedFiles, file.path],
              currentFile: null,
            };
            // Update memory only after the content and checkpoint commit together.
            await saveIncomplete(nextRaw, nextProgress as unknown as Prisma.InputJsonValue);
            raw = nextRaw;
            codingProgress = nextProgress;
            sentText = raw;
            sse.send("file-preview", { path: file.path, text: "" });
            sse.send("token", { text: fileText });
            // The checkpoint is durable before asking the browser to start a
            // fresh invocation with its own time budget. Older clients and
            // unsaved guest/temporary chats retain the original one-stream path.
            if (
              input.codingStep &&
              conversationId &&
              nextProgress.completedFiles.length < nextProgress.files.length
            ) {
              sse.send("coding-continue", {
                conversationId,
                completedFiles: nextProgress.completedFiles.length,
                retry: false,
              });
              return;
            }
          }

          const completed = new Set(codingProgress.completedFiles);
          const unfinished = codingProgress.files.filter((file) => !completed.has(file.path));
          if (unfinished.length) {
            throw new AiProviderError(
              `The project still has unfinished files: ${unfinished.map((file) => file.path).join(", ")}`,
              "bad_response",
            );
          }
        } else if (runAgentLoop) {
          const registry = createDefaultToolRegistry();
          const agentRequest = {
            message: prompt,
            sessionId,
            signal,
            history,
            showReasoning: false,
            mode: answerMode,
            images: providerPictures,
            system,
          };

          if (!agentCheckpoint) {
            receivedAny = true;
            sse.send("status", { state: "thinking", message: "Planning task steps…" });
            const steps = await planAgentSteps(provider, agentRequest, registry);
            agentCheckpoint = createAgentCheckpoint(stripAgentPrefix(input.message), steps);
            await saveIncomplete(raw, agentCheckpoint as unknown as Prisma.InputJsonValue);
          }

          while (agentCheckpoint.phase !== "done" && agentCheckpoint.phase !== "failed") {
            if (signal.aborted) throw interruptedError();
            receivedAny = true;

            if (agentCheckpoint.phase === "verify") {
              agentCheckpoint = await executeNextAgentStep({
                checkpoint: agentCheckpoint,
                registry,
                ctx: { userId: userId ?? "guest", signal },
                resolveAction: () => null,
              });
              break;
            }

            const stepIndex = agentCheckpoint.currentStepIndex;
            const currentStep = agentCheckpoint.steps[stepIndex];
            sse.send("status", {
              state: "thinking",
              message: `Step ${stepIndex + 1} of ${agentCheckpoint.steps.length}: ${currentStep.title}`,
            });

            const nextCheckpoint = await executeNextAgentStep({
              checkpoint: agentCheckpoint,
              registry,
              ctx: { userId: userId ?? "guest", signal },
              resolveAction: (step, cp) =>
                resolveAgentAction(provider, agentRequest, step, cp, registry),
              approvedStepId: input.approvedStepId,
            });

            if (nextCheckpoint.phase === "paused" && nextCheckpoint.pendingApprovalStepId) {
              const pausedStep = nextCheckpoint.steps.find(
                (s) => s.id === nextCheckpoint.pendingApprovalStepId,
              );
              await saveIncomplete(raw, nextCheckpoint as unknown as Prisma.InputJsonValue);
              agentCheckpoint = nextCheckpoint;
              sse.send("agent-approval", {
                conversationId,
                stepId: nextCheckpoint.pendingApprovalStepId,
                title: pausedStep?.title ?? "Confirm action",
                toolName: pausedStep?.toolCall?.toolName ?? "unknown",
              });
              return;
            }

            const updatedStep = nextCheckpoint.steps[stepIndex];
            let nextRaw = raw;
            if (updatedStep?.status === "completed") {
              const note = formatAgentStepNote(updatedStep, stepIndex, nextCheckpoint.steps.length);
              nextRaw = raw + note;
              await saveIncomplete(nextRaw, nextCheckpoint as unknown as Prisma.InputJsonValue);
              raw = nextRaw;
              sentText = raw;
              sse.send("token", { text: note });
            } else {
              await saveIncomplete(raw, nextCheckpoint as unknown as Prisma.InputJsonValue);
            }
            agentCheckpoint = nextCheckpoint;

            // Hand off remaining steps to a fresh serverless invocation with its own timeout budget.
            if (
              conversationId &&
              nextCheckpoint.phase !== "done" &&
              nextCheckpoint.phase !== "failed" &&
              nextCheckpoint.phase !== "verify"
            ) {
              sse.send("agent-continue", {
                conversationId,
                completedSteps: nextCheckpoint.currentStepIndex,
                totalSteps: nextCheckpoint.steps.length,
                retry: false,
              });
              return;
            }
          }

          if (agentCheckpoint.phase === "failed") {
            throw new AiProviderError(
              agentCheckpoint.verificationNote ?? "The agent could not complete all steps.",
              "bad_response",
            );
          }

          sse.send("status", { state: "thinking", message: "Verifying & summarizing final answer…" });
          const summary = await synthesizeAgentAnswer(provider, agentRequest, agentCheckpoint);
          const finalSegment = raw ? `\n${summary}` : summary;
          raw += finalSegment;
          sentText = raw;
          sse.send("token", { text: finalSegment });
        } else {
          // Arena-AI-style autonomous streaming command loop:
          // - Normal replies stream instantaneously with zero buffering penalty.
          // - Whenever Proxima decides to emit `<proxima_cmd>...</proxima_cmd>` (on ANY
          //   message), tags are silently intercepted (never leaked), executed live in a
          //   persistent workspace with fading `$ <cmd>` status + collapsible terminal cards,
          //   and real stdout/stderr/exitCode are fed back so Proxima can chain follow-up
          //   commands, self-correct errors, or deliver her grounded final answer.
          const MAX_COMMAND_ROUNDS = 4;
          const resumeInstruction =
            resumedAssistant && !resumeCodingProgress
              ? "\n\nThe previous assistant reply was interrupted. Continue from its saved output in the conversation history. Do not repeat completed sections or files, and finish every requested file before claiming the task is complete."
              : "";
          const workspaceFiles = extractWorkspaceFilesFromHistory(history);
          let workspaceState = createCommandPromptState(workspaceFiles);
          const loopHistory: AiHistoryMessage[] = [...history];
          let currentPrompt = `${prompt}${resumeInstruction}`;
          let currentImages = providerPictures;

          for (let round = 0; round < MAX_COMMAND_ROUNDS; round += 1) {
            const isFinalRound = round === MAX_COMMAND_ROUNDS - 1;
            const roundSystem =
              round === 0
                ? workspaceFiles.length > 0
                  ? `${system}\n\nWorkspace files currently in /workspace: ${workspaceFiles.map((f) => f.path).join(", ")}.`
                  : system
                : [
                    system,
                    isFinalRound
                      ? "You have completed your command prompt runs. Now write a clear, accurate, well-structured final answer grounded strictly in the real command outputs above. Do NOT emit `<proxima_cmd>` again."
                      : "You just received real output from your Proxima Command Prompt (`proxima-sh`). If you need another command (e.g., to inspect a file, fix an error, or scrape another URL), emit `<proxima_cmd>EXACT_COMMAND</proxima_cmd>`. Otherwise, write your clear, well-structured final answer grounded strictly in the real command output. Never repeat raw huge outputs verbatim.",
                  ].join("\n\n");

            const tagFilter = createCommandTagStreamFilter();
            const roundGate = round === 0 ? gate : null;
            let roundProse = "";

            const deltas = generateReply(provider, {
              message: currentPrompt,
              sessionId,
              signal,
              history: loopHistory,
              showReasoning: round === 0 ? showReasoning : false,
              mode: answerMode,
              images: currentImages,
              system: roundSystem,
            });

            for await (const delta of deltas) {
              if (delta.type === "activity") continue;
              if (delta.type === "reasoning") {
                if (showReasoning && delta.text) sse.send("reasoning", { text: delta.text });
                continue;
              }
              receivedAny = true;
              const visible = tagFilter.push(delta.text);
              if (!visible) continue;
              roundProse += visible;
              raw += visible;
              if (roundGate) {
                const safe = roundGate.push(visible);
                if (safe) {
                  sentText += safe;
                  sse.send("token", { text: safe });
                }
              } else {
                sentText += visible;
                sse.send("token", { text: visible });
              }
            }

            if (signal.aborted) throw interruptedError();

            const flushed = tagFilter.flush();
            if (flushed.text) {
              roundProse += flushed.text;
              raw += flushed.text;
              if (roundGate) {
                const safe = roundGate.push(flushed.text);
                if (safe) {
                  sentText += safe;
                  sse.send("token", { text: safe });
                }
              } else {
                sentText += flushed.text;
                sse.send("token", { text: flushed.text });
              }
            }

            // Release any buffered first-sentence prose from round 0 before emitting terminal cards.
            if (roundGate) {
              const heldNow = roundGate.flush();
              if (heldNow) {
                sentText += heldNow;
                sse.send("token", { text: heldNow });
              }
            }

            const commands = isFinalRound ? [] : flushed.commands;
            if (commands.length === 0) break;

            executedAnyCommands = true;
            const { runs, state: nextState } = await executeChatCommandsWithState(
              commands,
              workspaceState,
              {
                stepDelayMs: commands.length > 1 ? 180 : 80,
                onCommandStart: (cmd) => {
                  sse.send("status", {
                    state: "thinking",
                    message: `$ ${cmd}`,
                  });
                },
                onCommandFinish: (run) => {
                  const needsLeadingBreak = raw.length > 0 && !raw.endsWith("\n\n");
                  const prefix = needsLeadingBreak ? (raw.endsWith("\n") ? "\n" : "\n\n") : "";
                  const card = `${prefix}${formatTerminalToolBlock(run)}\n\n`;
                  raw += card;
                  sentText += card;
                  sse.send("token", { text: card });
                },
              },
            );
            workspaceState = nextState;

            if (signal.aborted) throw interruptedError();

            sse.send("status", {
              state: "thinking",
              message: "Analyzing command output…",
            });

            // Feed assistant turn + real tool results into the next autonomous round.
            const assistantSummary = [
              roundProse.trim(),
              commands.map((c) => `<proxima_cmd>${c}</proxima_cmd>`).join("\n"),
            ]
              .filter(Boolean)
              .join("\n");
            loopHistory.push({ role: "user", content: currentPrompt });
            loopHistory.push({ role: "assistant", content: assistantSummary });
            currentPrompt = `Real Command Prompt execution results:\n\n${formatToolObservationForModel(runs)}\n\nContinue helping the user with their original request: "${input.message}"`;
            currentImages = [];
          }
        }

        // Some fallback providers return normally when their typing loop is
        // aborted. Treat that as interruption, never as a completed answer.
        if (signal.aborted) throw interruptedError();

        // Release the first-sentence buffer (empty for file-by-file coding tasks).
        const held = gate.flush();
        if (held) {
          sentText += held;
          sse.send("token", { text: held });
        }

        const text = finalAnswer() || sentText;

        if (!text.trim()) {
          throw new AiProviderError("The engine returned an empty answer", "bad_response");
        }

        if (clientGone.signal.aborted) {
          // The output is complete even if the browser left before receiving `done`.
          await saveComplete(text, null);
          return;
        }

        const latencyMs = Date.now() - started;
        const messageId = await saveComplete(text || sentText, latencyMs);
        sse.send("done", {
          messageId,
          latencyMs,
          mode: answerMode,
          source: provider.id,
          // The clean final answer. The client swaps it in if trailing filler was removed.
          text: text || sentText,
          // Shown as the small "Memory used" chip on the reply.
          ...(memories.length
            ? { usedMemory: memories.map((memory) => ({ id: memory.id, text: memory.text })) }
            : {}),
        });
        // The answer is saved; close the stream before best-effort memory writes
        // so a slow database cannot keep the Stop button visible.
        sse.close();
        if (useMemory && userId) await rememberMessage(userId, input.message, conversationId).catch(() => 0);
      } catch (error) {
        const incompleteProgress = codingProgress
          ? { ...codingProgress, state: "interrupted" as const }
          : agentCheckpoint
            ? agentCheckpoint
            : raw
              ? { kind: "stream", version: 1, state: "interrupted", mode: answerMode }
              : (resumedAssistant?.progress ?? null);
        const partialText = finalAnswer() || sentText || raw;
        let checkpointSaved = false;
        if (conversationId && (partialText || incompleteProgress !== null)) {
          const progress = incompleteProgress ?? {
            kind: "stream",
            version: 1,
            state: "interrupted",
            mode: answerMode,
          };
          const saved = await saveIncomplete(partialText, progress as Prisma.InputJsonValue).catch(() => {
            console.error("[chat] could not save interrupted reply progress");
            return null;
          });
          checkpointSaved = Boolean(saved);
        }
        if (clientGone.signal.aborted) return;
        const code: AiErrorCode =
          error instanceof AiProviderError ? error.code : timeout.aborted ? "timeout" : "unavailable";
        // Log only the failure type and status, never prompts, provider responses or keys.
        const status = error instanceof AiProviderError ? error.status : undefined;
        console.error(`[chat] ${provider.id} failed (${code}${status ? `, HTTP ${status}` : ""})`);
        if (
          code === "timeout" &&
          checkpointSaved &&
          conversationId &&
          agentCheckpoint &&
          agentCheckpoint.phase !== "done" &&
          agentCheckpoint.phase !== "failed"
        ) {
          sse.send("agent-continue", {
            conversationId,
            completedSteps: agentCheckpoint.currentStepIndex,
            totalSteps: agentCheckpoint.steps.length,
            retry: true,
          });
          return;
        }
        if (
          code === "timeout" &&
          input.codingStep &&
          checkpointSaved &&
          conversationId &&
          codingProgress?.currentFile
        ) {
          sse.send("file-preview", { path: codingProgress.currentFile, text: "" });
          sse.send("coding-continue", {
            conversationId,
            completedFiles: codingProgress.completedFiles.length,
            retry: true,
          });
          return;
        }
        const message =
          codingProgress?.currentFile && code !== "aborted"
            ? `${code === "timeout" ? "The engine stopped responding or ran out of time while writing" : "Could not finish"} ${codingProgress.currentFile}. ${conversationId ? "Your completed files are saved; retry to resume from this file." : "Retry to start again."}`
            : FRIENDLY_ERRORS[code];
        sse.send("error", { code, message, retryable: code !== "aborted" });
      } finally {
        clearTimeout(waking);
        clearInterval(heartbeat);
      }
    },
    () => clientGone.abort(),
  );

  return new Response(stream, { headers: { ...SSE_HEADERS, ...rateLimitHeaders(rate) } });
});
