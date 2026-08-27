import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { cellKey } from '../types';
import { nearBody, paintWithShadow, putCell } from './shading';
import type { EarStyle } from './types';

/**
 * Facial ears that protrude past the body rim so they read at thumbnail size.
 */
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
      : rng.chance(0.15)
        ? (rng.pick(['lobe', 'pointy', 'floppy', 'notch', 'bat', 'shell'] as EarStyle[]) as EarStyle)
        : style;
  const rightStyle =
    style === 'asymmetric_stub'
      ? 'pointy'
      : rng.chance(0.25)
        ? (rng.pick(['lobe', 'pointy', 'floppy', 'notch', 'bat', 'shell'] as EarStyle[]) as EarStyle)
        : leftStyle;

  const half = Math.max(3, Math.floor(faceW * 0.5)) + rng.int(1, 2);
  paintOneEar(grid, rng, palette, midC - half, eyeY, -1, base, leftStyle);
  paintOneEar(grid, rng, palette, midC + half, eyeY + rng.int(-1, 1), 1, base, rightStyle);
}

function nearestBodyColor(
  grid: MonsterGrid,
  col: number,
  row: number,
  fallback: number,
): number {
  const self = grid.cells.get(cellKey(col, row));
  if (self?.part === 'body') return self.color;
  for (let r = 1; r <= 3; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.abs(dc) + Math.abs(dr) !== r) continue;
        const nb = grid.cells.get(cellKey(col + dc, row + dr));
        if (nb?.part === 'body') return nb.color;
      }
    }
  }
  return fallback;
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
  const bodyTint = nearestBodyColor(grid, anchorC - side, anchorR, palette.base);
  const color = lighten(bodyTint, 0.08);
  const outline = darken(palette.outline, 0.05);
  const tip = palette.accent;

  // Guaranteed stalk toward body (4-connected bridge)
  for (let s = 0; s <= 2; s++) {
    const col = anchorC - side * s;
    putCell(grid, col, anchorR, base, color, 'ear', {
      zBoost: 0.035,
      tipFactor: 0.15,
      faceSide: side,
    });
  }

  const paint = (dc: number, dr: number, tipF = 0, accent = false) => {
    const col = anchorC + dc;
    const row = anchorR + dr;
    if (!nearBody(grid, col, row, true, 2) && tipF < 0.25) return;
    const useAccent = accent && tipF > 0.7;
    paintWithShadow(grid, col, row, base, useAccent ? tip : color, 'ear', {
      zBoost: 0.035,
      soft: true,
      softRadius: 2,
      tipFactor: tipF,
      faceSide: side,
      shadow: tipF > 0.55,
      size: 1,
    });
    if (tipF > 0.55) {
      paintWithShadow(grid, col + side, row, base, outline, 'ear', {
        zBoost: 0.032,
        soft: true,
        softRadius: 2,
        tipFactor: Math.min(1, tipF + 0.1),
        faceSide: side,
        size: 0.9,
      });
    }
  };

  switch (style) {
    case 'lobe':
      for (let r = -1; r <= 3; r++) {
        for (let w = 0; w <= 2; w++) {
          paint(side * w, r, (r + 1) / 4);
        }
      }
      break;
    case 'pointy': {
      const h = rng.int(4, 7);
      for (let r = 0; r < h; r++) {
        const half = r < h - 2 ? 1 : 0;
        for (let w = 0; w <= half; w++) paint(side * w, r, r / h, r === h - 1);
        if (r < h - 1) paint(side, r, r / h);
      }
      break;
    }
    case 'floppy': {
      const h = rng.int(5, 8);
      for (let r = 0; r < h; r++) {
        const out = side * (1 + Math.floor(r / 2));
        paint(out, Math.floor(r * 0.35), r / h);
        paint(out, Math.floor(r * 0.35) - 1, r / h);
        paint(out + side, Math.floor(r * 0.35), r / h);
      }
      break;
    }
    case 'notch':
      for (let r = 0; r <= 4; r++) {
        paint(side, r, r / 4);
        if (r !== 2) paint(side * 2, r, r / 4);
        paint(side * 3, r, r / 4);
      }
      break;
    case 'bat':
      for (let r = 0; r <= 4; r++) {
        for (let w = 0; w <= 3; w++) {
          if (r === 4 && w < 2) continue;
          paint(side * w, r, r / 4, r === 4);
        }
      }
      break;
    case 'shell':
      paint(side, 0, 0.2);
      paint(side, 1, 0.35);
      paint(side * 2, 1, 0.45);
      paint(side * 2, 0, 0.55);
      paint(side * 3, 0, 0.65);
      paint(side * 3, -1, 0.75);
      paint(side * 2, -1, 0.8);
      paint(side, -1, 0.85, true);
      paint(side, -2, 0.9, true);
      break;
    default:
      paint(side, 0, 0.3);
      paint(side, 1, 0.5);
      paint(side * 2, 1, 0.7);
      paint(side * 2, 2, 0.85, true);
  }
}
