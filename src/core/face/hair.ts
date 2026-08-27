import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { cellKey } from '../types';
import { putCell } from './shading';
import type { HairStyle } from './types';

/** Axis-aligned pad around eyes — hair here reads as the left-eye smear. */
interface EyeKeepout {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
  maxBodyR: number;
}

function faceKeepout(grid: MonsterGrid, maxBodyR: number): EyeKeepout | null {
  let minC = Infinity;
  let maxC = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  let found = false;
  for (const c of grid.cells.values()) {
    if (
      c.part !== 'eye' &&
      c.part !== 'pupil' &&
      c.part !== 'eyelid' &&
      c.part !== 'outline' &&
      c.part !== 'brow'
    ) {
      continue;
    }
    found = true;
    minC = Math.min(minC, c.col);
    maxC = Math.max(maxC, c.col);
    minR = Math.min(minR, c.row);
    maxR = Math.max(maxR, c.row);
  }
  if (!found) return { minC: 0, maxC: 0, minR: 0, maxR: 0, maxBodyR };
  return { minC: minC - 2, maxC: maxC + 2, minR: minR - 1, maxR: maxR + 2, maxBodyR };
}

function inKeepout(k: EyeKeepout | null, _col: number, row: number): boolean {
  if (!k) return false;
  // Never paint hair on the silhouette or in the forehead band above the eyes
  if (row <= k.maxBodyR) return true;
  if (row <= k.maxR) return true;
  return false;
}

/** Head hair — crown cap + thick strands for readable shevelura. */
export function paintHair(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  _base: GridCell,
  style: HairStyle,
): void {
  const body = [...grid.cells.values()].filter((c) => c.part === 'body');
  if (body.length < 8) return;
  const maxR = Math.max(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const keepout = faceKeepout(grid, maxR);
  // Anchors = topmost body rows; paint only grows UP into void
  let crown = body.filter((c) => c.row >= maxR - 1);
  if (crown.length < 3) {
    crown = body.filter((c) => c.row >= maxR - 2);
  }
  if (crown.length < 3) return;

  const midC = Math.round((minC + maxC) / 2);
  let painted = 0;
  const budget = Math.min(180, Math.round(130 * grid.scaleRef * 0.55));

  const color = palette.hair;
  const tipColor = lighten(palette.hair, 0.12);

  // Solid crown cap (2–3 rows) growing up off the scalp — skip face keepout
  if (style !== 'bald_patch') {
    const capRows = rng.int(2, 3);
    for (const c of crown) {
      for (let dy = 1; dy <= capRows && painted < budget; dy++) {
        paintHairCell(
          grid,
          c.col,
          c.row + dy,
          c,
          dy === capRows ? tipColor : color,
          dy / (capRows + 2),
          0,
          keepout,
          () => painted++,
        );
      }
    }
  }

  if (style === 'bald_patch') {
    const ring = crown.filter((c) => c.col <= minC + 2 || c.col >= maxC - 2).slice(0, 10);
    for (let i = 0; i < ring.length; i++) {
      growStrand(
        grid,
        rng,
        ring[i]!,
        color,
        tipColor,
        rng.int(2, 4),
        i,
        budget,
        keepout,
        () => painted++,
      );
    }
    return;
  }

  const strandCount =
    style === 'afro_puff'
      ? rng.int(14, 22)
      : style === 'spikes'
        ? rng.int(6, 10)
        : style === 'braid'
          ? rng.int(2, 3)
          : style === 'mohawk'
            ? rng.int(8, 12)
            : style === 'wild_mane' || style === 'curtain'
              ? rng.int(12, 18)
              : rng.int(10, 16);

  for (let s = 0; s < strandCount && painted < budget; s++) {
    let anchor: GridCell;
    if (style === 'mohawk') {
      const band = crown.filter((c) => Math.abs(c.col - midC) <= 2);
      anchor = band[rng.int(0, Math.max(0, band.length - 1))] ?? crown[rng.int(0, crown.length - 1)]!;
    } else if (style === 'curtain') {
      const left = crown.filter((c) => c.col < midC);
      const right = crown.filter((c) => c.col >= midC);
      const pool = s % 2 === 0 ? left : right;
      anchor = pool[rng.int(0, Math.max(0, pool.length - 1))] ?? crown[0]!;
    } else if (style === 'wild_mane') {
      const side = s % 2 === 0 ? -1 : 1;
      const pool = crown.filter((c) => (c.col - midC) * side >= 0);
      anchor = pool[rng.int(0, Math.max(0, pool.length - 1))] ?? crown[rng.int(0, crown.length - 1)]!;
    } else {
      anchor = crown[rng.int(0, crown.length - 1)]!;
    }

    const len =
      style === 'braid'
        ? rng.int(5, 9)
        : style === 'spikes'
          ? rng.int(4, 6)
          : style === 'afro_puff'
            ? rng.int(3, 5)
            : rng.int(4, 8);

    if (style === 'braid') {
      growBraid(grid, rng, anchor, color, tipColor, len, s, budget, keepout, () => painted++);
    } else if (style === 'spikes') {
      growSpike(grid, rng, anchor, color, tipColor, len, s, keepout, () => painted++);
    } else if (style === 'afro_puff') {
      growPuff(grid, rng, anchor, color, tipColor, s, keepout, () => painted++);
    } else {
      growStrand(grid, rng, anchor, color, tipColor, len, s, budget, keepout, () => painted++);
    }
  }
}

function paintHairCell(
  grid: MonsterGrid,
  col: number,
  row: number,
  start: GridCell,
  color: number,
  tip: number,
  strandId: number,
  keepout: EyeKeepout | null,
  onPaint: () => void,
): void {
  if (inKeepout(keepout, col, row)) return;
  const existing = grid.cells.get(cellKey(col, row));
  if (existing?.part === 'body') return;
  if (
    existing &&
    (existing.part === 'eye' ||
      existing.part === 'pupil' ||
      existing.part === 'mouth' ||
      existing.part === 'tooth' ||
      existing.part === 'eyelid' ||
      existing.part === 'brow' ||
      existing.part === 'outline' ||
      existing.part === 'ear' ||
      existing.part === 'lash')
  ) {
    return;
  }
  // Don't sit next to the eye — particle bleed reads as a left-eye smear
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const nb = grid.cells.get(cellKey(col + dc, row + dr));
    if (nb && (nb.part === 'eye' || nb.part === 'pupil' || nb.part === 'eyelid')) return;
  }
  // Soft body contact for off-crown tips
  if (!existing || existing.part !== 'hair') {
    const onBody = existing?.part === 'body';
    if (!onBody) {
      let near = false;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nb = grid.cells.get(cellKey(col + dc, row + dr));
        if (nb && (nb.part === 'body' || nb.part === 'hair' || nb.part === 'appendage')) {
          near = true;
          break;
        }
      }
      if (!near && tip < 0.35) return;
    }
  }
  // Allow hair-on-hair overlap (thickens mane)
  putCell(grid, col, row, start, color, 'hair', {
    zBoost: 0.02 + tip * 0.04,
    tipFactor: tip,
    hairStrand: strandId,
    size: Math.max(0.85, 1 - tip * 0.12),
    phase: start.phase + strandId * 0.7,
  });
  onPaint();
}

function growStrand(
  grid: MonsterGrid,
  rng: Rng,
  start: GridCell,
  color: number,
  tipColor: number,
  len: number,
  strandId: number,
  budget: number,
  keepout: EyeKeepout | null,
  onPaint: () => void,
): void {
  let col = start.col;
  let row = start.row;
  const outDir = start.col < 0 || rng.chance(0.5) ? -1 : 1;
  for (let i = 1; i <= len; i++) {
    if (i > budget) break;
    const step = rng.pick([
      [0, 1],
      [0, 1],
      [outDir, 1],
      [outDir, 0],
      [-outDir, 1],
    ] as const);
    col += step[0];
    row += step[1];
    if (inKeepout(keepout, col, row)) {
      row += 1;
      continue;
    }
    const existing = grid.cells.get(cellKey(col, row));
    if (existing && existing.part === 'body') {
      row += 1;
      continue;
    }
    const tip = i / len;
    const c = tip > 0.7 ? tipColor : color;
    paintHairCell(grid, col, row, start, c, tip, strandId, keepout, onPaint);
    // Width-2 strand core
    paintHairCell(grid, col + outDir, row, start, c, tip, strandId, keepout, onPaint);
  }
}

function growSpike(
  grid: MonsterGrid,
  _rng: Rng,
  start: GridCell,
  color: number,
  tipColor: number,
  len: number,
  strandId: number,
  keepout: EyeKeepout | null,
  onPaint: () => void,
): void {
  for (let i = 1; i <= len; i++) {
    const tip = i / len;
    const c = tip > 0.7 ? tipColor : color;
    paintHairCell(grid, start.col, start.row + i, start, c, tip, strandId, keepout, onPaint);
    paintHairCell(grid, start.col + 1, start.row + i, start, c, tip, strandId, keepout, onPaint);
  }
}

function growPuff(
  grid: MonsterGrid,
  rng: Rng,
  start: GridCell,
  color: number,
  tipColor: number,
  strandId: number,
  keepout: EyeKeepout | null,
  onPaint: () => void,
): void {
  for (const [dx, dy] of [
    [0, 1],
    [1, 1],
    [-1, 1],
    [0, 2],
    [1, 2],
    [-1, 2],
    [2, 1],
    [-2, 1],
    [0, 3],
    [1, 3],
    [-1, 3],
  ] as const) {
    if (rng.chance(0.12)) continue;
    paintHairCell(
      grid,
      start.col + dx,
      start.row + dy,
      start,
      dy > 1 ? tipColor : color,
      0.4 + dy * 0.15,
      strandId,
      keepout,
      onPaint,
    );
  }
}

function growBraid(
  grid: MonsterGrid,
  _rng: Rng,
  start: GridCell,
  color: number,
  tipColor: number,
  len: number,
  strandId: number,
  budget: number,
  keepout: EyeKeepout | null,
  onPaint: () => void,
): void {
  let col = start.col;
  let row = start.row;
  const side = strandId % 2 === 0 ? -1 : 1;
  for (let i = 1; i <= len && i <= budget; i++) {
    col += side * (i % 2 === 0 ? 1 : 0);
    // Grow up off the scalp — never down into the eye band
    row += 1;
    const tip = i / len;
    const c = tip > 0.75 ? tipColor : darken(color, tip * 0.1);
    paintHairCell(grid, col, row, start, c, tip, strandId, keepout, onPaint);
    paintHairCell(grid, col + side, row, start, c, tip, strandId, keepout, onPaint);
  }
}
