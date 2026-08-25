import { darken, lighten } from './palette';
import type { Rng } from './rng';
import type {
  GridCell,
  MonsterGrid,
  MonsterPalette,
  MouthRest,
  MouthRole,
  ParticlePart,
} from './types';
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
type PupilKind = 'round' | 'slit' | 'square' | 'dot' | 'wide-oval';
type LashStyle = 'none' | 'upper-lash' | 'heavy-lid' | 'spiky' | 'bags';

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
  const key = cellKey(col, row);
  const existing = grid.cells.get(key);
  // Never overwrite eyes — prevents mouth/nose "eating" the face cluster
  if (existing && (existing.part === 'eye' || existing.part === 'pupil')) return;
  grid.cells.set(key, {
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
  const pupilKind = rng.pick<PupilKind>([
    'round',
    'round',
    'slit',
    'square',
    'dot',
    'wide-oval',
  ]);
  // Iris more often on medium+ eyes (not only cyclops)
  const useIris =
    irisColor !== undefined ||
    (w >= 3 && h >= 3 && rng.chance(0.55));
  const iris =
    irisColor ??
    (rng.chance(0.45)
      ? palette.accent
      : rng.chance(0.5)
        ? palette.accent2
        : darken(palette.base, 0.25));

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

  if (useIris && w >= 3 && h >= 3) {
    const icx = Math.floor(w / 2);
    const icy = Math.floor(h / 2);
    const rMax = Math.min(w, h) * 0.38;
    for (const key of mask) {
      const [xs, ys] = key.split(',').map(Number) as [number, number];
      const d = Math.hypot(xs - icx, ys - icy);
      if (d >= 0.8 && d <= rMax) {
        put(grid, originCol + xs, originRow + ys, base, iris, 'eye', 0.045);
      }
    }
  }

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
    const rangeX = Math.max(0.1, Math.max(0, w * 0.5 - 1.25) * grid.cell);
    const rangeY = Math.max(0.08, Math.max(0, h * 0.5 - 1.25) * grid.cell);
    const pupilRange = { x: rangeX, y: rangeY };

    const offsets: Array<[number, number]> = [[0, 0]];
    if (pupilKind === 'round' && w >= 4 && h >= 4) {
      offsets.push([1, 0], [0, 1], [1, 1]);
    } else if (pupilKind === 'slit') {
      offsets.push([0, 1], [0, -1]);
      if (h >= 5) offsets.push([0, 2]);
    } else if (pupilKind === 'square') {
      offsets.push([1, 0], [0, 1], [1, 1]);
    } else if (pupilKind === 'wide-oval') {
      offsets.push([1, 0], [-1, 0]);
      if (w >= 5) offsets.push([2, 0]);
    }
    // dot = single cell only

    for (const [dx, dy] of offsets) {
      if (!mask.has(`${px + dx},${py + dy}`) && !(dx === 0 && dy === 0)) continue;
      put(grid, originCol + px + dx, originRow + py + dy, base, palette.pupil, 'pupil', 0.055);
      const c = grid.cells.get(cellKey(originCol + px + dx, originRow + py + dy));
      if (c) c.pupilRange = pupilRange;
    }

    // Catchlight — one bright pixel near pupil (refs)
    if (rng.chance(0.75) && w >= 3) {
      const ox = rng.chance(0.5) ? -1 : 1;
      const hx = originCol + px + ox;
      const hy = originRow + py + 1;
      if (mask.has(`${px + ox},${py + 1}`) || mask.has(`${px},${py + 1}`)) {
        put(grid, hx, hy, base, lighten(palette.eyeWhite, 0.05), 'eye', 0.058, 0.7);
      }
    }
  }

  // Lashes / lids on larger eyes (~50%)
  if (w >= 3 && h >= 3 && rng.chance(0.5)) {
    const lash = rng.pick<LashStyle>(['upper-lash', 'heavy-lid', 'spiky', 'bags', 'none']);
    if (lash === 'none') return;
    const topKeys = [...mask].filter((k) => {
      const [, ys] = k.split(',').map(Number);
      return ys === 0 || ys === 1;
    });
    for (const key of topKeys) {
      const [xs, ys] = key.split(',').map(Number) as [number, number];
      const col = originCol + xs;
      const row = originRow + ys;
      if (lash === 'upper-lash' || lash === 'spiky') {
        put(grid, col, row + 1, base, palette.outline, 'outline', 0.035);
        if (lash === 'spiky' && rng.chance(0.55)) {
          put(grid, col, row + 2, base, palette.outline, 'outline', 0.032, 0.75);
        }
      }
      if (lash === 'heavy-lid') {
        put(grid, col, row, base, darken(palette.base, 0.2), 'outline', 0.036);
        put(grid, col, row + 1, base, darken(palette.base, 0.12), 'outline', 0.034);
      }
    }
    if (lash === 'bags') {
      const botKeys = [...mask].filter((k) => {
        const [, ys] = k.split(',').map(Number);
        return ys === h - 1 || ys === h - 2;
      });
      for (const key of botKeys) {
        const [xs] = key.split(',').map(Number) as [number, number];
        put(
          grid,
          originCol + xs,
          originRow - 1,
          base,
          darken(palette.base, 0.22),
          'outline',
          0.03,
          0.85,
        );
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
  return lighten(darken(palette.eyeWhite, 0.08), 0.05) || 0xf2e6c8;
}

/**
 * Volumetric nose between eyes and mouth. Returns lowest nose row (or null).
 * 40% spawn rate.
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
  if (!rng.chance(0.4)) return null;

  const kind = rng.pick<NoseKind>(['button', 'snout', 'snout', 'hook', 'pig']);
  const finalKind: NoseKind = rng.chance(0.12) ? 'beak' : kind;
  const noseColor = darken(palette.base, rng.float(0.05, 0.18));
  const nostril = darken(palette.shadow, 0.1);
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
 * Mouth from lip curve. Rest pose prefers sealed/smile; talk opens from rest.
 * Returns MouthRest for animation.
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
): MouthRest {
  const sr = grid.scaleRef;
  // Character mouths like likes: open/grin often; thin sealed only sometimes
  const style = rng.pick<MouthStyle>([
    'open-maw',
    'open-maw',
    'open-maw',
    'open-maw',
    'zigzag',
    'zigzag',
    'zigzag',
    'tiny',
    'tiny',
    'closed-line',
    'closed-line',
    'tongue-out',
  ]);

  const lipColor = palette.lip ?? darken(palette.mouth, 0.05);
  const cavityColor = darken(palette.mouth, 0.45);
  const tooth = creamTooth(palette);
  const curve = rng.pick<LipCurveKind>(['smile', 'smile', 'smile', 'scowl', 'wave', 'skew']);
  const amp = rng.float(0.8, 2.4) * Math.max(1, sr * 0.5);
  const skew = rng.float(-1.2, 1.2);

  // Hard clearance under eyes — never paint into the eye cluster
  const maxMouthTop = Math.min(
    lowestEyeRow - 2,
    noseBottom != null ? noseBottom - 1 : Infinity,
  );
  let lipMid = Math.min(midR, maxMouthTop - 1);
  if (lipMid < midR - Math.floor(faceH * 0.35)) {
    lipMid = Math.max(midR - Math.floor(faceH * 0.2), maxMouthTop - 2);
  }

  if (style === 'tiny') {
    const ox = rng.int(-Math.floor(halfW * 0.35), Math.floor(halfW * 0.35));
    const oy = rng.int(-1, 1);
    const cx = midC + ox;
    const cy = Math.min(lipMid + oy, maxMouthTop - 1);
    const rw = rng.int(1, 2);
    // Thin sealed: upper + optional cavity slit only (no outline sandwich / grill)
    for (let dx = -rw; dx <= rw; dx++) {
      putMouth(grid, cx + dx, cy + 1, base, lipColor, 'mouth', 'upper', true);
      putMouth(grid, cx + dx, cy, base, cavityColor, 'mouth', 'cavity', true);
      putMouth(grid, cx + dx, cy - 1, base, lipColor, 'mouth', 'lower', true);
    }
    return 'sealed';
  }

  const faceWApprox = halfW * 2;
  const W = Math.max(2, Math.floor(faceWApprox * rng.float(0.12, 0.2)));

  let openUp = 0;
  let openDown = 0;
  if (style === 'open-maw') {
    // Characterful but not a scream (likes: open smile / small maw)
    const open = Math.max(
      2,
      Math.min(Math.floor(faceH * rng.float(0.1, 0.18)), Math.round(rng.float(2, 4) * sr * 0.5)),
    );
    openUp = Math.floor(open * 0.35);
    openDown = Math.max(1, open - openUp);
  } else if (style === 'tongue-out') {
    const open = Math.max(2, Math.round(rng.float(2, 3) * sr * 0.5));
    openUp = Math.floor(open * 0.3);
    openDown = open - openUp;
  }

  while (lipMid + openUp >= maxMouthTop && lipMid > 2) lipMid--;

  const lipRows: number[] = [];
  for (let dx = -W; dx <= W; dx++) {
    const t = W === 0 ? 0 : dx / W;
    lipRows[dx + W] = lipRowAt(lipMid, t, curve, amp, skew);
  }

  // --- Sealed / grin: max 2 lip rows + slit — never 5-line grill ---
  if (style === 'closed-line' || style === 'zigzag') {
    for (let dx = -W; dx <= W; dx++) {
      const lip = lipRows[dx + W]!;
      putMouth(grid, midC + dx, lip + 1, base, lipColor, 'mouth', 'upper', true);
      putMouth(grid, midC + dx, lip, base, cavityColor, 'mouth', 'cavity', true);
      putMouth(grid, midC + dx, lip - 1, base, lipColor, 'mouth', 'lower', true);
    }

    if (style === 'zigzag') {
      let up = true;
      for (let dx = -W + 1; dx <= W - 1; dx += rng.int(2, 4)) {
        const lip = lipRows[dx + W]!;
        const h = rng.pick([1, 1, 2]);
        for (let i = 1; i <= h; i++) {
          const row = up ? lip + i : lip - i;
          const role: MouthRole = up ? 'upper' : 'lower';
          putMouth(grid, midC + dx, row, base, tooth, 'tooth', role, true);
        }
        up = !up;
      }
      return 'grin';
    }
    return 'sealed';
  }

  // --- Open styles: tapered cavity with clear lips ---
  for (let dx = -W; dx <= W; dx++) {
    const lip = lipRows[dx + W]!;
    const nx = W === 0 ? 0 : dx / W;
    const taper = Math.sqrt(Math.max(0, 1 - nx * nx * 0.85));
    const localUp = Math.max(0, Math.round(openUp * taper));
    const localDown = Math.max(1, Math.round(openDown * taper));
    const top = lip + localUp;
    const bot = lip - localDown;

    putMouth(grid, midC + dx, top, base, lipColor, 'mouth', 'upper', true);
    putMouth(grid, midC + dx, bot, base, lipColor, 'mouth', 'lower', true);
    for (let r = bot + 1; r < top; r++) {
      putMouth(grid, midC + dx, r, base, cavityColor, 'mouth', 'cavity', false);
    }
    putMouth(grid, midC + dx, top + 1, base, palette.outline, 'outline', 'upper', true);
    putMouth(grid, midC + dx, bot - 1, base, palette.outline, 'outline', 'lower', true);
  }

  const leftLip = lipRows[0]!;
  const rightLip = lipRows[W * 2]!;
  putMouth(grid, midC - W - 1, leftLip, base, palette.outline, 'outline', 'cavity', true);
  putMouth(grid, midC + W + 1, rightLip, base, palette.outline, 'outline', 'cavity', true);

  if (style === 'open-maw') {
    const cavityH = openUp + openDown;
    const maxToothH = Math.max(1, Math.floor(cavityH * 0.4));
    const bothJaws = rng.chance(0.65);
    for (let jaw = 0; jaw < (bothJaws ? 2 : 1); jaw++) {
      const fromUpper = bothJaws ? jaw === 0 : rng.chance(0.65);
      for (let dx = -W + 1; dx <= W - 1; dx += rng.int(2, 4)) {
        if (rng.chance(0.2)) continue;
        const lip = lipRows[dx + W]!;
        const h = rng.int(1, maxToothH);
        for (let i = 1; i <= h; i++) {
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
    }
    return 'grin';
  }

  // tongue-out
  {
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
    return 'open';
  }
}

/**
 * Extreme, characterful faces — big eyes, optional nose, character mouths.
 */
export function applyFeatures(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  bodyArchetype = 'blob',
): MouthRest {
  const shiftX = rng.float(-0.6, 0.6);
  const shiftY = rng.float(-0.4, 0.5);
  const region = faceRegion(grid, shiftX, shiftY);
  if (region.length < 8) return 'sealed';

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

  // Bias toward cyclops / big readable eyes (likes); cluster rare
  const eyePick: EyeArchetype[] =
    bodyArchetype === 'bighead'
      ? ['cyclops-giant', 'cyclops-giant', 'goggle', 'mismatched']
      : [
          'cyclops-giant',
          'cyclops-giant',
          'cyclops-giant',
          'goggle',
          'goggle',
          'mismatched',
          'masks',
          'cluster',
        ];
  const archetype = rng.pick(eyePick);

  let lowestEye = midR;
  const eScale = Math.max(1, Math.round(sr * 0.85));
  const goggleShapes: EyeShape[] = ['round', 'diamond', 'wide', 'tall', 'sleepy', 'angry'];
  const minEye = Math.max(3, Math.floor(faceW * 0.12));

  if (archetype === 'goggle') {
    const w = Math.max(minEye, Math.min(8 + eScale, Math.floor(faceW * 0.34)));
    const h = Math.max(3, Math.floor(w * rng.float(0.7, 1.15)));
    const spread = Math.max(w, Math.floor(faceW * 0.28));
    const y = midR - Math.floor(h / 2);
    const iris = rng.chance(0.6) ? palette.accent : undefined;
    paintEyeShaped(grid, rng, palette, midC - spread - Math.floor(w / 2), y, w, h, rng.pick(goggleShapes), base, 2, iris);
    paintEyeShaped(grid, rng, palette, midC + spread - Math.floor(w / 2), y, w, h, rng.pick(goggleShapes), base, 2, iris);
    lowestEye = y;
  } else if (archetype === 'cyclops-giant') {
    const w = Math.max(minEye + 1, Math.min(10 + eScale, Math.floor(faceW * rng.float(0.4, 0.6))));
    const h = Math.max(4, Math.floor(w * rng.float(0.7, 1.1)));
    const y = midR - Math.floor(h / 2);
    paintEyeShaped(
      grid,
      rng,
      palette,
      midC - Math.floor(w / 2) + rng.int(-1, 1),
      y,
      w,
      h,
      rng.pick(['round', 'wide', 'diamond']),
      base,
      1,
      palette.accent,
    );
    lowestEye = y;
  } else if (archetype === 'cluster') {
    // Fewer, larger spots — avoid micro-eyes on empty mass
    const count = rng.int(3, 5);
    const spots: { x: number; y: number }[] = [];
    const baseY = midR + rng.int(-1, 1);
    for (let i = 0; i < count; i++) {
      const x = midC + rng.int(-Math.floor(faceW * 0.35), Math.floor(faceW * 0.35));
      const y = baseY + rng.int(-1, 1);
      spots.push({ x, y });
      const s = Math.max(2, rng.int(2, 3 + Math.floor(eScale * 0.35)));
      paintEyeShaped(grid, rng, palette, x, y, s, s, rng.pick(['round', 'square', 'slit']), base, 1);
    }
    lowestEye = Math.min(...spots.map((s) => s.y));
  } else if (archetype === 'mismatched') {
    const bigW = Math.max(minEye, rng.int(4, 7 + Math.floor(eScale * 0.5)));
    const bigH = Math.max(3, rng.int(3, 6 + Math.floor(eScale * 0.3)));
    const smallW = Math.max(2, rng.int(2, 4));
    const smallH = Math.max(2, rng.int(2, 4));
    const spread = Math.max(bigW, Math.floor(faceW * 0.25));
    // Shared baseline ±1 — size mismatch ok, wild vertical scatter not
    const yBase = midR - Math.floor(Math.max(bigH, smallH) / 2);
    const yBig = yBase + rng.int(-1, 1);
    const ySmall = yBase + rng.int(-1, 1);
    const leftBig = rng.chance(0.5);
    if (leftBig) {
      paintEyeShaped(grid, rng, palette, midC - spread - Math.floor(bigW / 2), yBig, bigW, bigH, rng.pick(['round', 'wide', 'tall']), base, 1, palette.accent);
      paintEyeShaped(grid, rng, palette, midC + spread - Math.floor(smallW / 2), ySmall, smallW, smallH, rng.pick(['square', 'slit', 'diamond']), base, 1);
    } else {
      paintEyeShaped(grid, rng, palette, midC - spread - Math.floor(smallW / 2), ySmall, smallW, smallH, rng.pick(['square', 'slit']), base, 1);
      paintEyeShaped(grid, rng, palette, midC + spread - Math.floor(bigW / 2), yBig, bigW, bigH, rng.pick(['round', 'wide']), base, 1, palette.accent2);
    }
    lowestEye = Math.min(yBig, ySmall);
  } else {
    const shapes = rng.shuffle<EyeShape>([
      'round', 'square', 'tall', 'wide', 'sleepy', 'star', 'diamond', 'droopy', 'angry', 'crescent', 'slit',
    ]);
    const eyeCount = rng.pick([1, 2, 2, 2]);
    const makeSize = () => ({
      w: rng.int(minEye, Math.min(6 + Math.floor(eScale * 0.45), Math.max(minEye, Math.floor(faceW / 3.5)))),
      h: rng.int(Math.max(2, minEye - 1), 5 + Math.floor(eScale * 0.35)),
    });
    const eyes: { x: number; y: number; w: number; h: number; shape: EyeShape }[] = [];
    if (eyeCount === 1) {
      const s = makeSize();
      eyes.push({ x: midC - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]! });
    } else {
      const left = makeSize();
      const right = rng.chance(0.55) ? makeSize() : { ...left };
      const spread = Math.max(left.w + 1, Math.floor(faceW * 0.22));
      const yBase = midR - Math.floor(Math.max(left.h, right.h) / 2);
      eyes.push({
        x: midC - spread - Math.floor(left.w / 2),
        y: yBase + rng.int(-1, 1),
        ...left,
        shape: shapes[0]!,
      });
      eyes.push({
        x: midC + spread - Math.floor(right.w / 2),
        y: yBase + rng.int(-1, 1),
        ...right,
        shape: rng.chance(0.5) ? shapes[1]! : shapes[0]!,
      });
    }
    for (const e of eyes) {
      paintEyeShaped(grid, rng, palette, e.x, e.y, e.w, e.h, e.shape, base);
    }
    lowestEye = Math.min(...eyes.map((e) => e.y));
  }

  const faceHalf = Math.max(3, Math.floor(faceW * 0.5));
  const noseBottom = paintNose(grid, rng, palette, midC, midR, faceW, base, lowestEye);
  const mouthRest = paintMouthFromCurve(
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

  // Soft cheek blush like likes (~25%) — never on eyes/mouth
  if (rng.chance(0.25)) {
    const blush = lighten(palette.accent, 0.15);
    const cheekY = Math.max(minR + 1, lowestEye - 1);
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const col = midC + side * rng.int(Math.max(2, Math.floor(faceW * 0.2)), Math.max(3, Math.floor(faceW * 0.35)));
      const row = cheekY + rng.int(-1, 1);
      const existing = grid.cells.get(cellKey(col, row));
      if (!existing || existing.part !== 'body') continue;
      put(grid, col, row, base, blush, 'body', 0.01, 1);
    }
  }

  return mouthRest;
}
