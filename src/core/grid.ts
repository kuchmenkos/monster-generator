import type { GridCell, MonsterGrid, SurfaceFacing } from './types';
import { cellKey, surfaceCellKey } from './types';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const FACINGS: SurfaceFacing[] = ['front', 'back', 'side'];

/** Storage key for a grid cell (surface or legacy). */
export function storageKey(cell: GridCell): string {
  return cell.facing
    ? surfaceCellKey(cell.col, cell.row, cell.facing)
    : cellKey(cell.col, cell.row);
}

/** Remove cell at col/row (optionally scoped to facing). */
export function deleteCell(
  grid: MonsterGrid,
  col: number,
  row: number,
  facing?: SurfaceFacing,
): void {
  if (facing) {
    grid.cells.delete(surfaceCellKey(col, row, facing));
    return;
  }
  grid.cells.delete(cellKey(col, row));
  for (const f of FACINGS) {
    grid.cells.delete(surfaceCellKey(col, row, f));
  }
}

/** Lookup cell — surface key first, then legacy flat key. */
export function getCell(
  grid: MonsterGrid,
  col: number,
  row: number,
  facing?: SurfaceFacing,
): GridCell | undefined {
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

/** Store cell under the correct surface or legacy key. */
export function setCell(grid: MonsterGrid, cell: GridCell): void {
  const key = cell.facing
    ? surfaceCellKey(cell.col, cell.row, cell.facing)
    : cellKey(cell.col, cell.row);
  grid.cells.set(key, cell);
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
  return [...grid.cells.values()].filter(
    (c) => c.part === 'body' && (c.facing === 'front' || c.facing === undefined),
  );
}
