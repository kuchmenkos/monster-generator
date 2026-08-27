import {
  Group,
  Mesh,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BulalashkaSkull, SurfaceAnchor } from '../../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../../mesh/materials';
import type { BulalashkaEyeParams, EyePlan, PupilShape } from '../../types';

const FWD = new Vector3(0, 0, 1);
/** Port xb() — orient pivot so +Z aligns with surface normal. */
export function orientPivot(pivot: Object3D, anchor: SurfaceAnchor): void {
  pivot.position.copy(anchor.point);
  const q = new Quaternion().setFromUnitVectors(FWD, anchor.normal.clone().normalize());
  pivot.quaternion.copy(q);
}

/** Port Ex() — max protrusion along normal before silhouette pop. */
export function computeBulge(params: BulalashkaEyeParams, anchor: SurfaceAnchor, size: number): number {
  const n = anchor.normal.z;
  const base = params.eyeBulge * size * (0.55 + n * 0.65);
  return Math.max(size * 0.08, Math.min(size * 0.55, base));
}

/** Port zx() — pupil mesh inside sclera. */
export function buildPupil(
  shape: PupilShape,
  size: number,
  materials: BulalashkaMaterials,
): Mesh {
  const geo = new SphereGeometry(size, 10, 8);
  const mesh = new Mesh(geo, materials.pupil);
  mesh.name = 'pupil';

  if (shape === 'slit') {
    mesh.scale.set(0.35, 1.1, 0.85);
  } else if (shape === 'goat') {
    mesh.scale.set(0.75, 1.05, 0.85);
  } else if (shape === 'cross') {
    mesh.scale.set(0.55, 0.55, 0.9);
  }
  mesh.position.z = size * 0.55;
  return mesh;
}

/** Port Bx() — upper eyelid as partial sphere with skin material. */
export function buildEyelid(
  eyeLid: number,
  size: number,
  materials: BulalashkaMaterials,
): Mesh | null {
  if (eyeLid <= 0.02) return null;
  const geo = new SphereGeometry(size * 1.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const lid = new Mesh(geo, materials.skin);
  lid.name = 'eyelid';
  lid.rotation.x = -Math.PI * 0.12 * eyeLid;
  lid.position.z = size * 0.15;
  lid.userData.blinkWeight = eyeLid;
  return lid;
}

function addScleraOutline(sclera: Mesh, materials: BulalashkaMaterials): void {
  const hull = new Mesh(sclera.geometry.clone(), materials.outline);
  hull.scale.multiplyScalar(1.06);
  hull.name = 'sclera-outline';
  sclera.add(hull);
}

function antiPopPush(group: Group, anchor: SurfaceAnchor, size: number, skull: BulalashkaSkull): void {
  const maxZ = skull.bounds.maxZ + size * 0.15;
  group.updateMatrixWorld(true);
  const wp = new Vector3();
  group.getWorldPosition(wp);
  if (wp.z > maxZ) {
    const push = wp.z - maxZ;
    group.position.addScaledVector(anchor.normal, -push);
  }
}

/** Default ball style — single sclera sphere + pupil + lid. */
export function buildBallEye(
  plan: EyePlan,
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = new Group();
  group.name = 'eye-ball';
  orientPivot(group, anchor);

  const bulge = computeBulge(params, anchor, plan.size);
  const sclera = new Mesh(new SphereGeometry(plan.size, 14, 12), materials.eye);
  sclera.name = 'sclera';
  sclera.position.z = bulge;
  addScleraOutline(sclera, materials);

  const pupil = buildPupil(params.pupilShape, plan.pupilSize, materials);
  sclera.add(pupil);

  const lid = buildEyelid(params.eyeLid, plan.size, materials);
  if (lid) sclera.add(lid);

  group.add(sclera);
  antiPopPush(group, anchor, plan.size, skull);
  return group;
}

/** Cluster — several small spheres in one pivot. */
export function buildClusterEye(
  plans: EyePlan[],
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = new Group();
  group.name = 'eye-cluster';
  orientPivot(group, anchor);

  const cx = plans.reduce((s, p) => s + p.x, 0) / plans.length;
  const cy = plans.reduce((s, p) => s + p.y, 0) / plans.length;

  for (const plan of plans) {
    const local = new Vector3(plan.x - cx, plan.y - cy, 0);
    const subAnchor: SurfaceAnchor = {
      point: anchor.point.clone().add(local),
      normal: anchor.normal.clone(),
    };
    const bulge = computeBulge(params, subAnchor, plan.size) * (0.85 + plan.bulge * 0.2);
    const mini = new Mesh(new SphereGeometry(plan.size, 10, 8), materials.eye);
    mini.position.copy(local);
    mini.position.z = bulge;
    const pupil = buildPupil(params.pupilShape, plan.pupilSize * 0.9, materials);
    mini.add(pupil);
    group.add(mini);
  }

  const lid = buildEyelid(params.eyeLid, plans[0]?.size ?? params.eyeSize, materials);
  if (lid) group.add(lid);

  antiPopPush(group, anchor, params.eyeSize, skull);
  return group;
}

/** Hole — deep socket + tiny sphere inside. */
export function buildHoleEye(
  plan: EyePlan,
  anchor: SurfaceAnchor,
  params: BulalashkaEyeParams,
  materials: BulalashkaMaterials,
  skull: BulalashkaSkull,
): Group {
  const group = new Group();
  group.name = 'eye-hole';
  orientPivot(group, anchor);

  const tiny = plan.size * 0.35;
  const bulge = computeBulge(params, anchor, tiny) * 0.35;
  const sclera = new Mesh(new SphereGeometry(tiny, 10, 8), materials.eye);
  sclera.position.z = bulge;
  sclera.add(buildPupil(params.pupilShape, tiny * 0.55, materials));
  group.add(sclera);

  antiPopPush(group, anchor, tiny, skull);
  return group;
}
