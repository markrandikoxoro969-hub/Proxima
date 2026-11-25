/**
 * Web Audio DSP graph for the persistent background `<video>` element:
 *
 *   HTMLVideoElement ─▶ MediaElementAudioSourceNode ─▶ BiquadFilterNode (lowpass) ─▶ GainNode ─▶ destination
 *
 * Why this exists:
 * 1. Smoothly muffles/covers background music (`~460 Hz` low-pass + dimmed gain)
 *    whenever Settings, dialogs, command palette, or drawers are open — like
 *    hearing the soundtrack softly behind frosted glass.
 * 2. Smoothly ducks & softens theme music when Proxima's voice reads aloud.
 * 3. Guarantees instant, zero-tail hard mute when the user cuts sound or switches
 *    themes (`cancelScheduledValues` + `setValueAtTime(0)` + `video.muted = true`).
 * 4. Safely caches one `MediaElementAudioSourceNode` per `<video>` in a `WeakMap`
 *    and only binds once `AudioContext` is actually running (avoiding Safari/Chrome
 *    autoplay suspension traps).
 */

export type AudioMixState = {
  enabled: boolean;
  volume: number;
  muffled: boolean;
  ducked: boolean;
  immediate?: boolean;
};

export type VideoAudioGraph = {
  apply: (mix: AudioMixState) => void;
  silenceNow: () => void;
  resumeIfNeeded: () => Promise<boolean>;
};

const graphs = new WeakMap<HTMLVideoElement, VideoAudioGraph>();

/** Acoustic targets shared between video audio and synthesized ambient scenes. */
export function resolveAudioMix(mix: AudioMixState): {
  gain: number;
  cutoffHz: number;
  q: number;
} {
  if (!mix.enabled) {
    return { gain: 0, cutoffHz: 20000, q: 0.5 };
  }
  const base = Math.min(1, Math.max(0, mix.volume));
  if (mix.ducked) {
    return { gain: base * 0.14, cutoffHz: 680, q: 0.7 };
  }
  if (mix.muffled) {
    return { gain: base * 0.42, cutoffHz: 460, q: 0.85 };
  }
  return { gain: base, cutoffHz: 20000, q: 0.5 };
}

export function getVideoAudioGraph(video: HTMLVideoElement): VideoAudioGraph | null {
  return graphs.get(video) ?? null;
}

/**
 * Lazily attaches a Web Audio low-pass + gain chain to `video`.
 * Returns `null` if Web Audio is unavailable or blocked by autoplay policy
 * (never traps the `<video>` element inside a suspended `AudioContext`).
 */
export async function ensureVideoAudioGraph(
  video: HTMLVideoElement,
): Promise<VideoAudioGraph | null> {
  const existing = graphs.get(video);
  if (existing) {
    const ok = await existing.resumeIfNeeded();
    return ok ? existing : null;
  }

  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) return null;

  let ctx: AudioContext;
  try {
    // "playback" uses a larger hardware audio buffer (fewer CPU audio interrupts
    // per second), preventing frame drops or audio stutter while HD video decodes.
    ctx = new AudioCtx({ latencyHint: "playback" });
  } catch {
    try {
      ctx = new AudioCtx();
    } catch {
      return null;
    }
  }

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      void ctx.close().catch(() => {});
      return null;
    }
  }
  if (ctx.state !== "running") {
    void ctx.close().catch(() => {});
    return null;
  }

  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(video);
  } catch {
    void ctx.close().catch(() => {});
    return null;
  }

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 20000;
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  // GainNode now owns exact loudness; keep element volume at unity.
  video.volume = 1;

  const graph: VideoAudioGraph = {
    apply(mix: AudioMixState) {
      const now = ctx.currentTime;
      const { gain: targetGain, cutoffHz, q } = resolveAudioMix(mix);

      if (!mix.enabled) {
        video.muted = true;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        return;
      }

      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }

      video.volume = 1;
      video.muted = false;

      if (mix.immediate) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(targetGain, now);
        filter.frequency.cancelScheduledValues(now);
        filter.frequency.setValueAtTime(cutoffHz, now);
        filter.Q.cancelScheduledValues(now);
        filter.Q.setValueAtTime(q, now);
      } else {
        // Smooth exponential-like sweep: zero clicks, dreamy muffled transition.
        const gainTau = targetGain < gain.gain.value ? 0.08 : 0.14;
        const filterTau = 0.13;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(targetGain, now, gainTau);
        filter.frequency.cancelScheduledValues(now);
        filter.frequency.setTargetAtTime(cutoffHz, now, filterTau);
        filter.Q.cancelScheduledValues(now);
        filter.Q.setTargetAtTime(q, now, filterTau);
      }
    },
    silenceNow() {
      const now = ctx.currentTime;
      video.muted = true;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
      } catch {
        /* ignore */
      }
    },
    async resumeIfNeeded() {
      if (ctx.state === "running") return true;
      if (ctx.state === "closed") return false;
      try {
        await ctx.resume();
        return (ctx.state as AudioContextState) === "running";
      } catch {
        return false;
      }
    },
  };

  graphs.set(video, graph);
  return graph;
}
