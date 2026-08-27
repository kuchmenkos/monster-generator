import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { nearBody, paintWithShadow, putCell } from './shading';
import type { AccentStyle } from './types';

/** Face accents (клики): moles, freckles, blush, warts, dimples, sparkles. Cap ~16 cells. */
export function paintAccents(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  faceW: number,
  faceH: number,
  base: GridCell,
): void {
  const count = rng.int(1, 3);
  let painted = 0;
  for (let i = 0; i < count && painted < 16; i++) {
    const style = rng.pick<AccentStyle>([
      'mole',
      'freckle_cluster',
      'cheek_blush',
      'wart',
      'dimple',
      'sparkle',
    ]);
    painted += paintOne(grid, rng, palette, midC, midR, faceW, faceH, base, style);
  }
}

function paintOne(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  faceW: number,
  faceH: number,
  base: GridCell,
  style: AccentStyle,
): number {
  const side = rng.chance(0.5) ? -1 : 1;
  const cheekC = midC + side * Math.max(2, Math.floor(faceW * 0.28));
  const cheekR = midR - Math.floor(faceH * 0.1) + rng.int(-1, 1);
  let n = 0;

  switch (style) {
    case 'mole':
      if (nearBody(grid, cheekC, cheekR, true)) {
        paintWithShadow(grid, cheekC, cheekR, base, darken(palette.base, 0.35), 'freckle', {
          zBoost: 0.042,
          soft: true,
          shadow: true,
          faceSide: side,
        });
        n = 1;
      }
      break;
    case 'freckle_cluster': {
      const count = rng.int(3, 7);
      for (let i = 0; i < count; i++) {
        const c = cheekC + rng.int(-2, 2);
        const r = cheekR + rng.int(-2, 2);
        if (!nearBody(grid, c, r, true)) continue;
        putCell(grid, c, r, base, darken(palette.base, 0.25), 'freckle', {
          zBoost: 0.041,
          size: 0.55,
          faceSide: side,
        });
        n++;
      }
      break;
    }
    case 'cheek_blush':
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          if (!nearBody(grid, cheekC + dx, cheekR + dy, true)) continue;
          putCell(grid, cheekC + dx, cheekR + dy, base, palette.cheek, 'freckle', {
            zBoost: 0.038,
            size: 0.9,
            faceSide: side,
          });
          n++;
        }
      }
      break;
    case 'wart':
      if (nearBody(grid, cheekC, cheekR, true)) {
        paintWithShadow(grid, cheekC, cheekR, base, darken(palette.accent, 0.15), 'freckle', {
          zBoost: 0.043,
          soft: true,
          shadow: true,
          highlight: true,
          faceSide: side,
        });
        n = 2;
      }
      break;
    case 'dimple':
      if (nearBody(grid, cheekC, midR - Math.floor(faceH * 0.2), true)) {
        putCell(grid, cheekC, midR - Math.floor(faceH * 0.2), base, palette.shadow, 'freckle', {
          zBoost: 0.037,
          size: 0.7,
          faceSide: side,
        });
        n = 1;
      }
      break;
    case 'sparkle':
      if (nearBody(grid, cheekC, cheekR + 2, true)) {
        putCell(grid, cheekC, cheekR + 2, base, lighten(palette.highlight, 0.1), 'freckle', {
          zBoost: 0.05,
          glow: true,
          size: 0.6,
          faceSide: side,
        });
        n = 1;
      }
      break;
  }
  return n;
}
