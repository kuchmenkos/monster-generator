import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { orientPivot } from '../eyes/styles/shared';
import { recessSkullPatch } from '../eyes/socket';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnSurface } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { lighten } from '../palette';
import type { Rng } from '../rng';
import type { FaceLandmarks, MonsterPalette, NosePlan, NoseStyle } from '../types';

export function generateNosePlan(rng: Rng, landmarks: FaceLandmarks): NosePlan {
  const style = rng.pick<NoseStyle>(['nostril_slit', 'nostril_slit', 'nostril_slit', 'stalk', 'patch_bump', 'ridge']);
  return {
    style,
    x: rng.float(-0.025, 0.025),
    y: landmarks.noseY + rng.float(-0.015, 0.015),
    size: rng.float(0.014, 0.03),
    tilt: rng.float(-0.35, 0.35),
  };
}

/** Build nose mesh on skull front. */
export function buildNose(
  skull: BulalashkaSkull,
  plan: NosePlan,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
  landmarks: FaceLandmarks,
): Group {
  const root = new Group();
  root.name = 'nose';
  const anchor = anchorOnSurface(skull, plan.x, plan.y) ?? {
    point: new Vector3(plan.x, landmarks.noseY, skull.bounds.maxZ * 0.88),
    normal: new Vector3(0, 0, 1),
  };

  const pivot = new Group();
  orientPivot(pivot, anchor);
  root.add(pivot);

  const socketMat = materials.socket;
  const skinMat = materials.skin.clone();
  skinMat.color.setHex(lighten(palette.base, 0.08));

  switch (plan.style) {
    case 'nostril_slit': {
      const gap = plan.size * 0.55;
      for (const sx of [-gap, gap]) {
        const nostril = new Mesh(
          new BoxGeometry(plan.size * 0.4, plan.size * 1.5, plan.size * 0.55),
          socketMat,
        );
        nostril.position.set(sx, 0, plan.size * 0.12);
        pivot.add(nostril);
      }
      break;
    }
    case 'stalk': {
      const stem = new Mesh(
        new CylinderGeometry(plan.size * 0.25, plan.size * 0.35, plan.size * 2.2, 6),
        skinMat,
      );
      stem.position.z = plan.size * 0.8;
      stem.rotation.z = plan.tilt;
      stem.rotation.x = -0.4;
      pivot.add(stem);
      const tip = new Mesh(new SphereGeometry(plan.size * 0.4, 6, 4), socketMat);
      tip.position.set(
        Math.sin(plan.tilt) * plan.size,
        Math.cos(plan.tilt) * plan.size * 0.5,
        plan.size * 2,
      );
      pivot.add(tip);
      break;
    }
    case 'patch_bump': {
      recessSkullPatch(skull, plan.x, plan.y, plan.size * 1.2, plan.size, plan.size * 0.15);
      const bump = new Mesh(new SphereGeometry(plan.size * 0.9, 8, 6), skinMat);
      bump.position.z = plan.size * 0.35;
      pivot.add(bump);
      break;
    }
    case 'ridge': {
      recessSkullPatch(skull, plan.x, plan.y, plan.size * 2, plan.size * 0.8, plan.size * 0.12);
      const ridge = new Mesh(new BoxGeometry(plan.size * 1.8, plan.size * 0.5, plan.size * 0.35), skinMat);
      ridge.position.z = plan.size * 0.2;
      pivot.add(ridge);
      break;
    }
  }

  return root;
}
