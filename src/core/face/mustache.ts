import { darken } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { paintWithShadow } from './shading';
import type { MustacheStyle } from './types';

/**
 * Mustache between nose and mouth — painted as brow part + hair/brow color
 * so MonsterView stays unchanged (static like freckles via brow treatment).
 */
export function paintMustache(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  noseR: number,
  mouthR: number,
  base: GridCell,
  style: MustacheStyle,
): void {
  const y = Math.round((noseR + mouthR) * 0.5);
  const color = darken(palette.hair, 0.05);
  const tip = darken(palette.brow, 0.12);

  const paint = (dc: number, dr: number, side: -1 | 1 | 0 = 0) => {
    paintWithShadow(grid, midC + dc, y + dr, base, color, 'brow', {
      zBoost: 0.052,
      soft: true,
      faceSide: side === 0 ? undefined : side,
      shadow: Math.abs(dc) > 2,
      size: 1,
    });
  };

  switch (style) {
    case 'walrus':
      for (let dx = -3; dx <= 3; dx++) {
        paint(dx, 0, dx < 0 ? -1 : dx > 0 ? 1 : 0);
        paint(dx, -1, dx < 0 ? -1 : dx > 0 ? 1 : 0);
        if (Math.abs(dx) <= 2) paint(dx, -2, dx < 0 ? -1 : 1);
      }
      break;
    case 'pencil':
      for (let dx = -2; dx <= 2; dx++) {
        paint(dx, 0, dx < 0 ? -1 : dx > 0 ? 1 : 0);
      }
      break;
    case 'handlebar':
      for (let dx = -3; dx <= 3; dx++) {
        paint(dx, 0, dx < 0 ? -1 : dx > 0 ? 1 : 0);
      }
      // Curl tips upward
      paint(-4, 1, -1);
      paint(-4, 2, -1);
      paint(4, 1, 1);
      paint(4, 2, 1);
      paint(-3, 1, -1);
      paint(3, 1, 1);
      break;
    case 'stubble':
      for (let i = 0; i < 7; i++) {
        const dx = rng.int(-3, 3);
        const dr = rng.int(-1, 0);
        paintWithShadow(grid, midC + dx, y + dr, base, tip, 'brow', {
          zBoost: 0.05,
          soft: true,
          faceSide: dx < 0 ? -1 : 1,
          size: 0.85,
        });
      }
      break;
    case 'fu_manchu':
      for (let dx = -2; dx <= 2; dx++) paint(dx, 0, dx < 0 ? -1 : dx > 0 ? 1 : 0);
      // Long hanging ends
      for (let dy = -1; dy >= -4; dy--) {
        paint(-2, dy, -1);
        paint(-3, dy, -1);
        paint(2, dy, 1);
        paint(3, dy, 1);
      }
      break;
  }
}
