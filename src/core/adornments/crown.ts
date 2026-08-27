import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnCrown } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { lighten } from '../palette';
import type { Rng } from '../rng';
import type { CrownPlan, CrownStyle, MonsterPalette } from '../types';

const CROWN_SCALE = 0.7;

export function generateCrownPlan(rng: Rng): CrownPlan {
  const style = rng.pick<CrownStyle>([
    'spikes',
    'spikes',
    'cloud_puff',
    'straw',
    'sprouts',
    'crystal',
  ]);
  const count =
    style === 'cloud_puff'
      ? rng.int(3, 5)
      : style === 'straw'
        ? rng.int(4, 7)
        : style === 'crystal'
          ? rng.int(2, 4)
          : rng.int(3, 5);
  return {
    style,
    count,
    spread: rng.float(0.3, 0.65),
    height: rng.float(0.05, 0.12) * CROWN_SCALE,
    sparkle: style === 'cloud_puff' || style === 'crystal' || rng.chance(0.25),
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
    const xNorm = t * plan.spread + Math.sin(i * 2.7) * 0.06;
    const anchor = anchorOnCrown(skull, xNorm);
    const h = plan.height * (0.65 + (i % 3) * 0.18);

    if (plan.style === 'spikes') {
      const spike = new Mesh(new ConeGeometry(h * 0.22, h, 5), skinMat);
      spike.position.copy(anchor.point);
      spike.position.y += h * 0.4;
      spike.rotation.z = t * 0.25;
      spike.rotation.x = -0.1;
      group.add(spike);
    } else if (plan.style === 'cloud_puff') {
      const stem = new Mesh(new CylinderGeometry(0.005, 0.008, h * 0.45, 4), skinMat);
      stem.position.copy(anchor.point);
      stem.position.y += h * 0.15;
      group.add(stem);
      const puff = new Mesh(new SphereGeometry(h * 0.38, 8, 6), hiMat);
      puff.position.copy(stem.position);
      puff.position.y += h * 0.42;
      puff.scale.set(1.1, 0.85, 0.9);
      group.add(puff);
      if (i % 2 === 0) {
        const puff2 = new Mesh(new SphereGeometry(h * 0.24, 6, 4), hiMat);
        puff2.position.copy(puff.position);
        puff2.position.x += h * 0.22;
        group.add(puff2);
      }
    } else if (plan.style === 'straw') {
      const straw = new Mesh(new CylinderGeometry(0.004, 0.006, h * (0.75 + (i % 2) * 0.35), 4), skinMat);
      straw.position.copy(anchor.point);
      straw.position.y += h * 0.32;
      straw.rotation.z = t * 0.4 + (i % 2 ? 0.25 : -0.18);
      straw.rotation.x = (i % 3) * 0.12 - 0.08;
      group.add(straw);
    } else if (plan.style === 'sprouts') {
      const sprout = new Mesh(new CylinderGeometry(0.007, 0.011, h, 5), skinMat);
      sprout.position.copy(anchor.point);
      sprout.position.y += h * 0.42;
      group.add(sprout);
      const leaf = new Mesh(new SphereGeometry(h * 0.18, 5, 4), hiMat);
      leaf.position.copy(sprout.position);
      leaf.position.y += h * 0.35;
      group.add(leaf);
    } else {
      const crystal = new Mesh(new ConeGeometry(0.01, h, 4), hiMat);
      crystal.position.copy(anchor.point);
      crystal.position.y += h * 0.42;
      crystal.rotation.z = t * 0.35;
      group.add(crystal);
    }
  }

  return group;
}
