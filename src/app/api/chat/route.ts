import { AI_TIMEOUT_MS, AiProviderError, getAiProvider } from "@/lib/ai";
import { generateReply, typeOut } from "@/lib/ai/reply";
import type { AiErrorCode } from "@/lib/ai/types";
import { ApiError, apiErrors, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin, hashedClientId } from "@/lib/api/security";
import { createSseStream, SSE_HEADERS } from "@/lib/api/sse";
import { getApiUserId } from "@/lib/auth/api";
import { attachmentMeta, composePrompt, DEFAULT_TITLE, makeTitle } from "@/lib/chat/compose";
import { db } from "@/lib/db";
import { getIdentityAnswer } from "@/lib/identity";
import { enforceRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { chatRequestSchema, LIMITS } from "@/lib/validation";

/**
 * POST /api/chat — send a message, receive the reply as a live stream (SSE).
 *
 * Signed in → saved to your conversation, limit 20 messages/minute.
 * Guest (landing-page demo) → not saved, max 500 characters, limit 5/minute.
 *
 * Events sent to the browser, in order:
 *   meta    { mode, conversationId, title, userMessageId }
 *   status  { state: "thinking" | "waking", message? }
 *   delta   { text }                     ← many of these
 *   done    { messageId, latencyMs, source }
 *   error   { code, message, retryable } ← instead of done, if the AI fails
 */
export const maxDuration = 120; // seconds (Render cold starts can be slow)

const WAKING_AFTER_MS = 4_000;
const HEARTBEAT_MS = 15_000;

const FRIENDLY_ERRORS: Record<AiErrorCode, string> = {
  timeout: "The PROXIMA engine took too long to answer. Please try again.",
  unavailable: "Couldn't reach the PROXIMA engine. It may be waking up — try again in a few seconds.",
  upstream: "The PROXIMA engine had a problem answering. Please try again.",
  bad_response: "The PROXIMA engine sent an unexpected answer. Please try again.",
  aborted: "The request was cancelled.",
};

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await getApiUserId();
  const input = chatRequestSchema.parse(await readJson(request, 512 * 1024));
  const attachments = input.attachments ?? [];

  // ── Guest demo rules ──
  if (!userId) {
    if (attachments.length) throw new ApiError(401, "sign_in_required", "Sign in to attach files.");
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

  // ── Save the user's message (signed-in only) ──
  let conversationId: string | null = null;
  let title: string | null = null;
  let userMessageId: string | null = null;

  if (userId) {
    const userMessage = {
      role: "user" as const,
      content: input.message,
      ...(attachments.length ? { attachments: attachmentMeta(attachments) } : {}),
    };

    if (input.conversationId) {
      const existing = await db.conversation.findFirst({
        where: { id: input.conversationId, userId },
        select: { id: true, title: true, _count: { select: { messages: true } } },
      });
      if (!existing) throw apiErrors.notFound("Conversation not found");
      conversationId = existing.id;
      title =
        existing._count.messages === 0 && existing.title === DEFAULT_TITLE
          ? makeTitle(input.message)
          : existing.title;

      const [created] = await db.$transaction([
        db.message.create({ data: { ...userMessage, conversationId }, select: { id: true } }),
        db.conversation.update({ where: { id: conversationId }, data: { title, updatedAt: new Date() } }),
      ]);
      userMessageId = created.id;
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

  // ── Stream the reply ──
  const provider = getAiProvider();
  const prompt = composePrompt(input.message, attachments);
  const sessionId = conversationId ?? `demo-${input.demoSessionId ?? crypto.randomUUID()}`;

  const clientGone = new AbortController();
  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS());
  const signal = AbortSignal.any([clientGone.signal, timeout]);
  request.signal?.addEventListener("abort", () => clientGone.abort(), { once: true });

  const stream = createSseStream(
    async (sse) => {
      sse.send("meta", { mode: userId ? "user" : "guest", conversationId, title, userMessageId });
      sse.send("status", { state: "thinking" });

      const started = Date.now();
      let text = "";
      let receivedAny = false;
      const waking = setTimeout(() => {
        if (!receivedAny) {
          sse.send("status", {
            state: "waking",
            message: "Waking up the PROXIMA engine… the first reply can take up to a minute.",
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

      try {
        const identityAnswer = getIdentityAnswer(input.message);
        const pieces = identityAnswer
          ? typeOut(identityAnswer, signal)
          : generateReply(provider, { message: prompt, sessionId, signal });

        for await (const piece of pieces) {
          receivedAny = true;
          text += piece;
          sse.send("delta", { text: piece });
        }

        if (clientGone.signal.aborted) {
          // Browser left mid-reply: keep what we have so it shows after reload.
          await saveAssistant(text, null);
          return;
        }

        const latencyMs = Date.now() - started;
        const messageId = await saveAssistant(text, latencyMs);
        sse.send("done", { messageId, latencyMs, source: identityAnswer ? "identity" : provider.id });
      } catch (error) {
        if (clientGone.signal.aborted) {
          await saveAssistant(text, null).catch(() => {});
          return;
        }
        const code: AiErrorCode =
          error instanceof AiProviderError ? error.code : timeout.aborted ? "timeout" : "unavailable";
        // Log the failure type only — never the user's message.
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
