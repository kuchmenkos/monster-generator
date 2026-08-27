import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { GridCell, MonsterGrid, MonsterPalette } from '../types';
import { paintWithShadow } from './shading';
import type { MustacheStyle } from './types';

/**
 * Procedural living mustache — strand clusters between nose and mouth.
 * Uses dedicated `mustache` part so it never clobbers mouth via brow proxy.
 */
export function paintMustache(
  grid: MonsterGrid,
  rng: Rng,
  palette: MonsterPalette,
  midC: number,
  noseR: number,
  mouthR: number,
  base: GridCell,
  style: MustacheStyle,
): void {
  // Clamp between nose and mouth (rows grow upward)
  const lo = Math.min(noseR, mouthR);
  const hi = Math.max(noseR, mouthR);
  const y = Math.max(lo + 1, Math.min(hi - 1, Math.round((noseR + mouthR) * 0.5)));
  if (y <= mouthR && mouthR < noseR) {
    // mouth below nose in world-row: keep above mouth
  }

  const paintStrand = (dc: number, dr: number, side: -1 | 1 | 0 = 0, tip = false) => {
    const row = y + dr;
    // Keep clear of mouth/tooth cells
    const existing = grid.cells.get(`${midC + dc},${row}`);
    if (existing && (existing.part === 'mouth' || existing.part === 'tooth')) return;
    // Stay strictly between nose and mouth bands
    const lo = Math.min(noseR, mouthR);
    const hi = Math.max(noseR, mouthR);
    if (row <= lo || row >= hi) return;

    const baseColor = tip
      ? darken(palette.brow, 0.1)
      : rng.chance(0.5)
        ? palette.hair
        : palette.brow;
    const color = rng.chance(0.4)
      ? lighten(baseColor, rng.float(0.04, 0.12))
      : darken(baseColor, rng.float(0.02, 0.14));

    paintWithShadow(grid, midC + dc, row, base, color, 'mustache', {
      zBoost: 0.052,
      soft: true,
      faceSide: side === 0 ? undefined : side,
      shadow: false,
      size: tip ? 0.85 : rng.float(0.85, 1.05),
      hairStrand: Math.abs(dc) * 2 + Math.abs(dr),
      tipFactor: tip ? 0.7 : 0.35,
      phase: base.phase + dc * 0.3 + dr * 0.5,
    });
  };

  switch (style) {
    case 'walrus':
      for (let dx = -2; dx <= 2; dx++) {
        paintStrand(dx, 0, dx < 0 ? -1 : dx > 0 ? 1 : 0);
        paintStrand(dx, rng.chance(0.5) ? 0 : 1, dx < 0 ? -1 : 1);
        if (Math.abs(dx) <= 1) paintStrand(dx, 1, dx < 0 ? -1 : 1, true);
      }
      break;
    case 'pencil':
      for (let dx = -2; dx <= 2; dx++) {
        const arc = Math.round((1 - (dx / 2) ** 2) * 0.5);
        paintStrand(dx, arc, dx < 0 ? -1 : dx > 0 ? 1 : 0);
      }
      break;
    case 'handlebar':
      for (let dx = -3; dx <= 3; dx++) {
        const droop = Math.abs(dx) >= 3 ? -1 : 0;
        paintStrand(dx, droop, dx < 0 ? -1 : dx > 0 ? 1 : 0);
      }
      // Curl tips downward (toward chin in row space = negative if up is +)
      paintStrand(-4, -1, -1, true);
      paintStrand(-4, -2, -1, true);
      paintStrand(4, -1, 1, true);
      paintStrand(4, -2, 1, true);
      paintStrand(-3, -1, -1);
      paintStrand(3, -1, 1);
      break;
    case 'stubble':
      for (let i = 0; i < 6; i++) {
        const dx = rng.int(-3, 3);
        const dr = rng.int(0, 1);
        paintStrand(dx, dr, dx < 0 ? -1 : 1, true);
      }
      break;
    case 'fu_manchu':
      for (let dx = -2; dx <= 2; dx++) {
        paintStrand(dx, 0, dx < 0 ? -1 : dx > 0 ? 1 : 0);
      }
      for (let dy = -1; dy >= -3; dy--) {
        paintStrand(-2, dy, -1, true);
        paintStrand(2, dy, 1, true);
        if (dy <= -2) {
          paintStrand(-3, dy, -1, true);
          paintStrand(3, dy, 1, true);
        }
      }
      break;
  }
}
