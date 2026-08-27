import { darken } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { cellKey } from '../types';
import { eyeMask, fillMaskHoles, shearMask, stretchMask } from './masks';
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
  // Mild stretch/shear only — holes filled to avoid black lattice
  if (rng.chance(0.12)) {
    mask = stretchMask(mask, rng.float(0.85, 1.2), rng.float(0.85, 1.15));
  }
  if (rng.chance(0.1)) {
    mask = shearMask(mask, rng.float(-0.15, 0.15));
  }
  mask = fillMaskHoles(mask);

  const fillSclera = () => {
    for (const key of mask) {
      const [xs, ys] = key.split(',').map(Number) as [number, number];
      const fill = shape === 'void' ? darken(palette.pupil, 0.1) : palette.eyeWhite;
      putCell(grid, originCol + xs, originRow + ys, base, fill, 'eye', {
        zBoost: 0.04,
        faceSide: faceSide === 0 ? undefined : faceSide,
      });
    }
  };

  paintOutlineRing(grid, originCol, originRow, mask, base, palette.outline, Math.min(1, ringThick));
  // Fill after outline so sclera always wins over any stray outline
  fillSclera();
  // Repair: any outline sandwiched by eye cells → sclera (kills lattice)
  repairOutlineLattice(grid, originCol, originRow, w, h, palette, shape, base, faceSide);

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

/** Convert outline cells trapped between eye/pupil into sclera (anti-lattice). */
function repairOutlineLattice(
  grid: MonsterGrid,
  originCol: number,
  originRow: number,
  w: number,
  h: number,
  palette: MonsterPalette,
  shape: EyeShape,
  base: GridCell,
  faceSide: -1 | 1 | 0,
): void {
  const pad = 2;
  for (let y = -pad; y < h + pad; y++) {
    for (let x = -pad; x < w + pad; x++) {
      const col = originCol + x;
      const row = originRow + y;
      const cell = grid.cells.get(cellKey(col, row));
      if (!cell || cell.part !== 'outline') continue;
      const L = grid.cells.get(cellKey(col - 1, row));
      const R = grid.cells.get(cellKey(col + 1, row));
      const U = grid.cells.get(cellKey(col, row + 1));
      const D = grid.cells.get(cellKey(col, row - 1));
      const eyeish = (c: GridCell | undefined) =>
        !!c && (c.part === 'eye' || c.part === 'pupil');
      if ((eyeish(L) && eyeish(R)) || (eyeish(U) && eyeish(D))) {
        const fill = shape === 'void' ? darken(palette.pupil, 0.1) : palette.eyeWhite;
        putCell(grid, col, row, base, fill, 'eye', {
          zBoost: 0.04,
          faceSide: faceSide === 0 ? undefined : faceSide,
        });
      }
    }
  }
}
