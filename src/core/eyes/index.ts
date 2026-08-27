import { computeFaceLandmarks } from '../face/landmarks';
import { buildBulalashkaSkull } from '../mesh/bulalashkaSkull';
import type { Rng } from '../rng';
import type {
  BulalashkaBodyArchetype,
  BulalashkaEyeParams,
  BulalashkaSkullParams,
  SkullProfile,
  VolumetricEyeBundle,
  VolumetricEyeMetrics,
} from '../types';
import type { FaceLandmarks } from '../face/landmarks';
import { layoutEyes, solveEyeLayout } from './layout';

export function generateSkullParams(rng: Rng, bodyArchetype: BulalashkaBodyArchetype | string = 'pear'): BulalashkaSkullParams {
  let profile: SkullProfile = 'pear';
  switch (bodyArchetype) {
    case 'pear':
    case 'teardrop':
      profile = bodyArchetype;
      break;
    case 'dumpling':
    case 'egg':
      profile = 'dumpling';
      break;
    case 'mushroom_cap':
      profile = 'bighead';
      break;
    default:
      profile = rng.pick<SkullProfile>(['bighead', 'pear', 'dumpling', 'teardrop']);
  }
  return {
    boxiness: rng.float(0.15, 0.65),
    lumpiness: rng.float(0.12, 0.5),
    jawDrop: rng.float(0.25, 0.75),
    scale: rng.float(0.95, 1.08),
    profile,
  };
}

export function generateEyeParams(
  rng: Rng,
  bodyArchetype: string,
  landmarks: FaceLandmarks,
): BulalashkaEyeParams {
  const layoutPick: import('../types').EyeLayout[] =
    bodyArchetype === 'mushroom_cap'
      ? ['row', 'row', 'cluster']
      : ['row', 'row', 'row', 'row', 'cluster'];
  const eyeLayout = rng.pick(layoutPick);

  const stylePick: import('../types').EyeStyle[] =
    eyeLayout === 'cluster'
      ? ['cluster', 'cluster', 'ball', 'bead']
      : ['hole', 'hole', 'pit', 'pit', 'ball', 'bead', 'stalk', 'bulb'];
  const eyeStyle = rng.pick(stylePick);

  const eyeCount =
    eyeStyle === 'cluster'
      ? rng.int(3, 4)
      : eyeLayout === 'row'
        ? rng.pick([1, 2, 2, 2, 3])
        : rng.int(2, 4);

  return {
    eyeCount,
    eyeLayout: eyeStyle === 'cluster' ? 'cluster' : eyeLayout,
    eyeStyle,
    eyeSize: rng.float(0.08, 0.14),
    eyeSpread: rng.float(0.14, 0.28),
    eyeY: landmarks.eyeLineY + rng.float(-0.02, 0.02),
    eyeBulge: rng.float(0.1, 0.38),
    eyeLid: rng.float(0.15, 0.85),
    eyeJitter: rng.float(0.08, 0.45),
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
  const skullParams = generateSkullParams(rng, bodyArchetype);
  const tempSkull = buildBulalashkaSkull(blobs, skullParams);
  const landmarks = computeFaceLandmarks(
    tempSkull,
    bodyArchetype as BulalashkaBodyArchetype,
    mouthFloorY,
  );
  const params = generateEyeParams(rng, bodyArchetype, landmarks);
  const plans = layoutEyes(params, rng);

  const { plans: solved, silhouetteClip } = solveEyeLayout(params, plans, tempSkull, landmarks.mouthFloorY);
  tempSkull.geometry.dispose();

  const metrics: VolumetricEyeMetrics = {
    eyeCount: solved.length,
    avgBulge: solved.reduce((s, p) => s + p.bulge, 0) / Math.max(1, solved.length),
    socketDepth: params.eyeSize * 0.4,
    silhouetteClip,
  };

  return {
    params,
    skullParams,
    plans: solved,
    metrics,
    mouthFloorY: landmarks.mouthFloorY,
    variantSeed,
  };
}

export { layoutEyes, solveEyeLayout } from './layout';
