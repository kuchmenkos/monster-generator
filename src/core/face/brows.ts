import { darken } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { paintWithShadow } from './shading';
import type { BrowStyle, EyeSlot } from './types';

export function paintBrows(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eyes: EyeSlot[],
  base: GridCell,
  style: BrowStyle,
): void {
  if (eyes.length === 0) return;
  const color = darken(palette.brow, 0.08);

  if (style === 'unibrow' && eyes.length >= 2) {
    const left = eyes.reduce((a, b) => (a.x < b.x ? a : b));
    const right = eyes.reduce((a, b) => (a.x > b.x ? a : b));
    const y = Math.max(...eyes.map((e) => e.y + e.h)) + 1;
    for (let c = left.x; c <= right.x + right.w; c++) {
      for (let dy = 0; dy < 2; dy++) {
        paintWithShadow(grid, c, y + dy, base, color, 'brow', {
          zBoost: 0.05,
          shadow: dy === 0 && c === right.x + right.w,
          soft: true,
        });
      }
    }
    return;
  }

  for (const eye of eyes) {
    paintOneBrow(grid, rng, eye, base, style, color);
  }
}

function paintOneBrow(
  grid: MonsterGrid,
  rng: Rng,
  eye: EyeSlot,
  base: GridCell,
  style: BrowStyle,
  color: number,
): void {
  const y0 = eye.y + eye.h + (style === 'surprised' ? 2 : 1);
  // Solid arcs: thick 2 default, bushy 3, thin 1
  const thick = style === 'bushy' ? 3 : style === 'thin' ? 1 : 2;
  const bend =
    style === 'angry' ? -1 : style === 'surprised' ? 1 : style === 'straight' ? 0 : rng.int(-1, 1);

  for (let dx = 0; dx < eye.w; dx++) {
    const t = eye.w <= 1 ? 0 : (dx / (eye.w - 1)) * 2 - 1;
    const y = y0 + Math.round((1 - t * t) * bend);
    for (let dy = 0; dy < thick; dy++) {
      paintWithShadow(grid, eye.x + dx, y + dy, base, color, 'brow', {
        zBoost: 0.05,
        shadow: dx === eye.w - 1 && dy === 0,
        soft: true,
        faceSide: eye.side === 0 ? undefined : eye.side,
        size: 1,
      });
    }
  }
}
