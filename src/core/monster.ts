import { applyFeatures } from './features';
import { createBlobs } from './field';
import { applyLimbs } from './limbs';
import { generateMonsterName } from './names';
import { generatePalette } from './palette';
import { applyPatterns } from './patterns';
import { applyGroundShadow, gridToParticles, rasterizeField } from './particles';
import { createRng } from './rng';
import { scoreMonster } from './score';
import type { AnimParams, MonsterData, Particle } from './types';

const CANDIDATE_COUNT = 6;

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
    breathAmp: rng.float(0.012, 0.028),
    breathFreq: rng.float(1.0, 2.0),
    swayAmp: rng.float(0.02, 0.055),
    swayFreq: rng.float(0.65, 1.4),
    jiggleAmp: rng.float(0.002, 0.01),
    bounceChance: rng.float(0.1, 0.32),
    blinkInterval: rng.float(1.6, 4.2),
    jitteriness: rng.float(0.15, 0.95),
    heaviness: rng.float(0.1, 0.85),
    curiosity: rng.float(0.2, 0.95),
    talkRate: rng.float(3, 9),
    talkSyllables: rng.int(2, 8),
    // Stronger base open in cell units — scaled by scaleRef at render
    talkAmp: rng.float(1.5, 3.0),
  };
}

/** Single pipeline pass for a candidate seed variant. */
function generateCandidate(variantSeed: string, displaySeed: string): MonsterData {
  const rng = createRng(variantSeed);
  const palette = generatePalette(rng);
  const { blobs, archetype } = createBlobs(rng);
  const threshold = rng.float(1.02, 1.32);

  let grid = rasterizeField(rng, blobs, palette, {
    resolution: rng.int(64, 80),
    threshold,
  });

  if (grid.cells.size < 200) {
    grid = rasterizeField(rng, blobs, palette, {
      resolution: 72,
      threshold: 0.92,
    });
  }

  applyLimbs(rng, grid, palette, archetype);
  applyGroundShadow(grid);
  applyPatterns(rng, grid, palette);
  applyFeatures(rng, grid, palette, archetype);

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
    archetype,
    particles,
    palette,
    anim: makeAnim(rng),
    cellSize: grid.cell,
    scaleRef: grid.scaleRef,
    bounds: computeBounds(particles),
  };
}

/**
 * Full deterministic pipeline: seed → best of N scored candidates.
 * Variants use `seed#v0..vN` so the same seed always picks the same winner.
 */
export function generateMonster(seed: string): MonsterData {
  let best: MonsterData | null = null;
  let bestScore = -Infinity;
  let bestLimbed: MonsterData | null = null;
  let bestLimbedScore = -Infinity;

  for (let v = 0; v < CANDIDATE_COUNT; v++) {
    const candidate = generateCandidate(`${seed}#v${v}`, seed);
    const s = scoreMonster(candidate);
    const limbs = candidate.particles.filter((p) => p.part === 'appendage').length;
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
    if (limbs >= 8 && s > bestLimbedScore) {
      bestLimbedScore = s;
      bestLimbed = candidate;
    }
  }

  // Prefer a limbed candidate unless the limbless one scores much higher
  if (bestLimbed && bestLimbedScore >= bestScore - 12) return bestLimbed;
  return best!;
}
