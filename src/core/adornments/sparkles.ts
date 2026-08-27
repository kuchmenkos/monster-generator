import { Group, Mesh, SphereGeometry } from 'three';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { lighten } from '../palette';
import type { Rng } from '../rng';
import type { MonsterPalette, SparklePlan } from '../types';

export function generateSparklePlan(rng: Rng, crownSparkle: boolean): SparklePlan {
  if (!crownSparkle) return { count: 0, radius: 0, y: 0 };
  return {
    count: rng.int(3, 10),
    radius: rng.float(0.06, 0.14),
    y: rng.float(0.05, 0.15),
  };
}

/** Tiny accent spheres near crown — animated in BulalashkaSceneView. */
export function buildSparkles(
  skull: BulalashkaSkull,
  plan: SparklePlan,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
): { group: Group; meshes: Mesh[] } {
  const group = new Group();
  group.name = 'sparkles';
  const meshes: Mesh[] = [];

  if (plan.count <= 0) return { group, meshes };

  const mat = materials.skin.clone();
  mat.color.setHex(lighten(palette.accent2, 0.2));
  const cy = skull.bounds.maxY + plan.y * 0.5;

  for (let i = 0; i < plan.count; i++) {
    const a = (i / plan.count) * Math.PI * 2;
    const r = plan.radius * (0.4 + (i % 3) * 0.2);
    const sparkle = new Mesh(new SphereGeometry(0.006 + (i % 2) * 0.003, 4, 3), mat);
    sparkle.position.set(Math.cos(a) * r, cy + Math.sin(i * 1.3) * 0.02, Math.sin(a) * r * 0.5);
    sparkle.name = 'sparkle';
    sparkle.userData.phase = i * 0.7;
    sparkle.userData.baseY = sparkle.position.y;
    group.add(sparkle);
    meshes.push(sparkle);
  }

  return { group, meshes };
}

export function generateSparklePlanFromRng(rng: Rng, crownSparkle: boolean): SparklePlan {
  return generateSparklePlan(rng, crownSparkle);
}
