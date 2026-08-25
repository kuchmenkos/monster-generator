import type { MonsterData, Particle } from './types';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function keyOf(col: number, row: number): string {
  return `${col},${row}`;
}

/** Appendage cells not 4-connected to any body cell. */
export function countDetachedAppendages(particles: Particle[]): number {
  const solid = particles.filter((p) => p.part === 'body' || p.part === 'appendage');
  if (solid.length === 0) return 0;
  const keys = new Set(solid.map((p) => keyOf(p.col, p.row)));
  const bodyKeys = particles
    .filter((p) => p.part === 'body')
    .map((p) => keyOf(p.col, p.row));
  if (bodyKeys.length === 0) {
    return particles.filter((p) => p.part === 'appendage').length;
  }

  const visited = new Set<string>();
  const q = [...bodyKeys];
  for (const k of q) visited.add(k);
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++]!;
    const comma = cur.indexOf(',');
    const c = Number(cur.slice(0, comma));
    const r = Number(cur.slice(comma + 1));
    for (const [dc, dr] of ORTHO) {
      const nk = keyOf(c + dc, r + dr);
      if (!keys.has(nk) || visited.has(nk)) continue;
      visited.add(nk);
      q.push(nk);
    }
  }

  return particles.filter((p) => p.part === 'appendage' && !visited.has(keyOf(p.col, p.row)))
    .length;
}

export function uniqueBodyColors(particles: Particle[]): number {
  const colors = new Set<number>();
  for (const p of particles) {
    if (p.part === 'body') colors.add(p.color);
  }
  return colors.size;
}

/** Grill mouth: flat multi-row sandwich (barcode) — not a real open cavity. */
function grillMouthPenalty(mouths: Particle[]): number {
  const byCol = new Map<number, { rows: Set<number>; cavity: Set<number> }>();
  for (const p of mouths) {
    if (!p.mouthRole) continue;
    let entry = byCol.get(p.col);
    if (!entry) {
      entry = { rows: new Set(), cavity: new Set() };
      byCol.set(p.col, entry);
    }
    entry.rows.add(p.row);
    if (p.mouthRole === 'cavity') entry.cavity.add(p.row);
  }
  let grilled = 0;
  for (const { rows, cavity } of byCol.values()) {
    const cavH =
      cavity.size === 0 ? 0 : Math.max(...cavity) - Math.min(...cavity) + 1;
    // Thin slit + many stacked lip/outline rows = barcode grill
    if (rows.size >= 4 && cavH <= 1) grilled++;
  }
  if (grilled >= 4) return -14;
  if (grilled >= 2) return -7;
  return 0;
}

/**
 * Quality scorer for rejection sampling.
 * Higher = better. Penalizes "tile with a mask"; rewards organic mass + face focus.
 */
export function scoreMonster(data: MonsterData): number {
  const body = data.particles.filter(
    (p) => p.part === 'body' || p.part === 'appendage' || p.part === 'fleck',
  );
  if (body.length < 40) return -1000;

  let score = 0;

  // --- BBox fill (boxiness / tile) ---
  const cols = body.map((p) => p.col);
  const rows = body.map((p) => p.row);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);
  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  const bw = Math.max(1, maxC - minC + 1);
  const bh = Math.max(1, maxR - minR + 1);
  const fill = body.length / (bw * bh);
  if (fill > 0.78) score -= 70;
  else if (fill > 0.72) score -= 40;
  else if (fill > 0.65) score -= 16;
  else if (fill < 0.45) score += 10;
  else score += 6;

  // --- Row-width variance (organic silhouette) ---
  const widths: number[] = [];
  for (let r = minR; r <= maxR; r++) {
    let lo = Infinity;
    let hi = -Infinity;
    let any = false;
    for (const p of body) {
      if (p.row !== r) continue;
      any = true;
      lo = Math.min(lo, p.col);
      hi = Math.max(hi, p.col);
    }
    if (any) widths.push(hi - lo + 1);
  }
  let widthCv = 0;
  if (widths.length >= 4) {
    const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
    const variance =
      widths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / widths.length;
    widthCv = Math.sqrt(variance) / Math.max(1, mean);
    if (widthCv < 0.08) score -= 32;
    else if (widthCv < 0.15) score -= 12;
    else score += Math.min(18, widthCv * 40);
  }

  // --- Face validity ---
  const eyes = data.particles.filter((p) => p.part === 'eye');
  const pupils = data.particles.filter((p) => p.part === 'pupil');
  const mouths = data.particles.filter(
    (p) => p.part === 'mouth' || p.part === 'tooth' || (p.part === 'outline' && p.mouthRole),
  );
  if (eyes.length === 0) score -= 30;
  else score += 6;
  if (eyes.length > 0 && eyes.length < 4) score -= 12; // micro-eyes on empty mass
  if (pupils.length === 0) score -= 10;
  if (mouths.length === 0) score -= 20;
  else score += 6;
  if (mouths.some((p) => p.mouthRole === 'cavity')) score += 4;

  const upperLips = mouths.filter((p) => p.mouthRole === 'upper');
  const lowerLips = mouths.filter((p) => p.mouthRole === 'lower');
  const cavity = mouths.filter((p) => p.mouthRole === 'cavity');
  if (upperLips.length > 0 && lowerLips.length > 0) score += 6;
  const lipCount = upperLips.length + lowerLips.length;
  if (lipCount > 0 && cavity.length <= lipCount * 2.2) score += 3;
  score += grillMouthPenalty(mouths);
  // Prefer character grin/open-ish; no blanket sealed bonus
  if (data.mouthRest === 'grin') score += 4;
  if (mouths.some((p) => p.part === 'tooth')) score += 3;

  if (data.particles.some((p) => p.part === 'nose')) score += 4;
  const eyeTones = new Set(eyes.map((e) => e.color));
  if (eyeTones.size >= 2) score += 3;
  // Cyclops-like: one solid eye mass
  if (eyes.length >= 8 && pupils.length <= 4) score += 5;

  for (const pu of pupils) {
    if (pu.pupilRange && pu.pupilRange.x > 0) score += 1;
  }

  // --- Limbs / flecks ---
  const limbs = data.particles.filter((p) => p.part === 'appendage');
  const flecks = data.particles.filter((p) => p.part === 'fleck');
  if (limbs.length >= 8) score += 8;
  else if (limbs.length >= 3) score += 4;
  // Limbless is fine for likes — only soft nudge, not hard penalty
  else if (limbs.length === 0) score += 1;
  else score -= 2;
  // Wispy: many flecks relative to body mass reads as static scribble
  if (flecks.length > body.length * 0.12) score -= 8;
  else if (flecks.length >= 3 && flecks.length <= 12) score += 3;

  if (data.archetype === 'column' || data.archetype === 'wide' || data.archetype === 'stack') {
    score -= 40;
  }
  if (data.archetype === 'blob' || data.archetype === 'pear' || data.archetype === 'bighead') {
    score += 4;
  }
  if (data.archetype === 'lanky') score += 2;
  if (data.archetype === 'slug') score -= 4;

  // Aspect: punish square tiles and wide flat loaves with low width variance
  const aspect = bw / bh;
  if (aspect > 0.85 && aspect < 1.15) score -= 22;
  else if (aspect > 0.7 && aspect < 1.3) score -= 8;
  else score += 5;
  if (aspect > 1.45 && widthCv < 0.12) score -= 18; // flat brick loaf

  const detached = countDetachedAppendages(data.particles);
  if (detached > 0) score -= 40 + Math.min(40, detached);

  // Coat: a few tones good; too many = noisy static
  const tones = uniqueBodyColors(data.particles);
  if (tones >= 8) score -= 10;
  else if (tones >= 5) score += 8;
  else if (tones >= 3) score += 10;
  else if (tones <= 1) score -= 12;

  return score;
}

/** Quick helper for tests: bbox fill ratio of solid particles. */
export function bboxFill(particles: Particle[]): number {
  const body = particles.filter(
    (p) => p.part === 'body' || p.part === 'appendage',
  );
  if (body.length === 0) return 0;
  const minC = Math.min(...body.map((p) => p.col));
  const maxC = Math.max(...body.map((p) => p.col));
  const minR = Math.min(...body.map((p) => p.row));
  const maxR = Math.max(...body.map((p) => p.row));
  const area = Math.max(1, (maxC - minC + 1) * (maxR - minR + 1));
  return body.length / area;
}
