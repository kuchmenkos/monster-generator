import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { putCell } from './shading';
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

  // Upper lid — cover top of eye
  const upperRows = Math.max(1, Math.floor(eye.h * cover));
  for (let dy = 0; dy < upperRows; dy++) {
    for (let dx = 0; dx < eye.w; dx++) {
      const cell = grid.cells.get(`${eye.x + dx},${eye.y + eye.h - 1 - dy}`);
      if (cell?.part === 'eye' || cell?.part === 'pupil' || !cell) {
        putCell(grid, eye.x + dx, eye.y + eye.h - 1 - dy, base, palette.base, 'eyelid', {
          zBoost: 0.052,
          lidRole: 'upper',
          faceSide: eye.side === 0 ? undefined : eye.side,
        });
      }
    }
  }

  // Lower lid
  if (style === 'droopy' || style === 'wide' || style === 'heavy') {
    const lowerRows = style === 'droopy' ? 2 : 1;
    for (let dy = 0; dy < lowerRows; dy++) {
      for (let dx = 0; dx < eye.w; dx++) {
        putCell(grid, eye.x + dx, eye.y + dy, base, palette.shadow, 'eyelid', {
          zBoost: 0.051,
          lidRole: 'lower',
          faceSide: eye.side === 0 ? undefined : eye.side,
          size: 0.85,
        });
      }
    }
  }
}
