import type { Rng } from './rng';
import type { MonsterPalette } from './types';

/** Pack HSL (h 0-360, s/l 0-1) into 0xRRGGBB. */
export function hslToRgb(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

export function lighten(rgb: number, amount: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return (nr << 16) | (ng << 8) | nb;
}

export function darken(rgb: number, amount: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const nr = Math.round(r * (1 - amount));
  const ng = Math.round(g * (1 - amount));
  const nb = Math.round(b * (1 - amount));
  return (nr << 16) | (ng << 8) | nb;
}

type Harmony = 'analogous' | 'complementary' | 'triad' | 'split';

/**
 * Tight 3–5 color palette per monster — vibrant but limited,
 * matching the reference "one dominant hue + accents" look.
 */
export function generatePalette(rng: Rng): MonsterPalette {
  const harmony = rng.pick<Harmony>(['analogous', 'complementary', 'triad', 'split']);

  // Prefer saturated mid-tones for Real Monsters vibes
  const hue = rng.float(0, 360);
  const sat = rng.float(0.55, 0.92);
  const lit = rng.float(0.38, 0.58);

  let accentHue = hue;
  switch (harmony) {
    case 'analogous':
      accentHue = hue + rng.pick([-40, -25, 25, 40]);
      break;
    case 'complementary':
      accentHue = hue + 180 + rng.float(-12, 12);
      break;
    case 'triad':
      accentHue = hue + rng.pick([120, 240]) + rng.float(-10, 10);
      break;
    case 'split':
      accentHue = hue + rng.pick([150, 210]) + rng.float(-8, 8);
      break;
  }

  const base = hslToRgb(hue, sat, lit);
  const highlight = hslToRgb(hue + rng.float(-8, 8), Math.min(1, sat * 0.85), Math.min(0.78, lit + 0.22));
  const shadow = hslToRgb(hue + rng.float(-5, 5), Math.min(1, sat * 1.05), Math.max(0.12, lit - 0.22));
  const outline = hslToRgb(hue, sat * 0.6, Math.max(0.06, lit - 0.35));
  const accent = hslToRgb(accentHue, rng.float(0.65, 0.95), rng.float(0.45, 0.65));
  const accent2Hue = hue + rng.pick([60, 90, 180, 210, 270]) + rng.float(-15, 15);
  const accent2 = hslToRgb(accent2Hue, rng.float(0.55, 0.95), rng.float(0.4, 0.7));
  const mouth = hslToRgb(rng.float(350, 380), rng.float(0.55, 0.85), rng.float(0.22, 0.38));
  const lip = lighten(mouth, rng.float(0.12, 0.28));
  const eyeWhite = hslToRgb(rng.float(40, 70), rng.float(0.05, 0.2), rng.float(0.88, 0.97));
  const pupil = hslToRgb(rng.float(200, 260), rng.float(0.1, 0.4), rng.float(0.05, 0.18));

  return { base, highlight, shadow, outline, accent, accent2, mouth, lip, eyeWhite, pupil };
}
