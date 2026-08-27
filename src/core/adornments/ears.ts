import { CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import { orientPivot } from '../eyes/styles/shared';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnSide, silhouetteWidthAtY } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import type { Rng } from '../rng';
import type { EarPlan, EarStyle, MonsterPalette } from '../types';

function clipEarToSilhouette(skull: BulalashkaSkull, plan: EarPlan): number {
  const room = silhouetteWidthAtY(skull, plan.y);
  const extent = Math.abs(plan.x) + plan.length * 0.5;
  if (extent <= room) return 0;
  const over = extent - room;
  plan.length *= Math.max(0.5, 1 - over / Math.max(0.01, plan.length));
  return Math.min(1, over / Math.max(0.01, room));
}

export function layoutEars(rng: Rng, skull: BulalashkaSkull, eyeY: number): { ears: EarPlan[]; clip: number } {
  const style = rng.pick<EarStyle>(['lobe', 'lobe', 'stub', 'stub']);
  const baseY = eyeY * 0.55 + skull.bounds.minY * 0.25 + rng.float(0, 0.08);
  const yNorm = (baseY - skull.bounds.minY) / Math.max(0.01, skull.bounds.maxY - skull.bounds.minY);

  const ears: EarPlan[] = [];
  let totalClip = 0;

  for (const side of [-1, 1] as const) {
    const anchor = anchorOnSide(skull, side, yNorm);
    const asym = side < 0 ? rng.float(0.85, 1.15) : rng.float(0.7, 1.25);
    const plan: EarPlan = {
      style,
      side,
      x: anchor.point.x,
      y: anchor.point.y,
      length: rng.float(0.04, 0.09) * asym,
      width: rng.float(0.025, 0.05) * asym,
      tipAccent: rng.chance(0.45),
    };
    totalClip += clipEarToSilhouette(skull, plan);
    ears.push(plan);
  }

  return { ears, clip: ears.length ? totalClip / ears.length : 0 };
}

/** Build asymmetric ear pair. */
export function buildEars(
  skull: BulalashkaSkull,
  plans: EarPlan[],
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
): Group {
  const group = new Group();
  group.name = 'ears';

  for (const plan of plans) {
    const yNorm = (plan.y - skull.bounds.minY) / Math.max(0.01, skull.bounds.maxY - skull.bounds.minY);
    const anchor = anchorOnSide(skull, plan.side, yNorm);
    const pivot = new Group();
    pivot.name = `ear-${plan.side}`;
    orientPivot(pivot, anchor);

    const skinMat = materials.skin.clone();

    if (plan.style === 'lobe') {
      const lobe = new Mesh(
        new SphereGeometry(plan.width, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65),
        skinMat,
      );
      lobe.scale.set(1, plan.length / Math.max(0.01, plan.width), 0.65);
      lobe.position.set(0, 0, plan.width * 0.35);
      pivot.add(lobe);
    } else {
      const stub = new Mesh(
        new CylinderGeometry(plan.width * 0.5, plan.width * 0.7, plan.length, 6),
        skinMat,
      );
      stub.rotation.x = Math.PI / 2;
      stub.position.set(0, 0, plan.length * 0.45);
      pivot.add(stub);
      if (plan.tipAccent) {
        const tipMat = materials.skin.clone();
        tipMat.color.setHex(palette.buttHighlight);
        const tip = new Mesh(new SphereGeometry(plan.width * 0.45, 6, 4), tipMat);
        tip.position.set(0, 0, plan.length * 0.85);
        pivot.add(tip);
      }
    }

    group.add(pivot);
  }

  return group;
}
