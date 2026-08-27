import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { paintWithShadow, putCell } from './shading';
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

  if (style === 'unibrow' && eyes.length >= 2) {
    const left = eyes.reduce((a, b) => (a.x < b.x ? a : b));
    const right = eyes.reduce((a, b) => (a.x > b.x ? a : b));
    const y = Math.max(...eyes.map((e) => e.y + e.h)) + 1;
    for (let c = left.x; c <= right.x + right.w; c++) {
      paintWithShadow(grid, c, y, base, palette.brow, 'brow', {
        zBoost: 0.05,
        shadow: true,
        soft: true,
      });
      if (rng.chance(0.4)) putCell(grid, c, y + 1, base, palette.brow, 'brow', { zBoost: 0.05 });
    }
    return;
  }

  for (const eye of eyes) {
    const localStyle =
      style === 'unibrow'
        ? 'bushy'
        : rng.chance(0.3)
          ? (rng.pick(['straight', 'angry', 'surprised', 'bushy', 'thin'] as BrowStyle[]) as BrowStyle)
          : style;
    paintOneBrow(grid, rng, palette, eye, base, localStyle);
  }
}

function paintOneBrow(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eye: EyeSlot,
  base: GridCell,
  style: BrowStyle,
): void {
  const y0 = eye.y + eye.h + (style === 'surprised' ? 2 : 1);
  const thick = style === 'bushy' ? 2 : style === 'thin' ? 1 : 1;
  const bend =
    style === 'angry' ? -1 : style === 'surprised' ? 1 : style === 'straight' ? 0 : rng.int(-1, 1);

  for (let dx = 0; dx < eye.w; dx++) {
    const t = eye.w <= 1 ? 0 : (dx / (eye.w - 1)) * 2 - 1;
    const y = y0 + Math.round((1 - t * t) * bend);
    for (let dy = 0; dy < thick; dy++) {
      paintWithShadow(grid, eye.x + dx, y + dy, base, palette.brow, 'brow', {
        zBoost: 0.05,
        shadow: dx === eye.w - 1,
        soft: true,
        faceSide: eye.side === 0 ? undefined : eye.side,
        size: style === 'thin' ? 0.75 : 1,
      });
    }
  }
}
