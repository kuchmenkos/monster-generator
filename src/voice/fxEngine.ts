import type { VoiceFxPreset } from './traitCatalogs';

function makeDistortionCurve(amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = Math.max(0.01, amount) * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Short, quiet room IR — not a cathedral. */
function makeTinyRoom(ctx: AudioContext, amount: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * (0.08 + amount * 0.12));
  const impulse = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4 + amount * 4) * 0.35;
    }
  }
  return impulse;
}

function chainCharacter(ctx: AudioContext, input: AudioNode, preset: VoiceFxPreset): AudioNode {
  let node: AudioNode = input;

  if (preset.highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = preset.highpass;
    hp.Q.value = 0.7;
    node.connect(hp);
    node = hp;
  }

  if (preset.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = preset.lowpass;
    lp.Q.value = 0.7;
    node.connect(lp);
    node = lp;
  }

  if (preset.formant) {
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = preset.formant;
    peak.gain.value = preset.formantGain ?? 6;
    peak.Q.value = preset.formantQ ?? 3;
    node.connect(peak);
    node = peak;
  }

  if (preset.distortion && preset.distortion > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(preset.distortion);
    shaper.oversample = '2x';
    node.connect(shaper);
    node = shaper;
  }

  if (preset.bitcrush && preset.bitcrush > 0) {
    const crush = ctx.createWaveShaper();
    const steps = Math.max(2, Math.round(preset.bitcrush));
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    crush.curve = curve;
    node.connect(crush);
    node = crush;
  }

  return node;
}

/**
 * Monster FX engine: dry character path (pitch + formant + grit).
 * Optional dual layer for growl/alien. Almost no echo/hall.
 */
export class VoiceFxEngine {
  private ctx: AudioContext | null = null;
  private currentSources: AudioBufferSourceNode[] = [];

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  stop(): void {
    for (const s of this.currentSources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.currentSources = [];
  }

  async play(buffer: AudioBuffer, preset: VoiceFxPreset, voicePitch = 0): Promise<void> {
    this.stop();
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = preset.gain ?? 1;
    master.connect(ctx.destination);

    const rate = Math.max(0.5, Math.min(1.6, preset.playbackRate * (1 + voicePitch * 0.12)));

    const main = ctx.createBufferSource();
    main.buffer = buffer;
    main.playbackRate.value = rate;
    const shaped = chainCharacter(ctx, main, preset);
    shaped.connect(master);

    // Optional quiet room — capped hard
    const roomAmt = Math.min(0.18, preset.room ?? 0);
    if (roomAmt > 0.02) {
      const convolver = ctx.createConvolver();
      convolver.buffer = makeTinyRoom(ctx, roomAmt);
      const roomGain = ctx.createGain();
      roomGain.gain.value = roomAmt;
      shaped.connect(convolver);
      convolver.connect(roomGain);
      roomGain.connect(master);
    }

    this.currentSources = [main];
    main.start();

    // Dual layer (growl / alien) — same buffer, different rate
    if (preset.dualRate && preset.dualRate > 0) {
      const dual = ctx.createBufferSource();
      dual.buffer = buffer;
      dual.playbackRate.value = Math.max(0.45, Math.min(1.7, preset.dualRate));
      const dualShaped = chainCharacter(ctx, dual, {
        ...preset,
        formantGain: (preset.formantGain ?? 6) * 0.7,
        distortion: (preset.distortion ?? 0) * 0.8,
      });
      const dualGain = ctx.createGain();
      dualGain.gain.value = preset.dualGain ?? 0.4;
      dualShaped.connect(dualGain);
      dualGain.connect(master);
      dual.start();
      this.currentSources.push(dual);
    }

    const sources = this.currentSources;
    return new Promise((resolve) => {
      let left = sources.length;
      for (const s of sources) {
        s.onended = () => {
          left -= 1;
          if (left <= 0) {
            if (this.currentSources === sources) this.currentSources = [];
            resolve();
          }
        };
      }
    });
  }

  async decodeAndPlay(wavOrPcm: ArrayBuffer, preset: VoiceFxPreset, voicePitch = 0): Promise<void> {
    const ctx = this.ensureContext();
    const buffer = await ctx.decodeAudioData(wavOrPcm.slice(0));
    await this.play(buffer, preset, voicePitch);
  }
}

export const sharedFxEngine = new VoiceFxEngine();
