/**
 * Procedural SFX via WebAudio — no asset files.
 * Mute persists in localStorage `bulala-sfx`.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const KEY = "bulala-sfx";

export function sfxEnabled(): boolean {
  const v = localStorage.getItem(KEY);
  return v !== "0";
}

export function setSfxEnabled(on: boolean) {
  localStorage.setItem(KEY, on ? "1" : "0");
  if (master) master.gain.value = on ? 0.55 : 0;
}

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = sfxEnabled() ? 0.55 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 0.2,
  slideTo?: number,
) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur: number, gain = 0.15, filterFreq = 1200) {
  const c = ac();
  if (!c || !master) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  const g = c.createGain();
  const t0 = c.currentTime;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

export function gong() {
  tone(220, 1.4, "sine", 0.28, 110);
  tone(330, 1.1, "triangle", 0.12, 165);
  noiseBurst(0.08, 0.08, 400);
}

export function crack() {
  noiseBurst(0.12, 0.22, 2400);
  tone(180, 0.08, "square", 0.08, 60);
}

export function bubble() {
  tone(520 + Math.random() * 200, 0.18, "sine", 0.1, 180);
}

export function pop() {
  tone(640, 0.12, "sine", 0.16, 180);
}

export function whoosh() {
  noiseBurst(0.28, 0.12, 800);
  tone(240, 0.25, "sawtooth", 0.04, 80);
}

export function heart() {
  tone(520, 0.12, "sine", 0.12);
  setTimeout(() => tone(680, 0.16, "sine", 0.1), 90);
}
