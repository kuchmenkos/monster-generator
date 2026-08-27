import { darken } from './palette';
import { dominantKind, fieldNormal, sampleField } from './field';
import type { Rng } from './rng';
import type { Blob, GridCell, MonsterGrid, MonsterPalette } from './types';
import { cellKey } from './types';

export interface RasterOptions {
  /** Approx columns across the body (baseline ~28 for scaleRef). */
  resolution?: number;
  threshold?: number;
}

const BASELINE_RESOLUTION = 28;

/** Flat base fill — coat patterns + lighting live in patterns.ts */
function shadeColor(palette: MonsterPalette): number {
  return palette.base;
}

/**
 * After fill: paint a dark 1-cell outline on silhouette rim for crisp edges.
 */
function applySilhouetteOutline(grid: MonsterGrid, palette: MonsterPalette): void {
  const rim: GridCell[] = [];
  for (const c of grid.cells.values()) {
    if (c.part !== 'body' && c.part !== 'appendage') continue;
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
    if (neighbors < 4) {
      rim.push(c);
    }
  }
  for (const c of rim) {
    c.color = palette.outline;
  }
}

/**
 * Find the front-most z where the field is solid (ray from front → back).
 */
function frontSurfaceZ(
  blobs: Blob[],
  x: number,
  y: number,
  minZ: number,
  maxZ: number,
  threshold: number,
  step: number,
): number | null {
  // March from front (high z) to back
  for (let z = maxZ; z >= minZ; z -= step) {
    if (sampleField(blobs, x, y, z) >= threshold) {
      return z;
    }
  }
  return null;
}

/**
 * Rasterize the metaball field into a solid 2D grid of cells (1 cell = 1 particle).
 * No holes, strict bilateral symmetry, morphological close for gaps.
 */
export function rasterizeField(
  rng: Rng,
  blobs: Blob[],
  palette: MonsterPalette,
  options: RasterOptions = {},
): MonsterGrid {
  const threshold = options.threshold ?? rng.float(1.05, 1.35);
  const resolution = options.resolution ?? rng.int(64, 80);

  // Bounding box from blobs
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of blobs) {
    minX = Math.min(minX, b.x - b.rx * 1.25);
    maxX = Math.max(maxX, b.x + b.rx * 1.25);
    minY = Math.min(minY, b.y - b.ry * 1.25);
    maxY = Math.max(maxY, b.y + b.ry * 1.25);
    minZ = Math.min(minZ, b.z - b.rz * 1.25);
    maxZ = Math.max(maxZ, b.z + b.rz * 1.25);
  }

  const spanX = Math.max(0.5, maxX - minX);
  const spanY = Math.max(0.5, maxY - minY);
  const cell = Math.max(spanX, spanY) / resolution;
  const cols = Math.ceil(spanX / cell) + 2;
  const rows = Math.ceil(spanY / cell) + 2;
  const originX = minX - cell;
  const originY = minY - cell;
  const zStep = Math.max(0.04, (maxZ - minZ) / 18);

  const cells = new Map<string, GridCell>();
  const midCol = Math.floor(cols / 2);

  // Sample left half + center column, then mirror
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= midCol; col++) {
      const x = originX + col * cell;
      const y = originY + row * cell;

      const z = frontSurfaceZ(blobs, x, y, minZ, maxZ, threshold, zStep);
      if (z === null) continue;

      const { nx, ny, nz } = fieldNormal(blobs, x, y, z);
      const kind = dominantKind(blobs, x, y, z);
      const color = shadeColor(palette);

      const cellData: GridCell = {
        col,
        row,
        x,
        y,
        z,
        nx,
        ny,
        nz,
        color,
        part: kind === 'appendage' ? 'appendage' : 'body',
        phase: rng.float(0, Math.PI * 2),
        size: 1,
        tipFactor: 0,
      };
      cells.set(cellKey(col, row), cellData);
    }
  }

  // Strict bilateral mirror (right half)
  const mirrored: GridCell[] = [];
  for (const c of cells.values()) {
    if (c.col === midCol) continue;
    const mirrorCol = midCol * 2 - c.col;
    if (mirrorCol < 0 || mirrorCol >= cols) continue;
    if (cells.has(cellKey(mirrorCol, c.row))) continue;
    const mx = originX + mirrorCol * cell;
    mirrored.push({
      ...c,
      col: mirrorCol,
      x: mx,
      nx: -c.nx,
      phase: c.phase,
    });
  }
  for (const m of mirrored) {
    cells.set(cellKey(m.col, m.row), m);
  }

  // Morphological close: fill holes with 3+ orthogonal neighbors
  const toFill: GridCell[] = [];
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const key = cellKey(col, row);
      if (cells.has(key)) continue;
      let n = 0;
      let sample: GridCell | null = null;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nb = cells.get(cellKey(col + dc, row + dr));
        if (nb) {
          n++;
          sample = nb;
        }
      }
      if (n >= 3 && sample) {
        const x = originX + col * cell;
        const y = originY + row * cell;
        toFill.push({
          ...sample,
          col,
          row,
          x,
          y,
          z: sample.z - 0.01,
          phase: rng.float(0, Math.PI * 2),
          part: 'body',
          tipFactor: 0,
          color: darken(sample.color, 0.05),
        });
      }
    }
  }
  for (const f of toFill) {
    cells.set(cellKey(f.col, f.row), f);
  }

  // Second close pass for stubborn 1-cell holes
  const toFill2: GridCell[] = [];
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      if (cells.has(cellKey(col, row))) continue;
      let n = 0;
      let sample: GridCell | null = null;
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
        const nb = cells.get(cellKey(col + dc, row + dr));
        if (nb && nb.part !== 'aura') {
          n++;
          sample = nb;
        }
      }
      if (n >= 5 && sample) {
        toFill2.push({
          ...sample,
          col,
          row,
          x: originX + col * cell,
          y: originY + row * cell,
          part: 'body',
          tipFactor: 0,
          phase: rng.float(0, Math.PI * 2),
        });
      }
    }
  }
  for (const f of toFill2) {
    cells.set(cellKey(f.col, f.row), f);
  }

  const scaleRef = resolution / BASELINE_RESOLUTION;
  const grid: MonsterGrid = {
    cols,
    rows,
    cell,
    originX,
    originY,
    scaleRef,
    shear: 0,
    shearOriginRow: 0,
    cells,
  };
  applyAsymmetry(rng, grid, palette);
  applyOrganicRim(rng, grid, palette);
  roundSharpCorners(grid);
  pinchWaist(grid);
  applySilhouetteOutline(grid, palette);
  applyFlecksAndDrips(rng, grid, palette);

  return grid;
}

function isSolidPart(part: string): boolean {
  return part === 'body' || part === 'appendage';
}

/** Tag silhouette rim cells for coherent-interior animation. */
export function markRimFlags(grid: MonsterGrid): void {
  for (const c of grid.cells.values()) {
    if (c.part === 'fleck' || c.part === 'aura') {
      c.isRim = true;
      continue;
    }
    if (!isSolidPart(c.part)) {
      c.isRim = false;
      continue;
    }
    let n = 0;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nb = grid.cells.get(cellKey(c.col + dc, c.row + dr));
      if (nb && isSolidPart(nb.part)) n++;
    }
    c.isRim = n < 4;
  }
}

/**
 * Break boxy edges: wave-erode rim + scatter lumps so silhouette isn't rectangular.
 */
function applyOrganicRim(rng: Rng, grid: MonsterGrid, palette: MonsterPalette): void {
  const solid = [...grid.cells.values()].filter((c) => isSolidPart(c.part));
  if (solid.length < 30) return;

  const minC = Math.min(...solid.map((c) => c.col));
  const maxC = Math.max(...solid.map((c) => c.col));
  const minR = Math.min(...solid.map((c) => c.row));
  const maxR = Math.max(...solid.map((c) => c.row));
  const cx = (minC + maxC) / 2;
  const cy = (minR + maxR) / 2;
  const phase = rng.float(0, Math.PI * 2);
  const freq = rng.float(2.5, 5.5);

  const rim = rimCells(grid);
  const erodeFrac = rng.float(0.08, 0.15);
  const erodeN = Math.floor(rim.length * erodeFrac);
  const scored = rim
    .map((c) => {
      const ang = Math.atan2(c.row - cy, c.col - cx);
      const wave = Math.sin(ang * freq + phase);
      return { c, wave };
    })
    .sort((a, b) => b.wave - a.wave);

  for (let i = 0; i < erodeN && i < scored.length; i++) {
    // Prefer high wave peaks for erosion — scalloped edge
    if (scored[i]!.wave < 0.15 && rng.chance(0.5)) continue;
    grid.cells.delete(cellKey(scored[i]!.c.col, scored[i]!.c.row));
  }

  // Add 2–5 organic bumps on rim
  const bumpN = rng.int(2, 5);
  const freshRim = rimCells(grid);
  for (let b = 0; b < bumpN && freshRim.length > 0; b++) {
    const anchor = freshRim[rng.int(0, freshRim.length - 1)]!;
    const size = rng.int(2, 5);
    const outC = Math.sign(anchor.col - cx) || (rng.chance(0.5) ? 1 : -1);
    const outR = Math.sign(anchor.row - cy) || 1;
    for (let k = 0; k < size; k++) {
      const col = anchor.col + outC * rng.int(0, 2) + rng.int(-1, 1);
      const row = anchor.row + outR * rng.int(0, 2) + rng.int(-1, 1);
      const key = cellKey(col, row);
      if (grid.cells.has(key)) continue;
      grid.cells.set(key, {
        col,
        row,
        x: grid.originX + col * grid.cell,
        y: grid.originY + row * grid.cell,
        z: anchor.z - 0.01,
        nx: outC * 0.3,
        ny: outR * 0.2,
        nz: 0.9,
        color: palette.base,
        part: 'body',
        phase: rng.float(0, Math.PI * 2),
        size: 1,
        tipFactor: 0,
      });
    }
  }
}

function rimCells(grid: MonsterGrid): GridCell[] {
  const rim: GridCell[] = [];
  for (const c of grid.cells.values()) {
    if (!isSolidPart(c.part)) continue;
    let n = 0;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nb = grid.cells.get(cellKey(c.col + dc, c.row + dr));
      if (nb && isSolidPart(nb.part)) n++;
    }
    if (n < 4) rim.push(c);
  }
  return rim;
}

/**
 * Break perfect bilateral symmetry: erode one side, add lumps, shear lean.
 */
function applyAsymmetry(rng: Rng, grid: MonsterGrid, palette: MonsterPalette): void {
  const solid = [...grid.cells.values()].filter((c) => isSolidPart(c.part));
  if (solid.length < 30) return;

  const minC = Math.min(...solid.map((c) => c.col));
  const maxC = Math.max(...solid.map((c) => c.col));
  const minR = Math.min(...solid.map((c) => c.row));
  const maxR = Math.max(...solid.map((c) => c.row));
  const midC = (minC + maxC) / 2;

  if (rng.chance(0.6)) {
    const erodeSide = rng.chance(0.5) ? -1 : 1;
    const rim = rimCells(grid).filter((c) => (c.col - midC) * erodeSide > 0);
    const erodeCount = Math.floor(rim.length * rng.float(0.05, 0.12));
    const shuffled = rng.shuffle([...rim]);
    for (let i = 0; i < erodeCount && i < shuffled.length; i++) {
      grid.cells.delete(cellKey(shuffled[i]!.col, shuffled[i]!.row));
    }

    const lumpCount = rng.int(1, 3);
    for (let L = 0; L < lumpCount; L++) {
      const side = rng.chance(0.5) ? -1 : 1;
      const anchors = rimCells(grid).filter((c) => (c.col - midC) * side >= 0);
      if (anchors.length === 0) continue;
      const anchor = anchors[rng.int(0, anchors.length - 1)]!;
      const lumpSize = rng.int(3, 8);
      for (let k = 0; k < lumpSize; k++) {
        const dc = side * rng.int(1, 3) + rng.int(-1, 1);
        const dr = rng.int(-2, 2);
        const col = anchor.col + dc;
        const row = anchor.row + dr;
        const key = cellKey(col, row);
        if (grid.cells.has(key)) continue;
        grid.cells.set(key, {
          col,
          row,
          x: grid.originX + col * grid.cell,
          y: grid.originY + row * grid.cell,
          z: anchor.z - 0.01,
          nx: side * 0.3,
          ny: 0,
          nz: 0.9,
          color: palette.base,
          part: 'body',
          phase: rng.float(0, Math.PI * 2),
          size: 1,
          tipFactor: 0,
        });
      }
    }
  }

  const spanR = Math.max(1, maxR - minR);
  const lean = rng.float(-0.08, 0.08);
  grid.shear = (lean * (maxC - minC) * grid.cell) / spanR;
  grid.shearOriginRow = minR;
}

/**
 * If the silhouette is almost constant-width, carve a waist so it isn't a rectangle.
 */
function pinchWaist(grid: MonsterGrid): void {
  const solid = [...grid.cells.values()].filter((c) => c.part === 'body');
  if (solid.length < 40) return;
  const minR = Math.min(...solid.map((c) => c.row));
  const maxR = Math.max(...solid.map((c) => c.row));
  const h = maxR - minR;
  if (h < 8) return;

  const rows: { r: number; minC: number; maxC: number; w: number }[] = [];
  for (let r = minR; r <= maxR; r++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of solid) {
      if (c.row !== r) continue;
      lo = Math.min(lo, c.col);
      hi = Math.max(hi, c.col);
    }
    if (!Number.isFinite(lo)) continue;
    rows.push({ r, minC: lo, maxC: hi, w: hi - lo + 1 });
  }
  if (rows.length < 6) return;

  const mean = rows.reduce((a, x) => a + x.w, 0) / rows.length;
  const variance = rows.reduce((a, x) => a + (x.w - mean) * (x.w - mean), 0) / rows.length;
  const cv = Math.sqrt(variance) / Math.max(1, mean);
  if (cv > 0.14) return;

  const loR = minR + Math.floor(h * 0.32);
  const hiR = minR + Math.floor(h * 0.68);
  for (const row of rows) {
    if (row.r < loR || row.r > hiR) continue;
    const t = (row.r - loR) / Math.max(1, hiR - loR);
    const pinch = 1 + Math.round(Math.sin(t * Math.PI) * 2);
    for (let k = 0; k < pinch; k++) {
      grid.cells.delete(cellKey(row.minC + k, row.r));
      grid.cells.delete(cellKey(row.maxC - k, row.r));
    }
  }
}

/**
 * Chamfer 90° L-corners so silhouettes aren't boxes with sharp angles.
 */
function roundSharpCorners(grid: MonsterGrid): void {
  for (let pass = 0; pass < 3; pass++) {
    const toDrop: string[] = [];
    for (const c of grid.cells.values()) {
      if (!isSolidPart(c.part)) continue;
      const n = (dc: number, dr: number) => {
        const nb = grid.cells.get(cellKey(c.col + dc, c.row + dr));
        return !!(nb && isSolidPart(nb.part));
      };
      const ortho = [n(1, 0), n(-1, 0), n(0, 1), n(0, -1)].filter(Boolean).length;
      if (ortho !== 2) continue;
      const perp = (n(1, 0) || n(-1, 0)) && (n(0, 1) || n(0, -1));
      if (perp) toDrop.push(cellKey(c.col, c.row));
    }
    for (const k of toDrop) grid.cells.delete(k);
  }
}

/** Connected hair tufts growing from silhouette + optional drips. */
function applyFlecksAndDrips(rng: Rng, grid: MonsterGrid, palette: MonsterPalette): void {
  const rim = rimCells(grid);
  if (rim.length === 0) return;

  const solid = [...grid.cells.values()].filter((c) => isSolidPart(c.part));
  const maxR = Math.max(...solid.map((c) => c.row));
  const minR = Math.min(...solid.map((c) => c.row));
  const midR = (minR + maxR) / 2;

  // Prefer top / side rim for hair tufts
  const topRim = rim.filter((c) => c.row >= midR);
  const anchors = topRim.length >= 2 ? topRim : rim;
  const tuftCount = rng.int(1, Math.max(2, Math.round(3 * grid.scaleRef * 0.45)));

  for (let t = 0; t < tuftCount; t++) {
    const start = anchors[rng.int(0, anchors.length - 1)]!;
    const len = rng.int(
      Math.max(3, Math.round(3 * grid.scaleRef * 0.7)),
      Math.max(5, Math.round(8 * grid.scaleRef * 0.7)),
    );
    let col = start.col;
    let row = start.row;
    // Grow mostly upward / outward
    const outDir = start.col < 0 || rng.chance(0.5) ? -1 : 1;

    for (let i = 1; i <= len; i++) {
      // Prefer up, slight outward, rare sideways — always adjacent
      const step = rng.pick([
        [0, 1],
        [0, 1],
        [outDir, 1],
        [outDir, 0],
        [-outDir, 1],
      ] as const);
      col += step[0];
      row += step[1];
      const key = cellKey(col, row);
      if (grid.cells.has(key)) {
        // Nudge outward if occupied
        col += outDir;
        if (grid.cells.has(cellKey(col, row))) break;
      }
      const tip = i / len;
      grid.cells.set(key, {
        col,
        row,
        x: grid.originX + col * grid.cell,
        y: grid.originY + row * grid.cell,
        z: start.z + 0.02 + tip * 0.04,
        nx: outDir * 0.2,
        ny: 0.3,
        nz: 0.9,
        color: tip > 0.7 ? palette.highlight : palette.base,
        part: 'fleck',
        phase: rng.float(0, Math.PI * 2),
        size: Math.max(0.45, 1 - tip * 0.5),
        tipFactor: tip,
      });
    }
  }

  // Drips hanging from bottom (~30%), tapering size
  if (rng.chance(0.3)) {
    const bottom = rim.filter((c) => {
      const below = grid.cells.get(cellKey(c.col, c.row - 1));
      return !below || !isSolidPart(below.part);
    });
    const dripN = rng.int(2, 4);
    for (let i = 0; i < dripN && bottom.length > 0; i++) {
      const src = bottom[rng.int(0, bottom.length - 1)]!;
      const len = rng.int(2, 4);
      for (let d = 1; d <= len; d++) {
        const key = cellKey(src.col, src.row - d);
        if (grid.cells.has(key)) break;
        const tip = d / len;
        grid.cells.set(key, {
          col: src.col,
          row: src.row - d,
          x: grid.originX + src.col * grid.cell,
          y: grid.originY + (src.row - d) * grid.cell,
          z: src.z,
          nx: 0,
          ny: -0.2,
          nz: 0.9,
          color: palette.shadow,
          part: 'body',
          phase: rng.float(0, Math.PI * 2),
          size: Math.max(0.5, 1 - tip * 0.4),
          tipFactor: tip,
        });
      }
    }
  }
}

/** Oval ground blob under the lowest solid cells — grounds the silhouette. */
export function applyGroundShadow(grid: MonsterGrid): void {
  const solid = [...grid.cells.values()].filter((c) => isSolidPart(c.part));
  if (solid.length === 0) return;
  const minR = Math.min(...solid.map((c) => c.row));
  const minC = Math.min(...solid.map((c) => c.col));
  const maxC = Math.max(...solid.map((c) => c.col));
  const midC = Math.round((minC + maxC) / 2);
  const halfW = Math.max(3, Math.floor((maxC - minC) * 0.38));
  const sample = solid.find((c) => c.row === minR) ?? solid[0]!;
  for (let dx = -halfW; dx <= halfW; dx++) {
    const t = dx / Math.max(1, halfW);
    const h = Math.max(2, Math.round((1 - t * t) * 2.4));
    for (let dy = 1; dy <= h; dy++) {
      const col = midC + dx;
      const row = minR - dy;
      const key = cellKey(col, row);
      if (grid.cells.has(key)) continue;
      grid.cells.set(key, {
        col,
        row,
        x: grid.originX + col * grid.cell,
        y: grid.originY + row * grid.cell,
        z: sample.z - 0.25,
        nx: 0,
        ny: -1,
        nz: 0.2,
        color: 0x2a2240,
        part: 'aura',
        phase: 0,
        size: 1.15,
        tipFactor: 0,
      });
    }
  }
}

/** Flatten grid to particle list, sorted back-to-front. */
export function gridToParticles(grid: MonsterGrid) {
  markRimFlags(grid);
  const particles = [...grid.cells.values()].map((c) => ({
    x: c.x + grid.shear * (c.row - grid.shearOriginRow),
    y: c.y,
    z: c.z,
    nx: c.nx,
    ny: c.ny,
    nz: c.nz,
    color: c.color,
    part: c.part,
    phase: c.phase,
    size: c.size,
    col: c.col,
    row: c.row,
    tipFactor: c.tipFactor,
    mouthRole: c.mouthRole,
    isRim: c.isRim,
    pupilRange: c.pupilRange,
    glow: c.glow,
    faceSide: c.faceSide,
    hairStrand: c.hairStrand,
    lidRole: c.lidRole,
  }));
  particles.sort((a, b) => a.z - b.z);
  return particles;
}
