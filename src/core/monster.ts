import { applyButtFeatures } from './butt';
import { createProceduralBulalashka } from './bulalashka';
import { applyFeatures } from './features';
import { generateMonsterName } from './names';
import { generatePalette } from './palette';
import { applyPatterns } from './patterns';
import { applyGroundShadow, gridToParticles, rasterizeDenseShell } from './particles';
import { createRng } from './rng';
import { scoreBulalashka } from './score';
import type { AnimParams, MonsterData, Particle } from './types';

const CANDIDATE_COUNT = 4;

function computeBounds(particles: Particle[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of particles) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) {
    return { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 };
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function makeAnim(rng: ReturnType<typeof createRng>): AnimParams {
  return {
    breathAmp: rng.float(0.014, 0.032),
    breathFreq: rng.float(1.0, 2.0),
    swayAmp: rng.float(0.022, 0.058),
    swayFreq: rng.float(0.65, 1.4),
    jiggleAmp: rng.float(0.003, 0.012),
    bounceChance: rng.float(0.12, 0.35),
    blinkInterval: rng.float(1.6, 4.2),
    jitteriness: rng.float(0.2, 0.95),
    heaviness: rng.float(0.15, 0.75),
    curiosity: rng.float(0.25, 0.95),
  };
}

/** Single bulalashka pipeline pass for a candidate seed variant. */
function generateCandidate(variantSeed: string, displaySeed: string): MonsterData {
  const rng = createRng(variantSeed);
  const palette = generatePalette(rng);
  const { blobs, bodyArchetype, buttArchetype } = createProceduralBulalashka(rng);
  const threshold = rng.float(1.0, 1.28);

  let grid = rasterizeDenseShell(rng, blobs, palette, {
    resolution: rng.int(72, 88),
    threshold,
  });

  if (grid.cells.size < 350) {
    grid = rasterizeDenseShell(rng, blobs, palette, {
      resolution: 80,
      threshold: 0.95,
    });
  }

  applyGroundShadow(grid);
  applyPatterns(rng, grid, palette);
  applyFeatures(rng, grid, palette, bodyArchetype);
  applyButtFeatures(rng, grid, palette, buttArchetype);

  const particles = gridToParticles(grid);

  const bounds = computeBounds(particles);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  for (const p of particles) {
    p.x -= cx;
    p.y -= cy;
  }

  return {
    seed: displaySeed,
    name: generateMonsterName(displaySeed),
    archetype: bodyArchetype,
    buttArchetype,
    particles,
    palette,
    anim: makeAnim(rng),
    cellSize: grid.cell,
    scaleRef: grid.scaleRef,
    bounds: computeBounds(particles),
  };
}

/**
 * Full deterministic pipeline: seed → best of N scored bulalashka candidates.
 */
export function generateMonster(seed: string): MonsterData {
  let best: MonsterData | null = null;
  let bestScore = -Infinity;

  for (let v = 0; v < CANDIDATE_COUNT; v++) {
    const candidate = generateCandidate(`${seed}#v${v}`, seed);
    const s = scoreBulalashka(candidate);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }

  return best!;
}
