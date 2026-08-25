import { darken, lighten } from './palette';
import type { Rng } from './rng';
import type { GridCell, MonsterGrid, MonsterPalette } from './types';
import { cellKey } from './types';

type PatternKind =
  | 'plain'
  | 'belly'
  | 'spots'
  | 'stripes'
  | 'gradient'
  | 'rosettes'
  | 'scales'
  | 'stripes-curved'
  | 'mask'
  | 'bio-glow'
  | 'dual-gradient';

function bodyCells(grid: MonsterGrid): GridCell[] {
  return [...grid.cells.values()].filter((c) => c.part === 'body');
}

/** Cel-shade from normals + screen position so volume reads even with flat nz. */
function applyCelShading(grid: MonsterGrid, palette: MonsterPalette): void {
  const lx = -0.4;
  const ly = 0.6;
  const lz = 0.7;
  const llen = Math.hypot(lx, ly, lz) || 1;
  const Lx = lx / llen;
  const Ly = ly / llen;
  const Lz = lz / llen;

  const solid = [...grid.cells.values()].filter((c) => c.part === 'body' || c.part === 'appendage');
  if (solid.length === 0) return;
  const minC = Math.min(...solid.map((c) => c.col));
  const maxC = Math.max(...solid.map((c) => c.col));
  const minR = Math.min(...solid.map((c) => c.row));
  const maxR = Math.max(...solid.map((c) => c.row));
  const midC = (minC + maxC) / 2;
  const midR = (minR + maxR) / 2;
  const halfW = Math.max(1, (maxC - minC) / 2);
  const halfH = Math.max(1, (maxR - minR) / 2);

  for (const c of solid) {
    const d = c.nx * Lx + c.ny * Ly + c.nz * Lz;
    const pos = -0.45 * ((c.col - midC) / halfW) + 0.35 * ((c.row - midR) / halfH);
    const dither = (c.col + c.row) % 2 === 0 ? 0.04 : -0.04;
    const t = d * 0.45 + pos * 0.55 + dither;
    // 6 soft bands for richer volume (still cel, not smooth gradient)
    let color = palette.base;
    if (t > 0.38) color = lighten(palette.highlight, 0.06);
    else if (t > 0.22) color = palette.highlight;
    else if (t > 0.06) color = lighten(palette.base, 0.1);
    else if (t > -0.1) color = palette.base;
    else if (t > -0.28) color = darken(palette.base, 0.14);
    else color = palette.shadow;
    // Stronger underbelly AO
    if (c.ny < -0.2 || (c.row - minR) / (halfH * 2) < 0.28) {
      color = darken(color, 0.18);
    }
    c.color = color;
  }

  // Rim light + contact shadow where limbs meet body
  for (const c of solid) {
    let n = 0;
    let touchesOther = false;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nb = grid.cells.get(cellKey(c.col + dc, c.row + dr));
      if (nb && (nb.part === 'body' || nb.part === 'appendage')) {
        n++;
        if (nb.part !== c.part) touchesOther = true;
      }
    }
    if (n < 4 && c.nx > 0.15) c.color = lighten(c.color, 0.14);
    if (touchesOther) c.color = darken(c.color, 0.1);
  }
}

/**
 * Soft AO on body cells near face features so mouth/eyes don't erase volume.
 * Call after applyFeatures — only darkens body, never face parts.
 */
export function applyFaceAmbientOcclusion(grid: MonsterGrid): void {
  const face = [...grid.cells.values()].filter(
    (c) =>
      c.part === 'eye' ||
      c.part === 'pupil' ||
      c.part === 'mouth' ||
      c.part === 'tooth' ||
      c.part === 'nose' ||
      (c.part === 'outline' && c.mouthRole),
  );
  if (face.length === 0) return;
  const faceKeys = new Set(face.map((c) => cellKey(c.col, c.row)));
  for (const c of grid.cells.values()) {
    if (c.part !== 'body') continue;
    let near = 0;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      if (faceKeys.has(cellKey(c.col + dc, c.row + dr))) near++;
    }
    if (near >= 2) c.color = darken(c.color, 0.08 + near * 0.02);
  }
}

function applyBelly(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const midC = (minC + maxC) / 2;
  const bellyHi = minR + Math.floor((maxR - minR) * 0.4);
  const halfW = Math.max(2, Math.floor((maxC - minC) * rng.float(0.22, 0.38)));
  const tint = lighten(palette.base, rng.float(0.1, 0.22));
  for (const c of body) {
    if (c.row > bellyHi) continue;
    if (Math.abs(c.col - midC) > halfW) continue;
    const nx = (c.col - midC) / halfW;
    const ny = (bellyHi - c.row) / Math.max(1, bellyHi - minR);
    if (nx * nx + ny * ny * 0.7 < 1) c.color = lighten(c.color, 0.12);
    if (nx * nx + ny * ny * 0.7 < 0.55) c.color = tint;
  }
}

function applySpots(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  // Keep spots off the upper face third so they don't muddy the face cluster
  const faceCut = minR + Math.floor((maxR - minR) * 0.55);
  const candidates = body.filter((c) => c.row <= faceCut);
  const pool = candidates.length >= 8 ? candidates : body;
  const count = rng.int(2, 5);
  for (let i = 0; i < count; i++) {
    const center = pool[rng.int(0, pool.length - 1)]!;
    const radius = rng.int(1, 2);
    const tint = rng.chance(0.5)
      ? darken(palette.base, 0.14)
      : rng.chance(0.55)
        ? darken(palette.accent, 0.08)
        : lighten(palette.base, 0.1);
    for (const c of body) {
      const d = Math.hypot(c.col - center.col, c.row - center.row);
      if (d <= radius) c.color = tint;
    }
  }
}

function applyStripes(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const period = rng.int(3, 6);
  // Soft tone shift of base — not a foreign hue across half the body
  const alt = rng.chance(0.5) ? darken(palette.base, 0.12) : lighten(palette.base, 0.1);
  for (const c of body) {
    if (Math.floor(c.row / period) % 2 === 0) c.color = alt;
  }
}

function applyGradient(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const span = Math.max(1, maxR - minR);
  const top = lighten(palette.base, rng.float(0.06, 0.14));
  const bot = darken(palette.base, rng.float(0.1, 0.2));
  for (const c of body) {
    const t = (c.row - minR) / span;
    // Soft 4-band blend — no hard mid cut
    if (t < 0.28) c.color = top;
    else if (t < 0.45) c.color = (c.col + c.row) % 2 === 0 ? top : c.color;
    else if (t < 0.62) c.color = (c.col + c.row) % 2 === 0 ? bot : c.color;
    else c.color = bot;
  }
}

function applyDualGradient(grid: MonsterGrid, _rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  // Near-base tones only — avoid accent vs accent2 half-split
  const a = lighten(palette.base, 0.1);
  const b = darken(palette.base, 0.14);
  for (const c of body) {
    const tx = (c.col - minC) / Math.max(1, maxC - minC);
    const ty = (c.row - minR) / Math.max(1, maxR - minR);
    const t = (tx + ty) * 0.5;
    const dither = (c.col * 3 + c.row * 5) % 4;
    if (t + dither * 0.05 < 0.42) c.color = a;
    else if (t + dither * 0.05 < 0.58) c.color = (c.col + c.row) % 2 === 0 ? a : b;
    else c.color = b;
  }
}

function applyRosettes(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const count = rng.int(3, 7);
  const ring = darken(palette.accent, 0.15);
  const fill = palette.accent2;
  for (let i = 0; i < count; i++) {
    const center = body[rng.int(0, body.length - 1)]!;
    const r = rng.int(2, 4);
    for (const c of body) {
      const d = Math.hypot(c.col - center.col, c.row - center.row);
      if (d <= r * 0.45) c.color = fill;
      else if (d <= r) c.color = ring;
    }
  }
}

function applyScales(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const period = rng.int(3, 5);
  const edge = darken(palette.base, 0.2);
  for (const c of body) {
    const shift = Math.floor(c.row / period) % 2 === 0 ? 0 : Math.floor(period / 2);
    const lx = (c.col + shift) % period;
    const ly = c.row % period;
    if (lx === 0 || ly === 0) c.color = edge;
    if (lx === 1 && ly === 1) c.color = lighten(c.color, 0.08);
  }
}

function applyCurvedStripes(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const w = Math.max(1, maxC - minC);
  const period = rng.int(4, 7);
  const alt = palette.accent;
  for (const c of body) {
    const nx = (c.col - minC) / w;
    const bent = c.row + Math.round(Math.sin(nx * Math.PI) * 3);
    if (Math.floor(bent / period) % 2 === 0) c.color = alt;
  }
}

function applyMask(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const midC = (minC + maxC) / 2;
  const faceLo = minR + Math.floor((maxR - minR) * 0.35);
  const faceHi = minR + Math.floor((maxR - minR) * 0.92);
  const halfW = Math.max(3, Math.floor((maxC - minC) * rng.float(0.28, 0.42)));
  const tint = lighten(palette.base, 0.16);
  for (const c of body) {
    if (c.row < faceLo || c.row > faceHi) continue;
    if (Math.abs(c.col - midC) > halfW) continue;
    c.color = tint;
  }
}

function applyBioGlow(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const count = rng.int(5, 12);
  for (let i = 0; i < count; i++) {
    const c = body[rng.int(0, body.length - 1)]!;
    c.color = rng.chance(0.5) ? palette.accent : palette.accent2;
    c.glow = true;
  }
}

/**
 * Cel-shaded coat + rich patterns. Outline last so rim stays crisp.
 */
export function applyPatterns(rng: Rng, grid: MonsterGrid, palette: MonsterPalette): void {
  applyCelShading(grid, palette);

  const kind = rng.pick<PatternKind>([
    'plain',
    'plain',
    'plain',
    'plain',
    'belly',
    'belly',
    'belly',
    'spots',
    'spots',
    'stripes',
    'gradient',
    'rosettes',
    'stripes-curved',
    'dual-gradient',
    'mask',
    'scales',
    'bio-glow',
  ]);

  switch (kind) {
    case 'belly':
      applyBelly(grid, rng, palette);
      break;
    case 'spots':
      applySpots(grid, rng, palette);
      break;
    case 'stripes':
      applyStripes(grid, rng, palette);
      break;
    case 'gradient':
      applyGradient(grid, rng, palette);
      break;
    case 'dual-gradient':
      applyDualGradient(grid, rng, palette);
      break;
    case 'rosettes':
      applyRosettes(grid, rng, palette);
      break;
    case 'scales':
      applyScales(grid, rng, palette);
      break;
    case 'stripes-curved':
      applyCurvedStripes(grid, rng, palette);
      break;
    case 'mask':
      applyMask(grid, rng, palette);
      break;
    case 'bio-glow':
      applyBioGlow(grid, rng, palette);
      break;
    default:
      break;
  }

  // Occasional soft accent dots — rare, never stacked on noisy coats
  if (kind === 'plain' || kind === 'belly') {
    if (rng.chance(0.22)) applySpots(grid, rng, palette);
  }

  // Crisp outline on body silhouette only — limbs stay body-tinted so they read attached
  for (const c of grid.cells.values()) {
    if (c.part !== 'body') continue;
    let neighbors = 0;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nb = grid.cells.get(cellKey(c.col + dc, c.row + dr));
      if (nb && (nb.part === 'body' || nb.part === 'appendage')) neighbors++;
    }
    if (neighbors < 4) c.color = palette.outline;
  }
}
