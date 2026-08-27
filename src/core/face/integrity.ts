import type { MonsterGrid, Particle, ParticlePart } from '../types';
import { nearBody } from './shading';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

export interface IntegrityReport {
  lidOffEye: number;
  floatingBrow: number;
  lashInEye: number;
  hairOverEye: number;
  mustacheOnMouth: number;
  eyeLattice: number;
  orphanLashEar: number;
  silhouetteLeak: number;
}

type CellLike = { col: number; row: number; part: ParticlePart };

function toEntries(src: MonsterGrid | Particle[]): CellLike[] {
  if (Array.isArray(src)) return src;
  return [...src.cells.values()];
}

function byKeyMap(entries: CellLike[]): Map<string, CellLike> {
  return new Map(entries.map((e) => [`${e.col},${e.row}`, e] as const));
}

function isEyeish(part: ParticlePart): boolean {
  return part === 'eye' || part === 'pupil';
}

function chebyshevToNearest(
  col: number,
  row: number,
  targets: CellLike[],
): number {
  let best = Infinity;
  for (const t of targets) {
    const d = Math.max(Math.abs(t.col - col), Math.abs(t.row - row));
    if (d < best) best = d;
  }
  return best;
}

/** Eyelid not ortho-adjacent to eye/eyelid, or floating off soft body. */
export function countLidOffEye(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const map = byKeyMap(entries);
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'eyelid') continue;
    let ok = false;
    for (const [dc, dr] of ORTHO) {
      const nb = map.get(`${e.col + dc},${e.row + dr}`);
      if (nb && (nb.part === 'eye' || nb.part === 'eyelid' || nb.part === 'pupil')) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      n++;
      continue;
    }
    // Soft body contact (or on body / eye / eyelid stack)
    const self = map.get(`${e.col},${e.row}`);
    if (self && (self.part === 'eyelid' || self.part === 'eye')) {
      // Check soft body via neighbors if we have a grid; particle path uses body neighbors
      let near = false;
      for (const [dc, dr] of [...ORTHO, ...DIAG]) {
        const nb = map.get(`${e.col + dc},${e.row + dr}`);
        if (nb && (nb.part === 'body' || nb.part === 'eye' || nb.part === 'eyelid' || nb.part === 'pupil')) {
          near = true;
          break;
        }
      }
      if (!near) n++;
    }
  }
  return n;
}

/** Brow cells whose Chebyshev distance to nearest eye/pupil/eyelid is ≥ 3. */
export function countFloatingBrow(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const anchors = entries.filter(
    (e) => e.part === 'eye' || e.part === 'pupil' || e.part === 'eyelid',
  );
  if (anchors.length === 0) return 0;
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'brow') continue;
    if (chebyshevToNearest(e.col, e.row, anchors) >= 3) n++;
  }
  return n;
}

/** Lash painted on eye/pupil cells. */
export function countLashInEye(src: MonsterGrid | Particle[]): number {
  // After generation, lash overwrites eye — detect lash with ≥3 ortho eyeish neighbors
  // or (on grid during paint) we can't see overwritten. Use sandwich heuristic:
  const entries = toEntries(src);
  const map = byKeyMap(entries);
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'lash') continue;
    let eyeN = 0;
    for (const [dc, dr] of ORTHO) {
      const nb = map.get(`${e.col + dc},${e.row + dr}`);
      if (nb && isEyeish(nb.part)) eyeN++;
    }
    if (eyeN >= 3) n++;
  }
  return n;
}

/** Hair sitting on eye/pupil — shouldn't happen after protected write; count as 0 always post-fix.
 *  Detect via hair with 4 ortho eye neighbors (impossible for rim hair) — rare.
 *  Better: hair key that has eye/pupil as same cell can't exist. Use: hair fully enclosed by eye. */
export function countHairOverEye(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const map = byKeyMap(entries);
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'hair') continue;
    let eyeN = 0;
    for (const [dc, dr] of ORTHO) {
      const nb = map.get(`${e.col + dc},${e.row + dr}`);
      if (nb && isEyeish(nb.part)) eyeN++;
    }
    // Interior of eye: 4 ortho eye neighbors
    if (eyeN >= 4) n++;
  }
  return n;
}

/** Mustache (or brow-as-stache) overlapping mouth/tooth. */
export function countMustacheOnMouth(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const map = byKeyMap(entries);
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'mustache' && e.part !== 'brow') continue;
    for (const [dc, dr] of ORTHO) {
      const nb = map.get(`${e.col + dc},${e.row + dr}`);
      // Same cell can't be both; check if mustache replaced mouth: mustache with mouth neighbors on 3+ sides
      // Actual overlap: part is mustache/brow but we look for mouth adjacency in mouth band — too loose.
      // Strict: mustache cell that has mouth/tooth as... can't share key.
      // Detect brow/mustache that sits IN mouth cavity: ≥2 ortho mouth/tooth neighbors
      if (nb && (nb.part === 'mouth' || nb.part === 'tooth')) {
        // count once per cell if ≥2 mouth neighbors
      }
    }
    let mouthN = 0;
    for (const [dc, dr] of ORTHO) {
      const nb = map.get(`${e.col + dc},${e.row + dr}`);
      if (nb && (nb.part === 'mouth' || nb.part === 'tooth')) mouthN++;
    }
    if (e.part === 'mustache' && mouthN >= 2) n++;
    // brow deep in mouth (mustache painted as brow historically)
    if (e.part === 'brow' && mouthN >= 3) n++;
  }
  return n;
}

/** Outline sandwiched by eye/pupil (ortho + diagonal). */
export function countEyeLattice(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const map = byKeyMap(entries);
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'outline') continue;
    const L = map.get(`${e.col - 1},${e.row}`);
    const R = map.get(`${e.col + 1},${e.row}`);
    const U = map.get(`${e.col},${e.row + 1}`);
    const D = map.get(`${e.col},${e.row - 1}`);
    if (
      (L && R && isEyeish(L.part) && isEyeish(R.part)) ||
      (U && D && isEyeish(U.part) && isEyeish(D.part))
    ) {
      n++;
      continue;
    }
    // Diagonal sandwich
    const NE = map.get(`${e.col + 1},${e.row + 1}`);
    const SW = map.get(`${e.col - 1},${e.row - 1}`);
    const NW = map.get(`${e.col - 1},${e.row + 1}`);
    const SE = map.get(`${e.col + 1},${e.row - 1}`);
    if (
      (NE && SW && isEyeish(NE.part) && isEyeish(SW.part)) ||
      (NW && SE && isEyeish(NW.part) && isEyeish(SE.part))
    ) {
      n++;
    }
  }
  return n;
}

/** Lash/ear without soft body/face bridge (ears allow soft-2 via tipFactor). */
export function countOrphanLashEar(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const map = byKeyMap(entries);
  let n = 0;
  for (const e of entries) {
    if (e.part !== 'lash' && e.part !== 'ear') continue;
    const radius = e.part === 'ear' ? 2 : 1;
    let near = false;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dc) + Math.abs(dr) > radius || (dc === 0 && dr === 0)) continue;
        const nb = map.get(`${e.col + dc},${e.row + dr}`);
        if (
          nb &&
          (nb.part === 'body' ||
            nb.part === 'appendage' ||
            nb.part === 'ear' ||
            nb.part === 'eyelid' ||
            nb.part === 'eye' ||
            nb.part === 'hair' ||
            nb.part === 'lash' ||
            nb.part === 'brow')
        ) {
          near = true;
          break;
        }
      }
      if (near) break;
    }
    if (!near) n++;
  }
  return n;
}

/** Grid-aware orphan check using nearBody when MonsterGrid is available. */
export function countOrphanLashEarOnGrid(grid: MonsterGrid): number {
  let n = 0;
  for (const c of grid.cells.values()) {
    if (c.part !== 'lash' && c.part !== 'ear') continue;
    if (!nearBody(grid, c.col, c.row, true, 1)) {
      if (c.part === 'ear' && nearBody(grid, c.col, c.row, true, 2)) continue;
      n++;
    }
  }
  return n;
}

/**
 * Eye/outline/lid/brow cells whose column sits outside the body span of this row ±1.
 * Catches hanging left-eye shards that stay 4-connected through the eye itself.
 */
export function countSilhouetteLeak(src: MonsterGrid | Particle[]): number {
  const entries = toEntries(src);
  const span = new Map<number, { minC: number; maxC: number }>();
  for (const e of entries) {
    if (e.part !== 'body') continue;
    const s = span.get(e.row);
    if (!s) span.set(e.row, { minC: e.col, maxC: e.col });
    else {
      s.minC = Math.min(s.minC, e.col);
      s.maxC = Math.max(s.maxC, e.col);
    }
  }
  const leakParts: ReadonlySet<ParticlePart> = new Set(['eye', 'outline', 'eyelid', 'brow']);
  let n = 0;
  for (const e of entries) {
    if (!leakParts.has(e.part)) continue;
    let ok = false;
    for (const dr of [-1, 0, 1] as const) {
      const s = span.get(e.row + dr);
      if (s && e.col >= s.minC - 1 && e.col <= s.maxC + 1) {
        ok = true;
        break;
      }
    }
    if (!ok) n++;
  }
  return n;
}

export function auditIntegrity(src: MonsterGrid | Particle[]): IntegrityReport {
  return {
    lidOffEye: countLidOffEye(src),
    floatingBrow: countFloatingBrow(src),
    lashInEye: countLashInEye(src),
    hairOverEye: countHairOverEye(src),
    mustacheOnMouth: countMustacheOnMouth(src),
    eyeLattice: countEyeLattice(src),
    orphanLashEar: countOrphanLashEar(src),
    silhouetteLeak: countSilhouetteLeak(src),
  };
}

export function sumDefects(r: IntegrityReport): number {
  return (
    r.lidOffEye +
    r.floatingBrow +
    r.lashInEye +
    r.hairOverEye +
    r.mustacheOnMouth +
    r.eyeLattice +
    r.orphanLashEar +
    r.silhouetteLeak
  );
}
