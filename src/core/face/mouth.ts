import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette, MouthRole } from '../types';
import { nearBody, putCell } from './shading';
import { paintTeeth } from './teeth';
import type { LipCurveKind, MouthStyle, ToothStyle } from './types';

function lipRowAt(midRow: number, t: number, kind: LipCurveKind, amp: number, skew: number): number {
  let bend = 0;
  switch (kind) {
    case 'smile':
      bend = -(1 - t * t) * amp;
      break;
    case 'scowl':
      bend = (1 - t * t) * amp;
      break;
    case 'wave':
      bend = Math.sin(t * Math.PI) * amp;
      break;
    case 'skew':
      bend = t * skew * amp;
      break;
    default:
      bend = t * skew * 0.3;
  }
  return Math.round(midRow + bend);
}

function putMouth(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  color: number,
  part: 'mouth' | 'tooth' | 'outline',
  role: MouthRole,
  soft = false,
): boolean {
  if (!nearBody(grid, col, row, soft)) return false;
  putCell(grid, col, row, base, color, part, { zBoost: 0.045, mouthRole: role });
  return true;
}

function creamTooth(palette: MonsterPalette): number {
  return lighten(darken(palette.eyeWhite, 0.08), 0.05) || 0xf2e6c8;
}

export function paintMouthFromCurve(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  halfW: number,
  base: GridCell,
  faceH: number,
  lowestEyeRow: number,
  forced?: {
    style?: MouthStyle;
    toothStyle?: ToothStyle;
    minHalfW?: number;
  },
): void {
  const sr = grid.scaleRef;
  // Avoid flat closed-line as default — readability first
  let style =
    forced?.style ??
    rng.pick<MouthStyle>([
      'open-maw',
      'open-maw',
      'open-maw',
      'tongue-out',
      'zigzag',
      'tiny',
      'closed-line',
    ]);
  // Flat 1-line mouths read as defects — promote to open-maw
  if (style === 'closed-line' && rng.chance(0.85)) style = 'open-maw';

  const mouthColor = darken(palette.mouth, 0.2);
  const cavityColor = darken(palette.mouth, 0.45);
  const tooth = creamTooth(palette);
  const curve = rng.pick<LipCurveKind>(['smile', 'scowl', 'wave', 'skew', 'flat']);
  const amp = rng.float(0.8, 2.4) * Math.max(1, sr * 0.5);
  const skew = rng.float(-1.2, 1.2);
  const toothStyle =
    forced?.toothStyle ??
    rng.pick<ToothStyle>([
      'row_even',
      'fang_pair',
      'buck',
      'shark',
      'gap_grin',
      'stump',
      'gold_cap',
    ]);

  const maxMouthTop = lowestEyeRow - 2;
  let lipMid = Math.min(midR, maxMouthTop - 1);
  if (lipMid < midR - Math.floor(faceH * 0.35)) {
    lipMid = Math.max(midR - Math.floor(faceH * 0.2), maxMouthTop - 2);
  }

  if (style === 'tiny') {
    const ox = rng.int(-Math.floor(halfW * 0.25), Math.floor(halfW * 0.25));
    const oy = rng.int(-1, 1);
    const cx = midC + ox;
    const cy = Math.min(lipMid + oy, maxMouthTop - 1);
    // Min readable tiny mouth (not a single pixel)
    const rw = Math.max(2, rng.int(2, 3));
    const rh = Math.max(1, rng.int(1, 2));
    for (let dy = -rh; dy <= rh; dy++) {
      for (let dx = -rw; dx <= rw; dx++) {
        if ((dx * dx) / (rw * rw + 0.01) + (dy * dy) / (rh * rh + 0.01) > 1.2) continue;
        const role: MouthRole = dy > 0 ? 'upper' : dy < 0 ? 'lower' : 'cavity';
        putMouth(grid, cx + dx, cy + dy, base, dy === 0 ? cavityColor : mouthColor, 'mouth', role, true);
      }
    }
    for (let dx = -rw - 1; dx <= rw + 1; dx++) {
      putMouth(grid, cx + dx, cy + rh + 1, base, palette.outline, 'outline', 'upper', true);
      putMouth(grid, cx + dx, cy - rh - 1, base, palette.outline, 'outline', 'lower', true);
    }
    // Always add a couple of teeth so tiny mouths aren't empty voids
    putMouth(grid, cx - 1, cy, base, tooth, 'tooth', 'cavity', true);
    putMouth(grid, cx + 1, cy, base, tooth, 'tooth', 'cavity', true);
    return;
  }

  const faceWApprox = halfW * 2;
  const minW = forced?.minHalfW ?? 2;
  const W = Math.max(minW, Math.floor(faceWApprox * rng.float(0.18, 0.3)));

  let openUp = 0;
  let openDown = 0;
  if (style === 'open-maw') {
    const open = Math.max(
      3,
      Math.min(Math.floor(faceH * rng.float(0.25, 0.42)), Math.round(rng.float(4, 9) * sr * 0.5)),
    );
    openUp = Math.floor(open * 0.35);
    openDown = open - openUp;
  } else if (style === 'tongue-out') {
    const open = Math.max(2, Math.round(rng.float(2, 4) * sr * 0.55));
    openUp = Math.floor(open * 0.3);
    openDown = open - openUp;
  }

  while (lipMid + openUp >= maxMouthTop && lipMid > 2) lipMid--;

  const lipRows: number[] = [];
  for (let dx = -W; dx <= W; dx++) {
    const t = W === 0 ? 0 : dx / W;
    lipRows[dx + W] = lipRowAt(lipMid, t, curve, amp, skew);
  }

  for (let dx = -W; dx <= W; dx++) {
    const lip = lipRows[dx + W]!;
    if (style === 'closed-line' || style === 'zigzag') {
      putMouth(grid, midC + dx, lip, base, mouthColor, 'mouth', 'cavity', true);
      if (rng.chance(0.55) || Math.abs(dx) < W * 0.7) {
        putMouth(grid, midC + dx, lip - 1, base, cavityColor, 'mouth', 'lower', true);
      }
      putMouth(grid, midC + dx, lip + 1, base, palette.outline, 'outline', 'upper', true);
      continue;
    }
    const nx = W === 0 ? 0 : dx / W;
    const taper = Math.sqrt(Math.max(0, 1 - nx * nx * 0.85));
    const localUp = Math.max(0, Math.round(openUp * taper));
    const localDown = Math.max(1, Math.round(openDown * taper));
    const top = lip + localUp;
    const bot = lip - localDown;
    putMouth(grid, midC + dx, top, base, mouthColor, 'mouth', 'upper', true);
    putMouth(grid, midC + dx, bot, base, mouthColor, 'mouth', 'lower', true);
    for (let r = bot + 1; r < top; r++) {
      putMouth(grid, midC + dx, r, base, cavityColor, 'mouth', 'cavity', false);
    }
    putMouth(grid, midC + dx, top + 1, base, palette.outline, 'outline', 'upper', true);
    putMouth(grid, midC + dx, bot - 1, base, palette.outline, 'outline', 'lower', true);
  }

  if (style !== 'closed-line' && style !== 'zigzag') {
    putMouth(grid, midC - W - 1, lipRows[0]!, base, palette.outline, 'outline', 'cavity', true);
    putMouth(grid, midC + W + 1, lipRows[W * 2]!, base, palette.outline, 'outline', 'cavity', true);
  }

  paintTeeth(grid, rng, palette, {
    style,
    toothStyle: style === 'zigzag' ? 'fang_pair' : toothStyle,
    midC,
    W,
    lipRows,
    openUp,
    openDown,
    tooth,
    cavityColor,
    base,
  });

  if (style === 'tongue-out') {
    const tw = Math.max(1, Math.floor(W * 0.35));
    const th = rng.int(2, Math.max(2, Math.round(3 * sr * 0.5)));
    const tipShift = rng.int(-1, 1);
    for (let dy = 1; dy <= th; dy++) {
      const half = dy === th ? 0 : Math.max(0, tw - Math.floor(dy / 2));
      for (let dx = -half; dx <= half; dx++) {
        const lip = lipRows[Math.min(W * 2, Math.max(0, W + tipShift))]!;
        putMouth(grid, midC + tipShift + dx, lip - openDown - dy, base, palette.accent, 'mouth', 'tongue', true);
      }
    }
  }
}
