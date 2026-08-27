import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { nearestBodyColor, putCell } from './shading';
import type { EyeSlot, LidStyle } from './types';

export function paintLids(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eyes: EyeSlot[],
  base: GridCell,
  style: LidStyle,
): void {
  for (const eye of eyes) {
    const local = rng.chance(0.2)
      ? (rng.pick(['heavy', 'monolid', 'droopy', 'wide', 'sleepy_half'] as LidStyle[]) as LidStyle)
      : style;
    paintOneLid(grid, palette, eye, base, local);
  }
}

function paintOneLid(
  grid: MonsterGrid,
  palette: MonsterPalette,
  eye: EyeSlot,
  base: GridCell,
  style: LidStyle,
): void {
  const cover =
    style === 'heavy'
      ? 0.45
      : style === 'sleepy_half'
        ? 0.55
        : style === 'droopy'
          ? 0.35
          : style === 'monolid'
            ? 0.25
            : 0.15;

  // Small eyes: one row only — a multi-row palette.base stamp reads as a texture slice
  const upperRows =
    eye.h < 6 ? 1 : Math.max(1, Math.floor(eye.h * cover));

  for (let dy = 0; dy < upperRows; dy++) {
    for (let dx = 0; dx < eye.w; dx++) {
      const col = eye.x + dx;
      const row = eye.y + eye.h - 1 - dy;
      const cell = grid.cells.get(`${col},${row}`);
      if (cell?.part !== 'eye') continue;
      const tint = nearestBodyColor(grid, col, row + 1, palette.shadow);
      putCell(grid, col, row, base, tint, 'eyelid', {
        zBoost: 0.052,
        lidRole: 'upper',
        faceSide: eye.side === 0 ? undefined : eye.side,
        allowOverwrite: ['eye'],
      });
    }
  }

  if (style === 'droopy' || style === 'wide' || style === 'heavy') {
    for (let dx = 0; dx < eye.w; dx++) {
      const col = eye.x + dx;
      const row = eye.y;
      const cell = grid.cells.get(`${col},${row}`);
      if (cell?.part !== 'eye') continue;
      const tint = nearestBodyColor(grid, col, row - 1, palette.shadow);
      putCell(grid, col, row, base, tint, 'eyelid', {
        zBoost: 0.051,
        lidRole: 'lower',
        faceSide: eye.side === 0 ? undefined : eye.side,
        size: 0.85,
        allowOverwrite: ['eye'],
      });
    }
  }
}
