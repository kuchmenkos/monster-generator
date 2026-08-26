import { darken, lighten } from './palette';
import { countSolidNeighbors } from './grid';
import type { Rng } from './rng';
import type { GridCell, MonsterGrid, MonsterPalette } from './types';

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
    const dither = (c.col + c.row) % 2 === 0 ? 0.05 : -0.05;
    const t = d * 0.45 + pos * 0.55 + dither;
    let color = palette.base;
    if (t > 0.28) color = palette.highlight;
    else if (t > 0.02) color = lighten(palette.base, 0.06);
    else if (t > -0.22) color = darken(palette.base, 0.16);
    else color = palette.shadow;
    if (c.ny < -0.25 || (c.row - minR) / (halfH * 2) < 0.22) {
      color = darken(color, 0.14); // AO underbelly
    }
    c.color = color;
  }

  for (const c of solid) {
    const n = countSolidNeighbors(grid, c.col, c.row, c.facing);
    if (n < 4 && c.nx > 0.15) c.color = lighten(c.color, 0.14);
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
  const count = rng.int(4, 10);
  for (let i = 0; i < count; i++) {
    const center = body[rng.int(0, body.length - 1)]!;
    const radius = rng.int(1, 3);
    const tint = rng.chance(0.45) ? palette.accent : rng.chance(0.5) ? palette.accent2 : darken(center.color, 0.22);
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
  const alt = rng.chance(0.5) ? palette.accent : darken(palette.base, 0.16);
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
  const top = rng.chance(0.5) ? palette.highlight : palette.accent;
  const bot = rng.chance(0.5) ? palette.shadow : palette.accent2;
  for (const c of body) {
    const t = (c.row - minR) / span;
    const dither = (c.col + c.row) % 3 === 0 ? 0.08 : 0;
    const u = Math.min(1, Math.max(0, t + dither));
    c.color = u < 0.45 ? top : u < 0.55 ? c.color : bot;
    if (u >= 0.45 && u < 0.55 && (c.col + c.row) % 2 === 0) c.color = top;
  }
}

function applyDualGradient(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = bodyCells(grid);
  if (body.length === 0) return;
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const a = rng.chance(0.5) ? palette.accent : palette.highlight;
  const b = rng.chance(0.5) ? palette.accent2 : palette.shadow;
  for (const c of body) {
    const tx = (c.col - minC) / Math.max(1, maxC - minC);
    const ty = (c.row - minR) / Math.max(1, maxR - minR);
    const t = (tx + ty) * 0.5;
    const dither = (c.col * 3 + c.row * 5) % 4;
    if (t + dither * 0.04 < 0.5) c.color = a;
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
    'belly',
    'belly',
    'spots',
    'spots',
    'stripes',
    'gradient',
    'rosettes',
    'scales',
    'stripes-curved',
    'mask',
    'bio-glow',
    'dual-gradient',
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

  // Rare extra accent scatter
  if (rng.chance(0.35)) {
    applySpots(grid, rng, palette);
  }
  if (rng.chance(0.12)) {
    applyBioGlow(grid, rng, palette);
  }

  // Crisp outline on body silhouette only — limbs stay body-tinted so they read attached
  for (const c of grid.cells.values()) {
    if (c.part !== 'body') continue;
    const neighbors = countSolidNeighbors(grid, c.col, c.row, c.facing);
    if (neighbors < 4) c.color = palette.outline;
  }
}
