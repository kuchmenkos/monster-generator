import { buildBulalashkaSkull } from '../mesh/bulalashkaSkull';
import type { Rng } from '../rng';
import type {
  BulalashkaEyeParams,
  BulalashkaSkullParams,
  VolumetricEyeBundle,
  VolumetricEyeMetrics,
} from '../types';
import { layoutEyes, solveEyeLayout } from './layout';

export function generateSkullParams(rng: Rng): BulalashkaSkullParams {
  return {
    boxiness: rng.float(0.15, 0.65),
    lumpiness: rng.float(0.2, 0.85),
    jawDrop: rng.float(0.25, 0.75),
    scale: rng.float(0.95, 1.08),
  };
}

export function generateEyeParams(rng: Rng, bodyArchetype: string): BulalashkaEyeParams {
  const layoutPick: import('../types').EyeLayout[] =
    bodyArchetype === 'mushroom_cap'
      ? ['row', 'cluster', 'ring']
      : ['row', 'row', 'cluster', 'scatter'];
  const eyeLayout = rng.pick(layoutPick);

  const stylePick: import('../types').EyeStyle[] =
    eyeLayout === 'cluster'
      ? ['cluster', 'cluster', 'ball', 'bead']
      : ['ball', 'ball', 'hole', 'cluster', 'bead', 'stalk', 'pit', 'bulb'];
  const eyeStyle = rng.pick(stylePick);

  const eyeCount =
    eyeStyle === 'cluster'
      ? rng.int(4, 6)
      : eyeLayout === 'row'
        ? rng.pick([1, 2, 2, 2, 3])
        : rng.int(2, 5);

  return {
    eyeCount,
    eyeLayout: eyeStyle === 'cluster' ? 'cluster' : eyeLayout,
    eyeStyle,
    eyeSize: rng.float(0.06, 0.12),
    eyeSpread: rng.float(0.12, 0.28),
    eyeY: rng.float(0.05, 0.32),
    eyeBulge: rng.float(0.12, 0.42),
    eyeLid: rng.float(0.05, 0.85),
    eyeJitter: rng.float(0.1, 0.55),
    pupilShape: rng.pick(['round', 'round', 'slit', 'goat', 'cross']),
  };
}

/** Pure-data bundle for MonsterData (no Three.js objects). */
export function buildVolumetricEyeBundle(
  rng: Rng,
  blobs: import('../types').Blob[],
  bodyArchetype: string,
  variantSeed: string,
  mouthFloorY: number,
): VolumetricEyeBundle {
  const params = generateEyeParams(rng, bodyArchetype);
  const skullParams = generateSkullParams(rng);
  const plans = layoutEyes(params, rng);

  const tempSkull = buildBulalashkaSkull(blobs, skullParams);
  const { plans: solved, silhouetteClip } = solveEyeLayout(params, plans, tempSkull, mouthFloorY);
  tempSkull.geometry.dispose();

  const metrics: VolumetricEyeMetrics = {
    eyeCount: solved.length,
    avgBulge: solved.reduce((s, p) => s + p.bulge, 0) / Math.max(1, solved.length),
    socketDepth: params.eyeSize * 0.28,
    silhouetteClip,
  };

  return {
    params,
    skullParams,
    plans: solved,
    metrics,
    mouthFloorY,
    variantSeed,
  };
}

export { layoutEyes, solveEyeLayout } from './layout';
