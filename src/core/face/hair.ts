import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { cellKey } from '../types';
import { putCell } from './shading';
import type { HairStyle } from './types';

/** Head hair manes — 6–18 strands, capped cells for perf (~120). */
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
  const minR = Math.min(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const h = maxR - minR;
  const crownLo = minR + Math.floor(h * 0.62);
  const crown = body.filter((c) => c.row >= crownLo);
  if (crown.length < 3) return;

  const midC = Math.round((minC + maxC) / 2);
  let painted = 0;
  const budget = Math.min(120, Math.round(90 * grid.scaleRef * 0.55));

  const color = palette.hair;
  const tipColor = lighten(palette.hair, 0.12);

  if (style === 'bald_patch') {
    // Thin ring only
    const ring = crown.filter((c) => c.col <= minC + 2 || c.col >= maxC - 2).slice(0, 8);
    for (let i = 0; i < ring.length; i++) {
      growStrand(grid, rng, ring[i]!, color, tipColor, rng.int(2, 4), i, budget, () => painted++);
    }
    return;
  }

  const strandCount =
    style === 'afro_puff'
      ? rng.int(8, 12)
      : style === 'spikes'
        ? rng.int(4, 7)
        : style === 'braid'
          ? rng.int(2, 3)
          : style === 'mohawk'
            ? rng.int(4, 6)
            : rng.int(4, 10);

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
          ? rng.int(3, 5)
          : style === 'afro_puff'
            ? rng.int(3, 5)
            : rng.int(4, 8);

    if (style === 'braid') {
      growBraid(grid, rng, anchor, color, tipColor, len, s, budget, () => painted++);
    } else if (style === 'spikes') {
      growSpike(grid, rng, anchor, color, tipColor, len, s, () => painted++);
    } else if (style === 'afro_puff') {
      growPuff(grid, rng, anchor, color, tipColor, s, () => painted++);
    } else {
      growStrand(grid, rng, anchor, color, tipColor, len, s, budget, () => painted++);
    }
  }
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
    const key = cellKey(col, row);
    const existing = grid.cells.get(key);
    if (existing && (existing.part === 'eye' || existing.part === 'pupil' || existing.part === 'mouth')) {
      break;
    }
    if (existing && existing.part === 'body') {
      col += outDir;
      if (grid.cells.has(cellKey(col, row))) break;
    } else if (existing && existing.part === 'hair') {
      break;
    }
    const tip = i / len;
    putCell(grid, col, row, start, tip > 0.7 ? tipColor : color, 'hair', {
      zBoost: 0.02 + tip * 0.04,
      tipFactor: tip,
      hairStrand: strandId,
      size: Math.max(0.5, 1 - tip * 0.4),
      phase: start.phase + strandId * 0.7,
    });
    onPaint();
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
  onPaint: () => void,
): void {
  for (let i = 1; i <= len; i++) {
    const tip = i / len;
    putCell(grid, start.col, start.row + i, start, tip > 0.7 ? tipColor : color, 'hair', {
      zBoost: 0.025 + tip * 0.03,
      tipFactor: tip,
      hairStrand: strandId,
      size: Math.max(0.45, 1 - tip * 0.55),
      phase: start.phase + strandId,
    });
    onPaint();
  }
}

function growPuff(
  grid: MonsterGrid,
  rng: Rng,
  start: GridCell,
  color: number,
  tipColor: number,
  strandId: number,
  onPaint: () => void,
): void {
  for (const [dx, dy] of [
    [0, 1],
    [1, 1],
    [-1, 1],
    [0, 2],
    [1, 2],
    [-1, 2],
  ] as const) {
    if (rng.chance(0.2)) continue;
    putCell(grid, start.col + dx, start.row + dy, start, dy > 1 ? tipColor : color, 'hair', {
      zBoost: 0.03,
      tipFactor: 0.4 + dy * 0.2,
      hairStrand: strandId,
      size: 0.85,
      phase: start.phase + strandId * 0.5,
    });
    onPaint();
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
  onPaint: () => void,
): void {
  let col = start.col;
  let row = start.row;
  const side = strandId % 2 === 0 ? -1 : 1;
  for (let i = 1; i <= len && i <= budget; i++) {
    col += side * (i % 2 === 0 ? 1 : 0);
    row -= 1; // hang down (world Y up = higher row, so hanging = decreasing row)
    const tip = i / len;
    putCell(grid, col, row, start, tip > 0.75 ? tipColor : darken(color, tip * 0.1), 'hair', {
      zBoost: 0.028,
      tipFactor: tip,
      hairStrand: strandId,
      size: 0.8,
      phase: start.phase + strandId,
    });
    onPaint();
  }
}
