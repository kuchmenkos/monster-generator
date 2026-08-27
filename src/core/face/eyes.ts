import { darken } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { cellKey } from '../types';
import { eyeMask, shearMask, stretchMask } from './masks';
import { paintOutlineRing, putCell } from './shading';
import type { EyeShape } from './types';

export function paintEyeShaped(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  originCol: number,
  originRow: number,
  w: number,
  h: number,
  shape: EyeShape,
  base: GridCell,
  ringThick = 1,
  irisColor?: number,
  faceSide: -1 | 1 | 0 = 0,
): void {
  let mask = eyeMask(shape, w, h);
  // Weird stretch/shear ~35%
  if (rng.chance(0.35)) {
    mask = stretchMask(mask, rng.float(0.75, 1.35), rng.float(0.7, 1.25));
  }
  if (rng.chance(0.25)) {
    mask = shearMask(mask, rng.float(-0.25, 0.25));
  }

  paintOutlineRing(grid, originCol, originRow, mask, base, palette.outline, ringThick);

  for (const key of mask) {
    const [xs, ys] = key.split(',').map(Number) as [number, number];
    // Void: dark fill, tiny pupil later
    const fill =
      shape === 'void' ? darken(palette.pupil, 0.1) : palette.eyeWhite;
    putCell(grid, originCol + xs, originRow + ys, base, fill, 'eye', {
      zBoost: 0.04,
      faceSide: faceSide === 0 ? undefined : faceSide,
    });
  }

  if (irisColor !== undefined && w >= 4 && h >= 4 && shape !== 'void') {
    const icx = Math.floor(w / 2);
    const icy = Math.floor(h / 2);
    for (const key of mask) {
      const [xs, ys] = key.split(',').map(Number) as [number, number];
      const d = Math.hypot(xs - icx, ys - icy);
      if (d >= 1.2 && d <= Math.min(w, h) * 0.35) {
        putCell(grid, originCol + xs, originRow + ys, base, irisColor, 'eye', {
          zBoost: 0.045,
          faceSide: faceSide === 0 ? undefined : faceSide,
        });
      }
    }
  }

  // Highlight glint on large eyes
  if (w >= 4 && h >= 4 && shape !== 'void') {
    const hx = Math.floor(w * 0.3);
    const hy = Math.floor(h * 0.65);
    if (mask.has(`${hx},${hy}`)) {
      putCell(grid, originCol + hx, originRow + hy, base, palette.highlight, 'eye', {
        zBoost: 0.048,
        size: 0.7,
      });
    }
  }

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const lookX = cx + rng.float(-0.35, 0.35) * Math.max(0, w / 2 - 1.5);
  const lookY = cy + rng.float(-0.35, 0.35) * Math.max(0, h / 2 - 1.5);

  if (shape === 'triple') {
    const offsets = [
      [0, 0],
      [-1, 1],
      [1, 1],
    ] as const;
    for (const [ox, oy] of offsets) {
      const px = Math.round(cx) + ox;
      const py = Math.round(cy) + oy;
      if (!mask.has(`${px},${py}`)) continue;
      putPupil(grid, originCol + px, originRow + py, base, palette, w, h);
    }
    return;
  }

  if (shape === 'cross') {
    // Cross slit pupil — horizontal + vertical dark
    const px = Math.round(cx);
    const py = Math.round(cy);
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (mask.has(`${px + dx},${py + dy}`)) {
        putPupil(grid, originCol + px + dx, originRow + py + dy, base, palette, w, h);
      }
    }
    return;
  }

  const pupilKey = [...mask].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return Math.hypot(ax! - lookX, ay! - lookY) - Math.hypot(bx! - lookX, by! - lookY);
  })[0];
  if (pupilKey) {
    const [px, py] = pupilKey.split(',').map(Number) as [number, number];
    putPupil(grid, originCol + px, originRow + py, base, palette, w, h);
    const big = w >= 5 && h >= 5 && shape !== 'void';
    if (big) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        if (mask.has(`${px + dx},${py + dy}`)) {
          putPupil(grid, originCol + px + dx, originRow + py + dy, base, palette, w, h);
        }
      }
    }
  }
}

function putPupil(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  palette: MonsterPalette,
  w: number,
  h: number,
): void {
  const rangeX = Math.max(0.1, Math.max(0, w * 0.5 - 1.25) * grid.cell);
  const rangeY = Math.max(0.08, Math.max(0, h * 0.5 - 1.25) * grid.cell);
  putCell(grid, col, row, base, palette.pupil, 'pupil', { zBoost: 0.055 });
  const pupilCell = grid.cells.get(cellKey(col, row));
  if (pupilCell) pupilCell.pupilRange = { x: rangeX, y: rangeY };
}
