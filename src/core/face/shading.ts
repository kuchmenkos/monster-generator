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

/** True if col/row is on body (or within 1-cell soft rim). */
export function nearBody(grid: MonsterGrid, col: number, row: number, soft = false): boolean {
  if (grid.cells.get(cellKey(col, row))?.part === 'body') return true;
  if (!soft) return false;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (grid.cells.get(cellKey(col + dc, row + dr))?.part === 'body') return true;
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

/** Outline ring around a set of local mask keys `"x,y"` placed at origin. */
export function paintOutlineRing(
  grid: MonsterGrid,
  originCol: number,
  originRow: number,
  mask: Set<string>,
  base: GridCell,
  outlineColor: number,
  thick = 1,
): void {
  for (let r = 1; r <= thick; r++) {
    for (const key of mask) {
      const [xs, ys] = key.split(',');
      const x = Number(xs);
      const y = Number(ys);
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
        [r, r],
        [-r, r],
        [r, -r],
        [-r, -r],
      ] as const) {
        const nk = `${x + dx},${y + dy}`;
        if (!mask.has(nk)) {
          putCell(grid, originCol + x + dx, originRow + y + dy, base, outlineColor, 'outline', {
            zBoost: 0.03,
          });
        }
      }
    }
  }
}
