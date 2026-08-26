import { darken, lighten } from './palette';
import { getCell } from './grid';
import type { Rng } from './rng';
import type {
  ButtArchetype,
  GridCell,
  MonsterGrid,
  MonsterPalette,
  ParticlePart,
  SurfaceFacing,
} from './types';
import { surfaceCellKey } from './types';

function backShellCells(grid: MonsterGrid): GridCell[] {
  return [...grid.cells.values()].filter(
    (c) =>
      (c.facing === 'back' || c.nz < -0.35) &&
      (c.part === 'body' || c.part === 'butt'),
  );
}

function put(
  grid: MonsterGrid,
  source: GridCell,
  color: number,
  part: ParticlePart,
  zBoost = 0.06,
  size = 1.15,
  glow = false,
): void {
  const facing = (source.facing ?? 'back') as SurfaceFacing;
  const protrude =
    part === 'butt' || part === 'butt_highlight' || part === 'tail' ? 0.06 : 0;
  grid.cells.set(surfaceCellKey(source.col, source.row, facing), {
    col: source.col,
    row: source.row,
    x: source.x,
    y: source.y,
    z: source.z + zBoost + protrude,
    nx: source.nx ?? -0.15,
    ny: source.ny ?? 0.05,
    nz: Math.min(-0.85, (source.nz ?? -0.9) - 0.05),
    color,
    part,
    phase: source.phase,
    size,
    tipFactor: 0,
    facing,
    glow,
  });
}

/** Back bulge: centroid band + cells protruding behind median Z. */
function buttRegion(grid: MonsterGrid): GridCell[] {
  const back = backShellCells(grid);
  if (back.length < 6) return back;

  const zs = back.map((c) => c.z).sort((a, b) => a - b);
  const medianZ = zs[Math.floor(zs.length / 2)] ?? 0;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const c of back) {
    sx += c.x;
    sy += c.y;
    sz += c.z;
  }
  const bulgeCx = sx / back.length;
  const bulgeCy = sy / back.length;
  const bulgeCz = sz / back.length;
  const bandR = grid.cell * Math.max(2.5, grid.scaleRef * 1.4);

  return back.filter((c) => {
    if (c.z < medianZ - 0.06) return true;
    const dist = Math.hypot(c.x - bulgeCx, c.y - bulgeCy, c.z - bulgeCz);
    return dist <= bandR || c.nz < -0.45;
  });
}

function inButtEllipse(
  col: number,
  row: number,
  midC: number,
  midR: number,
  rx: number,
  ry: number,
): boolean {
  const dx = (col - midC) / Math.max(0.5, rx);
  const dy = (row - midR) / Math.max(0.5, ry);
  return dx * dx + dy * dy <= 1;
}

function paintLobeShadows(
  grid: MonsterGrid,
  palette: MonsterPalette,
  region: GridCell[],
  midC: number,
  midR: number,
  spread: number,
): void {
  for (const c of region) {
    const side = c.col < midC ? -1 : c.col > midC ? 1 : 0;
    if (side === 0) {
      put(grid, c, palette.buttShadow, 'butt', 0.07, 1.2);
      continue;
    }
    const lobeCenter = midC + side * spread;
    const dist = Math.abs(c.col - lobeCenter) + Math.abs(c.row - midR) * 0.4;
    if (dist < spread * 0.9) {
      put(grid, c, palette.buttBase, 'butt', 0.065, 1.25);
    } else {
      put(grid, c, darken(palette.buttBase, 0.1), 'butt', 0.055, 1.15);
    }
  }
}

function paintHeartPatch(
  grid: MonsterGrid,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  base: GridCell,
  scale: number,
): void {
  for (let dr = -scale; dr <= scale; dr++) {
    for (let dc = -scale; dc <= scale; dc++) {
      const col = midC + dc;
      const row = midR + dr;
      const nx = dc / Math.max(1, scale);
      const ny = dr / Math.max(1, scale);
      const heart =
        Math.pow(nx * nx + ny * ny - 0.3, 3) -
        nx * nx * Math.pow(ny, 3) <
        0.02;
      if (!heart) continue;
      const cell = getCell(grid, col, row, 'back') ?? base;
      put(grid, cell, palette.buttHighlight, 'butt_highlight', 0.09, 1.3, true);
    }
  }
}

function paintTail(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  midR: number,
  base: GridCell,
  fluffy: boolean,
): void {
  const len = fluffy ? rng.int(2, 4) : rng.int(1, 2);
  for (let i = 0; i <= len; i++) {
    const col = midC + rng.int(-1, 1);
    const row = midR + i + 1;
    const cell = getCell(grid, col, row, 'back') ?? base;
    const color = fluffy ? palette.buttHighlight : lighten(palette.buttBase, 0.18);
    put(grid, cell, color, 'tail', 0.08 + i * 0.025, fluffy ? 1.35 : 1.15);
    if (fluffy && i > 0) {
      const left = getCell(grid, col - 1, row, 'back') ?? cell;
      const right = getCell(grid, col + 1, row, 'back') ?? cell;
      put(grid, left, color, 'tail', 0.07, 1.2);
      put(grid, right, color, 'tail', 0.07, 1.2);
    }
  }
}

function paintSparkles(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  region: GridCell[],
  count: number,
): void {
  if (region.length === 0) return;
  for (let i = 0; i < count; i++) {
    const c = region[rng.int(0, region.length - 1)]!;
    put(grid, c, palette.buttHighlight, 'butt_highlight', 0.1, 0.95, true);
  }
}

export function applyButtFeatures(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  buttArchetype: ButtArchetype,
): void {
  const region = buttRegion(grid);
  if (region.length < 4) return;

  const minC = Math.min(...region.map((c) => c.col));
  const maxC = Math.max(...region.map((c) => c.col));
  const minR = Math.min(...region.map((c) => c.row));
  const maxR = Math.max(...region.map((c) => c.row));
  const midC = Math.round((minC + maxC) / 2);
  const midR = Math.round((minR + maxR) / 2);
  const base = region.reduce((a, b) => (a.z <= b.z ? a : b));
  const spread = Math.max(2, Math.floor((maxC - minC) * 0.24));
  const sr = grid.scaleRef;

  for (const c of region) {
    put(grid, c, palette.buttBase, 'butt', 0.05, 1.2);
  }

  switch (buttArchetype) {
    case 'peach':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      for (const c of region) {
        if (c.col === midC) put(grid, c, palette.buttShadow, 'butt', 0.08, 1.25);
      }
      break;
    case 'heart_patch':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      paintHeartPatch(grid, palette, midC, midR, base, Math.max(2, Math.round(2.8 * sr * 0.5)));
      break;
    case 'bunny_tail':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      paintTail(grid, rng, palette, midC, midR, base, true);
      break;
    case 'wide_sploot':
      for (const c of region) {
        const wide = inButtEllipse(c.col, c.row, midC, midR, spread * 1.5, spread * 0.8);
        put(
          grid,
          c,
          wide ? palette.buttBase : darken(palette.buttBase, 0.1),
          'butt',
          0.055,
          1.22,
        );
      }
      break;
    case 'glossy_meme':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      paintSparkles(grid, rng, palette, region, rng.int(4, 7));
      for (const c of region) {
        if (c.col > midC && c.row >= midR) {
          put(grid, c, palette.buttHighlight, 'butt_highlight', 0.085, 1.25, true);
        }
      }
      break;
    case 'tail_nub':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      paintTail(grid, rng, palette, midC, midR, base, false);
      break;
    case 'duck_round':
      for (const c of region) {
        const oval = inButtEllipse(c.col, c.row, midC, midR, spread * 1.4, spread * 0.9);
        if (oval) put(grid, c, palette.buttBase, 'butt', 0.06, 1.28);
      }
      break;
    case 'deep_dimple':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      for (const c of region) {
        if (Math.abs(c.col - midC) <= 0) {
          put(grid, c, palette.buttShadow, 'butt', 0.09, 1.3);
        }
      }
      break;
    case 'puffy_cloud':
      for (const c of region) {
        const dist = Math.hypot(c.col - midC, (c.row - midR) * 1.2);
        const t = dist / Math.max(1, spread * 1.15);
        const col =
          t < 0.65
            ? lighten(palette.buttBase, 0.15)
            : darken(palette.buttBase, 0.06 * t);
        put(grid, c, col, 'butt', 0.055, 1.2);
      }
      break;
    case 'sparkle_cute':
      paintLobeShadows(grid, palette, region, midC, midR, spread);
      paintSparkles(grid, rng, palette, region, rng.int(5, 9));
      break;
  }
}
