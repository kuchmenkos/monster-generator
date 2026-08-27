import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { nearBody, paintWithShadow, putCell } from './shading';
import type { EarStyle } from './types';

export function paintFacialEars(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  eyeY: number,
  faceW: number,
  base: GridCell,
  style: EarStyle,
): void {
  const leftStyle =
    style === 'asymmetric_stub'
      ? 'lobe'
      : rng.chance(0.2)
        ? (rng.pick(['lobe', 'pointy', 'floppy', 'notch', 'bat', 'shell'] as EarStyle[]) as EarStyle)
        : style;
  const rightStyle =
    style === 'asymmetric_stub'
      ? 'pointy'
      : rng.chance(0.35)
        ? (rng.pick(['lobe', 'pointy', 'floppy', 'notch', 'bat', 'shell'] as EarStyle[]) as EarStyle)
        : leftStyle;

  const half = Math.max(3, Math.floor(faceW * 0.48));
  paintOneEar(grid, rng, palette, midC - half, eyeY, -1, base, leftStyle);
  paintOneEar(grid, rng, palette, midC + half, eyeY + rng.int(-1, 1), 1, base, rightStyle);
}

function paintOneEar(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  anchorC: number,
  anchorR: number,
  side: -1 | 1,
  base: GridCell,
  style: EarStyle,
): void {
  const color = lighten(palette.base, 0.06);
  const tip = palette.accent;

  const paint = (dc: number, dr: number, tipF = 0, accent = false) => {
    const col = anchorC + dc;
    const row = anchorR + dr;
    if (!nearBody(grid, col, row, true) && tipF < 0.3) return;
    paintWithShadow(grid, col, row, base, accent ? tip : color, 'ear', {
      zBoost: 0.035,
      soft: true,
      tipFactor: tipF,
      faceSide: side,
      shadow: tipF > 0.6,
      size: tipF > 0.7 ? 0.8 : 1,
    });
  };

  switch (style) {
    case 'lobe':
      for (let r = 0; r <= 2; r++) {
        for (let w = 0; w <= 1; w++) {
          paint(side * w, r, r / 2);
        }
      }
      break;
    case 'pointy': {
      const h = rng.int(3, 5);
      for (let r = 0; r < h; r++) {
        const half = r < h - 1 ? 1 : 0;
        for (let w = 0; w <= half; w++) paint(side * w, r, r / h, r === h - 1);
      }
      break;
    }
    case 'floppy': {
      const h = rng.int(4, 6);
      for (let r = 0; r < h; r++) {
        const out = side * (1 + Math.floor(r / 2));
        paint(out, Math.floor(r * 0.4), r / h);
        paint(out, Math.floor(r * 0.4) - 1, r / h);
      }
      break;
    }
    case 'notch':
      for (let r = 0; r <= 3; r++) {
        paint(side, r, r / 3);
        if (r !== 2) paint(side * 2, r, r / 3);
      }
      break;
    case 'bat':
      for (let r = 0; r <= 3; r++) {
        for (let w = 0; w <= 2; w++) {
          if (r === 3 && w < 2) continue;
          paint(side * w, r, r / 3, r === 3);
        }
      }
      break;
    case 'shell':
      paint(side, 0, 0.2);
      paint(side, 1, 0.4);
      paint(side * 2, 1, 0.5);
      paint(side * 2, 0, 0.6);
      paint(side * 2, -1, 0.7);
      paint(side, -1, 0.8, true);
      break;
    default:
      paint(side, 0, 0.3);
      paint(side, 1, 0.6);
      putCell(grid, anchorC + side, anchorR + 1, base, darken(color, 0.1), 'ear', {
        zBoost: 0.035,
        faceSide: side,
      });
  }
}
