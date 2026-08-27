import { Group, Mesh } from 'three';
import type { Blob } from '../types';
import { buildBulalashkaSkull, type BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { createBulalashkaMaterials, type BulalashkaMaterials } from '../mesh/materials';
import { layoutEyes, solveEyeLayout } from './layout';
import { carveSocketPatch, recessSkullPatch } from './socket';
import { buildBallEye, buildClusterEye, buildHoleEye } from './styles/shared';
import type { Rng } from '../rng';
import type {
  BulalashkaEyeParams,
  BulalashkaSkullParams,
  MonsterPalette,
  VolumetricEyeBundle,
  VolumetricEyeMetrics,
} from '../types';
import { anchorOnSurface } from '../mesh/bulalashkaSkull';

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
    eyeLayout === 'cluster' ? ['cluster', 'cluster', 'ball'] : ['ball', 'ball', 'hole', 'cluster'];
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

export interface VolumetricEyeScene {
  root: Group;
  skull: BulalashkaSkull;
  materials: BulalashkaMaterials;
  eyelids: Mesh[];
}

/** Build Three.js eye assembly + skull for detail renderer. */
export function buildVolumetricEyeScene(
  blobs: Blob[],
  palette: MonsterPalette,
  bundle: VolumetricEyeBundle,
  mouthFloorY: number,
): VolumetricEyeScene {
  const skull = buildBulalashkaSkull(blobs, bundle.skullParams);
  const materials = createBulalashkaMaterials(palette);
  const root = new Group();
  root.name = 'bulalashka-volumetric';

  const skullMesh = new Mesh(skull.geometry, materials.skin);
  skullMesh.name = 'skull-skin';
  root.add(skullMesh);

  const { plans, silhouetteClip } = solveEyeLayout(
    bundle.params,
    bundle.plans.map((p) => ({ ...p })),
    skull,
    mouthFloorY,
  );

  const eyelids: Mesh[] = [];
  let socketDepthSum = 0;
  let socketCount = 0;
  let bulgeSum = 0;

  if (bundle.params.eyeStyle === 'cluster') {
    const cx = plans.reduce((s, p) => s + p.x, 0) / plans.length;
    const cy = plans.reduce((s, p) => s + p.y, 0) / plans.length;
    const maxR = Math.max(...plans.map((p) => p.rx)) * 1.45;
    recessSkullPatch(skull, cx, cy, maxR, maxR * 0.85, bundle.params.eyeSize * 0.35);
    const sock = carveSocketPatch(
      skull,
      cx,
      cy,
      maxR,
      maxR * 0.85,
      bundle.params.eyeSize * 0.28,
      3,
      materials,
    );
    root.add(sock.mesh);
    socketDepthSum += sock.depth;
    socketCount++;

    const anchor = anchorOnSurface(skull, cx, cy)!;
    const cluster = buildClusterEye(plans, anchor, bundle.params, materials, skull);
    root.add(cluster);
    for (const c of cluster.children) {
      if ((c as Mesh).name === 'eyelid') eyelids.push(c as Mesh);
    }
    bulgeSum = plans.reduce((s, p) => s + p.bulge, 0);
  } else {
    for (const plan of plans) {
      recessSkullPatch(skull, plan.x, plan.y, plan.rx * 1.45, plan.ry * 1.35, plan.size * 0.32);
      const sock = carveSocketPatch(
        skull,
        plan.x,
        plan.y,
        plan.rx * 1.45,
        plan.ry * 1.35,
        plan.size * 0.3,
        3,
        materials,
      );
      root.add(sock.mesh);
      socketDepthSum += sock.depth;
      socketCount++;

      const anchor = anchorOnSurface(skull, plan.x, plan.y)!;
      let eye: Group;
      if (bundle.params.eyeStyle === 'hole') {
        eye = buildHoleEye(plan, anchor, bundle.params, materials, skull);
      } else {
        eye = buildBallEye(plan, anchor, bundle.params, materials, skull);
      }
      root.add(eye);
      eye.traverse((o) => {
        if (o instanceof Mesh && o.name === 'eyelid') eyelids.push(o);
      });
      bulgeSum += plan.bulge;
    }
  }

  bundle.metrics = {
    eyeCount: plans.length,
    avgBulge: plans.length ? bulgeSum / plans.length : 0,
    socketDepth: socketCount ? socketDepthSum / socketCount : 0,
    silhouetteClip,
  };

  return { root, skull, materials, eyelids };
}

/** Pure-data bundle for MonsterData (no Three.js objects). */
export function buildVolumetricEyeBundle(
  rng: Rng,
  blobs: Blob[],
  bodyArchetype: string,
  variantSeed: string,
  mouthFloorY: number,
): VolumetricEyeBundle {
  const params = generateEyeParams(rng, bodyArchetype);
  const skullParams = generateSkullParams(rng);
  const plans = layoutEyes(params, rng);

  // Dry-run solver using temporary skull for metrics/plan adjustment
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

// Re-export layout for tests
export { layoutEyes, solveEyeLayout } from './layout';
