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

/**
 * Quality scorer for rejection sampling.
 * Higher = better. Penalizes boxy silhouettes; rewards limbs, face, organic edges.
 */
export function scoreMonster(data: MonsterData): number {
  const body = data.particles.filter(
    (p) => p.part === 'body' || p.part === 'appendage' || p.part === 'fleck',
  );
  if (body.length < 40) return -1000;

  let score = 0;

  // --- BBox fill (boxiness) ---
  const cols = body.map((p) => p.col);
  const rows = body.map((p) => p.row);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);
  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  const bw = Math.max(1, maxC - minC + 1);
  const bh = Math.max(1, maxR - minR + 1);
  const fill = body.length / (bw * bh);
  if (fill > 0.78) score -= 55;
  else if (fill > 0.72) score -= 28;
  else if (fill > 0.65) score -= 10;
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
  if (widths.length >= 4) {
    const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
    const variance =
      widths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / widths.length;
    const cv = Math.sqrt(variance) / Math.max(1, mean);
    if (cv < 0.08) score -= 25; // almost constant width = column/box
    else if (cv < 0.15) score -= 8;
    else score += Math.min(18, cv * 40);
  }

  // --- Face validity ---
  const eyes = data.particles.filter((p) => p.part === 'eye');
  const pupils = data.particles.filter((p) => p.part === 'pupil');
  const mouths = data.particles.filter(
    (p) => p.part === 'mouth' || p.part === 'tooth',
  );
  if (eyes.length === 0) score -= 30;
  else score += 6;
  if (pupils.length === 0) score -= 10;
  if (mouths.length === 0) score -= 20;
  else score += 6;
  if (mouths.some((p) => p.mouthRole === 'cavity')) score += 4;

  // Soft bonuses — nose / tooth variety / chunky limbs (no new hard rejects)
  const noses = data.particles.filter((p) => p.part === 'nose');
  if (noses.length >= 2) score += 4;
  const teeth = data.particles.filter((p) => p.part === 'tooth');
  if (teeth.length >= 4) score += 3;
  if (teeth.length >= 8) score += 2;

  // Pupil within range metadata
  for (const pu of pupils) {
    if (pu.pupilRange && pu.pupilRange.x > 0) score += 1;
  }

  // --- Limbs / flecks ---
  const limbs = data.particles.filter((p) => p.part === 'appendage');
  const flecks = data.particles.filter((p) => p.part === 'fleck');
  if (limbs.length >= 8) score += 10;
  else if (limbs.length >= 3) score += 4;
  else score -= 6;
  // Chunky limb bonus (many appendage cells ≈ thicker paths)
  if (limbs.length >= 40 && limbs.length <= 350) score += 4;
  if (flecks.length >= 4) score += 4;

  // Prefer non-boxy archetypes slightly
  if (data.archetype === 'column' || data.archetype === 'wide' || data.archetype === 'stack') score -= 40;
  if (data.archetype === 'lanky' || data.archetype === 'bighead' || data.archetype === 'pear') {
    score += 3;
  }
  if (
    data.archetype === 'peanut' ||
    data.archetype === 'lobed' ||
    data.archetype === 'crescent' ||
    data.archetype === 'vase'
  ) {
    score += 2;
  }
  if (data.archetype === 'slug') score -= 4;

  // Aspect ratio extreme bonus (not square)
  const aspect = bw / bh;
  if (aspect > 0.85 && aspect < 1.15) score -= 14; // near-square bbox
  else if (aspect > 0.7 && aspect < 1.3) score -= 5;
  else score += 5;

  // Detached limbs (flood-fill from body)
  const detached = countDetachedAppendages(data.particles);
  if (detached > 0) score -= 40 + Math.min(40, detached);

  // Coat richness — cel-shading + patterns should yield several tones
  const tones = uniqueBodyColors(data.particles);
  if (tones >= 4) score += 10;
  else if (tones >= 3) score += 6;
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
