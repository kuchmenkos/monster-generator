import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnCrown } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { lighten } from '../palette';
import type { Rng } from '../rng';
import type { CrownPlan, CrownStyle, MonsterPalette } from '../types';

export function generateCrownPlan(rng: Rng): CrownPlan {
  const style = rng.pick<CrownStyle>(['spikes', 'spikes', 'cloud_puff', 'straw', 'straw']);
  const count =
    style === 'cloud_puff'
      ? rng.int(4, 7)
      : style === 'straw'
        ? rng.int(4, 9)
        : rng.int(3, 6);
  return {
    style,
    count,
    spread: rng.float(0.35, 0.75),
    height: rng.float(0.06, 0.16),
    sparkle: style === 'cloud_puff' || style === 'crystal' || rng.chance(0.35),
  };
}

/** Build crown horns / hairs on skull top. */
export function buildCrown(
  skull: BulalashkaSkull,
  plan: CrownPlan,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
): Group {
  const group = new Group();
  group.name = 'crown';
  const skinMat = materials.skin.clone();
  const hiMat = materials.skin.clone();
  hiMat.color.setHex(lighten(palette.highlight, 0.12));

  for (let i = 0; i < plan.count; i++) {
    const t = plan.count <= 1 ? 0 : (i / (plan.count - 1)) * 2 - 1;
    const xNorm = t * plan.spread + (Math.sin(i * 2.7) * 0.08);
    const anchor = anchorOnCrown(skull, xNorm);
    const h = plan.height * (0.65 + (i % 3) * 0.2);

    if (plan.style === 'spikes') {
      const spikeR = h * 0.22;
      const spike = new Mesh(new ConeGeometry(spikeR, h, 5), skinMat);
      spike.position.copy(anchor.point);
      spike.position.y += h * 0.4;
      spike.rotation.z = t * 0.25;
      spike.rotation.x = -0.1;
      group.add(spike);
    } else if (plan.style === 'cloud_puff') {
      const stem = new Mesh(new CylinderGeometry(0.006, 0.01, h * 0.5, 4), skinMat);
      stem.position.copy(anchor.point);
      stem.position.y += h * 0.2;
      group.add(stem);
      const puff = new Mesh(new SphereGeometry(h * 0.35, 8, 6), hiMat);
      puff.position.copy(stem.position);
      puff.position.y += h * 0.45;
      puff.scale.set(1.1, 0.85, 0.9);
      group.add(puff);
      if (i % 2 === 0) {
        const puff2 = new Mesh(new SphereGeometry(h * 0.22, 6, 4), hiMat);
        puff2.position.copy(puff.position);
        puff2.position.x += h * 0.25;
        group.add(puff2);
      }
    } else if (plan.style === 'straw') {
      const straw = new Mesh(new CylinderGeometry(0.005, 0.007, h * (0.8 + (i % 2) * 0.4), 4), skinMat);
      straw.position.copy(anchor.point);
      straw.position.y += h * 0.35;
      straw.rotation.z = t * 0.4 + (i % 2 ? 0.3 : -0.2);
      straw.rotation.x = (i % 3) * 0.15 - 0.1;
      group.add(straw);
    } else if (plan.style === 'sprouts') {
      const sprout = new Mesh(new CylinderGeometry(0.008, 0.012, h, 5), skinMat);
      sprout.position.copy(anchor.point);
      sprout.position.y += h * 0.45;
      group.add(sprout);
    } else {
      const crystal = new Mesh(new ConeGeometry(0.012, h, 4), hiMat);
      crystal.position.copy(anchor.point);
      crystal.position.y += h * 0.45;
      crystal.rotation.z = t * 0.35;
      group.add(crystal);
    }
  }

  return group;
}
