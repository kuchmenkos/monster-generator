import { Group, Mesh, SphereGeometry } from 'three';
import { recessSkullPatch } from '../eyes/socket';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { LipCurveKind, MonsterPalette, MouthBundle, MouthStyle } from '../types';

function lipYAt(
  midY: number,
  t: number,
  kind: LipCurveKind,
  amp: number,
  skew: number,
): number {
  let bend = 0;
  switch (kind) {
    case 'smile':
      bend = -(1 - t * t) * amp * 0.04;
      break;
    case 'scowl':
      bend = (1 - t * t) * amp * 0.04;
      break;
    case 'wave':
      bend = Math.sin(t * Math.PI) * amp * 0.035;
      break;
    case 'skew':
      bend = t * skew * amp * 0.03;
      break;
    default:
      bend = t * skew * 0.01;
      break;
  }
  return midY + bend;
}

export function generateMouthBundle(
  rng: Rng,
  mouthFloorY: number,
  eyeY: number,
): MouthBundle {
  const style = rng.pick<MouthStyle>([
    'closed-line',
    'closed-line',
    'zigzag',
    'open-maw',
    'open-maw',
    'tongue-out',
    'tiny',
  ]);
  const curve = rng.pick<LipCurveKind>(['smile', 'scowl', 'wave', 'skew', 'flat']);
  const amp = rng.float(0.8, 2.4);
  const skew = rng.float(-1.2, 1.2);
  const midY = mouthFloorY + (eyeY - mouthFloorY) * rng.float(0.15, 0.35);
  const halfW = rng.float(0.08, 0.18);

  let openUp = 0;
  let openDown = 0;
  if (style === 'open-maw') {
    const open = rng.float(0.06, 0.14);
    openUp = open * 0.35;
    openDown = open * 0.65;
  } else if (style === 'tongue-out') {
    const open = rng.float(0.04, 0.08);
    openUp = open * 0.3;
    openDown = open * 0.7;
  }

  return {
    style,
    midX: rng.float(-0.04, 0.04),
    midY,
    halfW,
    openUp,
    openDown,
    curve,
    amp,
    skew,
    hasCavity: style !== 'closed-line' || rng.chance(0.55),
  };
}

/** Build volumetric mouth meshes on skull front. */
export function buildVolumetricMouth(
  skull: BulalashkaSkull,
  bundle: MouthBundle,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
  jawDrop: number,
): Group {
  const group = new Group();
  group.name = 'mouth';

  const mouthColor = darken(palette.mouth, 0.2);
  const cavityColor = darken(palette.mouth, 0.45);
  const toothColor = lighten(darken(palette.eyeWhite, 0.08), 0.05) || 0xf2e6c8;

  recessSkullPatch(
    skull,
    bundle.midX,
    bundle.midY,
    bundle.halfW * 1.2,
    bundle.openUp + bundle.openDown + 0.04,
    0.025 + jawDrop * 0.015,
  );

  const lipMat = materials.skin.clone();
  lipMat.color.setHex(mouthColor);
  const cavityMat = materials.skin.clone();
  cavityMat.color.setHex(cavityColor);

  const segments = 10;
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * 2 - 1;
    const y = lipYAt(bundle.midY, t, bundle.curve, bundle.amp, bundle.skew);
    const x = bundle.midX + t * bundle.halfW;
    const lipR = 0.018 + Math.abs(t) * 0.008;

    const upper = new Mesh(
      new SphereGeometry(lipR, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      lipMat,
    );
    upper.position.set(x, y + bundle.openUp * 0.5, skull.bounds.maxZ * 0.92);
    upper.rotation.x = Math.PI * 0.15;
    group.add(upper);

    const lower = new Mesh(
      new SphereGeometry(lipR * 0.9, 8, 6, Math.PI * 0.5, Math.PI * 2, 0, Math.PI * 0.5),
      lipMat,
    );
    lower.position.set(x, y - bundle.openDown * 0.5, skull.bounds.maxZ * 0.9);
    lower.rotation.x = -Math.PI * 0.12;
    group.add(lower);

    if (bundle.openUp + bundle.openDown > 0.02) {
      const cavity = new Mesh(new SphereGeometry(lipR * 0.75, 6, 4), cavityMat);
      cavity.position.set(x, y, skull.bounds.maxZ * 0.88 - bundle.openDown * 0.3);
      cavity.scale.set(1, 1 + (bundle.openUp + bundle.openDown) * 8, 0.6);
      group.add(cavity);
    }
  }

  if (bundle.style === 'open-maw' || bundle.style === 'zigzag') {
    const toothMat = materials.skin.clone();
    toothMat.color.setHex(toothColor);
    for (let i = -2; i <= 2; i += 2) {
      const t = i / 3;
      const y = lipYAt(bundle.midY, t, bundle.curve, bundle.amp, bundle.skew);
      const tooth = new Mesh(new SphereGeometry(0.012, 6, 4), toothMat);
      tooth.position.set(bundle.midX + t * bundle.halfW * 0.7, y + bundle.openUp * 0.3, skull.bounds.maxZ * 0.95);
      tooth.scale.set(0.8, 1.4, 0.7);
      group.add(tooth);
    }
  }

  if (bundle.style === 'tongue-out') {
    const tongueMat = materials.skin.clone();
    tongueMat.color.setHex(palette.accent);
    const tongue = new Mesh(new SphereGeometry(0.022, 8, 6), tongueMat);
    tongue.position.set(bundle.midX, bundle.midY - bundle.openDown - 0.04, skull.bounds.maxZ * 0.88);
    tongue.scale.set(1.2, 1.6, 0.8);
    group.add(tongue);
  }

  return group;
}
