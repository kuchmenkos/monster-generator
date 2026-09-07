export type Mood = "neutral" | "happy" | "sad";
export type Reaction = "smile" | "shout" | "sigh" | "pet" | "shiver" | "chew";
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export class SoftSpring {
  value = 0;
  velocity = 0;
  update(dt: number, angularVelocity: number, reduced = false) {
    if (reduced) {
      this.value = this.velocity = 0;
      return 0;
    }
    let remaining = clamp(dt, 0, 0.1);
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 120);
      const force = -clamp(angularVelocity, -8, 8) * 1.3;
      this.velocity += (force - 95 * this.value - 14 * this.velocity) * h;
      this.value = clamp(this.value + this.velocity * h, -0.12, 0.12);
      remaining -= h;
    }
    if (Math.abs(this.value) < 0.00001 && Math.abs(this.velocity) < 0.00001)
      this.value = this.velocity = 0;
    return this.value;
  }
}
export class ExpressionController {
  mood: Mood = "neutral";
  reaction: Reaction | null = null;
  elapsed = 0;
  trigger(reaction: Reaction) {
    this.reaction = reaction;
    this.elapsed = 0;
  }
  update(dt: number, speech: number, reduced: boolean) {
    this.elapsed += Math.min(0.1, Math.max(0, dt));
    const duration =
      this.reaction === "pet"
        ? 1.9
        : this.reaction === "sigh"
          ? 2.2
          : this.reaction === "shiver"
            ? 2.1
            : this.reaction === "chew"
              ? 1.8
              : 1.65;
    if (this.elapsed >= duration) this.reaction = null;
    const t = this.reaction ? this.elapsed / duration : 0;
    const envelope = this.reaction ? Math.sin(Math.PI * t) ** 0.7 : 0;
    let smile = this.mood === "happy" ? 0.65 : this.mood === "sad" ? -0.55 : 0;
    if (this.reaction === "smile" || this.reaction === "pet")
      smile += (1 - smile) * envelope;
    if (this.reaction === "chew") smile += envelope * 0.35;
    let open = 0,
      round = 0;
    if (this.reaction === "shout") {
      open = envelope;
      round = envelope * 0.75;
    }
    if (this.reaction === "sigh") {
      open = envelope * 0.42;
      round = envelope;
    }
    if (this.reaction === "chew") {
      const chew = Math.abs(Math.sin(this.elapsed * Math.PI * 3.2));
      open = chew * 0.55 * (1 - t * 0.35);
      round = chew * 0.4;
    }
    if (this.reaction === "shiver") {
      open = envelope * 0.12;
      round = envelope * 0.35;
    }
    if (speech > 0.015) {
      open = speech;
      round = 0.3 + 0.28 * Math.sin(this.elapsed * 9);
    }
    let hop = 0,
      roll = 0;
    if (this.reaction === "pet" && !reduced) {
      const beat = this.elapsed / 0.62;
      if (beat < 2) {
        const arc = Math.sin(Math.PI * (beat % 1));
        hop = arc * 0.17;
        roll = arc * (beat < 1 ? 1 : -1) * 0.11;
      }
    }
    if (this.reaction === "shiver" && !reduced) {
      hop = Math.sin(this.elapsed * 42) * 0.02 * envelope;
      roll = Math.sin(this.elapsed * 38) * 0.08 * envelope;
    }
    if (this.reaction === "chew" && !reduced) {
      hop = Math.abs(Math.sin(this.elapsed * Math.PI * 3.2)) * 0.04;
    }
    return {
      smile,
      open: clamp(open, 0, 1),
      round,
      hop,
      roll,
      press: this.reaction === "pet" ? envelope * 0.055 : 0,
      sigh: this.reaction === "sigh" || this.reaction === "shiver" ? envelope : 0,
    };
  }
}
