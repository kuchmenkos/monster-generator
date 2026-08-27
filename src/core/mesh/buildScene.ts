import { Group, Mesh } from 'three';
import { buildHeadAdornments } from '../adornments';
import {
  buildBeadEye,
  buildBulbEye,
  buildClusterEye,
  buildPitEye,
  buildStalkEye,
} from '../eyes/styles/extra';
import { buildBallEye, buildHoleEye } from '../eyes/styles/shared';
import { solveEyeLayout } from '../eyes/layout';
import { carveSocketPatch, recessSkullPatch } from '../eyes/socket';
import { buildVolumetricMouth } from '../mouth';
import { anchorOnSurface, buildBodyOutline, buildBulalashkaSkull } from './bulalashkaSkull';
import { buildMeshButt } from './buttMesh';
import { createBulalashkaMaterials, type BulalashkaMaterials } from './materials';
import { applyMeshPatternsToSkull, countVertexColorSteps } from './meshPatterns';
import type { Blob, MeshBundle, MonsterPalette } from '../types';

export interface BulalashkaSceneResult {
  root: Group;
  materials: BulalashkaMaterials;
  eyelids: Mesh[];
  pupils: Mesh[];
  sparkles: Mesh[];
}

export interface BuildSceneOptions {
  subdivisions?: number;
}

/** Full HEADDDS-style mesh scene — body, patterns, mouth, butt, eyes. */
export function buildBulalashkaScene(
  blobs: Blob[],
  palette: MonsterPalette,
  bundle: MeshBundle,
  buttArchetype: import('../types').ButtArchetype,
  options: BuildSceneOptions = {},
): BulalashkaSceneResult {
  const ve = bundle.volumetricEyes;
  const skull = buildBulalashkaSkull(blobs, ve.skullParams, { subdivisions: options.subdivisions });
  const materials = createBulalashkaMaterials(palette);
  const root = new Group();
  root.name = 'bulalashka-scene';

  applyMeshPatternsToSkull(skull, palette, bundle.patternKind as import('./meshPatterns').MeshPatternKind);
  const patternKind = bundle.patternKind;

  const skinMesh = new Mesh(skull.geometry, materials.skin);
  skinMesh.name = 'skull-skin';
  root.add(skinMesh);
  root.add(buildBodyOutline(skull, materials));

  const mouthGroup = buildVolumetricMouth(
    skull,
    bundle.mouth,
    palette,
    materials,
    ve.skullParams.jawDrop,
  );
  root.add(mouthGroup);

  const { group: adornmentGroup, sparkles } = buildHeadAdornments(
    skull,
    bundle.adornments,
    palette,
    materials,
    ve.params.eyeY,
    bundle.mouth.midY,
  );
  root.add(adornmentGroup);

  const { group: buttGroup, protrusion } = buildMeshButt(skull, buttArchetype, palette, materials);
  root.add(buttGroup);

  const { plans, silhouetteClip } = solveEyeLayout(
    ve.params,
    ve.plans.map((p) => ({ ...p })),
    skull,
    ve.mouthFloorY,
  );

  const eyelids: Mesh[] = [];
  const pupils: Mesh[] = [];
  let socketDepthSum = 0;
  let socketCount = 0;
  let bulgeSum = 0;

  const addEye = (eye: Group) => {
    root.add(eye);
    eye.traverse((o) => {
      if (o instanceof Mesh) {
        if (o.name === 'eyelid') eyelids.push(o);
        if (o.name === 'pupil') pupils.push(o);
      }
    });
  };

  const style = ve.params.eyeStyle;
  if (style === 'cluster') {
    const cx = plans.reduce((s, p) => s + p.x, 0) / plans.length;
    const cy = plans.reduce((s, p) => s + p.y, 0) / plans.length;
    const maxR = Math.max(...plans.map((p) => p.rx)) * 1.45;
    recessSkullPatch(skull, cx, cy, maxR, maxR * 0.85, ve.params.eyeSize * 0.35);
    const sock = carveSocketPatch(skull, cx, cy, maxR, maxR * 0.85, ve.params.eyeSize * 0.28, 3, materials);
    root.add(sock.mesh);
    socketDepthSum += sock.depth;
    socketCount++;
    const anchor = anchorOnSurface(skull, cx, cy)!;
    addEye(buildClusterEye(plans, anchor, ve.params, materials, skull));
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
      switch (style) {
        case 'hole':
          eye = buildHoleEye(plan, anchor, ve.params, materials, skull);
          break;
        case 'bead':
          eye = buildBeadEye(plan, anchor, ve.params, materials, skull);
          break;
        case 'stalk':
          eye = buildStalkEye(plan, anchor, ve.params, materials, skull);
          break;
        case 'pit':
          eye = buildPitEye(plan, anchor, ve.params, materials, skull);
          break;
        case 'bulb':
          eye = buildBulbEye(plan, anchor, ve.params, materials, skull);
          break;
        default:
          eye = buildBallEye(plan, anchor, ve.params, materials, skull);
      }
      addEye(eye);
      bulgeSum += plan.bulge;
    }
  }

  bundle.metrics = {
    eyeCount: plans.length,
    avgBulge: plans.length ? bulgeSum / plans.length : 0,
    socketDepth: socketCount ? socketDepthSum / socketCount : 0,
    silhouetteClip,
    mouthCavity: bundle.mouth.hasCavity || bundle.mouth.openUp + bundle.mouth.openDown > 0.02,
    buttProtrusion: protrusion,
    vertexColorSteps: countVertexColorSteps(skull),
    patternKind,
    hasNose: bundle.adornments.nose.size > 0,
    earCount: bundle.adornments.ears.length,
    crownCount: bundle.adornments.crown.count,
    earSilhouetteClip: bundle.adornments.earSilhouetteClip,
    sparkleCount: bundle.adornments.sparkles.count,
  };

  ve.metrics = {
    eyeCount: plans.length,
    avgBulge: bundle.metrics.avgBulge,
    socketDepth: bundle.metrics.socketDepth,
    silhouetteClip,
  };

  return { root, materials, eyelids, pupils, sparkles };
}

export { layoutEyes, solveEyeLayout } from '../eyes/layout';
