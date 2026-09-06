import { darken, lighten } from './palette';
import type { Rng } from './rng';
import type { GridCell, MonsterGrid, MonsterPalette } from './types';
import { cellKey } from './types';

function torsoCells(grid: MonsterGrid): GridCell[] {
  return [...grid.cells.values()].filter((c) => c.part === 'body');
}

function put(grid: MonsterGrid, cell: GridCell): void {
  grid.cells.set(cellKey(cell.col, cell.row), cell);
}

function makeLimbCell(
  grid: MonsterGrid,
  src: GridCell,
  col: number,
  row: number,
  tipFactor: number,
  color: number,
  rng: Rng,
): GridCell {
  return {
    col,
    row,
    x: grid.originX + col * grid.cell,
    y: grid.originY + row * grid.cell,
    z: src.z - 0.02 + tipFactor * 0.01,
    nx: src.nx * 0.5,
    ny: tipFactor > 0.5 ? -0.3 : src.ny,
    nz: 0.85,
    color,
    part: 'appendage',
    phase: rng.float(0, Math.PI * 2),
    size: 1,
    tipFactor,
  };
}

function s(grid: MonsterGrid, n: number): number {
  return Math.max(1, Math.round(n * grid.scaleRef * 0.55));
}

/** Limb color follows body hue — roots stay close so they read as flesh, not sticks. */
function limbTint(palette: MonsterPalette, tip: number): number {
  return darken(palette.base, 0.04 + tip * 0.16);
}

/** Cream/bone tint for claws — reads hard vs soft flesh (pixel-art refs). */
function boneTint(palette: MonsterPalette): number {
  return lighten(darken(palette.eyeWhite, 0.12), 0.02) || 0xe8dcc4;
}

/**
 * Manhattan walk so a diagonal step never leaves a 4-connected gap.
 * When thick: ~3 cells near root, taper to 2 at tip.
 */
function paintLimbPath(
  grid: MonsterGrid,
  rng: Rng,
  src: GridCell,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  tip: number,
  color: number,
  thick = false,
  side: -1 | 1 = 1,
): void {
  if (fromCol === toCol && fromRow === toRow) return;
  let c = fromCol;
  let r = fromRow;
  while (c !== toCol || r !== toRow) {
    if (c !== toCol) c += Math.sign(toCol - c);
    else r += Math.sign(toRow - r);
    put(grid, makeLimbCell(grid, src, c, r, tip, color, rng));
    if (thick) {
      put(grid, makeLimbCell(grid, src, c + side, r, tip * 0.95, color, rng));
      // Extra flesh near root so limbs read chunky, not wires
      if (tip < 0.55) {
        put(grid, makeLimbCell(grid, src, c - side, r, tip * 0.9, color, rng));
      }
    }
  }
}

/** Glue a thick root 1–2 cells into the body so limbs never float. */
function paintRoot(
  grid: MonsterGrid,
  rng: Rng,
  anchor: GridCell,
  inwardCol: number,
  inwardRow: number,
  side: -1 | 1,
  palette: MonsterPalette,
): void {
  const color = limbTint(palette, 0);
  for (let k = 0; k <= 1; k++) {
    put(grid, makeLimbCell(grid, anchor, inwardCol, inwardRow + k, 0.05, color, rng));
    put(grid, makeLimbCell(grid, anchor, inwardCol + side, inwardRow + k, 0.05, color, rng));
    put(grid, makeLimbCell(grid, anchor, inwardCol - side, inwardRow + k, 0.05, color, rng));
  }
}

function findBottomEdge(cells: GridCell[]): GridCell[] {
  if (cells.length === 0) return [];
  const minRow = Math.min(...cells.map((c) => c.row));
  return cells.filter((c) => c.row <= minRow + 1);
}

function findTopEdge(cells: GridCell[]): GridCell[] {
  if (cells.length === 0) return [];
  const maxRow = Math.max(...cells.map((c) => c.row));
  return cells.filter((c) => c.row >= maxRow - 1);
}

function findSideAnchors(cells: GridCell[]): { left: GridCell[]; right: GridCell[] } {
  if (cells.length === 0) return { left: [], right: [] };
  const minR = Math.min(...cells.map((c) => c.row));
  const maxR = Math.max(...cells.map((c) => c.row));
  const midLo = minR + Math.floor((maxR - minR) * 0.25);
  const midHi = minR + Math.floor((maxR - minR) * 0.7);
  const band = cells.filter((c) => c.row >= midLo && c.row <= midHi);
  if (band.length === 0) return { left: [], right: [] };
  const minC = Math.min(...band.map((c) => c.col));
  const maxC = Math.max(...band.map((c) => c.col));
  return {
    left: band.filter((c) => c.col <= minC + 1),
    right: band.filter((c) => c.col >= maxC - 1),
  };
}

function nearestOnEdge(edge: GridCell[], targetCol: number): GridCell {
  return edge.reduce((a, b) =>
    Math.abs(a.col - targetCol) < Math.abs(b.col - targetCol) ? a : b,
  );
}

/** Paint 2–3 toe/finger rays from a tip cell. */
function paintDigits(
  grid: MonsterGrid,
  rng: Rng,
  anchor: GridCell,
  tipCol: number,
  tipRow: number,
  /** Primary growth direction for toes (down = -1 row) or fingers (outward). */
  mode: 'toes' | 'fingers',
  outDir: -1 | 1,
  color: number,
): void {
  const count = rng.pick([2, 3, 3]);
  for (let i = 0; i < count; i++) {
    const spread = i - Math.floor((count - 1) / 2);
    if (mode === 'toes') {
      put(grid, makeLimbCell(grid, anchor, tipCol + spread, tipRow, 0.95, color, rng));
      put(grid, makeLimbCell(grid, anchor, tipCol + spread, tipRow - 1, 1, color, rng));
      if (rng.chance(0.6)) {
        put(grid, makeLimbCell(grid, anchor, tipCol + spread, tipRow - 2, 1, darken(color, 0.08), rng));
      }
    } else {
      put(
        grid,
        makeLimbCell(grid, anchor, tipCol + outDir, tipRow + spread, 1, color, rng),
      );
      if (rng.chance(0.55)) {
        put(
          grid,
          makeLimbCell(grid, anchor, tipCol + outDir * 2, tipRow + spread, 1, darken(color, 0.1), rng),
        );
      }
    }
  }
}

/** Legs with knee bend, thickness from scaleRef, toes. */
function addLegs(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const bottom = findBottomEdge(torsoCells(grid));
  if (bottom.length < 2) return;

  const minC = Math.min(...bottom.map((c) => c.col));
  const maxC = Math.max(...bottom.map((c) => c.col));
  const mid = (minC + maxC) / 2;
  const width = Math.max(2, maxC - minC);

  const legCount = rng.pick([2, 2, 4, 4, 6]);
  const halfPairs = legCount / 2;
  // ~25% stubby (hulking) or beads; else normal length
  const style = rng.chance(0.25) ? rng.pick(['stubby', 'beads'] as const) : 'normal';
  const baseLen =
    style === 'stubby' ? s(grid, rng.int(2, 3)) : s(grid, rng.int(3, 6));
  const thick = true;
  const clawCount = rng.int(2, 3);
  const clawBone = rng.chance(0.45);

  for (let p = 0; p < halfPairs; p++) {
    const t = (p + 1) / (halfPairs + 1);
    const offset = width * 0.15 + t * width * 0.35;
    const left = nearestOnEdge(bottom, mid - offset);
    const right = nearestOnEdge(bottom, mid + offset);

    for (const [anchor, side] of [
      [left, -1],
      [right, 1],
    ] as const) {
      const legLen = Math.max(2, baseLen + rng.int(-1, 1));
      paintRoot(grid, rng, anchor, anchor.col, anchor.row, side, palette);
      let col = anchor.col;
      let row = anchor.row;
      const kneeAt = Math.floor(legLen * 0.45);
      for (let i = 1; i <= legLen; i++) {
        const tip = i / legLen;
        const color = limbTint(palette, tip);
        const drift = i < kneeAt ? side : -side;
        const nextCol = col + rng.pick([drift, 0, 0, side * (i < kneeAt ? 1 : 0)]);
        const nextRow = anchor.row - i;
        paintLimbPath(grid, rng, anchor, col, row, nextCol, nextRow, tip, color, thick, side);
        // Beaded segments: plump blob every few steps
        if (style === 'beads' && i % 2 === 0) {
          put(grid, makeLimbCell(grid, anchor, nextCol + side, nextRow, tip, color, rng));
          put(grid, makeLimbCell(grid, anchor, nextCol - side, nextRow, tip * 0.9, color, rng));
          put(grid, makeLimbCell(grid, anchor, nextCol, nextRow - 1, tip, color, rng));
        }
        col = nextCol;
        row = nextRow;
      }
      const footRow = row;
      const footColor = clawBone ? boneTint(palette) : darken(palette.base, 0.4);
      paintDigits(grid, rng, anchor, col, footRow, 'toes', side, footColor);
      for (let c = 0; c < Math.min(clawCount, 2); c++) {
        put(grid, makeLimbCell(grid, anchor, col + c - 1, footRow - 1, 1, footColor, rng));
      }
    }
  }
}

/** Arms with elbow + finger rays. */
function addArms(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const { left, right } = findSideAnchors(torsoCells(grid));
  if (left.length === 0 || right.length === 0) return;

  const pairs = rng.chance(0.28) ? 2 : 1;
  // Rare: longer arms (hulking reach) vs normal
  const longArms = rng.chance(0.22);
  const len = s(grid, longArms ? rng.int(5, 7) : rng.int(3, 5));
  const clawBone = rng.chance(0.5);

  const placeArm = (anchors: GridCell[], dir: -1 | 1, rowBias: number) => {
    const sorted = [...anchors].sort((a, b) => a.row - b.row);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.5) + rowBias));
    const anchor = sorted[idx]!;
    paintRoot(grid, rng, anchor, anchor.col - dir, anchor.row, dir, palette);
    let tipCol = anchor.col;
    let tipRow = anchor.row;
    for (let i = 1; i <= len; i++) {
      const tip = i / Math.max(1, len);
      const color = limbTint(palette, tip);
      const drop = i === Math.ceil(len / 2) ? -1 : i > len / 2 ? rng.pick([-1, 0, 0]) : 0;
      const nextCol = anchor.col + dir * i;
      const nextRow = anchor.row + drop - Math.floor((i > len / 2 ? i - len / 2 : 0) * 0.3);
      paintLimbPath(grid, rng, anchor, tipCol, tipRow, nextCol, nextRow, tip, color, true, dir);
      put(grid, makeLimbCell(grid, anchor, nextCol, nextRow - 1, tip * 0.9, color, rng));
      tipCol = nextCol;
      tipRow = nextRow;
    }
    const digColor = clawBone ? boneTint(palette) : darken(palette.base, 0.38);
    paintDigits(grid, rng, anchor, tipCol, tipRow, 'fingers', dir, digColor);
  };

  for (let p = 0; p < pairs; p++) {
    const bias = p === 0 ? 0 : rng.pick([-2, -1, 1]);
    placeArm(left, -1, bias);
    placeArm(right, 1, bias);
  }
}

function addTail(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const bottom = findBottomEdge(torsoCells(grid));
  if (bottom.length < 2) return;
  const minC = Math.min(...bottom.map((c) => c.col));
  const maxC = Math.max(...bottom.map((c) => c.col));
  const dir = rng.chance(0.5) ? -1 : 1;
  const corner = nearestOnEdge(bottom, dir < 0 ? minC : maxC);
  const len = s(grid, rng.int(4, 8));
  let col = corner.col;
  let row = corner.row;

  for (let i = 1; i <= len; i++) {
    const tip = i / len;
    const nextCol = col + dir + rng.pick([-1, 0, 0, 0]);
    const nextRow = row + rng.pick([-1, 0, 0, 1, 1]);
    const color = limbTint(palette, tip);
    paintLimbPath(grid, rng, corner, col, row, nextCol, nextRow, tip, color);
    if (tip < 0.45) {
      put(grid, makeLimbCell(grid, corner, nextCol, nextRow - 1, tip * 0.85, color, rng));
    }
    col = nextCol;
    row = nextRow;
  }
}

function addWings(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const body = torsoCells(grid);
  if (body.length === 0) return;
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const upperLo = minR + Math.floor((maxR - minR) * 0.55);
  const upper = body.filter((c) => c.row >= upperLo);
  if (upper.length < 4) return;

  const minC = Math.min(...upper.map((c) => c.col));
  const maxC = Math.max(...upper.map((c) => c.col));
  const leftA = nearestOnEdge(upper, minC);
  const rightA = nearestOnEdge(upper, maxC);
  const span = s(grid, rng.int(3, 5));
  const height = s(grid, rng.int(3, 5));

  const paintWing = (anchor: GridCell, dir: -1 | 1) => {
    for (let c = 1; c <= span; c++) {
      const colH = Math.max(1, height - c + 1);
      for (let r = 0; r < colH; r++) {
        const tip = (c / span) * 0.7 + (r / colH) * 0.3;
        const isMembrane = r > 0 && c > 1;
        const color = isMembrane ? palette.base : limbTint(palette, tip);
        put(
          grid,
          makeLimbCell(grid, anchor, anchor.col + dir * c, anchor.row + r, tip, color, rng),
        );
      }
    }
  };

  paintWing(leftA, -1);
  paintWing(rightA, 1);
}

function addHorns(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const top = findTopEdge(torsoCells(grid));
  if (top.length < 2) return;
  const mid = (Math.min(...top.map((c) => c.col)) + Math.max(...top.map((c) => c.col))) / 2;
  const leftA = top.filter((c) => c.col <= mid).sort((a, b) => a.col - b.col)[0];
  const rightA = top.filter((c) => c.col >= mid).sort((a, b) => b.col - a.col)[0];
  if (!leftA || !rightA) return;

  const height = s(grid, rng.int(2, 5));
  const curve = rng.int(0, 2);
  const thickBase = rng.chance(0.7);

  for (const [anchor, dir] of [
    [leftA, -1],
    [rightA, 1],
  ] as const) {
    let col = anchor.col;
    let row = anchor.row;
    for (let i = 1; i <= height; i++) {
      const tip = i / height;
      const color = limbTint(palette, tip);
      const nextCol = anchor.col + dir * Math.floor((i * curve) / Math.max(1, height - 1));
      const nextRow = anchor.row + i;
      paintLimbPath(
        grid,
        rng,
        anchor,
        col,
        row,
        nextCol,
        nextRow,
        tip,
        color,
        thickBase && i <= Math.ceil(height * 0.4),
        dir,
      );
      col = nextCol;
      row = nextRow;
    }
  }
}

function addAntennae(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const top = findTopEdge(torsoCells(grid));
  if (top.length < 2) return;
  const mid = (Math.min(...top.map((c) => c.col)) + Math.max(...top.map((c) => c.col))) / 2;
  const left = top.filter((c) => c.col <= mid).sort((a, b) => b.col - a.col)[0];
  const right = top.filter((c) => c.col >= mid).sort((a, b) => a.col - b.col)[0];
  if (!left || !right) return;

  const height = s(grid, rng.int(3, 6));
  for (const [anchor, dir] of [
    [left, -1],
    [right, 1],
  ] as const) {
    let col = anchor.col;
    let row = anchor.row;
    for (let i = 1; i <= height; i++) {
      const tip = i / height;
      const nextCol = col + dir * rng.pick([0, 1, 1]) + rng.pick([-1, 0, 0]);
      const nextRow = anchor.row + i;
      paintLimbPath(grid, rng, anchor, col, row, nextCol, nextRow, tip, limbTint(palette, tip));
      col = nextCol;
      row = nextRow;
    }
    paintLimbPath(grid, rng, anchor, col, row, col, anchor.row + height + 1, 1, palette.accent);
    const tipA = makeLimbCell(grid, anchor, col, anchor.row + height + 1, 1, palette.accent, rng);
    tipA.glow = true;
    put(grid, tipA);
    const tipB = makeLimbCell(grid, anchor, col + dir, anchor.row + height + 1, 1, darken(palette.accent, 0.15), rng);
    tipB.glow = true;
    put(grid, tipB);
  }
}

function addEars(grid: MonsterGrid, rng: Rng, palette: MonsterPalette): void {
  const top = findTopEdge(torsoCells(grid));
  if (top.length < 2) return;
  const mid = (Math.min(...top.map((c) => c.col)) + Math.max(...top.map((c) => c.col))) / 2;
  const left = top.filter((c) => c.col <= mid).sort((a, b) => a.col - b.col)[0];
  const right = top.filter((c) => c.col >= mid).sort((a, b) => b.col - a.col)[0];
  if (!left || !right) return;

  const tall = s(grid, rng.int(2, 4));
  const wide = Math.max(1, s(grid, rng.int(1, 2)));

  for (const [anchor, dir] of [
    [left, -1],
    [right, 1],
  ] as const) {
    for (let r = 1; r <= tall; r++) {
      for (let w = 1; w <= wide; w++) {
        if (r > tall * 0.6 && w > Math.ceil(wide * 0.6)) continue;
        const tip = r / tall;
        const color = limbTint(palette, tip);
        put(
          grid,
          makeLimbCell(grid, anchor, anchor.col + dir * (w - 1), anchor.row + r, tip, color, rng),
        );
      }
    }
  }
}

function addLongLegs(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  legLen: number,
): void {
  const bottom = findBottomEdge(torsoCells(grid));
  if (bottom.length < 2) return;
  const minC = Math.min(...bottom.map((c) => c.col));
  const maxC = Math.max(...bottom.map((c) => c.col));
  const mid = (minC + maxC) / 2;
  const left = nearestOnEdge(bottom, mid - (maxC - minC) * 0.25);
  const right = nearestOnEdge(bottom, mid + (maxC - minC) * 0.25);
  const thick = true;

  for (const [anchor, side] of [
    [left, -1],
    [right, 1],
  ] as const) {
    const len = Math.max(3, legLen + rng.int(-1, 1));
    paintRoot(grid, rng, anchor, anchor.col, anchor.row, side, palette);
    let col = anchor.col;
    let row = anchor.row;
    const kneeAt = Math.floor(len * 0.5);
    for (let i = 1; i <= len; i++) {
      const tip = i / len;
      const drift = i < kneeAt ? side : -side;
      const nextCol = col + rng.pick([drift, 0, 0]);
      const nextRow = anchor.row - i;
      paintLimbPath(grid, rng, anchor, col, row, nextCol, nextRow, tip, limbTint(palette, tip), thick, side);
      col = nextCol;
      row = nextRow;
    }
    paintDigits(
      grid,
      rng,
      anchor,
      col,
      anchor.row - len,
      'toes',
      side,
      rng.chance(0.4) ? boneTint(palette) : darken(palette.outline, 0.05),
    );
  }
}

/**
 * Grow explicit limbs. Lengths scale with grid.scaleRef.
 */
export function applyLimbs(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  archetype = 'blob',
): void {
  if (torsoCells(grid).length < 20) return;

  if (archetype === 'slug') {
    if (rng.chance(0.4)) addLegs(grid, rng, palette);
    addTail(grid, rng, palette);
    if (rng.chance(0.35)) addAntennae(grid, rng, palette);
    return;
  }

  if (archetype === 'lanky') {
    addLongLegs(grid, rng, palette, s(grid, rng.int(6, 10)));
    if (rng.chance(0.5)) addArms(grid, rng, palette);
    if (rng.chance(0.55)) addAntennae(grid, rng, palette);
    return;
  }

  if (archetype === 'bighead') {
    addLongLegs(grid, rng, palette, s(grid, rng.int(2, 4)));
    if (rng.chance(0.4)) addEars(grid, rng, palette);
    else if (rng.chance(0.5)) addHorns(grid, rng, palette);
    return;
  }

  if (rng.chance(0.97)) addLegs(grid, rng, palette);
  if (rng.chance(0.8)) addArms(grid, rng, palette);
  if (rng.chance(0.35)) addTail(grid, rng, palette);
  if (rng.chance(0.2)) addWings(grid, rng, palette);

  const headStyles = rng.shuffle(['horns', 'antennae', 'ears'] as const);
  const headCount = rng.pick([1, 1, 2]);
  for (let i = 0; i < headCount; i++) {
    switch (headStyles[i]) {
      case 'horns':
        addHorns(grid, rng, palette);
        break;
      case 'antennae':
        addAntennae(grid, rng, palette);
        break;
      case 'ears':
        addEars(grid, rng, palette);
        break;
    }
  }
}
