import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { paintWithShadow } from './shading';
import type { EyeSlot, LashStyle } from './types';

export function paintLashes(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eyes: EyeSlot[],
  base: GridCell,
  style: LashStyle,
): void {
  for (const eye of eyes) {
    const local = rng.chance(0.25)
      ? (rng.pick(['spike', 'fan', 'clump', 'lower_only', 'spider'] as LashStyle[]) as LashStyle)
      : style;
    paintOneLash(grid, rng, palette, eye, base, local);
  }
}

function paintOneLash(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  eye: EyeSlot,
  base: GridCell,
  style: LashStyle,
): void {
  const topY = eye.y + eye.h;
  const botY = eye.y - 1;
  const count =
    style === 'spider' ? Math.min(6, eye.w) : style === 'clump' ? 3 : Math.min(5, Math.max(2, eye.w));

  if (style !== 'lower_only') {
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);
      const x = eye.x + Math.round(t * (eye.w - 1));
      const len = style === 'spike' ? rng.int(1, 3) : style === 'fan' ? 2 : rng.int(1, 2);
      const flare = style === 'fan' ? Math.round((t - 0.5) * 2) : style === 'spider' ? (i % 2 === 0 ? -1 : 1) : 0;
      for (let L = 1; L <= len; L++) {
        paintWithShadow(grid, x + flare * L, topY + L, base, palette.brow, 'lash', {
          zBoost: 0.056,
          soft: true,
          tipFactor: L / len,
          size: 0.65,
          faceSide: eye.side === 0 ? undefined : eye.side,
        });
      }
    }
  }

  if (style === 'lower_only' || style === 'spider' || (style === 'fan' && rng.chance(0.4))) {
    const n = style === 'lower_only' ? count : 2;
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const x = eye.x + Math.round(t * (eye.w - 1));
      paintWithShadow(grid, x, botY, base, palette.brow, 'lash', {
        zBoost: 0.056,
        soft: true,
        tipFactor: 0.5,
        size: 0.55,
        faceSide: eye.side === 0 ? undefined : eye.side,
      });
    }
  }
}
