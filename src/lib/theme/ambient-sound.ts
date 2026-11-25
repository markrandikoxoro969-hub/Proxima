/**
 * Lightweight Web Audio API soundscapes for non-video themes (Night Drive photo
 * theme and the procedural Sky / Ocean / Nature scenes).
 *
 * Zero network downloads and tiny CPU footprint: one filtered noise buffer plus
 * a quiet low-passed harmonic pad. Cleans up completely when stopped.
 */

export type AmbientKind = "night-drive" | "ocean" | "sky" | "nature";

export type AmbientController = {
  setVolume: (volume: number) => void;
  stop: () => void;
};

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
  initialVolume: number,
): Promise<AmbientController | null> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      await ctx.close().catch(() => {});
      return null;
    }
  }
  if (ctx.state !== "running") {
    await ctx.close().catch(() => {});
    return null;
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.linearRampToValueAtTime(Math.max(0.0001, initialVolume * 0.28), ctx.currentTime + 0.6);
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
    padGain.connect(master);

    for (const freq of [130.81, 155.56, 196.0, 233.08]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(padFilter);
      osc.start();
      oscs.push(osc);
    }
  } else if (kind === "ocean") {
    // Slow rolling ocean surf with an LFO modulating cutoff + gain
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
    padGain.connect(master);
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
  noiseGain.connect(master);
  noise.start();

  let closed = false;

  return {
    setVolume(vol: number) {
      if (closed) return;
      const target = Math.max(0.0001, vol * 0.28);
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
    },
    stop() {
      if (closed) return;
      closed = true;
      try {
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        try {
          noise.stop();
          for (const osc of oscs) osc.stop();
        } catch {
          /* already stopped */
        }
        void ctx.close().catch(() => {});
      }, 220);
    },
  };
}
