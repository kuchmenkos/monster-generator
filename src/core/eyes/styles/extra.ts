import { CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import type { BulalashkaSkull, SurfaceAnchor } from '../../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../../mesh/materials';
import type { BulalashkaEyeParams, EyePlan } from '../../types';
import {
  buildHoleEye,
  buildPupil,
  computeBulge,
  orientPivot,
} from './shared';

export { buildClusterEye } from './shared';

function antiPop(group: Group, anchor: SurfaceAnchor, size: number, skull: BulalashkaSkull): void {
  const maxZ = skull.bounds.maxZ + size * 0.15;
  group.updateMatrixWorld(true);
  const wp = anchor.point.clone();
  group.getWorldPosition(wp);
  if (wp.z > maxZ) {
    group.position.z -= wp.z - maxZ;
  }
}

/** Bead — protruding pupil sphere on socket. */
export function buildBeadEye(
  plan: EyePlan,
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = buildHoleEye(plan, anchor, params, materials, skull);
  group.name = 'eye-bead';
  const pupil = buildPupil(params.pupilShape, plan.pupilSize * 1.35, materials);
  pupil.position.z = computeBulge(params, anchor, plan.size) * 0.9;
  group.add(pupil);
  return group;
}

/** Stalk — capsule stem + eye sphere at tip. */
export function buildStalkEye(
  plan: EyePlan,
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = new Group();
  group.name = 'eye-stalk';
  orientPivot(group, anchor);

  const stemLen = plan.size * 1.8;
  const stem = new Mesh(
    new CylinderGeometry(plan.size * 0.12, plan.size * 0.18, stemLen, 8),
    materials.skin,
  );
  stem.rotation.x = Math.PI / 2;
  stem.position.z = stemLen * 0.5;
  group.add(stem);

  const eye = new Mesh(new SphereGeometry(plan.size * 0.85, 10, 8), materials.eye);
  eye.position.z = stemLen + plan.size * 0.4;
  eye.add(buildPupil(params.pupilShape, plan.pupilSize, materials));
  group.add(eye);

  antiPop(group, anchor, plan.size * 2, skull);
  return group;
}

/** Pit — concave socket, pupil deep inside. */
export function buildPitEye(
  plan: EyePlan,
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = new Group();
  group.name = 'eye-pit';
  orientPivot(group, anchor);

  const tiny = plan.size * 0.25;
  const pupil = buildPupil(params.pupilShape, tiny, materials);
  pupil.position.z = computeBulge(params, anchor, tiny) * 0.15;
  group.add(pupil);

  antiPop(group, anchor, tiny, skull);
  return group;
}

/** Bulb — large protruding sphere. */
export function buildBulbEye(
  plan: EyePlan,
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = new Group();
  group.name = 'eye-bulb';
  orientPivot(group, anchor);

  const big = plan.size * 1.45;
  const bulge = computeBulge(params, anchor, big) * 1.2;
  const sclera = new Mesh(new SphereGeometry(big, 14, 12), materials.eye);
  sclera.position.z = bulge;
  sclera.add(buildPupil(params.pupilShape, plan.pupilSize * 1.1, materials));
  group.add(sclera);

  antiPop(group, anchor, big, skull);
  return group;
}
