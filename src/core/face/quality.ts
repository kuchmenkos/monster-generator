import type { MonsterGrid, Particle, ParticlePart } from '../types';

const FACE_PARTS: ReadonlySet<ParticlePart> = new Set([
  'eye',
  'pupil',
  'mouth',
  'tooth',
  'outline',
  'brow',
  'eyelid',
  'lash',
  'nose',
  'freckle',
  'ear',
  'hair',
]);

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Soft cap for gallery / detail 60fps (MonsterView sprite budget). */
export const PARTICLE_BUDGET = 4000;

function isWalkablePart(part: ParticlePart): boolean {
  return part === 'body' || part === 'appendage' || FACE_PARTS.has(part);
}

/**
 * Keys reachable from any body cell via 4-connected body/appendage/face bridge.
 * Face cells outside this set are floating defects.
 */
function reachableFromBody(
  entries: Iterable<{ col: number; row: number; part: ParticlePart }>,
): Set<string> {
  const walkable = new Set<string>();
  const bodyKeys: string[] = [];
  for (const e of entries) {
    const k = `${e.col},${e.row}`;
    if (isWalkablePart(e.part)) walkable.add(k);
    if (e.part === 'body') bodyKeys.push(k);
  }

  const visited = new Set<string>();
  if (bodyKeys.length === 0) return visited;

  const q = [...bodyKeys];
  for (const k of q) visited.add(k);
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++]!;
    const comma = cur.indexOf(',');
    const c = Number(cur.slice(0, comma));
    const r = Number(cur.slice(comma + 1));
    for (const [dc, dr] of ORTHO) {
      const nk = `${c + dc},${r + dr}`;
      if (!walkable.has(nk) || visited.has(nk)) continue;
      visited.add(nk);
      q.push(nk);
    }
  }
  return visited;
}

/**
 * Remove face particles that are not 4-connected to the body silhouette
 * (via face/appendage bridge). Returns count removed.
 */
export function pruneFloatingFeatures(grid: MonsterGrid): number {
  const visited = reachableFromBody(grid.cells.values());
  if (visited.size === 0) {
    // No body — drop all face parts (broken candidate)
    let removed = 0;
    for (const [k, c] of [...grid.cells.entries()]) {
      if (FACE_PARTS.has(c.part) && grid.cells.delete(k)) removed++;
    }
    return removed;
  }

  let removed = 0;
  for (const [k, c] of [...grid.cells.entries()]) {
    if (!FACE_PARTS.has(c.part)) continue;
    if (visited.has(`${c.col},${c.row}`)) continue;
    if (grid.cells.delete(k)) removed++;
  }
  return removed;
}

/** Count face particles not 4-connected to any body cell (via face/appendage bridge). */
export function countFloatingFaceParticles(particles: Particle[]): number {
  const visited = reachableFromBody(particles);
  if (visited.size === 0) {
    return particles.filter((p) => FACE_PARTS.has(p.part)).length;
  }
  return particles.filter((p) => FACE_PARTS.has(p.part) && !visited.has(`${p.col},${p.row}`))
    .length;
}

/** Drop floating face particles from the particle list (post-grid safety net). */
export function stripFloatingFaceParticles(particles: Particle[]): Particle[] {
  const visited = reachableFromBody(particles);
  if (visited.size === 0) {
    return particles.filter((p) => !FACE_PARTS.has(p.part));
  }
  return particles.filter((p) => !FACE_PARTS.has(p.part) || visited.has(`${p.col},${p.row}`));
}

/** Cap particle list for 60fps — drop decorative first; never sacrifice core face. */
export function enforceParticleBudget(particles: Particle[], max = PARTICLE_BUDGET): Particle[] {
  if (particles.length <= max) return particles;

  const isCoreFace = (p: Particle): boolean =>
    p.part === 'eye' ||
    p.part === 'pupil' ||
    p.part === 'mouth' ||
    p.part === 'tooth' ||
    p.part === 'nose' ||
    p.part === 'brow' ||
    p.part === 'eyelid';

  let out = particles;
  const drop = (pred: (p: Particle) => boolean) => {
    if (out.length <= max) return;
    const keep = out.filter((p) => !pred(p) || isCoreFace(p));
    if (keep.some((p) => p.part === 'body')) out = keep;
  };
  drop((p) => p.part === 'aura');
  drop((p) => p.part === 'fleck');
  drop((p) => p.part === 'hair' && p.tipFactor > 0.7);
  drop((p) => p.part === 'freckle');
  drop((p) => p.part === 'outline');
  drop((p) => p.part === 'lash');
  drop((p) => p.part === 'ear' && p.tipFactor > 0.55);

  if (out.length <= max) return out;

  // Tiered keep: core face → body → appendage → rest
  const core = out.filter(isCoreFace);
  const body = out.filter((p) => p.part === 'body');
  const limbs = out.filter((p) => p.part === 'appendage');
  const rest = out.filter(
    (p) => !isCoreFace(p) && p.part !== 'body' && p.part !== 'appendage',
  );

  const pick = [...core];
  const take = (arr: Particle[], room: number) => {
    if (room <= 0 || arr.length === 0) return 0;
    const n = Math.min(room, arr.length);
    // Prefer central / lower tipFactor when thinning body mass
    const sorted = [...arr].sort((a, b) => a.tipFactor - b.tipFactor || a.z - b.z);
    pick.push(...sorted.slice(0, n));
    return n;
  };

  let room = max - pick.length;
  room -= take(body, room);
  room -= take(limbs, Math.max(0, room));
  take(rest, Math.max(0, room));
  return pick.slice(0, max);
}
