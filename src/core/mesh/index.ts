import type { MeshPatternKind } from './meshPatterns';
import { generateHeadAdornments } from '../adornments';
import {
  computeFaceLandmarks,
  computeFaceProminence,
  computeMouthCavityDepth,
  computeSilhouettePinch,
} from '../face/landmarks';
import { generateSkullParams, generateEyeParams, layoutEyes, solveEyeLayout } from '../eyes/index';
import { buildBulalashkaSkull } from './bulalashkaSkull';
import { generateMouthBundle } from '../mouth';
import type { Rng } from '../rng';
import type { Blob, BulalashkaBodyArchetype, ButtArchetype, MeshBundle, MeshBundleMetrics } from '../types';

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
    'scales',
    'curved_stripes',
    'mask',
  ]);
}

/** Serializable mesh bundle for MonsterData. */
export function buildMeshBundle(
  rng: Rng,
  blobs: Blob[],
  bodyArchetype: BulalashkaBodyArchetype | string,
  _buttArchetype: ButtArchetype,
  _variantSeed: string,
  mouthFloorY: number,
): MeshBundle {
  const variantSeed = _variantSeed;
  const archetype = bodyArchetype as BulalashkaBodyArchetype;
  const skullParams = generateSkullParams(rng, archetype);

  const tempSkull = buildBulalashkaSkull(blobs, skullParams);
  const landmarks = computeFaceLandmarks(tempSkull, archetype, mouthFloorY);
  const silhouettePinch = computeSilhouettePinch(tempSkull);

  const eyeParams = generateEyeParams(rng, archetype, landmarks);
  const plans = layoutEyes(eyeParams, rng);
  const { plans: solved, silhouetteClip, eyeOverlap } = solveEyeLayout(
    eyeParams,
    plans,
    tempSkull,
    landmarks.mouthFloorY,
  );

  const mouth = generateMouthBundle(rng, landmarks);
  const patternKind = pickPatternKind(rng);
  const adornments = generateHeadAdornments(rng, blobs, skullParams, landmarks);

  const faceProminence = computeFaceProminence(landmarks, solved, mouth);
  const mouthCavityDepth = computeMouthCavityDepth(mouth);

  tempSkull.geometry.dispose();

  const metrics: MeshBundleMetrics = {
    eyeCount: solved.length,
    avgBulge: solved.reduce((s, p) => s + p.bulge, 0) / Math.max(1, solved.length),
    socketDepth: eyeParams.eyeSize * 0.4,
    silhouetteClip,
    mouthCavity: mouth.hasCavity || mouth.openUp + mouth.openDown > 0.02,
    buttProtrusion: 0.12,
    vertexColorSteps: 0,
    patternKind,
    hasNose: adornments.nose.style !== 'ridge' || adornments.nose.size > 0,
    earCount: adornments.ears.length,
    crownCount: adornments.crown.count,
    earSilhouetteClip: adornments.earSilhouetteClip,
    sparkleCount: adornments.sparkles.count,
    silhouettePinch,
    faceProminence,
    mouthCavityDepth,
    eyeOverlap,
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
    mouthFloorY: landmarks.mouthFloorY,
    variantSeed,
  };

  return {
    volumetricEyes,
    mouth,
    adornments,
    landmarks,
    patternKind,
    metrics,
    variantSeed,
  };
}

export { buildBulalashkaScene } from './buildScene';
export type { BulalashkaSceneResult, BuildSceneOptions } from './buildScene';
