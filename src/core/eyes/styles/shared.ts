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
const WP = new Vector3();

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

/** Upper + lower partial spheres for blink animation. */
export function buildEyelids(
  eyeLid: number,
  size: number,
  materials: BulalashkaMaterials,
): Mesh[] {
  if (eyeLid <= 0.02) return [];
  const lids: Mesh[] = [];

  const upperGeo = new SphereGeometry(size * 1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const upper = new Mesh(upperGeo, materials.skin);
  upper.name = 'eyelid';
  upper.rotation.x = -Math.PI * 0.14 * eyeLid;
  upper.position.z = size * 0.12;
  upper.userData.blinkWeight = eyeLid;
  upper.userData.lidRole = 'upper';
  lids.push(upper);

  const lowerGeo = new SphereGeometry(size * 1.05, 10, 6, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.35);
  const lower = new Mesh(lowerGeo, materials.skin);
  lower.name = 'eyelid';
  lower.rotation.x = Math.PI * 0.08 * eyeLid;
  lower.position.z = size * 0.08;
  lower.position.y = -size * 0.15;
  lower.userData.blinkWeight = eyeLid * 0.65;
  lower.userData.lidRole = 'lower';
  lids.push(lower);

  return lids;
}

/** Legacy single upper lid helper. */
export function buildEyelid(
  eyeLid: number,
  size: number,
  materials: BulalashkaMaterials,
): Mesh | null {
  const lids = buildEyelids(eyeLid, size, materials);
  return lids[0] ?? null;
}

function addScleraOutline(sclera: Mesh, materials: BulalashkaMaterials): void {
  const hull = new Mesh(sclera.geometry.clone(), materials.outline);
  hull.scale.multiplyScalar(1.06);
  hull.name = 'sclera-outline';
  sclera.add(hull);
}

/** Shrink bulge when protruding past silhouette instead of hard push. */
function antiPopPush(
  group: Group,
  anchor: SurfaceAnchor,
  size: number,
  skull: BulalashkaSkull,
  bulgeRef?: { value: number },
): void {
  const maxZ = skull.bounds.maxZ + size * 0.08;
  group.updateMatrixWorld(true);
  group.getWorldPosition(WP);
  if (WP.z > maxZ) {
    const over = (WP.z - maxZ) / Math.max(0.01, size);
    if (bulgeRef) bulgeRef.value *= Math.max(0.35, 1 - over * 0.6);
    group.position.addScaledVector(anchor.normal, -(WP.z - maxZ) * 0.45);
  }
}

/** Default ball style — single sclera sphere + pupil + lids. */
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

  const bulgeRef = { value: computeBulge(params, anchor, plan.size) };
  const sclera = new Mesh(new SphereGeometry(plan.size, 14, 12), materials.eye);
  sclera.name = 'sclera';
  sclera.position.z = bulgeRef.value;
  addScleraOutline(sclera, materials);

  const pupil = buildPupil(params.pupilShape, plan.pupilSize, materials);
  sclera.add(pupil);

  for (const lid of buildEyelids(params.eyeLid, plan.size, materials)) {
    sclera.add(lid);
  }

  group.add(sclera);
  antiPopPush(group, anchor, plan.size, skull, bulgeRef);
  sclera.position.z = bulgeRef.value;
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
    const bulge = computeBulge(params, subAnchor, plan.size) * (0.8 + plan.bulge * 0.15);
    const mini = new Mesh(new SphereGeometry(plan.size, 10, 8), materials.eye);
    mini.position.copy(local);
    mini.position.z = bulge;
    const pupil = buildPupil(params.pupilShape, plan.pupilSize * 0.9, materials);
    mini.add(pupil);
    group.add(mini);
  }

  for (const lid of buildEyelids(params.eyeLid, plans[0]?.size ?? params.eyeSize, materials)) {
    group.add(lid);
  }

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

  const pitMat = materials.socket.clone();
  const pit = new Mesh(new SphereGeometry(plan.size * 0.85, 10, 8), pitMat);
  pit.position.z = -plan.size * 0.15;
  pit.scale.set(1, 1, 0.55);
  group.add(pit);

  const tiny = plan.size * 0.32;
  const bulgeRef = { value: computeBulge(params, anchor, tiny) * 0.25 };
  const sclera = new Mesh(new SphereGeometry(tiny, 10, 8), materials.eye);
  sclera.position.z = bulgeRef.value;
  sclera.add(buildPupil(params.pupilShape, tiny * 0.55, materials));
  group.add(sclera);

  for (const lid of buildEyelids(params.eyeLid, plan.size, materials)) {
    group.add(lid);
  }

  antiPopPush(group, anchor, plan.size, skull, bulgeRef);
  return group;
}
