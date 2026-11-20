import "server-only";
import type { Readable } from "node:stream";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { edgeSpeechConfigured, speechVoiceId } from "../settings";
import { SpeechProviderError, type SpeechAudio, type SpeechProvider, type SpeechRequest } from "../types";

/**
 * Microsoft Edge's neural "Read Aloud" voices.
 *
 * This is the free, no-key option — the same family of voices Edge uses when
 * it reads a page aloud, and much more natural than the robotic default some
 * browsers install. It is an unofficial endpoint: Microsoft can change it,
 * which is why it is only one link in the chain and the browser's own speech
 * synthesis remains the final fallback.
 *
 *   en-US-AvaNeural     → warm, conversational female
 *   en-US-AndrewNeural  → calm, conversational male
 *
 * Server-side only (the endpoint refuses browser user agents).
 */

/** The text is XML-escaped before it enters Edge's SSML template. */
export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type EdgeAudioEngine = {
  /** `text` is already SSML-safe. Injected in tests; no network there. */
  synthesize(
    text: string,
    options: { voiceId: string; speed: number; signal: AbortSignal },
  ): Promise<Uint8Array>;
};

function abortedError(signal: AbortSignal): SpeechProviderError {
  const reason = signal.reason as { name?: string } | undefined;
  return reason?.name === "TimeoutError"
    ? new SpeechProviderError("Edge voice timed out", "timeout")
    : new SpeechProviderError("Edge voice request was cancelled", "aborted");
}

function collect(stream: Readable, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortedError(signal));
      return;
    }
    const chunks: Buffer[] = [];
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
      stream.off("close", onClose);
    };
    const finish = (error?: SpeechProviderError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(new Uint8Array(Buffer.concat(chunks)));
    };
    const onAbort = () => finish(abortedError(signal));
    const onData = (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const onEnd = () => finish();
    const onError = (error: Error) =>
      finish(new SpeechProviderError(`Edge voice failed: ${error.message}`, "upstream"));
    const onClose = () => {
      // A socket can close without a clean end; never leave the request hanging.
      if (!settled) finish(new SpeechProviderError("Edge voice closed unexpectedly", "upstream"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
    stream.on("close", onClose);
  });
}

export const edgeAudioEngine: EdgeAudioEngine = {
  async synthesize(text, { voiceId, speed, signal }) {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 6_000, synthesisTimeoutMs: 15_000 });
    const onAbort = () => tts.close();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      if (signal.aborted) throw abortedError(signal);
      const { audioStream } = tts.toStream(text, {
        rate: Math.min(2, Math.max(0.5, speed)),
        pitch: "+0Hz",
        volume: 100,
      });
      const bytes = await collect(audioStream, signal);
      if (bytes.byteLength === 0) {
        throw new SpeechProviderError("Edge voice returned no audio", "bad_response");
      }
      return bytes;
    } catch (error) {
      if (error instanceof SpeechProviderError) throw error;
      if (signal.aborted) throw abortedError(signal);
      throw new SpeechProviderError(
        `Edge voice failed: ${(error as Error)?.message ?? "unknown error"}`,
        "upstream",
      );
    } finally {
      signal.removeEventListener("abort", onAbort);
      tts.close();
    }
  },
};

export type EdgeSpeechOptions = {
  /** Injected in tests so the suite never opens a WebSocket. */
  engine?: EdgeAudioEngine;
  env?: Record<string, string | undefined>;
};

export function createEdgeSpeechProvider(options: EdgeSpeechOptions = {}): SpeechProvider {
  const engine = options.engine ?? edgeAudioEngine;
  const env = options.env ?? process.env;

  return {
    id: "edge",
    label: "Microsoft Edge neural voices",

    async synthesize({ text, voice, speed, signal }: SpeechRequest): Promise<SpeechAudio> {
      if (!edgeSpeechConfigured(env)) {
        throw new SpeechProviderError("Edge voices are switched off", "unavailable");
      }
      const voiceId = speechVoiceId("edge", voice, env);
      const bytes = await engine.synthesize(escapeSsml(text), {
        voiceId,
        speed: Math.min(2, Math.max(0.5, speed)),
        signal,
      });
      if (bytes.byteLength === 0) {
        throw new SpeechProviderError("Edge voice returned no audio", "bad_response");
      }
      return { bytes, mime: "audio/mpeg", provider: "edge", voiceId };
    },
  };
}
