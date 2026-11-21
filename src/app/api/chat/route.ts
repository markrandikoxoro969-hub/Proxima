import { AI_TIMEOUT_MS, AiProviderError, getAiProvider } from "@/lib/ai";
import { LeadingCleanGate, stripFiller } from "@/lib/ai/clean-reply";
import { modeSystemPrompt, resolveChatMode, resolveModeConfig } from "@/lib/ai/modes";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { generateReply, typeOut } from "@/lib/ai/reply";
import type { AiErrorCode, AiHistoryMessage } from "@/lib/ai/types";
import { ApiError, apiErrors, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin, hashedClientId } from "@/lib/api/security";
import { createSseStream, SSE_HEADERS } from "@/lib/api/sse";
import { getApiUserId } from "@/lib/auth/api";
import { attachmentMeta, composePrompt, DEFAULT_TITLE, makeTitle } from "@/lib/chat/compose";
import { db } from "@/lib/db";
import { chatImageAttachment, loadChatImages } from "@/lib/image/store";
import { cleanIdentityLeaks, getIdentityAnswer } from "@/lib/identity";
import { memoryEnabled, memoryPrompt, relevantMemories, rememberMessage } from "@/lib/memory/store";
import { enforceRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
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
 *   token      { text }   ← many of these; the answer as it is written
 *   done       { messageId, latencyMs, source, mode, text }  ← `text` is the final,
 *                                                         cleaned answer
 *   error      { code, message, retryable }            ← instead of done
 *
 * Only the final answer is stored. Reasoning never touches the database.
 */
export const maxDuration = 120; // seconds (Render cold starts can be slow)

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
  const modeConfig = resolveModeConfig(mode);
  /** Temporary chats are never written to the database and never touch memory. */
  const temporary = input.temporary === true;

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
  let priorMessages: { id: string; role: AiHistoryMessage["role"]; content: string }[] = [];

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
            take: modeConfig.historyLimit,
            select: { id: true, role: true, content: true },
          },
        },
      });
      if (!existing) throw apiErrors.notFound("Conversation not found");
      conversationId = existing.id;
      priorMessages = existing.messages;
      title =
        existing._count.messages === 0 && existing.title === DEFAULT_TITLE
          ? makeTitle(input.message)
          : existing.title;

      const last = existing.messages[0];
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
    history.push(...input.history.slice(-modeConfig.historyLimit));
  }

  // ── Memory (Settings → Memory; off unless the person turned it on) ──
  // Reading is a single indexed query; learning is deterministic (no AI call),
  // so neither one can delay the first token of the reply.
  const identityAnswer = getIdentityAnswer(input.message);
  const useMemory = Boolean(userId) && !temporary && (await memoryEnabled(userId!));
  // Identity responses are fixed and don't use the prompt; don't attach memory
  // provenance to a reply that did not actually receive the memory context.
  const memories = useMemory && !identityAnswer ? await relevantMemories(userId!, input.message) : [];
  const memorySection = memories.length ? memoryPrompt(memories) : "";
  // The mode's rules are appended last, so they win over the general prompt.
  const system = modeSystemPrompt(
    memorySection ? `${SYSTEM_PROMPT}\n\n${memorySection}` : SYSTEM_PROMPT,
    mode,
  );

  // ── Stream the reply ──
  const provider = getAiProvider();
  const prompt = composePrompt(input.message, attachments, pictures.length);
  const sessionId = conversationId ?? `demo-${input.demoSessionId ?? crypto.randomUUID()}`;

  const clientGone = new AbortController();
  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS());
  const signal = AbortSignal.any([clientGone.signal, timeout]);
  request.signal?.addEventListener("abort", () => clientGone.abort(), { once: true });

  const stream = createSseStream(
    async (sse) => {
      sse.send("meta", {
        mode: userId ? "user" : "guest",
        answerMode: mode,
        conversationId,
        title,
        userMessageId,
      });
      sse.send("status", { state: "thinking" });

      const started = Date.now();
      let raw = "";
      let sentText = "";
      let receivedAny = false;
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

      const saveAssistant = async (content: string, latencyMs: number | null) => {
        if (!conversationId || !content) return null;
        const [saved] = await db.$transaction([
          db.message.create({
            data: { conversationId, role: "assistant", content, latencyMs },
            select: { id: true },
          }),
          db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
        ]);
        return saved.id;
      };

      const finalAnswer = () => stripFiller(cleanIdentityLeaks(raw));

      try {
        const deltas = identityAnswer
          ? typeOut(identityAnswer, signal)
          : generateReply(provider, {
              message: prompt,
              sessionId,
              signal,
              history,
              showReasoning,
              mode,
              images: pictures,
              system,
            });

        for await (const delta of deltas) {
          if (delta.type === "reasoning") {
            // Never stored, never counted as an answer, only sent when asked.
            if (showReasoning && delta.text) sse.send("reasoning", { text: delta.text });
            continue;
          }
          receivedAny = true;
          raw += delta.text;
          const safe = gate.push(delta.text);
          if (safe) {
            sentText += safe;
            sse.send("token", { text: safe });
          }
        }

        // Release the first-sentence buffer (filler already removed).
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
          // Browser left mid-reply: keep what we have so it shows after reload.
          await saveAssistant(text, null);
          return;
        }

        const latencyMs = Date.now() - started;
        const messageId = await saveAssistant(text || sentText, latencyMs);
        // Learn after the reply completes: extraction is deterministic and
        // best-effort, and the database consent check was made above.
        if (useMemory && userId) await rememberMessage(userId, input.message, conversationId);
        sse.send("done", {
          messageId,
          latencyMs,
          mode,
          source: identityAnswer ? "identity" : provider.id,
          // The clean final answer. The client swaps it in if trailing filler was removed.
          text: text || sentText,
          // Shown as the small "Memory used" chip on the reply.
          ...(memories.length
            ? { usedMemory: memories.map((memory) => ({ id: memory.id, text: memory.text })) }
            : {}),
        });
      } catch (error) {
        if (clientGone.signal.aborted) {
          await saveAssistant(finalAnswer() || sentText, null).catch(() => {});
          return;
        }
        const code: AiErrorCode =
          error instanceof AiProviderError ? error.code : timeout.aborted ? "timeout" : "unavailable";
        // Log the failure type only — never the user's message or the API key.
        console.error(`[chat] ${provider.id} failed (${code}):`, (error as Error).message);
        sse.send("error", { code, message: FRIENDLY_ERRORS[code], retryable: code !== "aborted" });
      } finally {
        clearTimeout(waking);
        clearInterval(heartbeat);
      }
    },
    () => clientGone.abort(),
  );

  return new Response(stream, { headers: { ...SSE_HEADERS, ...rateLimitHeaders(rate) } });
});
