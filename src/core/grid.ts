import type { FeatureMasks, GridCell, MonsterGrid, SurfaceFacing } from './types';
import { cellKey, surfaceCellKey, voxelKey } from './types';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const FACINGS: SurfaceFacing[] = ['front', 'back', 'side'];

function maskKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Storage key for a grid cell (voxel, surface, or legacy). */
export function storageKey(cell: GridCell): string {
  if (cell.voxelIx !== undefined && cell.voxelIy !== undefined && cell.voxelIz !== undefined) {
    return voxelKey(cell.voxelIx, cell.voxelIy, cell.voxelIz);
  }
  return cell.facing
    ? surfaceCellKey(cell.col, cell.row, cell.facing)
    : cellKey(cell.col, cell.row);
}

/** Parse voxel indices from a voxel storage key, or null. */
export function parseVoxelKey(key: string): { ix: number; iy: number; iz: number } | null {
  if (!key.startsWith('v:')) return null;
  const parts = key.slice(2).split(',');
  if (parts.length !== 3) return null;
  return { ix: Number(parts[0]), iy: Number(parts[1]), iz: Number(parts[2]) };
}

/**
 * Build front/back projection masks from a 3D voxel shell.
 * Front: per (col,row) keep max-z cell where nz > 0.2.
 * Back: per (col,row) keep min-z cell where nz < -0.2.
 */
export function buildFeatureMasks(grid: MonsterGrid): FeatureMasks {
  const front = new Map<string, string>();
  const back = new Map<string, string>();

  for (const [key, cell] of grid.cells.entries()) {
    if (cell.part !== 'body' && cell.part !== 'appendage') continue;
    const cr = maskKey(cell.col, cell.row);

    if (cell.nz > 0.2 || cell.facing === 'front') {
      const prevKey = front.get(cr);
      if (!prevKey) {
        front.set(cr, key);
      } else {
        const prev = grid.cells.get(prevKey)!;
        if (cell.z > prev.z) front.set(cr, key);
      }
    }

    if (cell.nz < -0.2 || cell.facing === 'back') {
      const prevKey = back.get(cr);
      if (!prevKey) {
        back.set(cr, key);
      } else {
        const prev = grid.cells.get(prevKey)!;
        if (cell.z < prev.z) back.set(cr, key);
      }
    }
  }

  grid.featureMasks = { front, back };
  return grid.featureMasks;
}

/** Remove cell at col/row (optionally scoped to facing). */
export function deleteCell(
  grid: MonsterGrid,
  col: number,
  row: number,
  facing?: SurfaceFacing,
): void {
  if (facing && grid.featureMasks) {
    const mk = maskKey(col, row);
    const maskMap = facing === 'back' ? grid.featureMasks.back : grid.featureMasks.front;
    const vk = maskMap.get(mk);
    if (vk) {
      grid.cells.delete(vk);
      maskMap.delete(mk);
      return;
    }
  }
  if (facing) {
    grid.cells.delete(surfaceCellKey(col, row, facing));
    return;
  }
  grid.cells.delete(cellKey(col, row));
  for (const f of FACINGS) {
    grid.cells.delete(surfaceCellKey(col, row, f));
  }
}

/** Lookup cell — feature mask first, then surface/legacy key. */
export function getCell(
  grid: MonsterGrid,
  col: number,
  row: number,
  facing?: SurfaceFacing,
): GridCell | undefined {
  const cr = maskKey(col, row);
  if (facing === 'front' && grid.featureMasks?.front) {
    const vk = grid.featureMasks.front.get(cr);
    if (vk) return grid.cells.get(vk);
  }
  if (facing === 'back' && grid.featureMasks?.back) {
    const vk = grid.featureMasks.back.get(cr);
    if (vk) return grid.cells.get(vk);
  }
  if (facing) {
    const sk = surfaceCellKey(col, row, facing);
    const hit = grid.cells.get(sk);
    if (hit) return hit;
  }
  const legacy = grid.cells.get(cellKey(col, row));
  if (legacy) return legacy;
  if (!facing) {
    for (const f of FACINGS) {
      const hit = grid.cells.get(surfaceCellKey(col, row, f));
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Store cell under voxel, surface, or legacy key. */
export function setCell(grid: MonsterGrid, cell: GridCell): void {
  grid.cells.set(storageKey(cell), cell);
  // Keep feature masks in sync when overwriting a masked cell
  if (!grid.featureMasks) return;
  const cr = maskKey(cell.col, cell.row);
  const key = storageKey(cell);
  if (cell.facing === 'front' || cell.nz > 0.2) {
    const prev = grid.featureMasks.front.get(cr);
    if (!prev || prev === key) grid.featureMasks.front.set(cr, key);
  }
  if (cell.facing === 'back' || cell.nz < -0.2) {
    const prev = grid.featureMasks.back.get(cr);
    if (!prev || prev === key) grid.featureMasks.back.set(cr, key);
  }
}

/** Orthogonal neighbors on the same facing layer (fallback: any facing at col/row). */
export function neighborCells(
  grid: MonsterGrid,
  col: number,
  row: number,
  facing?: SurfaceFacing,
): GridCell[] {
  const out: GridCell[] = [];
  for (const [dc, dr] of ORTHO) {
    const nb = getCell(grid, col + dc, row + dr, facing);
    if (nb) out.push(nb);
  }
  return out;
}

/** Count solid orthogonal neighbors (body/appendage/butt). */
export function countSolidNeighbors(
  grid: MonsterGrid,
  col: number,
  row: number,
  facing?: SurfaceFacing,
): number {
  let n = 0;
  for (const nb of neighborCells(grid, col, row, facing)) {
    if (
      nb.part === 'body' ||
      nb.part === 'appendage' ||
      nb.part === 'butt' ||
      nb.part === 'butt_highlight' ||
      nb.part === 'tail'
    ) {
      n++;
    }
  }
  return n;
}

/** Front-facing body cells (for face features / coat). */
export function frontBodyCells(grid: MonsterGrid): GridCell[] {
  if (grid.featureMasks) {
    const out: GridCell[] = [];
    for (const key of grid.featureMasks.front.values()) {
      const c = grid.cells.get(key);
      if (c && c.part === 'body') out.push(c);
    }
    return out;
  }
  return [...grid.cells.values()].filter(
    (c) => c.part === 'body' && (c.facing === 'front' || c.facing === undefined),
  );
}
