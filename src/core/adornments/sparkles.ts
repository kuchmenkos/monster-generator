import { Group, Mesh, SphereGeometry } from 'three';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { lighten } from '../palette';
import type { Rng } from '../rng';
import type { CrownPlan, MonsterPalette, SparklePlan } from '../types';

export function generateSparklePlan(rng: Rng, crown: CrownPlan): SparklePlan {
  if (!crown.sparkle) return { count: 0, radius: 0, y: 0 };
  return {
    count: rng.int(3, 8),
    radius: rng.float(0.05, 0.12),
    y: rng.float(0.04, 0.12),
  };
}

/** Tiny accent spheres parented to crown group. */
export function buildSparkles(
  _skull: BulalashkaSkull,
  plan: SparklePlan,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
  crownGroup: Group,
): { group: Group; meshes: Mesh[] } {
  const group = new Group();
  group.name = 'sparkles';
  const meshes: Mesh[] = [];

  if (plan.count <= 0) return { group, meshes };

  const mat = materials.skin.clone();
  mat.color.setHex(lighten(palette.accent2, 0.2));

  crownGroup.updateMatrixWorld(true);
  group.position.set(0, plan.y, 0);
  crownGroup.add(group);

  for (let i = 0; i < plan.count; i++) {
    const a = (i / plan.count) * Math.PI * 2;
    const r = plan.radius * (0.35 + (i % 3) * 0.18);
    const sparkle = new Mesh(new SphereGeometry(0.005 + (i % 2) * 0.002, 4, 3), mat);
    sparkle.position.set(Math.cos(a) * r, Math.sin(i * 1.3) * 0.015, Math.sin(a) * r * 0.25);
    sparkle.name = 'sparkle';
    sparkle.userData.phase = i * 0.7;
    sparkle.userData.baseY = sparkle.position.y;
    group.add(sparkle);
    meshes.push(sparkle);
  }

  return { group, meshes };
}
