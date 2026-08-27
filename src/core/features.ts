import { getCell, storageKey } from './grid';
import { darken, lighten } from './palette';
import type { Rng } from './rng';
import type { GridCell, MonsterGrid, MonsterPalette, MouthRole, ParticlePart, SurfaceFacing } from './types';
import { cellKey } from './types';

type MouthStyle = 'closed-line' | 'zigzag' | 'open-maw' | 'tongue-out' | 'tiny';
type LipCurveKind = 'smile' | 'scowl' | 'wave' | 'skew' | 'flat';

export interface FaceLayout {
  midC: number;
  midR: number;
  faceHalf: number;
  faceH: number;
  base: GridCell;
  /** Skull-space Y — eyes must stay above this */
  mouthFloorY: number;
}

/** Map grid row → approximate skull/world Y for eye solver. */
function rowToSkullY(grid: MonsterGrid, row: number): number {
  const body = bodyOnly(grid);
  if (body.length === 0) return 0;
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const minY = Math.min(...body.map((c) => c.y));
  const maxY = Math.max(...body.map((c) => c.y));
  const t = (row - minR) / Math.max(1, maxR - minR);
  return minY + t * (maxY - minY);
}

/** Face anchor data shared by volumetric eyes + mouth painting. */
export function computeFaceLayout(rng: Rng, grid: MonsterGrid): FaceLayout | null {
  const shiftX = rng.float(-1, 1);
  const shiftY = rng.float(-0.6, 0.8);
  const region = faceRegion(grid, shiftX, shiftY);
  if (region.length < 8) return null;

  const minC = Math.min(...region.map((c) => c.col));
  const maxC = Math.max(...region.map((c) => c.col));
  const minR = Math.min(...region.map((c) => c.row));
  const maxR = Math.max(...region.map((c) => c.row));
  const midC = Math.round((minC + maxC) / 2);
  const midR = Math.round((minR + maxR) / 2);
  const faceW = maxC - minC;
  const faceH = Math.max(4, maxR - minR);
  const base = region.reduce((a, b) => (a.z >= b.z ? a : b));
  const faceHalf = Math.max(3, Math.floor(faceW * 0.5));
  const mouthFloorRow = midR - Math.floor(faceH * 0.22);
  const mouthFloorY = rowToSkullY(grid, mouthFloorRow);

  return { midC, midR, faceHalf, faceH, base, mouthFloorY };
}

function put(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  color: number,
  part: ParticlePart,
  zBoost = 0.02,
  size = 1,
  mouthRole?: MouthRole,
): void {
  const source = getCell(grid, col, row, 'front') ?? base;
  const key = storageKey(source);
  grid.cells.set(key, {
    ...source,
    col,
    row,
    x: source.x,
    y: source.y,
    z: source.z + zBoost,
    nx: source.nx ?? 0.1,
    ny: source.ny ?? 0.1,
    nz: source.nz ?? 1,
    color,
    part,
    phase: source.phase,
    size,
    tipFactor: 0,
    facing: (source.facing ?? 'front') as SurfaceFacing,
    mouthRole,
  });
}

function bodyOnly(grid: MonsterGrid): GridCell[] {
  if (grid.featureMasks) {
    const out: GridCell[] = [];
    for (const key of grid.featureMasks.front.values()) {
      const c = grid.cells.get(key);
      if (c?.part === 'body') out.push(c);
    }
    return out;
  }
  return [...grid.cells.values()].filter(
    (c) => c.part === 'body' && (c.facing === 'front' || c.facing === undefined),
  );
}

/** True if col/row is on body (or within 1-cell soft rim for lip ends). */
function nearBody(grid: MonsterGrid, col: number, row: number, soft = false): boolean {
  const front = getCell(grid, col, row, 'front');
  if (front?.part === 'body') return true;
  if (grid.cells.get(cellKey(col, row))?.part === 'body') return true;
  if (!soft) return false;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nb = getCell(grid, col + dc, row + dr, 'front');
    if (nb?.part === 'body') return true;
    if (grid.cells.get(cellKey(col + dc, row + dr))?.part === 'body') return true;
  }
  return false;
}

function faceRegion(grid: MonsterGrid, shiftX: number, shiftY: number): GridCell[] {
  const body = bodyOnly(grid);
  if (body.length === 0) return [];
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const h = maxR - minR;
  const w = maxC - minC;
  const faceLo = minR + Math.floor(h * (0.28 + shiftY * 0.1));
  const faceHi = minR + Math.floor(h * (0.82 + shiftY * 0.08));
  const midC = (minC + maxC) / 2 + shiftX * w * 0.15;
  const halfW = Math.max(2, Math.floor(w * 0.4));

  return body.filter(
    (c) => c.row >= faceLo && c.row <= faceHi && Math.abs(c.col - midC) <= halfW,
  );
}

/** Sample lip-line row at column offset t∈[-1,1] from mid. */
function lipRowAt(
  midRow: number,
  t: number,
  kind: LipCurveKind,
  amp: number,
  skew: number,
): number {
  let bend = 0;
  switch (kind) {
    case 'smile':
      bend = -(1 - t * t) * amp; // higher at center (world Y up = higher row)
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
    case 'flat':
    default:
      bend = t * skew * 0.3;
      break;
  }
  return Math.round(midRow + bend);
}

/**
 * Place a mouth cell only on/near body — never floats outside silhouette.
 */
function putMouth(
  grid: MonsterGrid,
  col: number,
  row: number,
  base: GridCell,
  color: number,
  part: ParticlePart,
  role: MouthRole,
  soft = false,
): boolean {
  if (!nearBody(grid, col, row, soft)) return false;
  put(grid, col, row, base, color, part, 0.045, 1, role);
  return true;
}

function creamTooth(palette: MonsterPalette): number {
  // Soft cream, not pure white — reads as enamel without a chalk stripe
  return lighten(darken(palette.eyeWhite, 0.08), 0.05) || 0xf2e6c8;
}

/**
 * Mouth from lip curve. Styles guarantee dark cavity dominates over teeth.
 */
function paintMouthFromCurve(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  halfW: number,
  base: GridCell,
  faceH: number,
  lowestEyeRow: number,
): void {
  const sr = grid.scaleRef;
  const style = rng.pick<MouthStyle>([
    'closed-line',
    'closed-line',
    'zigzag',
    'zigzag',
    'open-maw',
    'open-maw',
    'open-maw',
    'open-maw',
    'tongue-out',
    'tiny',
  ]);

  const mouthColor = darken(palette.mouth, 0.2);
  const cavityColor = darken(palette.mouth, 0.45);
  const tooth = creamTooth(palette);
  const curve = rng.pick<LipCurveKind>(['smile', 'scowl', 'wave', 'skew', 'flat']);
  const amp = rng.float(0.8, 2.4) * Math.max(1, sr * 0.5);
  const skew = rng.float(-1.2, 1.2);

  // Keep mouth below eyes with ≥2 cell gap
  const maxMouthTop = lowestEyeRow - 2;
  let lipMid = Math.min(midR, maxMouthTop - 1);
  if (lipMid < midR - Math.floor(faceH * 0.35)) {
    lipMid = Math.max(midR - Math.floor(faceH * 0.2), maxMouthTop - 2);
  }

  if (style === 'tiny') {
    const ox = rng.int(-Math.floor(halfW * 0.4), Math.floor(halfW * 0.4));
    const oy = rng.int(-1, 1);
    const cx = midC + ox;
    const cy = Math.min(lipMid + oy, maxMouthTop - 1);
    const rw = rng.int(1, 2);
    const rh = rng.int(1, 2);
    for (let dy = -rh; dy <= rh; dy++) {
      for (let dx = -rw; dx <= rw; dx++) {
        if ((dx * dx) / (rw * rw + 0.01) + (dy * dy) / (rh * rh + 0.01) > 1.2) continue;
        const role: MouthRole = dy > 0 ? 'upper' : dy < 0 ? 'lower' : 'cavity';
        putMouth(
          grid,
          cx + dx,
          cy + dy,
          base,
          dy === 0 ? cavityColor : mouthColor,
          'mouth',
          role,
          true,
        );
      }
    }
    // Soft outline along rim
    for (let dx = -rw - 1; dx <= rw + 1; dx++) {
      putMouth(grid, cx + dx, cy + rh + 1, base, palette.outline, 'outline', 'upper', true);
      putMouth(grid, cx + dx, cy - rh - 1, base, palette.outline, 'outline', 'lower', true);
    }
    return;
  }

  // Width 30–55% of face → half = 15–27.5% of faceW (halfW param = faceW/2)
  const faceWApprox = halfW * 2;
  const W = Math.max(
    2,
    Math.floor(faceWApprox * rng.float(0.15, 0.275)),
  );

  let openUp = 0;
  let openDown = 0;
  if (style === 'closed-line') {
    openUp = 0;
    openDown = 0;
  } else if (style === 'zigzag') {
    openUp = 0;
    openDown = 0;
  } else if (style === 'open-maw') {
    const open = Math.max(
      3,
      Math.min(Math.floor(faceH * rng.float(0.25, 0.42)), Math.round(rng.float(4, 9) * sr * 0.5)),
    );
    openUp = Math.floor(open * 0.35);
    openDown = open - openUp;
  } else {
    // tongue-out — smaller maw
    const open = Math.max(2, Math.round(rng.float(2, 4) * sr * 0.55));
    openUp = Math.floor(open * 0.3);
    openDown = open - openUp;
  }

  // Ensure mouth top stays under eyes
  while (lipMid + openUp >= maxMouthTop && lipMid > 2) lipMid--;

  const lipRows: number[] = [];
  for (let dx = -W; dx <= W; dx++) {
    const t = W === 0 ? 0 : dx / W;
    lipRows[dx + W] = lipRowAt(lipMid, t, curve, amp, skew);
  }

  // Paint cavity + lips along curve
  for (let dx = -W; dx <= W; dx++) {
    const lip = lipRows[dx + W]!;

    if (style === 'closed-line' || style === 'zigzag') {
      // 1–2 cell thick dark line along curve
      putMouth(grid, midC + dx, lip, base, mouthColor, 'mouth', 'cavity', true);
      if (rng.chance(0.55) || Math.abs(dx) < W * 0.7) {
        putMouth(grid, midC + dx, lip - 1, base, cavityColor, 'mouth', 'lower', true);
      }
      putMouth(grid, midC + dx, lip + 1, base, palette.outline, 'outline', 'upper', true);
      continue;
    }

    // Open styles: elliptical taper at ends so cavity isn't a rectangle
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

  // Side corners outline
  if (style !== 'closed-line' && style !== 'zigzag') {
    const leftLip = lipRows[0]!;
    const rightLip = lipRows[W * 2]!;
    putMouth(grid, midC - W - 1, leftLip, base, palette.outline, 'outline', 'cavity', true);
    putMouth(grid, midC + W + 1, rightLip, base, palette.outline, 'outline', 'cavity', true);
  }

  if (style === 'zigzag') {
    // Sparse alternating fangs — keep dark lip dominant
    let up = true;
    for (let dx = -W + 1; dx <= W - 1; dx += rng.int(3, 4)) {
      const lip = lipRows[dx + W]!;
      const h = rng.pick([1, 1, 2]);
      for (let i = 1; i <= h; i++) {
        const row = up ? lip + i : lip - i;
        const role: MouthRole = up ? 'upper' : 'lower';
        putMouth(grid, midC + dx, row, base, tooth, 'tooth', role, true);
        if (i < h) {
          // slight base flare only on taller fangs
          putMouth(grid, midC + dx - 1, up ? lip + 1 : lip - 1, base, tooth, 'tooth', role, true);
          putMouth(grid, midC + dx + 1, up ? lip + 1 : lip - 1, base, tooth, 'tooth', role, true);
        }
      }
      putMouth(grid, midC + dx, lip, base, cavityColor, 'mouth', 'cavity', true);
      up = !up;
    }
    return;
  }

  if (style === 'open-maw') {
    const cavityH = openUp + openDown;
    const maxToothH = Math.max(1, Math.floor(cavityH * 0.35));
    const fromUpper = rng.chance(0.65);
    const step = rng.int(3, 5);
    for (let dx = -W + 1; dx <= W - 1; dx += step) {
      if (rng.chance(0.2)) continue;
      const lip = lipRows[dx + W]!;
      const h = rng.int(1, maxToothH);
      for (let i = 1; i <= h; i++) {
        // Triangle: wide at gum, tip at end
        const half = i === h ? 0 : i === 1 && h >= 2 ? 1 : 0;
        for (let tdx = -half; tdx <= half; tdx++) {
          const row = fromUpper ? lip + openUp - i : lip - openDown + i;
          const role: MouthRole = fromUpper ? 'upper' : 'lower';
          const top = lip + openUp;
          const bot = lip - openDown;
          if (row > bot && row < top) {
            putMouth(grid, midC + dx + tdx, row, base, tooth, 'tooth', role, false);
          }
        }
      }
    }
    return;
  }

  if (style === 'tongue-out') {
    // Few upper teeth only
    const cavityH = openUp + openDown;
    const maxToothH = Math.max(1, Math.floor(cavityH * 0.3));
    for (let dx = -W + 2; dx <= W - 2; dx += 3) {
      if (rng.chance(0.25)) continue;
      const lip = lipRows[dx + W]!;
      const h = rng.int(1, maxToothH);
      for (let i = 1; i <= h; i++) {
        putMouth(grid, midC + dx, lip + openUp - i, base, tooth, 'tooth', 'upper', false);
      }
    }
    // Tongue hanging below lower lip, tapering
    const tw = Math.max(1, Math.floor(W * 0.35));
    const th = rng.int(2, Math.max(2, Math.round(3 * sr * 0.5)));
    const tipShift = rng.int(-1, 1);
    for (let dy = 1; dy <= th; dy++) {
      const half = dy === th ? 0 : Math.max(0, tw - Math.floor(dy / 2));
      for (let dx = -half; dx <= half; dx++) {
        const lip = lipRows[Math.min(W * 2, Math.max(0, W + tipShift))]!;
        putMouth(
          grid,
          midC + tipShift + dx,
          lip - openDown - dy,
          base,
          palette.accent,
          'mouth',
          'tongue',
          true,
        );
      }
    }
  }
}

/**
 * Mouth-only face features — eyes rendered volumetrically in detail view.
 */
export function applyMouthFeatures(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  layout: FaceLayout,
): void {
  const eyeCeilingRow = layout.midR - Math.floor(layout.faceH * 0.35);
  paintMouthFromCurve(
    grid,
    rng,
    palette,
    layout.midC + rng.int(-1, 1),
    layout.midR - 1,
    layout.faceHalf,
    layout.base,
    layout.faceH,
    eyeCeilingRow,
  );
}

/** @deprecated Grid eyes removed — use applyMouthFeatures + volumetricEyes */
export function applyFeatures(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  _bodyArchetype = 'blob',
): void {
  const layout = computeFaceLayout(rng, grid);
  if (!layout) return;
  applyMouthFeatures(rng, grid, palette, layout);
}
