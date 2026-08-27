import { darken, lighten } from '../palette';
import type { GridCell, LidRole, MonsterGrid, MouthRole, ParticlePart } from '../types';
import { cellKey } from '../types';

export interface PaintOpts {
  zBoost?: number;
  size?: number;
  mouthRole?: MouthRole;
  lidRole?: LidRole;
  faceSide?: -1 | 1;
  hairStrand?: number;
  tipFactor?: number;
  glow?: boolean;
  phase?: number;
  /** Soft: allow 1-cell off body rim */
  soft?: boolean;
  /** Add cel shadow cell down-right */
  shadow?: boolean;
  /** Add highlight cell up-left for larger features */
  highlight?: boolean;
}

export function bodyOnly(grid: MonsterGrid): GridCell[] {
  return [...grid.cells.values()].filter((c) => c.part === 'body');
}

/** True if col/row is on body (or within softRadius ortho/manhattan steps). */
export function nearBody(
  grid: MonsterGrid,
  col: number,
  row: number,
  soft = false,
  softRadius = 1,
): boolean {
  if (grid.cells.get(cellKey(col, row))?.part === 'body') return true;
  if (!soft) return false;
  const r = Math.max(1, softRadius);
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      if (Math.abs(dc) + Math.abs(dr) > r || (dc === 0 && dr === 0)) continue;
      if (grid.cells.get(cellKey(col + dc, row + dr))?.part === 'body') return true;
      // Also accept appendage/ear stalk as bridge for tip growth
      const nb = grid.cells.get(cellKey(col + dc, row + dr));
      if (nb && (nb.part === 'appendage' || nb.part === 'ear')) return true;
    }
  }
  return false;
}

/** Allow paint on body OR existing face parts (for layered features). */
export function nearFaceSurface(grid: MonsterGrid, col: number, row: number, soft = true): boolean {
  const c = grid.cells.get(cellKey(col, row));
  if (c && c.part !== 'aura') return true;
  return nearBody(grid, col, row, soft);
}

export function putCell(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  color: number,
  part: ParticlePart,
  opts: PaintOpts = {},
): void {
  const key = cellKey(col, row);
  grid.cells.set(key, {
    col,
    row,
    x: grid.originX + col * grid.cell,
    y: grid.originY + row * grid.cell,
    z: base.z + (opts.zBoost ?? 0.02),
    nx: 0.1,
    ny: 0.1,
    nz: 1,
    color,
    part,
    phase: opts.phase ?? base.phase,
    size: opts.size ?? 1,
    tipFactor: opts.tipFactor ?? 0,
    mouthRole: opts.mouthRole,
    lidRole: opts.lidRole,
    faceSide: opts.faceSide,
    hairStrand: opts.hairStrand,
    glow: opts.glow,
  });
}

/**
 * Cel-shaded feature paint: fill + optional shadow/highlight.
 * Light from top-left → shadow down-right.
 */
export function paintWithShadow(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  fillColor: number,
  part: ParticlePart,
  opts: PaintOpts = {},
): boolean {
  const soft = opts.soft ?? false;
  if (!nearFaceSurface(grid, col, row, soft) && part !== 'hair' && part !== 'ear' && part !== 'lash') {
    // Hair/ears/lashes may grow slightly off body — still require soft contact for others
    if (!nearBody(grid, col, row, true)) return false;
  }

  putCell(grid, col, row, base, fillColor, part, opts);

  if (opts.shadow) {
    const sc = col + 1;
    const sr = row - 1;
    if (!grid.cells.has(cellKey(sc, sr)) || grid.cells.get(cellKey(sc, sr))?.part === 'body') {
      putCell(grid, sc, sr, base, darken(fillColor, 0.22), part, {
        ...opts,
        zBoost: (opts.zBoost ?? 0.02) - 0.004,
        size: (opts.size ?? 1) * 0.9,
      });
    }
  }

  if (opts.highlight) {
    const hc = col - 1;
    const hr = row + 1;
    if (!grid.cells.has(cellKey(hc, hr)) || grid.cells.get(cellKey(hc, hr))?.part === 'body') {
      putCell(grid, hc, hr, base, lighten(fillColor, 0.18), part, {
        ...opts,
        zBoost: (opts.zBoost ?? 0.02) + 0.002,
        size: (opts.size ?? 1) * 0.75,
      });
    }
  }

  return true;
}

/** Exterior-only outline ring — never fills interior holes in the mask. */
export function paintOutlineRing(
  grid: MonsterGrid,
  originCol: number,
  originRow: number,
  mask: Set<string>,
  base: GridCell,
  outlineColor: number,
  thick = 1,
): void {
  const ORTHO = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const DIAG = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const;

  // Dilate mask by `thick`, then paint only cells in dilate \ mask that touch mask
  const border = new Set<string>();
  for (const key of mask) {
    const [xs, ys] = key.split(',').map(Number) as [number, number];
    for (let r = 1; r <= thick; r++) {
      for (const [dx, dy] of [...ORTHO, ...DIAG]) {
        const nk = `${xs + dx * r},${ys + dy * r}`;
        if (!mask.has(nk)) border.add(nk);
      }
    }
  }

  for (const key of border) {
    const [xs, ys] = key.split(',').map(Number) as [number, number];
    // Must be adjacent (ortho) to at least one mask cell — skip deep interior cavities
    let touches = false;
    for (const [dx, dy] of ORTHO) {
      if (mask.has(`${xs + dx},${ys + dy}`)) {
        touches = true;
        break;
      }
    }
    if (!touches) continue;
    putCell(grid, originCol + xs, originRow + ys, base, outlineColor, 'outline', {
      zBoost: 0.03,
    });
  }
}
