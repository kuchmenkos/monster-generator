import { Group } from 'three';
import { buildBulalashkaSkull } from '../mesh/bulalashkaSkull';
import { buildCrown, generateCrownPlan } from './crown';
import { buildEars, layoutEars } from './ears';
import { buildNose, generateNosePlan } from './nose';
import { buildSparkles, generateSparklePlan } from './sparkles';
import type { BulalashkaMaterials } from '../mesh/materials';
import type { Rng } from '../rng';
import type {
  Blob,
  BulalashkaSkullParams,
  HeadAdornmentBundle,
  MonsterPalette,
} from '../types';

export function generateHeadAdornments(
  rng: Rng,
  blobs: Blob[],
  skullParams: BulalashkaSkullParams,
  eyeY: number,
  mouthY: number,
): HeadAdornmentBundle {
  const tempSkull = buildBulalashkaSkull(blobs, skullParams);
  const nose = generateNosePlan(rng, eyeY, mouthY);
  const { ears, clip } = layoutEars(rng, tempSkull, eyeY);
  const crown = generateCrownPlan(rng);
  const sparkles = generateSparklePlan(rng, crown.sparkle);
  tempSkull.geometry.dispose();

  return {
    nose,
    ears,
    crown,
    sparkles,
    earSilhouetteClip: clip,
  };
}

export interface AdornmentSceneResult {
  group: Group;
  sparkles: import('three').Mesh[];
}

/** Build all head adornment meshes. */
export function buildHeadAdornments(
  skull: import('../mesh/bulalashkaSkull').BulalashkaSkull,
  bundle: HeadAdornmentBundle,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
  eyeY: number,
  mouthY: number,
): AdornmentSceneResult {
  const group = new Group();
  group.name = 'adornments';

  group.add(buildNose(skull, bundle.nose, palette, materials, eyeY, mouthY));
  group.add(buildEars(skull, bundle.ears, palette, materials));
  group.add(buildCrown(skull, bundle.crown, palette, materials));

  const { group: sparkleGroup, meshes } = buildSparkles(
    skull,
    bundle.sparkles,
    palette,
    materials,
  );
  group.add(sparkleGroup);

  return { group, sparkles: meshes };
}

export { generateNosePlan, buildNose } from './nose';
export { layoutEars, buildEars } from './ears';
export { generateCrownPlan, buildCrown } from './crown';
export { generateSparklePlan, buildSparkles } from './sparkles';
