import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette, MouthRole } from '../types';
import { nearBody, paintWithShadow, putCell } from './shading';
import type { MouthStyle, ToothStyle } from './types';

export interface TeethContext {
  style: MouthStyle;
  toothStyle: ToothStyle;
  midC: number;
  W: number;
  lipRows: number[];
  openUp: number;
  openDown: number;
  tooth: number;
  cavityColor: number;
  base: GridCell;
}

function putTooth(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  color: number,
  role: MouthRole,
  soft: boolean,
): boolean {
  if (!nearBody(grid, col, row, soft)) return false;
  paintWithShadow(grid, col, row, base, color, 'tooth', {
    zBoost: 0.048,
    mouthRole: role,
    soft,
    shadow: true,
    size: 0.95,
  });
  return true;
}

/** Paint tooth variations along lip curve. Caps cell budget (~24 teeth cells). */
export function paintTeeth(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  ctx: TeethContext,
): void {
  const { style, toothStyle, midC, W, lipRows, openUp, openDown, tooth, cavityColor, base } = ctx;
  let painted = 0;
  const budget = 28;

  if (style === 'closed-line' || style === 'tiny') return;

  if (style === 'zigzag' || toothStyle === 'fang_pair') {
    let up = true;
    for (let dx = -W + 1; dx <= W - 1; dx += rng.int(3, 4)) {
      if (painted >= budget) break;
      const lip = lipRows[dx + W]!;
      const h = toothStyle === 'fang_pair' ? rng.pick([2, 2, 3]) : rng.pick([1, 1, 2]);
      for (let i = 1; i <= h; i++) {
        const row = up ? lip + i : lip - i;
        putTooth(grid, midC + dx, row, base, tooth, up ? 'upper' : 'lower', true);
        painted++;
      }
      putCell(grid, midC + dx, lip, base, cavityColor, 'mouth', { zBoost: 0.045, mouthRole: 'cavity' });
      up = !up;
    }
    return;
  }

  if (style !== 'open-maw' && style !== 'tongue-out') return;

  const cavityH = openUp + openDown;
  const gold = palette.accent;

  switch (toothStyle) {
    case 'buck': {
      const lip = lipRows[W]!;
      for (let i = 1; i <= Math.min(3, openUp); i++) {
        putTooth(grid, midC, lip + openUp - i, base, tooth, 'upper', false);
        putTooth(grid, midC - 1, lip + openUp - i, base, tooth, 'upper', false);
        painted += 2;
      }
      break;
    }
    case 'shark': {
      for (let rowOff = 0; rowOff < 2; rowOff++) {
        for (let dx = -W + 1; dx <= W - 1; dx += 2) {
          if (painted >= budget) break;
          const lip = lipRows[dx + W]!;
          const row = lip + openUp - 1 - rowOff;
          if (row > lip - openDown) putTooth(grid, midC + dx, row, base, tooth, 'upper', false);
          painted++;
        }
      }
      break;
    }
    case 'gap_grin': {
      for (let dx = -W + 1; dx <= W - 1; dx += 2) {
        if (dx === 0 || painted >= budget) continue;
        const lip = lipRows[dx + W]!;
        putTooth(grid, midC + dx, lip + openUp - 1, base, tooth, 'upper', false);
        painted++;
      }
      break;
    }
    case 'stump': {
      for (let dx = -W + 1; dx <= W - 1; dx += 3) {
        if (painted >= budget) break;
        const lip = lipRows[dx + W]!;
        putTooth(grid, midC + dx, lip + openUp - 1, base, tooth, 'upper', false);
        painted++;
      }
      break;
    }
    case 'gold_cap': {
      let goldLeft = rng.int(1, 2);
      for (let dx = -W + 1; dx <= W - 1; dx += rng.int(2, 4)) {
        if (painted >= budget) break;
        const lip = lipRows[dx + W]!;
        const h = Math.max(1, Math.floor(cavityH * 0.3));
        for (let i = 1; i <= h; i++) {
          const color = goldLeft > 0 && i === 1 ? gold : tooth;
          putTooth(grid, midC + dx, lip + openUp - i, base, color, 'upper', false);
          painted++;
        }
        if (goldLeft > 0) goldLeft--;
      }
      break;
    }
    default: {
      // row_even
      const step = rng.int(2, 4);
      const fromUpper = style !== 'tongue-out' || rng.chance(0.65);
      const maxToothH = Math.max(1, Math.floor(cavityH * 0.35));
      for (let dx = -W + 1; dx <= W - 1; dx += step) {
        if (rng.chance(0.15) || painted >= budget) continue;
        const lip = lipRows[dx + W]!;
        const h = rng.int(1, maxToothH);
        for (let i = 1; i <= h; i++) {
          const half = i === h ? 0 : i === 1 && h >= 2 ? 1 : 0;
          for (let tdx = -half; tdx <= half; tdx++) {
            const row = fromUpper ? lip + openUp - i : lip - openDown + i;
            const top = lip + openUp;
            const bot = lip - openDown;
            if (row > bot && row < top) {
              putTooth(grid, midC + dx + tdx, row, base, tooth, fromUpper ? 'upper' : 'lower', false);
              painted++;
            }
          }
        }
      }
    }
  }
}
