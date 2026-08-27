import { darken } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { nearBody, paintWithShadow, putCell } from './shading';
import type { NoseStyle } from './types';

export function paintNose(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  noseY: number,
  base: GridCell,
  style: NoseStyle,
): void {
  const color = darken(palette.base, 0.12);
  const shadow = palette.shadow;

  switch (style) {
    case 'button':
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        paintWithShadow(grid, midC + dx, noseY + dy, base, color, 'nose', {
          zBoost: 0.046,
          soft: true,
          shadow: dx === 1 && dy === 0,
          highlight: dx === 0 && dy === 1,
        });
      }
      break;
    case 'beak': {
      const h = rng.int(2, 4);
      for (let i = 0; i < h; i++) {
        const half = Math.max(0, Math.floor((h - i) / 2));
        for (let dx = -half; dx <= half; dx++) {
          paintWithShadow(grid, midC + dx, noseY - i, base, color, 'nose', {
            zBoost: 0.046,
            soft: true,
            tipFactor: i / h,
          });
        }
      }
      break;
    }
    case 'slit':
      for (let dx = -1; dx <= 1; dx++) {
        putCell(grid, midC + dx, noseY, base, shadow, 'nose', { zBoost: 0.046 });
      }
      break;
    case 'bulb':
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx * dx + dy * dy > 2.2) continue;
          paintWithShadow(grid, midC + dx, noseY + dy, base, color, 'nose', {
            zBoost: 0.046,
            soft: true,
            shadow: dx === 1 && dy === -1,
            highlight: dx === -1 && dy === 1,
          });
        }
      }
      break;
    case 'snout': {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) === 2 && dy === 1) continue;
          paintWithShadow(grid, midC + dx, noseY + dy, base, color, 'nose', {
            zBoost: 0.046,
            soft: true,
          });
        }
      }
      putCell(grid, midC - 1, noseY, base, shadow, 'nose', { zBoost: 0.047 });
      putCell(grid, midC + 1, noseY, base, shadow, 'nose', { zBoost: 0.047 });
      break;
    }
    case 'patch': {
      const ox = rng.chance(0.5) ? -1 : 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx * dx + dy * dy > 1.5) continue;
          paintWithShadow(grid, midC + ox + dx, noseY + dy, base, darken(palette.accent, 0.2), 'nose', {
            zBoost: 0.046,
            soft: true,
          });
        }
      }
      break;
    }
  }

  // Quality: drop floating nose cells far from body
  for (const c of [...grid.cells.values()]) {
    if (c.part !== 'nose') continue;
    if (!nearBody(grid, c.col, c.row, true)) {
      grid.cells.delete(`${c.col},${c.row}`);
    }
  }
}
