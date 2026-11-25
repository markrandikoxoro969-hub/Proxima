/**
 * Lightweight Web Audio API soundscapes for non-video themes (Night Drive photo
 * theme and the procedural Sky / Ocean / Nature scenes).
 *
 * Includes a master low-pass `BiquadFilterNode` so ambient soundscapes get the
 * exact same warm "covered / dimmed" acoustic sweep as video themes when
 * Settings, dialogs, or drawers open.
 *
 * Maintains a singleton active controller so overlapping or zombie ambient
 * soundscapes can never occur across rapid theme switches or mutes.
 */

import { resolveAudioMix, type AudioMixState } from "./video-audio-graph";

export type AmbientKind = "night-drive" | "ocean" | "sky" | "nature";

export type AmbientController = {
  kind: AmbientKind;
  applyMix: (mix: AudioMixState) => void;
  stop: () => void;
};

let activeController: AmbientController | null = null;

export function stopAllAmbientSounds(): void {
  const prev = activeController;
  activeController = null;
  prev?.stop();
}

function createNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Pink-ish smoothed noise so it sounds warm, never harsh static.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + white * 0.029;
    b1 = 0.985 * b1 + white * 0.032;
    b2 = 0.95 * b2 + white * 0.048;
    data[i] = (b0 + b1 + b2 + white * 0.012) * 1.4;
  }
  return buffer;
}

export async function startAmbientSound(
  kind: AmbientKind,
  initialMix: AudioMixState,
): Promise<AmbientController | null> {
  // Always kill any previous soundscape synchronously first.
  stopAllAmbientSounds();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return null;
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

  const initial = resolveAudioMix(initialMix);

  // Master low-pass muffle stage (smoothly covers sound when Settings/modals open)
  const muffleFilter = ctx.createBiquadFilter();
  muffleFilter.type = "lowpass";
  muffleFilter.frequency.value = initial.cutoffHz;
  muffleFilter.Q.value = initial.q;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.linearRampToValueAtTime(
    Math.max(0.0001, initial.gain * 0.28),
    ctx.currentTime + 0.35,
  );

  muffleFilter.connect(master);
  master.connect(ctx.destination);

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 4);
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  const noiseGain = ctx.createGain();

  const oscs: OscillatorNode[] = [];

  if (kind === "night-drive") {
    // Soft midnight rain + warm low-fi minor-7th pad hum
    filter.type = "bandpass";
    filter.frequency.value = 880;
    filter.Q.value = 0.55;
    noiseGain.gain.value = 0.5;

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 340;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.14;
    padFilter.connect(padGain);
    padGain.connect(muffleFilter);

    for (const freq of [130.81, 155.56, 196.0, 233.08]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(padFilter);
      osc.start();
      oscs.push(osc);
    }
  } else if (kind === "ocean") {
    // Slow rolling ocean surf with an LFO modulating cutoff
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    noiseGain.gain.value = 0.55;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 210;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);
  } else if (kind === "sky") {
    // Airy high breeze + gentle warm fifth shimmer
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    filter.Q.value = 0.8;
    noiseGain.gain.value = 0.28;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.08;
    padGain.connect(muffleFilter);
    for (const freq of [220, 329.63]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(padGain);
      osc.start();
      oscs.push(osc);
    }
  } else {
    // Nature: warm soft wind through leaves
    filter.type = "bandpass";
    filter.frequency.value = 650;
    filter.Q.value = 0.65;
    noiseGain.gain.value = 0.42;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 160;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);
  }

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(muffleFilter);
  noise.start();

  let closed = false;

  const controller: AmbientController = {
    kind,
    applyMix(mix: AudioMixState) {
      if (closed) return;
      const now = ctx.currentTime;
      const resolved = resolveAudioMix(mix);
      if (!mix.enabled) {
        controller.stop();
        return;
      }
      const targetGain = Math.max(0.0001, resolved.gain * 0.28);
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(targetGain, now, 0.1);
      muffleFilter.frequency.cancelScheduledValues(now);
      muffleFilter.frequency.setTargetAtTime(resolved.cutoffHz, now, 0.13);
      muffleFilter.Q.cancelScheduledValues(now);
      muffleFilter.Q.setTargetAtTime(resolved.q, now, 0.13);
    },
    stop() {
      if (closed) return;
      closed = true;
      if (activeController === controller) activeController = null;
      // Instant zero + disconnect + close so cutting sound NEVER lingers.
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0, now);
        master.disconnect();
      } catch {
        /* ignore */
      }
      try {
        noise.stop();
        for (const osc of oscs) osc.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close().catch(() => {});
    },
  };

  activeController = controller;
  return controller;
}
