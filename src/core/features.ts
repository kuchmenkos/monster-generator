import { darken, lighten } from './palette';
import type { Rng } from './rng';
import type { GridCell, MonsterGrid, MonsterPalette, MouthRole, ParticlePart } from './types';
import { cellKey } from './types';

type EyeShape =
  | 'round'
  | 'square'
  | 'tall'
  | 'wide'
  | 'sleepy'
  | 'star'
  | 'diamond'
  | 'droopy'
  | 'angry'
  | 'crescent'
  | 'slit';
type EyeArchetype = 'masks' | 'goggle' | 'cyclops-giant' | 'cluster' | 'mismatched';
type MouthStyle = 'closed-line' | 'zigzag' | 'open-maw' | 'tongue-out' | 'tiny';
type LipCurveKind = 'smile' | 'scowl' | 'wave' | 'skew' | 'flat';
type NoseKind = 'button' | 'snout' | 'hook' | 'pig' | 'beak';
type ToothKind = 'fang' | 'square' | 'tusk';

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
  grid.cells.set(cellKey(col, row), {
    col,
    row,
    x: grid.originX + col * grid.cell,
    y: grid.originY + row * grid.cell,
    z: base.z + zBoost,
    nx: 0.1,
    ny: 0.1,
    nz: 1,
    color,
    part,
    phase: base.phase,
    size,
    tipFactor: 0,
    mouthRole,
  });
}

function bodyOnly(grid: MonsterGrid): GridCell[] {
  return [...grid.cells.values()].filter((c) => c.part === 'body');
}

/** True if col/row is on body (or within 1-cell soft rim for lip ends). */
function nearBody(grid: MonsterGrid, col: number, row: number, soft = false): boolean {
  if (grid.cells.get(cellKey(col, row))?.part === 'body') return true;
  if (!soft) return false;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
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

function eyeMask(shape: EyeShape, w: number, h: number): Set<string> {
  const cells = new Set<string>();
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / Math.max(0.5, cx);
      const ny = (y - cy) / Math.max(0.5, cy);
      let inside = false;

      switch (shape) {
        case 'square':
          inside = true;
          break;
        case 'round':
          inside = nx * nx + ny * ny <= 1.15;
          break;
        case 'tall':
          inside = Math.abs(nx) * 1.35 + Math.abs(ny) * 0.7 <= 1.1;
          break;
        case 'wide':
          inside = Math.abs(nx) * 0.7 + Math.abs(ny) * 1.35 <= 1.1;
          break;
        case 'sleepy':
          inside = ny <= 0.35 && nx * nx + ny * ny * 0.6 <= 1.2;
          break;
        case 'star': {
          const onH = Math.abs(ny) <= 0.35;
          const onV = Math.abs(nx) <= 0.35;
          inside = onH || onV;
          break;
        }
        case 'diamond':
          inside = Math.abs(nx) + Math.abs(ny) <= 1.05;
          break;
        case 'droopy':
          // Lower half heavy
          inside = ny <= 0.55 && nx * nx + (ny + 0.2) * (ny + 0.2) <= 1.15;
          break;
        case 'angry':
          // Diagonal upper cut (angry brow)
          inside = nx * nx + ny * ny <= 1.15 && ny <= 0.55 - nx * 0.35;
          break;
        case 'crescent':
          // Outer circle minus inner offset
          inside =
            nx * nx + ny * ny <= 1.15 &&
            (nx - 0.35) * (nx - 0.35) + ny * ny > 0.55;
          break;
        case 'slit':
          inside = Math.abs(nx) <= 0.28 && Math.abs(ny) <= 1.0;
          break;
      }
      if (inside) cells.add(`${x},${y}`);
    }
  }
  if (cells.size < 4) {
    for (let y = 0; y < Math.min(2, h); y++) {
      for (let x = 0; x < Math.min(2, w); x++) cells.add(`${x},${y}`);
    }
  }
  return cells;
}

function paintEyeShaped(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  originCol: number,
  originRow: number,
  w: number,
  h: number,
  shape: EyeShape,
  base: GridCell,
  ringThick = 1,
  irisColor?: number,
): void {
  const mask = eyeMask(shape, w, h);

  for (let r = 1; r <= ringThick; r++) {
    for (const key of mask) {
      const [xs, ys] = key.split(',');
      const x = Number(xs);
      const y = Number(ys);
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
        [r, r],
        [-r, r],
        [r, -r],
        [-r, -r],
      ] as const) {
        const nk = `${x + dx},${y + dy}`;
        if (!mask.has(nk)) {
          put(grid, originCol + x + dx, originRow + y + dy, base, palette.outline, 'outline', 0.03);
        }
      }
    }
  }

  for (const key of mask) {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    put(grid, originCol + x, originRow + y, base, palette.eyeWhite, 'eye', 0.04);
  }

  if (irisColor !== undefined && w >= 4 && h >= 4) {
    const icx = Math.floor(w / 2);
    const icy = Math.floor(h / 2);
    for (const key of mask) {
      const [xs, ys] = key.split(',').map(Number) as [number, number];
      const d = Math.hypot(xs - icx, ys - icy);
      if (d >= 1.2 && d <= Math.min(w, h) * 0.35) {
        put(grid, originCol + xs, originRow + ys, base, irisColor, 'eye', 0.045);
      }
    }
  }

  // Prefer pupil near center of mask (not on rim)
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const lookX = cx + rng.float(-0.35, 0.35) * Math.max(0, w / 2 - 1.5);
  const lookY = cy + rng.float(-0.35, 0.35) * Math.max(0, h / 2 - 1.5);
  const pupilKey = [...mask].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return Math.hypot(ax! - lookX, ay! - lookY) - Math.hypot(bx! - lookX, by! - lookY);
  })[0];
  if (pupilKey) {
    const [px, py] = pupilKey.split(',').map(Number) as [number, number];
    // Max travel: stay ≥1 cell inside eye
    const rangeX = Math.max(0.1, Math.max(0, (w * 0.5 - 1.25)) * grid.cell);
    const rangeY = Math.max(0.08, Math.max(0, (h * 0.5 - 1.25)) * grid.cell);
    const pupilRange = { x: rangeX, y: rangeY };
    const big = w >= 5 && h >= 5;
    put(grid, originCol + px, originRow + py, base, palette.pupil, 'pupil', 0.055);
    const pupilCell = grid.cells.get(cellKey(originCol + px, originRow + py));
    if (pupilCell) pupilCell.pupilRange = pupilRange;
    if (big) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const tx = originCol + px + dx;
        const ty = originRow + py + dy;
        if (mask.has(`${px + dx},${py + dy}`)) {
          put(grid, tx, ty, base, palette.pupil, 'pupil', 0.055);
          const c = grid.cells.get(cellKey(tx, ty));
          if (c) c.pupilRange = pupilRange;
        }
      }
    }
  }
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

/** Paint one tooth into cavity — fang / square / tusk shapes. */
function paintOneTooth(
  grid: MonsterGrid,
  midC: number,
  lip: number,
  dx: number,
  fromUpper: boolean,
  openUp: number,
  openDown: number,
  kind: ToothKind,
  h: number,
  base: GridCell,
  tooth: number,
): void {
  const role: MouthRole = fromUpper ? 'upper' : 'lower';
  const top = lip + openUp;
  const bot = lip - openDown;
  const open = openUp + openDown > 0;
  for (let i = 1; i <= h; i++) {
    let half = 0;
    if (kind === 'fang') {
      half = i === h ? 0 : i === 1 && h >= 2 ? 1 : 0;
    } else if (kind === 'square') {
      half = i < h ? 1 : 0;
    } else {
      half = i <= Math.ceil(h * 0.45) ? 1 : 0;
    }
    for (let tdx = -half; tdx <= half; tdx++) {
      const row = fromUpper ? lip + openUp - i : lip - openDown + i;
      if (open) {
        if (row > bot && row < top) {
          putMouth(grid, midC + dx + tdx, row, base, tooth, 'tooth', role, false);
        }
      } else {
        putMouth(grid, midC + dx + tdx, row, base, tooth, 'tooth', role, true);
      }
    }
  }
}

/**
 * Volumetric nose between eyes and mouth. Returns lowest nose row (or null if none).
 */
function paintNose(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  faceW: number,
  base: GridCell,
  lowestEye: number,
): number | null {
  // 40% chance — rest keep face as before (no nose)
  if (!rng.chance(0.4)) return null;

  const kind = rng.pick<NoseKind>(['button', 'snout', 'snout', 'hook', 'pig']);
  // Beak is rare among noses
  const finalKind: NoseKind = rng.chance(0.12) ? 'beak' : kind;
  const noseColor = darken(palette.base, rng.float(0.05, 0.18));
  const nostril = darken(palette.shadow, 0.1);
  // Sit below eyes, above mouth band
  let cy = Math.min(midR + rng.int(-1, 1), lowestEye - 1);
  if (cy >= lowestEye) cy = lowestEye - 1;
  const cx = midC + rng.int(-1, 1);

  const putNose = (col: number, row: number, color: number, zBoost = 0.055) => {
    if (!nearBody(grid, col, row, true)) return;
    put(grid, col, row, base, color, 'nose', zBoost, 1);
  };

  if (finalKind === 'button') {
    const r = rng.int(1, 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.2) continue;
        putNose(cx + dx, cy + dy, noseColor);
      }
    }
    if (rng.chance(0.6)) {
      putNose(cx - 1, cy - 1, nostril, 0.06);
      putNose(cx + 1, cy - 1, nostril, 0.06);
    }
    return cy - r;
  }

  if (finalKind === 'snout' || finalKind === 'pig') {
    const w = Math.max(2, Math.floor(faceW * rng.float(0.12, 0.22)));
    const h = rng.int(2, 3);
    for (let dy = 0; dy < h; dy++) {
      const half = Math.max(1, w - dy);
      for (let dx = -half; dx <= half; dx++) {
        putNose(cx + dx, cy - dy, noseColor);
      }
    }
    // Nostrils on tip
    putNose(cx - 1, cy - h, nostril, 0.06);
    putNose(cx + 1, cy - h, nostril, 0.06);
    if (finalKind === 'pig') {
      putNose(cx, cy - h, lighten(noseColor, 0.12), 0.06);
    }
    return cy - h;
  }

  if (finalKind === 'hook') {
    const h = rng.int(3, 5);
    for (let i = 0; i < h; i++) {
      putNose(cx, cy - i, noseColor);
      if (i > 1) putNose(cx + (rng.chance(0.5) ? 1 : -1), cy - i, noseColor);
    }
    putNose(cx + 1, cy - h, noseColor, 0.06);
    putNose(cx + 1, cy - h - 1, darken(noseColor, 0.1), 0.06);
    return cy - h - 1;
  }

  // beak — rare pointed wedge
  const h = rng.int(3, 5);
  for (let i = 0; i < h; i++) {
    const half = Math.max(0, Math.floor((h - i) * 0.5));
    for (let dx = -half; dx <= half; dx++) {
      putNose(cx + dx, cy - i, darken(palette.accent, 0.1));
    }
  }
  return cy - h;
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
  noseBottom: number | null,
): void {
  const sr = grid.scaleRef;
  // ~20% mega-maw bias toward huge open cavity
  const megaMaw = rng.chance(0.2);
  const style = megaMaw
    ? 'open-maw'
    : rng.pick<MouthStyle>([
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

  const lipColor = palette.lip ?? darken(palette.mouth, 0.05);
  const mouthColor = darken(palette.mouth, 0.2);
  const cavityColor = darken(palette.mouth, 0.45);
  const tooth = creamTooth(palette);
  const thickLips = rng.chance(0.4);
  const curve = rng.pick<LipCurveKind>(['smile', 'scowl', 'wave', 'skew', 'flat']);
  const amp = rng.float(0.8, 2.4) * Math.max(1, sr * 0.5);
  const skew = rng.float(-1.2, 1.2);

  // Keep mouth below eyes (and nose if present) with ≥2 cell gap
  const maxMouthTop = Math.min(lowestEyeRow - 2, noseBottom != null ? noseBottom - 1 : Infinity);
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
          dy === 0 ? cavityColor : thickLips ? lipColor : mouthColor,
          'mouth',
          role,
          true,
        );
      }
    }
    for (let dx = -rw - 1; dx <= rw + 1; dx++) {
      putMouth(grid, cx + dx, cy + rh + 1, base, palette.outline, 'outline', 'upper', true);
      putMouth(grid, cx + dx, cy - rh - 1, base, palette.outline, 'outline', 'lower', true);
    }
    return;
  }

  const faceWApprox = halfW * 2;
  const W = Math.max(
    2,
    Math.floor(
      faceWApprox * (megaMaw ? rng.float(0.28, 0.42) : rng.float(0.15, 0.275)),
    ),
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
      megaMaw ? 5 : 3,
      Math.min(
        Math.floor(faceH * (megaMaw ? rng.float(0.38, 0.52) : rng.float(0.25, 0.42))),
        Math.round(rng.float(megaMaw ? 6 : 4, megaMaw ? 12 : 9) * sr * 0.5),
      ),
    );
    openUp = Math.floor(open * 0.35);
    openDown = open - openUp;
  } else {
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

  const rimColor = thickLips ? lipColor : mouthColor;

  for (let dx = -W; dx <= W; dx++) {
    const lip = lipRows[dx + W]!;

    if (style === 'closed-line' || style === 'zigzag') {
      putMouth(grid, midC + dx, lip, base, thickLips ? lipColor : mouthColor, 'mouth', 'cavity', true);
      if (rng.chance(0.55) || Math.abs(dx) < W * 0.7) {
        putMouth(grid, midC + dx, lip - 1, base, cavityColor, 'mouth', 'lower', true);
      }
      if (thickLips) {
        putMouth(grid, midC + dx, lip + 1, base, lipColor, 'mouth', 'upper', true);
        putMouth(grid, midC + dx, lip + 2, base, palette.outline, 'outline', 'upper', true);
      } else {
        putMouth(grid, midC + dx, lip + 1, base, palette.outline, 'outline', 'upper', true);
      }
      continue;
    }

    const nx = W === 0 ? 0 : dx / W;
    const taper = Math.sqrt(Math.max(0, 1 - nx * nx * 0.85));
    const localUp = Math.max(0, Math.round(openUp * taper));
    const localDown = Math.max(1, Math.round(openDown * taper));
    const top = lip + localUp;
    const bot = lip - localDown;

    putMouth(grid, midC + dx, top, base, rimColor, 'mouth', 'upper', true);
    if (thickLips) {
      putMouth(grid, midC + dx, top - 1, base, lipColor, 'mouth', 'upper', true);
    }
    putMouth(grid, midC + dx, bot, base, rimColor, 'mouth', 'lower', true);
    if (thickLips) {
      putMouth(grid, midC + dx, bot + 1, base, lipColor, 'mouth', 'lower', true);
    }
    for (let r = bot + 1; r < top; r++) {
      putMouth(grid, midC + dx, r, base, cavityColor, 'mouth', 'cavity', false);
    }
    putMouth(grid, midC + dx, top + 1, base, palette.outline, 'outline', 'upper', true);
    putMouth(grid, midC + dx, bot - 1, base, palette.outline, 'outline', 'lower', true);
  }

  if (style !== 'closed-line' && style !== 'zigzag') {
    const leftLip = lipRows[0]!;
    const rightLip = lipRows[W * 2]!;
    putMouth(grid, midC - W - 1, leftLip, base, palette.outline, 'outline', 'cavity', true);
    putMouth(grid, midC + W + 1, rightLip, base, palette.outline, 'outline', 'cavity', true);
  }

  // Per-tooth catalog — mix fang / square / tusk, uneven heights & gaps
  const toothMix = rng.chance(0.65);
  const pickKind = (): ToothKind =>
    toothMix
      ? rng.pick(['fang', 'fang', 'square', 'tusk'])
      : rng.pick(['fang', 'square', 'tusk']);

  if (style === 'zigzag') {
    let up = true;
    for (let dx = -W + 1; dx <= W - 1; ) {
      if (rng.chance(0.15)) {
        dx += rng.int(2, 4);
        continue;
      }
      const lip = lipRows[dx + W]!;
      const kind = pickKind();
      const h =
        kind === 'tusk' ? rng.pick([2, 3]) : kind === 'square' ? rng.pick([1, 2]) : rng.pick([1, 1, 2]);
      paintOneTooth(grid, midC, lip, dx, up, 0, 0, kind, h, base, tooth);
      putMouth(grid, midC + dx, lip, base, cavityColor, 'mouth', 'cavity', true);
      up = !up;
      dx += rng.int(2, 4);
    }
    return;
  }

  if (style === 'open-maw') {
    const cavityH = openUp + openDown;
    const maxToothH = Math.max(1, Math.floor(cavityH * (megaMaw ? 0.45 : 0.35)));
    // Both jaws often — refs show upper+lower irregular dentition
    const bothJaws = rng.chance(0.7);
    for (let jaw = 0; jaw < (bothJaws ? 2 : 1); jaw++) {
      const fromUpper = bothJaws ? jaw === 0 : rng.chance(0.65);
      let dx = -W + 1;
      while (dx <= W - 1) {
        if (rng.chance(0.18)) {
          dx += rng.int(2, 4);
          continue;
        }
        const lip = lipRows[dx + W]!;
        const kind = pickKind();
        // Corner tusks longer
        const nearCorner = Math.abs(dx) > W * 0.55;
        let h = rng.int(1, maxToothH);
        if (kind === 'tusk' || nearCorner) h = Math.max(h, Math.min(maxToothH, h + 1));
        if (kind === 'square') h = Math.min(h, Math.max(1, Math.floor(maxToothH * 0.7)));
        paintOneTooth(grid, midC, lip, dx, fromUpper, openUp, openDown, kind, h, base, tooth);
        dx += rng.int(2, kind === 'tusk' ? 5 : 4);
      }
    }
    return;
  }

  if (style === 'tongue-out') {
    const cavityH = openUp + openDown;
    const maxToothH = Math.max(1, Math.floor(cavityH * 0.3));
    for (let dx = -W + 2; dx <= W - 2; ) {
      if (rng.chance(0.25)) {
        dx += 3;
        continue;
      }
      const lip = lipRows[dx + W]!;
      const kind = pickKind();
      const h = rng.int(1, maxToothH);
      paintOneTooth(grid, midC, lip, dx, true, openUp, openDown, kind, h, base, tooth);
      dx += rng.int(2, 4);
    }
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
 * Extreme, characterful faces — big eyes, lip-curve mouths, asymmetry.
 */
export function applyFeatures(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  bodyArchetype = 'blob',
): void {
  const shiftX = rng.float(-1, 1);
  const shiftY = rng.float(-0.6, 0.8);
  const region = faceRegion(grid, shiftX, shiftY);
  if (region.length < 8) return;

  const minC = Math.min(...region.map((c) => c.col));
  const maxC = Math.max(...region.map((c) => c.col));
  const minR = Math.min(...region.map((c) => c.row));
  const maxR = Math.max(...region.map((c) => c.row));
  const midC = Math.round((minC + maxC) / 2);
  const midR = Math.round((minR + maxR) / 2);
  const faceW = maxC - minC;
  const faceH = Math.max(4, maxR - minR);
  const base = region.reduce((a, b) => (a.z >= b.z ? a : b));
  const sr = grid.scaleRef;

  const eyePick: EyeArchetype[] =
    bodyArchetype === 'bighead'
      ? ['goggle', 'cyclops-giant', 'cyclops-giant', 'mismatched']
      : ['masks', 'goggle', 'goggle', 'cyclops-giant', 'cluster', 'mismatched'];
  const archetype = rng.pick(eyePick);

  let lowestEye = midR;
  // Scale eye sizes with resolution
  const eScale = Math.max(1, Math.round(sr * 0.85));

  if (archetype === 'goggle') {
    const w = Math.max(4, Math.min(7 + eScale, Math.floor(faceW * 0.32)));
    const h = w;
    const spread = Math.max(w, Math.floor(faceW * 0.28));
    const y = midR - Math.floor(h / 2);
    paintEyeShaped(grid, rng, palette, midC - spread - Math.floor(w / 2), y, w, h, rng.pick(['round', 'diamond', 'wide']), base, 2);
    paintEyeShaped(grid, rng, palette, midC + spread - Math.floor(w / 2), y, w, h, rng.pick(['round', 'diamond', 'wide']), base, 2);
    lowestEye = y;
  } else if (archetype === 'cyclops-giant') {
    const w = Math.max(5, Math.min(10 + eScale, Math.floor(faceW * rng.float(0.4, 0.6))));
    const h = Math.max(4, Math.floor(w * rng.float(0.75, 1)));
    const y = midR - Math.floor(h / 2);
    paintEyeShaped(
      grid,
      rng,
      palette,
      midC - Math.floor(w / 2) + rng.int(-1, 1),
      y,
      w,
      h,
      'round',
      base,
      1,
      palette.accent,
    );
    lowestEye = y;
  } else if (archetype === 'cluster') {
    const count = rng.int(4, 8);
    const spots: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const x = midC + rng.int(-Math.floor(faceW * 0.45), Math.floor(faceW * 0.45));
      const y = midR + rng.int(-2, Math.floor((maxR - minR) * 0.35));
      spots.push({ x, y });
      const s = rng.int(1, 2 + Math.floor(eScale * 0.3));
      paintEyeShaped(grid, rng, palette, x, y, s, s, rng.pick(['round', 'square']), base, 1);
    }
    lowestEye = Math.min(...spots.map((s) => s.y));
  } else if (archetype === 'mismatched') {
    const bigW = rng.int(4, 6 + Math.floor(eScale * 0.5));
    const bigH = rng.int(3, 5 + Math.floor(eScale * 0.3));
    const smallW = rng.int(2, 3);
    const smallH = rng.int(2, 3);
    const spread = Math.max(bigW, Math.floor(faceW * 0.25));
    const yBig = midR - Math.floor(bigH / 2) + rng.int(-1, 2);
    const ySmall = midR - Math.floor(smallH / 2) + rng.int(-2, 1);
    const leftBig = rng.chance(0.5);
    if (leftBig) {
      paintEyeShaped(grid, rng, palette, midC - spread - Math.floor(bigW / 2), yBig, bigW, bigH, 'round', base, 1);
      paintEyeShaped(grid, rng, palette, midC + spread - Math.floor(smallW / 2), ySmall, smallW, smallH, 'square', base, 1);
    } else {
      paintEyeShaped(grid, rng, palette, midC - spread - Math.floor(smallW / 2), ySmall, smallW, smallH, 'square', base, 1);
      paintEyeShaped(grid, rng, palette, midC + spread - Math.floor(bigW / 2), yBig, bigW, bigH, 'round', base, 1);
    }
    lowestEye = Math.min(yBig, ySmall);
  } else {
    const shapes = rng.shuffle<EyeShape>([
      'round',
      'square',
      'tall',
      'wide',
      'sleepy',
      'star',
      'diamond',
      'droopy',
      'angry',
      'crescent',
      'slit',
    ]);
    const eyeCount = rng.pick([1, 2, 2, 2, 3]);
    const makeSize = () => ({
      w: rng.int(2, Math.min(5 + Math.floor(eScale * 0.4), Math.max(2, Math.floor(faceW / 4)))),
      h: rng.int(2, 4 + Math.floor(eScale * 0.3)),
    });
    const eyes: { x: number; y: number; w: number; h: number; shape: EyeShape }[] = [];
    if (eyeCount === 1) {
      const s = makeSize();
      eyes.push({ x: midC - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]! });
    } else if (eyeCount === 2) {
      const left = makeSize();
      const right = rng.chance(0.4) ? makeSize() : { ...left };
      const spread = Math.max(left.w + 1, Math.floor(faceW * 0.22));
      eyes.push({
        x: midC - spread - Math.floor(left.w / 2),
        y: midR - Math.floor(left.h / 2) + rng.int(-1, 1),
        ...left,
        shape: shapes[0]!,
      });
      eyes.push({
        x: midC + spread - Math.floor(right.w / 2),
        y: midR - Math.floor(right.h / 2) + rng.int(-1, 1),
        ...right,
        shape: rng.chance(0.45) ? shapes[1]! : shapes[0]!,
      });
    } else {
      const s = makeSize();
      const spread = Math.max(s.w + 1, Math.floor(faceW * 0.22));
      eyes.push({ x: midC - spread - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]! });
      eyes.push({ x: midC + spread - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]! });
      const mid = makeSize();
      eyes.push({ x: midC - Math.floor(mid.w / 2), y: midR + s.h, ...mid, shape: shapes[1]! });
    }
    for (const e of eyes) {
      paintEyeShaped(grid, rng, palette, e.x, e.y, e.w, e.h, e.shape, base);
    }
    lowestEye = Math.min(...eyes.map((e) => e.y));
  }

  // Face half-width for mouth (≈40% of face already in region; use full faceW/2)
  const faceHalf = Math.max(3, Math.floor(faceW * 0.5));
  const noseBottom = paintNose(grid, rng, palette, midC, midR, faceW, base, lowestEye);
  paintMouthFromCurve(
    grid,
    rng,
    palette,
    midC + rng.int(-1, 1),
    midR - 1,
    faceHalf,
    base,
    faceH,
    lowestEye,
    noseBottom,
  );
}

/**
 * Optional tiny defects (~40%): wart, missing tooth, slight nose nudge.
 * At most one per creature — keeps characters quirky without noise.
 */
export function applyDefects(rng: Rng, grid: MonsterGrid, palette: MonsterPalette): void {
  if (!rng.chance(0.4)) return;

  const kind = rng.pick(['wart', 'missing-tooth', 'nose-nudge'] as const);

  if (kind === 'wart') {
    const body = [...grid.cells.values()].filter((c) => c.part === 'body');
    if (body.length < 10) return;
    const anchor = body[rng.int(0, body.length - 1)]!;
    const tint = darken(palette.accent, 0.1);
    for (const [dc, dr] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const col = anchor.col + dc;
      const row = anchor.row + dr;
      if (!nearBody(grid, col, row, true)) continue;
      put(grid, col, row, anchor, tint, 'body', 0.03, rng.float(0.7, 1));
    }
    return;
  }

  if (kind === 'missing-tooth') {
    const teeth = [...grid.cells.values()].filter((c) => c.part === 'tooth');
    if (teeth.length < 2) return;
    const victim = teeth[rng.int(0, teeth.length - 1)]!;
    grid.cells.delete(cellKey(victim.col, victim.row));
    return;
  }

  // nose-nudge: shift nose cells one step sideways if present
  const noses = [...grid.cells.values()].filter((c) => c.part === 'nose');
  if (noses.length === 0) return;
  const dir = rng.chance(0.5) ? 1 : -1;
  const moved: typeof noses = [];
  for (const n of noses) {
    grid.cells.delete(cellKey(n.col, n.row));
    moved.push({ ...n, col: n.col + dir });
  }
  for (const n of moved) {
    put(grid, n.col, n.row, n, n.color, 'nose', 0.055, n.size);
  }
}
