import type { MeshPatternKind } from './meshPatterns';
import { generateSkullParams, generateEyeParams, layoutEyes, solveEyeLayout } from '../eyes/index';
import { buildBulalashkaSkull } from './bulalashkaSkull';
import { generateMouthBundle } from '../mouth';
import type { Rng } from '../rng';
import type { Blob, MeshBundle, MeshBundleMetrics } from '../types';

function pickPatternKind(rng: Rng): MeshPatternKind {
  return rng.pick<MeshPatternKind>([
    'plain',
    'belly',
    'belly',
    'spots',
    'spots',
    'stripes',
    'gradient',
    'rosettes',
    'bio-glow',
  ]);
}

/** Serializable mesh bundle for MonsterData. */
export function buildMeshBundle(
  rng: Rng,
  blobs: Blob[],
  bodyArchetype: string,
  _buttArchetype: import('../types').ButtArchetype,
  _variantSeed: string,
  mouthFloorY: number,
): MeshBundle {
  const variantSeed = _variantSeed;
  const skullParams = generateSkullParams(rng);
  const eyeParams = generateEyeParams(rng, bodyArchetype);
  const plans = layoutEyes(eyeParams, rng);
  const tempSkull = buildBulalashkaSkull(blobs, skullParams);
  const { plans: solved, silhouetteClip } = solveEyeLayout(eyeParams, plans, tempSkull, mouthFloorY);
  tempSkull.geometry.dispose();

  const mouth = generateMouthBundle(rng, mouthFloorY, eyeParams.eyeY);
  const patternKind = pickPatternKind(rng);

  const metrics: MeshBundleMetrics = {
    eyeCount: solved.length,
    avgBulge: solved.reduce((s, p) => s + p.bulge, 0) / Math.max(1, solved.length),
    socketDepth: eyeParams.eyeSize * 0.28,
    silhouetteClip,
    mouthCavity: mouth.hasCavity,
    buttProtrusion: 0.12,
    vertexColorSteps: 0,
    patternKind,
  };

  const volumetricEyes = {
    params: eyeParams,
    skullParams,
    plans: solved,
    metrics: {
      eyeCount: metrics.eyeCount,
      avgBulge: metrics.avgBulge,
      socketDepth: metrics.socketDepth,
      silhouetteClip,
    },
    mouthFloorY,
    variantSeed,
  };

  return {
    volumetricEyes,
    mouth,
    patternKind,
    metrics,
    variantSeed,
  };
}

export { buildBulalashkaScene } from './buildScene';
export type { BulalashkaSceneResult, BuildSceneOptions } from './buildScene';
