import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { cellKey } from '../types';
import { paintWithShadow } from './shading';
import type { BrowStyle, EyeSlot } from './types';

/**
 * Procedural living brows — strand fibers on the actual eye rim
 * (never on the coat above the eye — that reads as the left-eye stamp).
 */
export function paintBrows(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eyes: EyeSlot[],
  base: GridCell,
  style: BrowStyle,
): void {
  if (eyes.length === 0) return;

  if (style === 'unibrow' && eyes.length >= 2) {
    paintUnibrow(grid, rng, palette, eyes, base);
    return;
  }

  for (const eye of eyes) {
    const local =
      rng.chance(0.18) && style !== 'thin'
        ? (rng.pick(['straight', 'angry', 'surprised', 'bushy', 'thin'] as BrowStyle[]) as BrowStyle)
        : style;
    paintOneBrow(grid, rng, palette, eye, base, local);
  }
}

function strandColor(rng: Rng, palette: MonsterPalette): number {
  const base = rng.chance(0.45) ? palette.brow : palette.hair;
  const roll = rng.float(0, 1);
  if (roll < 0.35) return darken(base, rng.float(0.05, 0.18));
  if (roll < 0.65) return lighten(base, rng.float(0.04, 0.14));
  return darken(base, 0.04);
}

/** Highest eye/pupil/eyelid row in this column within the eye slot (or -1). */
export function columnEyeTop(grid: MonsterGrid, eye: EyeSlot, dx: number): number {
  let top = -1;
  const col = eye.x + dx;
  for (let row = eye.y; row < eye.y + eye.h + 2; row++) {
    const c = grid.cells.get(cellKey(col, row));
    if (c && (c.part === 'eye' || c.part === 'pupil' || c.part === 'eyelid')) {
      if (row > top) top = row;
    }
  }
  return top;
}

const BROW_OVERWRITE: PaintOptsAllow = ['eye', 'eyelid'];

type PaintOptsAllow = Array<'eye' | 'eyelid'>;

function paintUnibrow(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eyes: EyeSlot[],
  base: GridCell,
): void {
  const left = eyes.reduce((a, b) => (a.x < b.x ? a : b));
  const right = eyes.reduce((a, b) => (a.x > b.x ? a : b));
  const x0 = left.x;
  const x1 = right.x + right.w - 1;

  for (let c = x0; c <= x1; c++) {
    // Only columns that actually have an eye rim — skip the forehead gap
    let top = -1;
    for (const eye of eyes) {
      const dx = c - eye.x;
      if (dx < 0 || dx >= eye.w) continue;
      const t = columnEyeTop(grid, eye, dx);
      if (t > top) top = t;
    }
    if (top < 0) continue;
    paintWithShadow(grid, c, top, base, strandColor(rng, palette), 'brow', {
      zBoost: 0.05,
      soft: true,
      size: rng.float(0.85, 1),
      hairStrand: c,
      tipFactor: 0.3,
      phase: base.phase + c * 0.15,
      shadow: false,
      allowOverwrite: BROW_OVERWRITE,
    });
    const below = grid.cells.get(cellKey(c, top - 1));
    if (below && (below.part === 'eye' || below.part === 'eyelid')) {
      paintWithShadow(grid, c, top - 1, base, strandColor(rng, palette), 'brow', {
        zBoost: 0.052,
        soft: true,
        size: rng.float(0.8, 0.95),
        hairStrand: c + 80,
        tipFactor: 0.4,
        phase: base.phase + c * 0.2 + 0.5,
        shadow: false,
        allowOverwrite: BROW_OVERWRITE,
      });
    }
  }
}

function paintOneBrow(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eye: EyeSlot,
  base: GridCell,
  style: BrowStyle,
): void {
  for (let dx = 0; dx < eye.w; dx++) {
    const top = columnEyeTop(grid, eye, dx);
    if (top < 0) continue;

    paintWithShadow(grid, eye.x + dx, top, base, strandColor(rng, palette), 'brow', {
      zBoost: 0.05,
      soft: true,
      faceSide: eye.side === 0 ? undefined : eye.side,
      size: style === 'thin' ? 0.8 : rng.float(0.85, 1.05),
      hairStrand: dx,
      tipFactor: 0.25,
      phase: base.phase + dx * 0.2,
      shadow: false,
      allowOverwrite: BROW_OVERWRITE,
    });

    // Second row down into the eye (thickBrow gate) — never onto the coat
    if (style === 'bushy' || style === 'angry' || (style !== 'thin' && rng.chance(0.55))) {
      const y2 = top - 1;
      const below = grid.cells.get(cellKey(eye.x + dx, y2));
      if (below && (below.part === 'eye' || below.part === 'eyelid' || below.part === 'brow')) {
        paintWithShadow(grid, eye.x + dx, y2, base, strandColor(rng, palette), 'brow', {
          zBoost: 0.052,
          soft: true,
          faceSide: eye.side === 0 ? undefined : eye.side,
          size: rng.float(0.8, 0.95),
          hairStrand: dx + 50,
          tipFactor: 0.4,
          phase: base.phase + dx * 0.25 + 0.7,
          shadow: false,
          allowOverwrite: BROW_OVERWRITE,
        });
      }
    }
  }
}
