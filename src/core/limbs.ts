import { darken } from './palette';
import type { Rng } from './rng';
import type { GridCell, MonsterGrid, MonsterPalette } from './types';
import { cellKey } from './types';

function torsoCells(grid: MonsterGrid): GridCell[] {
  return [...grid.cells.values()].filter((c) => c.part === 'body');
}

function put(grid: MonsterGrid, cell: GridCell): void {
  grid.cells.set(cellKey(cell.col, cell.row), cell);
}

function makeLimbCell(
  grid: MonsterGrid,
  src: GridCell,
  col: number,
  row: number,
  tipFactor: number,
  color: number,
  rng: Rng,
): GridCell {
  return {
    col,
    row,
    x: grid.originX + col * grid.cell,
    y: grid.originY + row * grid.cell,
    z: src.z - 0.02 + tipFactor * 0.01,
    nx: src.nx * 0.5,
    ny: tipFactor > 0.5 ? -0.3 : src.ny,
    nz: 0.85,
    color,
    part: 'appendage',
    phase: rng.float(0, Math.PI * 2),
    size: 1,
    tipFactor,
  };
}

function s(grid: MonsterGrid, n: number): number {
  return Math.max(1, Math.round(n * grid.scaleRef * 0.55));
}

/** Limb color follows body hue — roots stay close so they read as flesh, not sticks. */
function limbTint(palette: MonsterPalette, tip: number): number {
  return darken(palette.base, 0.04 + tip * 0.16);
}

/** Manhattan walk so a diagonal step never leaves a 4-connected gap. */
function paintLimbPath(
  grid: MonsterGrid,
  rng: Rng,
  src: GridCell,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  tip: number,
  color: number,
  thick = false,
  side: -1 | 1 = 1,
): void {
  if (fromCol === toCol && fromRow === toRow) return;
  let c = fromCol;
  let r = fromRow;
  while (c !== toCol || r !== toRow) {
    if (c !== toCol) c += Math.sign(toCol - c);
    else r += Math.sign(toRow - r);
    put(grid, makeLimbCell(grid, src, c, r, tip, color, rng));
    if (thick) {
      put(grid, makeLimbCell(grid, src, c + side, r, tip * 0.95, color, rng));
    }
  }
}

function findTopEdge(cells: GridCell[]): GridCell[] {
  const maxR = Math.max(...cells.map((c) => c.row));
  return cells.filter((c) => c.row >= maxR - 1);
}

function addHorns(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const top = findTopEdge(torsoCells(grid));
  if (top.length < 2) return;
  const mid = (Math.min(...top.map((c) => c.col)) + Math.max(...top.map((c) => c.col))) / 2;
  const leftA = top.filter((c) => c.col <= mid).sort((a, b) => a.col - b.col)[0];
  const rightA = top.filter((c) => c.col >= mid).sort((a, b) => b.col - a.col)[0];
  if (!leftA || !rightA) return;

  const height = s(grid, rng.int(2, 5));
  const curve = rng.int(0, 2);
  const thickBase = rng.chance(0.7);

  for (const [anchor, dir] of [
    [leftA, -1],
    [rightA, 1],
  ] as const) {
    let col = anchor.col;
    let row = anchor.row;
    for (let i = 1; i <= height; i++) {
      const tip = i / height;
      const color = limbTint(palette, tip);
      const nextCol = anchor.col + dir * Math.floor((i * curve) / Math.max(1, height - 1));
      const nextRow = anchor.row + i;
      paintLimbPath(
        grid,
        rng,
        anchor,
        col,
        row,
        nextCol,
        nextRow,
        tip,
        color,
        thickBase && i <= Math.ceil(height * 0.4),
        dir,
      );
      col = nextCol;
      row = nextRow;
    }
  }
}

function addAntennae(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const top = findTopEdge(torsoCells(grid));
  if (top.length < 2) return;
  const mid = (Math.min(...top.map((c) => c.col)) + Math.max(...top.map((c) => c.col))) / 2;
  const left = top.filter((c) => c.col <= mid).sort((a, b) => b.col - a.col)[0];
  const right = top.filter((c) => c.col >= mid).sort((a, b) => a.col - b.col)[0];
  if (!left || !right) return;

  const height = s(grid, rng.int(3, 6));
  for (const [anchor, dir] of [
    [left, -1],
    [right, 1],
  ] as const) {
    let col = anchor.col;
    let row = anchor.row;
    for (let i = 1; i <= height; i++) {
      const tip = i / height;
      const nextCol = col + dir * rng.pick([0, 1, 1]) + rng.pick([-1, 0, 0]);
      const nextRow = anchor.row + i;
      paintLimbPath(grid, rng, anchor, col, row, nextCol, nextRow, tip, limbTint(palette, tip));
      col = nextCol;
      row = nextRow;
    }
    paintLimbPath(grid, rng, anchor, col, row, col, anchor.row + height + 1, 1, palette.accent);
    const tipA = makeLimbCell(grid, anchor, col, anchor.row + height + 1, 1, palette.accent, rng);
    tipA.glow = true;
    put(grid, tipA);
    const tipB = makeLimbCell(
      grid,
      anchor,
      col + dir,
      anchor.row + height + 1,
      1,
      darken(palette.accent, 0.15),
      rng,
    );
    tipB.glow = true;
    put(grid, tipB);
  }
}

/**
 * Head toppers only — no legs/arms/tails/wings (limbless silhouette).
 * ~25% chance of a single horns or antennae set.
 */
export function applyLimbs(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  _archetype = 'blob',
): void {
  if (torsoCells(grid).length < 20) return;

  if (!rng.chance(0.25)) return;
  if (rng.chance(0.55)) addHorns(grid, rng, palette);
  else addAntennae(grid, rng, palette);
}
