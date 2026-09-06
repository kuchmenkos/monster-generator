import { character, type Genome } from "./genome";
export class Voice {
  context?: AudioContext;
  source?: AudioBufferSourceNode;
  analyser?: AnalyserNode;
  data?: Uint8Array<ArrayBuffer>;
  abort?: AbortController;
  active = false;
  private utterance?: SpeechSynthesisUtterance;
  private timer?: ReturnType<typeof setTimeout>;
  private request = 0;
  private startedAt = 0;
  private boundaryAt = 0;
  private boundarySeen = false;
  private smoothed = 0;
  private lastLevelTime = 0;
  private text = "";
  onState: (state: string) => void = () => {};
  stop() {
    this.request++;
    this.abort?.abort();
    this.abort = undefined;
    this.source?.stop();
    this.source?.disconnect();
    this.source = undefined;
    this.analyser?.disconnect();
    this.analyser = undefined;
    speechSynthesis.cancel();
    this.utterance = undefined;
    clearTimeout(this.timer);
    this.active = false;
    this.smoothed = 0;
    this.onState("idle");
  }
  level() {
    if (!this.active) return 0;
    const now = performance.now(),
      dt = Math.min(0.1, (now - this.lastLevelTime) / 1000 || 1 / 60);
    this.lastLevelTime = now;
    let target = 0;
    if (this.analyser && this.data) {
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (const n of this.data) sum += ((n - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / this.data.length);
      target = rms < 0.012 ? 0 : Math.min(1, (rms - 0.012) * 7);
    } else {
      const age = (now - this.startedAt) / 1000;
      const local = this.boundarySeen
        ? (now - this.boundaryAt) / 1000
        : age % 1.1;
      const pause = this.boundarySeen ? local > 0.62 : local > 0.78;
      const punctuation = /[.,!?…]/.test(
        this.text[Math.floor(age * 11) % Math.max(1, this.text.length)] || "",
      );
      target =
        pause || punctuation ? 0 : 0.16 + Math.sin(local * 17) ** 2 * 0.53;
    }
    this.smoothed +=
      (target - this.smoothed) *
      (1 - Math.exp(-dt * (target > this.smoothed ? 25 : 18)));
    return this.smoothed < 0.009 ? 0 : this.smoothed;
  }
  async speak(text: string, g: Genome, provider: string, voiceId: string) {
    this.stop();
    const request = this.request;
    if (!text.trim()) throw new Error("Напиши фразу для своего чудика.");
    this.context ??= new AudioContext();
    await this.context.resume();
    if (request !== this.request) return;
    if (provider === "demo") {
      this.text = text;
      this.boundarySeen = false;
      this.onState("loading");
      const c = character(g);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU";
      u.pitch = c.pitch;
      u.rate = c.rate;
      this.utterance = u;
      u.onstart = () => {
        if (this.utterance !== u) return;
        this.active = true;
        this.startedAt = this.lastLevelTime = performance.now();
        this.onState("playing");
      };
      u.onboundary = (event) => {
        if (
          this.utterance === u &&
          (event.name === "word" || event.name === "sentence")
        ) {
          this.boundaryAt = performance.now();
          this.boundarySeen = true;
        }
      };
      u.onend = () => {
        if (this.utterance === u) this.stop();
      };
      u.onerror = () => {
        if (this.utterance === u) {
          this.stop();
          this.onState(
            "Браузер не смог озвучить фразу. Выберите ElevenLabs или попробуйте другой браузер.",
          );
        }
      };
      speechSynthesis.speak(u);
      this.timer = setTimeout(
        () => this.stop(),
        Math.min(60000, text.length * 180 + 6000),
      );
      return;
    }
    this.abort = new AbortController();
    this.onState("loading");
    try {
      const response = await fetch("/api/bulala/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: this.abort.signal,
        body: JSON.stringify({
          text,
          voiceId,
          seed: g.seed,
          pitch: character(g).pitch,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось создать озвучку.");
      }
      const buffer = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (request !== this.request) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(this.context.destination);
      this.analyser = analyser;
      this.data = new Uint8Array(analyser.fftSize);
      this.source = source;
      this.active = true;
      source.onended = () => {
        if (request === this.request) this.stop();
      };
      source.start();
      this.onState("playing");
    } catch (e) {
      if (request !== this.request) return;
      this.stop();
      throw e;
    }
  }
}
