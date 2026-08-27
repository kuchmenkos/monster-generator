import { BoxGeometry, CapsuleGeometry, Group, Mesh } from 'three';
import { recessSkullPatch } from '../eyes/socket';
import { anchorOnSurface } from '../mesh/bulalashkaSkull';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';
import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { FaceLandmarks } from '../face/landmarks';
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

export function generateMouthBundle(rng: Rng, landmarks: FaceLandmarks): MouthBundle {
  const style = rng.pick<MouthStyle>([
    'closed-line',
    'closed-line',
    'zigzag',
    'open-maw',
    'open-maw',
    'open-maw',
    'tongue-out',
    'tiny',
  ]);
  const curve = rng.pick<LipCurveKind>(['smile', 'scowl', 'wave', 'skew', 'flat']);
  const amp = rng.float(0.8, 2.4);
  const skew = rng.float(-1.2, 1.2);
  const midY = landmarks.mouthMidY + rng.float(-0.015, 0.015);
  const halfW = rng.float(0.1, 0.2) * (landmarks.faceHeight * 0.55);

  let openUp = 0;
  let openDown = 0;
  if (style === 'open-maw') {
    const open = rng.float(0.06, 0.14);
    openUp = open * 0.35;
    openDown = open * 0.65;
  } else if (style === 'tongue-out') {
    const open = rng.float(0.04, 0.09);
    openUp = open * 0.3;
    openDown = open * 0.7;
  }

  return {
    style,
    midX: rng.float(-0.03, 0.03),
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

/** Build volumetric mouth along lip curve — capsule chain + teeth row. */
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
  const gumColor = darken(palette.mouth, 0.35);
  const toothColor = lighten(darken(palette.eyeWhite, 0.08), 0.05) || 0xf2e6c8;

  const cavityDepth =
    bundle.style === 'open-maw'
      ? Math.max(0.04, bundle.openUp + bundle.openDown) * 0.55
      : Math.max(0.025, (bundle.openUp + bundle.openDown) * 0.45) + jawDrop * 0.015;

  recessSkullPatch(
    skull,
    bundle.midX,
    bundle.midY,
    bundle.halfW * 1.25,
    bundle.openUp + bundle.openDown + 0.05,
    cavityDepth,
  );

  const lipMat = materials.skin.clone();
  lipMat.color.setHex(mouthColor);
  const cavityMat = materials.socket.clone();
  cavityMat.color.setHex(cavityColor);
  const gumMat = materials.socket.clone();
  gumMat.color.setHex(gumColor);

  const segments = 12;
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * 2 - 1;
    const y = lipYAt(bundle.midY, t, bundle.curve, bundle.amp, bundle.skew);
    const x = bundle.midX + t * bundle.halfW;
    const taper = Math.sqrt(Math.max(0, 1 - t * t * 0.85));
    const localUp = bundle.openUp * taper;
    const localDown = bundle.openDown * taper;

    const anchor = anchorOnSurface(skull, x, y);
    if (!anchor) continue;
    const zOff = anchor.point.z - skull.bounds.maxZ * 0.02;

    const lipR = 0.014 + Math.abs(t) * 0.006 + (bundle.style === 'tiny' ? -0.004 : 0);

    if (bundle.style !== 'closed-line' || bundle.hasCavity) {
      const upper = new Mesh(new CapsuleGeometry(lipR, lipR * 1.6, 4, 8), lipMat);
      upper.position.set(x, y + localUp * 0.45, zOff);
      upper.rotation.x = Math.PI * 0.5;
      group.add(upper);

      const lower = new Mesh(new CapsuleGeometry(lipR * 0.92, lipR * 1.4, 4, 8), lipMat);
      lower.position.set(x, y - localDown * 0.45, zOff - 0.008);
      lower.rotation.x = Math.PI * 0.5;
      group.add(lower);
    } else {
      const ridge = new Mesh(new CapsuleGeometry(lipR * 0.7, lipR * 2.2, 3, 6), lipMat);
      ridge.position.set(x, y, zOff);
      ridge.rotation.z = Math.PI / 2;
      group.add(ridge);
    }

    if (localUp + localDown > 0.015) {
      const cavity = new Mesh(new CapsuleGeometry(lipR * 0.55, localUp + localDown + 0.02, 3, 6), cavityMat);
      cavity.position.set(x, y, zOff - cavityDepth * 0.35);
      cavity.rotation.x = Math.PI * 0.5;
      group.add(cavity);
    }
  }

  // Gum strip along upper jaw for open mouths
  if (bundle.openUp + bundle.openDown > 0.03) {
    for (let s = 1; s < segments; s += 2) {
      const t = (s / segments) * 2 - 1;
      const y = lipYAt(bundle.midY, t, bundle.curve, bundle.amp, bundle.skew) + bundle.openUp * 0.35;
      const x = bundle.midX + t * bundle.halfW;
      const gum = new Mesh(new BoxGeometry(bundle.halfW * 0.08, 0.008, 0.012), gumMat);
      gum.position.set(x, y, skull.bounds.maxZ * 0.9 - cavityDepth * 0.2);
      group.add(gum);
    }
  }

  if (bundle.style === 'open-maw' || bundle.style === 'zigzag') {
    const toothMat = materials.skin.clone();
    toothMat.color.setHex(toothColor);
    const toothCount = bundle.style === 'open-maw' ? rngToothCount(bundle) : 5;
    for (let i = 0; i < toothCount; i++) {
      const t = toothCount <= 1 ? 0 : (i / (toothCount - 1)) * 2 - 1;
      const y = lipYAt(bundle.midY, t, bundle.curve, bundle.amp, bundle.skew);
      const x = bundle.midX + t * bundle.halfW * 0.85;
      const zigzag = bundle.style === 'zigzag' && i % 2 === 0;
      const toothH = zigzag ? 0.022 : 0.016 + Math.abs(t) * 0.008;
      const tooth = new Mesh(new CapsuleGeometry(0.006, toothH, 3, 4), toothMat);
      tooth.position.set(x, y + bundle.openUp * 0.25, skull.bounds.maxZ * 0.93);
      tooth.rotation.x = -0.15;
      group.add(tooth);
    }
  }

  if (bundle.style === 'tongue-out') {
    const tongueMat = materials.skin.clone();
    tongueMat.color.setHex(palette.accent);
    const tongue = new Mesh(new CapsuleGeometry(0.016, 0.04, 5, 6), tongueMat);
    tongue.position.set(bundle.midX, bundle.midY - bundle.openDown - 0.035, skull.bounds.maxZ * 0.86);
    tongue.rotation.x = -0.25;
    group.add(tongue);
  }

  return group;
}

/** Deterministic tooth count from bundle geometry (no rng at build time). */
function rngToothCount(bundle: MouthBundle): number {
  const w = Math.round(bundle.halfW * 40);
  return Math.max(5, Math.min(9, 5 + (w % 5)));
}
