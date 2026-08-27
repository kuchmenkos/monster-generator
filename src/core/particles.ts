import { countSolidNeighbors, getCell, setCell, storageKey } from './grid';
import { darken } from './palette';
import { dominantKind, fieldNormal, sampleField } from './field';
import type { Rng } from './rng';
import type { Blob, GridCell, MonsterGrid, MonsterPalette, SurfaceFacing } from './types';
import { cellKey, surfaceCellKey, voxelKey } from './types';

export interface RasterOptions {
  /** Approx columns across the body (baseline ~28 for scaleRef). */
  resolution?: number;
  threshold?: number;
  /** Target shell particle count for volume rasterizer. */
  targetParticles?: number;
}

const BASELINE_RESOLUTION = 28;
const VOXEL_BUDGET_MAX = 2800;
const VOXEL_BUDGET_MIN = 700;

const NEIGHBOR6: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function facingFromNormal(nz: number): SurfaceFacing {
  if (nz > 0.2) return 'front';
  if (nz < -0.2) return 'back';
  return 'side';
}

function blobBounds(blobs: Blob[]) {
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
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function buildVoxelShell(
  rng: Rng,
  blobs: Blob[],
  palette: MonsterPalette,
  threshold: number,
  resolution: number,
): MonsterGrid {
  const { minX, maxX, minY, maxY, minZ, maxZ } = blobBounds(blobs);
  const spanX = Math.max(0.5, maxX - minX);
  const spanY = Math.max(0.5, maxY - minY);
  const spanZ = Math.max(0.5, maxZ - minZ);
  const maxSpan = Math.max(spanX, spanY, spanZ);
  const cell = maxSpan / resolution;
  const nix = Math.ceil(spanX / cell) + 2;
  const niy = Math.ceil(spanY / cell) + 2;
  const niz = Math.ceil(spanZ / cell) + 2;
  const originX = minX - cell;
  const originY = minY - cell;
  const originZ = minZ - cell;

  const inside = new Uint8Array(nix * niy * niz);
  const idx = (ix: number, iy: number, iz: number) => ix + nix * (iy + niy * iz);

  for (let iz = 0; iz < niz; iz++) {
    for (let iy = 0; iy < niy; iy++) {
      for (let ix = 0; ix < nix; ix++) {
        const x = originX + (ix + 0.5) * cell;
        const y = originY + (iy + 0.5) * cell;
        const z = originZ + (iz + 0.5) * cell;
        if (sampleField(blobs, x, y, z) >= threshold) {
          inside[idx(ix, iy, iz)] = 1;
        }
      }
    }
  }

  const cells = new Map<string, GridCell>();
  for (let iz = 0; iz < niz; iz++) {
    for (let iy = 0; iy < niy; iy++) {
      for (let ix = 0; ix < nix; ix++) {
        if (!inside[idx(ix, iy, iz)]) continue;
        let surface = false;
        for (const [dx, dy, dz] of NEIGHBOR6) {
          const nx = ix + dx;
          const ny = iy + dy;
          const nz = iz + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= nix || ny >= niy || nz >= niz) {
            surface = true;
            break;
          }
          if (!inside[idx(nx, ny, nz)]) {
            surface = true;
            break;
          }
        }
        if (!surface) continue;

        let x = originX + (ix + 0.5) * cell;
        let y = originY + (iy + 0.5) * cell;
        let z = originZ + (iz + 0.5) * cell;
        const { nx, ny, nz } = fieldNormal(blobs, x, y, z);
        const facing = facingFromNormal(nz);
        const kind = dominantKind(blobs, x, y, z);
        const col = Math.round((x - originX) / cell);
        const row = Math.round((y - originY) / cell);

        cells.set(voxelKey(ix, iy, iz), {
          col,
          row,
          x,
          y,
          z,
          nx,
          ny,
          nz,
          color: palette.base,
          part: kind === 'appendage' ? 'appendage' : 'body',
          phase: rng.float(0, Math.PI * 2),
          size: 1,
          tipFactor: 0,
          facing,
          voxelIx: ix,
          voxelIy: iy,
          voxelIz: iz,
        });
      }
    }
  }

  // One pass 3D smooth — pull toward neighbor centroid in world space
  const smoothUpdates: { key: string; x: number; y: number; z: number }[] = [];
  for (const [key, c] of cells.entries()) {
    if (!key.startsWith('v:') || c.voxelIx === undefined) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const [dx, dy, dz] of NEIGHBOR6) {
      const nb = cells.get(voxelKey(c.voxelIx + dx, c.voxelIy! + dy, c.voxelIz! + dz));
      if (nb) {
        sx += nb.x;
        sy += nb.y;
        sz += nb.z;
        n++;
      }
    }
    if (n === 0) continue;
    const pull = 0.32;
    smoothUpdates.push({
      key,
      x: c.x + ((sx / n - c.x) * pull),
      y: c.y + ((sy / n - c.y) * pull),
      z: c.z + ((sz / n - c.z) * pull),
    });
  }
  for (const u of smoothUpdates) {
    const c = cells.get(u.key)!;
    c.x = u.x + rng.float(-0.08, 0.08) * cell;
    c.y = u.y + rng.float(-0.08, 0.08) * cell;
    c.z = u.z + rng.float(-0.08, 0.08) * cell;
    c.col = Math.round((c.x - originX) / cell);
    c.row = Math.round((c.y - originY) / cell);
    c.facing = facingFromNormal(c.nz);
  }

  let minC = Infinity;
  let maxC = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const c of cells.values()) {
    minC = Math.min(minC, c.col);
    maxC = Math.max(maxC, c.col);
    minR = Math.min(minR, c.row);
    maxR = Math.max(maxR, c.row);
  }
  const cols = Math.max(4, maxC - minC + 3);
  const rows = Math.max(4, maxR - minR + 3);
  const scaleRef = resolution / BASELINE_RESOLUTION;

  return {
    cols,
    rows,
    cell,
    originX,
    originY,
    scaleRef,
    shear: 0,
    shearOriginRow: minR,
    cells,
  };
}

/**
 * Closed 3D voxel surface — front/back/side facets, no dual-sheet gap.
 */
export function extractSurfaceShell(
  rng: Rng,
  blobs: Blob[],
  palette: MonsterPalette,
  options: RasterOptions = {},
): MonsterGrid {
  let threshold = options.threshold ?? rng.float(1.2, 1.45);
  let resolution = options.resolution ?? rng.int(32, 36);

  let grid = buildVoxelShell(rng, blobs, palette, threshold, resolution);
  for (let attempt = 0; attempt < 10; attempt++) {
    const n = grid.cells.size;
    if (n >= VOXEL_BUDGET_MIN && n <= VOXEL_BUDGET_MAX) break;
    if (n > VOXEL_BUDGET_MAX) {
      threshold += 0.18;
      if (attempt >= 4 && resolution > 30) {
        resolution -= 2;
      }
    } else {
      threshold = Math.max(0.9, threshold - 0.1);
    }
    grid = buildVoxelShell(rng, blobs, palette, threshold, resolution);
  }

  applyOrganicRim(rng, grid, palette);
  applySilhouetteOutline(grid, palette);
  applyFlecksAndDrips(rng, grid, palette);
  return grid;
}

/** Flat base fill — coat patterns + lighting live in patterns.ts */
function shadeColor(palette: MonsterPalette): number {
  return palette.base;
}

/**
 * After fill: paint a dark 1-cell outline on silhouette rim for crisp edges.
 */
function applySilhouetteOutline(grid: MonsterGrid, palette: MonsterPalette): void {
  for (const c of grid.cells.values()) {
    if (c.part !== 'body' && c.part !== 'appendage') continue;
    if (countSolidNeighbors(grid, c.col, c.row, c.facing) < 4) {
      c.color = palette.outline;
    }
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

/** Back-most z where the field is solid (ray from back → front). */
function backSurfaceZ(
  blobs: Blob[],
  x: number,
  y: number,
  minZ: number,
  maxZ: number,
  threshold: number,
  step: number,
): number | null {
  for (let z = minZ; z <= maxZ; z += step) {
    if (sampleField(blobs, x, y, z) >= threshold) {
      return z;
    }
  }
  return null;
}

function storeSurfaceCell(
  cells: Map<string, GridCell>,
  col: number,
  row: number,
  facing: SurfaceFacing,
  x: number,
  y: number,
  z: number,
  blobs: Blob[],
  palette: MonsterPalette,
  rng: Rng,
): void {
  const key = surfaceCellKey(col, row, facing);
  if (cells.has(key)) return;
  const { nx, ny, nz } = fieldNormal(blobs, x, y, z);
  const kind = dominantKind(blobs, x, y, z);
  cells.set(key, {
    col,
    row,
    x,
    y,
    z,
    nx,
    ny,
    nz,
    color: palette.base,
    part: kind === 'appendage' ? 'appendage' : 'body',
    phase: rng.float(0, Math.PI * 2),
    size: 1,
    tipFactor: 0,
    facing,
  });
}

function mirrorSurfaceHalf(
  cells: Map<string, GridCell>,
  midCol: number,
  cols: number,
  originX: number,
  cell: number,
  facing: SurfaceFacing,
): void {
  const mirrored: GridCell[] = [];
  for (const c of cells.values()) {
    if (c.facing !== facing) continue;
    if (c.col === midCol) continue;
    const mirrorCol = midCol * 2 - c.col;
    if (mirrorCol < 0 || mirrorCol >= cols) continue;
    const mk = surfaceCellKey(mirrorCol, c.row, facing);
    if (cells.has(mk)) continue;
    mirrored.push({
      ...c,
      col: mirrorCol,
      x: originX + mirrorCol * cell,
      nx: -c.nx,
    });
  }
  for (const m of mirrored) {
    cells.set(surfaceCellKey(m.col, m.row, facing), m);
  }
}

/**
 * Dense dual-surface shell — filled grid scan + morphological close.
 * @deprecated Use extractSurfaceShell — dual sheets show gap at rotation.
 */
export function rasterizeDenseShell(
  rng: Rng,
  blobs: Blob[],
  palette: MonsterPalette,
  options: RasterOptions = {},
): MonsterGrid {
  return extractSurfaceShell(rng, blobs, palette, options);
}

/**
 * @deprecated Sparse Fibonacci shell — use rasterizeDenseShell.
 */
export function rasterizeVolumeShell(
  rng: Rng,
  blobs: Blob[],
  palette: MonsterPalette,
  options: RasterOptions = {},
): MonsterGrid {
  return extractSurfaceShell(rng, blobs, palette, options);
}

/**
 * Rasterize front AND back shells of the metaball field — bulalashka dual surface.
 * @deprecated Use rasterizeDenseShell — ring artifacts fixed in render z-buffer.
 */
export function rasterizeDualSurface(
  rng: Rng,
  blobs: Blob[],
  palette: MonsterPalette,
  options: RasterOptions = {},
): MonsterGrid {
  const threshold = options.threshold ?? rng.float(1.02, 1.32);
  const resolution = options.resolution ?? rng.int(64, 80);

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

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= midCol; col++) {
      const x = originX + col * cell;
      const y = originY + row * cell;

      const zFront = frontSurfaceZ(blobs, x, y, minZ, maxZ, threshold, zStep);
      if (zFront !== null) {
        storeSurfaceCell(cells, col, row, 'front', x, y, zFront, blobs, palette, rng);
      }

      const zBack = backSurfaceZ(blobs, x, y, minZ, maxZ, threshold, zStep);
      if (zBack !== null && (zFront === null || zBack < zFront - zStep * 0.5)) {
        storeSurfaceCell(cells, col, row, 'back', x, y, zBack, blobs, palette, rng);
      }
    }
  }

  mirrorSurfaceHalf(cells, midCol, cols, originX, cell, 'front');
  mirrorSurfaceHalf(cells, midCol, cols, originX, cell, 'back');

  // Morphological close on each facing layer separately
  const closeLayer = (facing: SurfaceFacing) => {
    const toFill: GridCell[] = [];
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const key = surfaceCellKey(col, row, facing);
        if (cells.has(key)) continue;
        let n = 0;
        let sample: GridCell | null = null;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nb = cells.get(surfaceCellKey(col + dc, row + dr, facing));
          if (nb) {
            n++;
            sample = nb;
          }
        }
        if (n >= 3 && sample) {
          toFill.push({
            ...sample,
            col,
            row,
            x: originX + col * cell,
            y: originY + row * cell,
            z: sample.z - 0.01,
            phase: rng.float(0, Math.PI * 2),
            part: 'body',
            tipFactor: 0,
            facing,
            color: darken(sample.color, 0.05),
          });
        }
      }
    }
    for (const f of toFill) {
      cells.set(surfaceCellKey(f.col, f.row, facing), f);
    }
  };
  closeLayer('front');
  closeLayer('back');

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
  return (
    part === 'body' ||
    part === 'appendage' ||
    part === 'butt' ||
    part === 'butt_highlight' ||
    part === 'tail'
  );
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
    c.isRim = countSolidNeighbors(grid, c.col, c.row, c.facing) < 4;
  }
}

/**
 * Break boxy edges: wave-erode rim + scatter lumps so silhouette isn't rectangular.
 */
function applyOrganicRim(rng: Rng, grid: MonsterGrid, palette: MonsterPalette): void {
  const solid = [...grid.cells.values()].filter((c) => isSolidPart(c.part));
  if (solid.length < 30) return;
  const dense = solid.length > 2200;

  const minC = Math.min(...solid.map((c) => c.col));
  const maxC = Math.max(...solid.map((c) => c.col));
  const minR = Math.min(...solid.map((c) => c.row));
  const maxR = Math.max(...solid.map((c) => c.row));
  const cx = (minC + maxC) / 2;
  const cy = (minR + maxR) / 2;
  const phase = rng.float(0, Math.PI * 2);
  const freq = rng.float(2.5, 5.5);

  const rim = rimCells(grid);
  const erodeFrac = dense ? rng.float(0.04, 0.08) : rng.float(0.08, 0.15);
  const erodeN = Math.floor(rim.length * erodeFrac);
  const scored = rim
    .map((c) => {
      const ang = Math.atan2(c.row - cy, c.col - cx);
      const wave = Math.sin(ang * freq + phase);
      return { c, wave };
    })
    .sort((a, b) => b.wave - a.wave);

  for (let i = 0; i < erodeN && i < scored.length; i++) {
    if (scored[i]!.wave < 0.15 && rng.chance(0.5)) continue;
    const cell = scored[i]!.c;
    grid.cells.delete(storageKey(cell));
  }

  // Add organic bumps on rim — skip when shell is already dense
  if (dense) return;
  const bumpN = rng.int(2, 5);
  const freshRim = rimCells(grid);
  for (let b = 0; b < bumpN && freshRim.length > 0; b++) {
    const anchor = freshRim[rng.int(0, freshRim.length - 1)]!;
    const facing = anchor.facing ?? 'front';
    const size = rng.int(2, 5);
    const outC = Math.sign(anchor.col - cx) || (rng.chance(0.5) ? 1 : -1);
    const outR = Math.sign(anchor.row - cy) || 1;
    for (let k = 0; k < size; k++) {
      const col = anchor.col + outC * rng.int(0, 2) + rng.int(-1, 1);
      const row = anchor.row + outR * rng.int(0, 2) + rng.int(-1, 1);
      if (getCell(grid, col, row, facing)) continue;
      setCell(grid, {
        col,
        row,
        x: grid.originX + col * grid.cell,
        y: grid.originY + row * grid.cell,
        z: anchor.z - 0.01,
        nx: outC * 0.3,
        ny: outR * 0.2,
        nz: facing === 'back' ? -0.9 : 0.9,
        color: palette.base,
        part: 'body',
        phase: rng.float(0, Math.PI * 2),
        size: 1,
        tipFactor: 0,
        facing,
      });
    }
  }
}

function rimCells(grid: MonsterGrid): GridCell[] {
  const rim: GridCell[] = [];
  for (const c of grid.cells.values()) {
    if (!isSolidPart(c.part)) continue;
    if (countSolidNeighbors(grid, c.col, c.row, c.facing) < 4) rim.push(c);
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
  const denseShell = grid.cells.size > 2000;
  const tuftCount = denseShell
    ? rng.int(1, 2)
    : rng.int(2, Math.max(3, Math.round(5 * grid.scaleRef * 0.55)));

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
    facing: c.facing,
    mouthRole: c.mouthRole,
    isRim: c.isRim,
    pupilRange: c.pupilRange,
    glow: c.glow,
  }));
  particles.sort((a, b) => a.z - b.z);
  return particles;
}
