/**
 * Web Audio DSP graph for the persistent standalone theme `<audio>` element:
 *
 *   HTMLAudioElement ─▶ MediaElementAudioSourceNode ─▶ BiquadFilterNode (lowpass) ─▶ GainNode ─▶ destination
 *
 * Why this runs on a decoupled `<audio>` element (NEVER on `<video>`):
 * 1. Attaching `createMediaElementSource()` directly to `<video>` hijacks the
 *    video hardware decode clock and breaks zero-copy GPU video overlays, causing
 *    frame drops & scroll jank. Keeping `<video>` 100% muted and routing only the
 *    standalone `.m4a` `<audio>` track here eliminates that lag completely.
 * 2. Smoothly muffles/covers background music (`~460 Hz` low-pass + dimmed gain)
 *    whenever Settings, dialogs, command palette, or drawers are open — on BOTH
 *    desktop video themes and mobile animated WebP loops.
 * 3. Smoothly ducks & softens theme music when Proxima's voice reads aloud.
 * 4. Guarantees instant, zero-tail hard mute when the user cuts sound or switches
 *    themes (`cancelScheduledValues` + `setValueAtTime(0)` + `el.muted = true`).
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

const graphs = new WeakMap<HTMLMediaElement, VideoAudioGraph>();

/** Acoustic targets shared between theme audio tracks and synthesized ambient scenes. */
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

export function getVideoAudioGraph(media: HTMLMediaElement): VideoAudioGraph | null {
  return graphs.get(media) ?? null;
}

/**
 * Lazily attaches a Web Audio low-pass + gain chain to `media` (the decoupled `<audio>` element).
 * Returns `null` if Web Audio is unavailable or blocked by autoplay policy
 * (never traps the element inside a suspended `AudioContext`).
 */
export async function ensureVideoAudioGraph(
  media: HTMLMediaElement,
): Promise<VideoAudioGraph | null> {
  const existing = graphs.get(media);
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
    // per second), preventing UI frame drops or audio stutter.
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
    source = ctx.createMediaElementSource(media);
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
  media.volume = 1;

  const graph: VideoAudioGraph = {
    apply(mix: AudioMixState) {
      const now = ctx.currentTime;
      const { gain: targetGain, cutoffHz, q } = resolveAudioMix(mix);

      if (!mix.enabled) {
        media.muted = true;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        return;
      }

      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }

      media.volume = 1;
      media.muted = false;

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
      media.muted = true;
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

  graphs.set(media, graph);
  return graph;
}
