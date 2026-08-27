import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { recessSkullPatch } from '../eyes/socket';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnSurface, faceCenter } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { lighten } from '../palette';
import type { Rng } from '../rng';
import type { MonsterPalette, NosePlan, NoseStyle } from '../types';

export function generateNosePlan(
  rng: Rng,
  eyeY: number,
  mouthY: number,
): NosePlan {
  const style = rng.pick<NoseStyle>(['nostril_slit', 'nostril_slit', 'stalk', 'patch_bump']);
  const y = eyeY * 0.42 + mouthY * 0.58 + rng.float(-0.02, 0.02);
  return {
    style,
    x: rng.float(-0.03, 0.03),
    y,
    size: rng.float(0.012, 0.028),
    tilt: rng.float(-0.35, 0.35),
  };
}

/** Build nose mesh on skull front. */
export function buildNose(
  skull: BulalashkaSkull,
  plan: NosePlan,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
  eyeY: number,
  mouthY: number,
): Group {
  const group = new Group();
  group.name = 'nose';
  const center = faceCenter(skull, eyeY, mouthY);
  const anchor = anchorOnSurface(skull, plan.x, plan.y) ?? {
    point: center,
    normal: new Vector3(0, 0, 1),
  };

  const socketMat = materials.socket;
  const skinMat = materials.skin.clone();
  skinMat.color.setHex(lighten(palette.base, 0.08));

  switch (plan.style) {
    case 'nostril_slit': {
      const gap = plan.size * 0.55;
      for (const sx of [-gap, gap]) {
        const nostril = new Mesh(
          new BoxGeometry(plan.size * 0.35, plan.size * 1.4, plan.size * 0.5),
          socketMat,
        );
        nostril.position.set(plan.x + sx, plan.y, anchor.point.z + plan.size * 0.15);
        group.add(nostril);
      }
      break;
    }
    case 'stalk': {
      const stem = new Mesh(
        new CylinderGeometry(plan.size * 0.25, plan.size * 0.35, plan.size * 2.2, 6),
        skinMat,
      );
      stem.position.copy(anchor.point);
      stem.position.z += plan.size * 0.8;
      stem.rotation.z = plan.tilt;
      stem.rotation.x = -0.4;
      group.add(stem);
      const tip = new Mesh(new SphereGeometry(plan.size * 0.4, 6, 4), socketMat);
      tip.position.copy(stem.position);
      tip.position.x += Math.sin(plan.tilt) * plan.size;
      tip.position.y += Math.cos(plan.tilt) * plan.size * 0.5;
      tip.position.z += plan.size * 1.2;
      group.add(tip);
      break;
    }
    case 'patch_bump': {
      recessSkullPatch(skull, plan.x, plan.y, plan.size * 1.2, plan.size, plan.size * 0.15);
      const bump = new Mesh(new SphereGeometry(plan.size * 0.9, 8, 6), skinMat);
      bump.position.copy(anchor.point);
      bump.position.z += plan.size * 0.35;
      group.add(bump);
      break;
    }
    case 'ridge': {
      recessSkullPatch(skull, plan.x, plan.y, plan.size * 2, plan.size * 0.8, plan.size * 0.12);
      break;
    }
  }

  return group;
}
