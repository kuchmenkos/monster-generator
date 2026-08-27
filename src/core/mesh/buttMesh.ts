import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
} from 'three';
import type { BulalashkaSkull } from './bulalashkaSkull';
import type { BulalashkaMaterials } from './materials';
import type { ButtArchetype, MonsterPalette } from '../types';
import { lighten } from '../palette';
import type { Rng } from '../rng';

/** Rear butt shelf — mesh port of grid butt.ts archetypes. */
export function buildMeshButt(
  skull: BulalashkaSkull,
  archetype: ButtArchetype,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
  rng?: Rng,
): { group: Group; protrusion: number } {
  const group = new Group();
  group.name = 'butt';

  const b = skull.bounds;
  const rearZ = b.minZ;
  const cy = (b.minY + b.maxY) * 0.35;
  const spread = (b.maxX - b.minX) * 0.22;

  const buttMat = materials.skin.clone();
  buttMat.color.setHex(palette.buttBase);
  const shadowMat = materials.skin.clone();
  shadowMat.color.setHex(palette.buttShadow);
  const hiMat = materials.skin.clone();
  hiMat.color.setHex(lighten(palette.buttHighlight, 0.08));

  let protrusion = 0.14;

  switch (archetype) {
    case 'peach':
      protrusion = addPeachButt(group, rearZ, cy, spread, buttMat, shadowMat);
      break;
    case 'heart_patch':
      protrusion = addPeachButt(group, rearZ, cy, spread, buttMat, shadowMat);
      addHeartPatch(group, rearZ, cy, spread, hiMat);
      break;
    case 'bunny_tail':
      protrusion = addPeachButt(group, rearZ, cy, spread * 0.85, buttMat, shadowMat);
      protrusion = Math.max(protrusion, addBunnyTail(group, rearZ, cy, palette, materials));
      break;
    case 'wide_sploot':
      protrusion = addWideSploot(group, rearZ, cy, spread, buttMat, shadowMat);
      break;
    case 'glossy_meme':
      protrusion = addPeachButt(group, rearZ, cy, spread, buttMat, shadowMat);
      addGlossHighlight(group, rearZ, cy, spread, hiMat);
      if (rng) addSparkles(group, rearZ, cy, spread, hiMat, rng.int(4, 7));
      break;
    case 'tail_nub':
      protrusion = addPeachButt(group, rearZ, cy, spread * 0.9, buttMat, shadowMat);
      protrusion = Math.max(protrusion, addTailNub(group, rearZ, cy, buttMat));
      break;
    case 'duck_round':
      protrusion = addDuckRound(group, rearZ, cy, spread, buttMat);
      break;
    case 'deep_dimple':
      protrusion = addPeachButt(group, rearZ, cy, spread, buttMat, shadowMat);
      addDimple(group, rearZ, cy, shadowMat);
      break;
    case 'puffy_cloud':
      protrusion = addPuffyCloud(group, rearZ, cy, spread, buttMat, hiMat);
      break;
    case 'sparkle_cute':
      protrusion = addPeachButt(group, rearZ, cy, spread, buttMat, shadowMat);
      if (rng) addSparkles(group, rearZ, cy, spread, hiMat, rng.int(5, 9));
      break;
    default:
      protrusion = addPeachButt(group, rearZ, cy, spread, buttMat, shadowMat);
  }

  return { group, protrusion };
}

function addPeachButt(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  buttMat: import('three').Material,
  shadowMat: import('three').Material,
): number {
  const rx = spread * 0.95;
  const ry = spread * 0.75;
  const rz = spread * 0.7;

  for (const side of [-1, 1]) {
    const lobe = new Mesh(new SphereGeometry(1, 12, 10), buttMat);
    lobe.scale.set(rx, ry, rz);
    lobe.position.set(side * rx * 0.55, cy, rearZ - rz * 0.5);
    group.add(lobe);
  }

  const cleft = new Mesh(new BoxGeometry(spread * 0.08, ry * 1.4, rz * 0.35), shadowMat);
  cleft.position.set(0, cy, rearZ - rz * 0.25);
  group.add(cleft);

  return rz + Math.abs(rearZ - (rearZ - rz * 0.5));
}

function addHeartPatch(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  hiMat: import('three').Material,
): void {
  const heart = new Mesh(new SphereGeometry(spread * 0.35, 10, 8), hiMat);
  heart.position.set(0, cy + spread * 0.15, rearZ - spread * 0.15);
  heart.scale.set(1.1, 0.95, 0.45);
  group.add(heart);
}

function addBunnyTail(
  group: Group,
  rearZ: number,
  cy: number,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
): number {
  const fluffMat = materials.skin.clone();
  fluffMat.color.setHex(lighten(palette.buttHighlight, 0.1));
  const positions = [
    [0, cy + 0.06, rearZ - 0.14],
    [-0.04, cy + 0.04, rearZ - 0.12],
    [0.04, cy + 0.05, rearZ - 0.11],
    [0, cy + 0.08, rearZ - 0.1],
  ];
  for (const [x, y, z] of positions) {
    const puff = new Mesh(new SphereGeometry(0.045, 8, 6), fluffMat);
    puff.position.set(x!, y!, z!);
    group.add(puff);
  }
  return 0.18;
}

function addWideSploot(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  buttMat: import('three').Material,
  shadowMat: import('three').Material,
): number {
  const shelf = new Mesh(new SphereGeometry(1, 12, 8), buttMat);
  shelf.scale.set(spread * 1.6, spread * 0.55, spread * 0.85);
  shelf.position.set(0, cy - spread * 0.1, rearZ - spread * 0.35);
  group.add(shelf);
  const rim = new Mesh(new BoxGeometry(spread * 2.8, spread * 0.12, spread * 0.2), shadowMat);
  rim.position.set(0, cy - spread * 0.35, rearZ - spread * 0.2);
  group.add(rim);
  return spread * 0.85;
}

function addGlossHighlight(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  hiMat: import('three').Material,
): void {
  const blob = new Mesh(new SphereGeometry(spread * 0.22, 8, 6), hiMat);
  blob.position.set(spread * 0.25, cy + spread * 0.2, rearZ - spread * 0.08);
  blob.scale.set(1.2, 0.8, 0.5);
  group.add(blob);
}

function addSparkles(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  hiMat: import('three').Material,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const sparkle = new Mesh(new SphereGeometry(0.012, 4, 3), hiMat);
    sparkle.position.set(
      Math.cos(a) * spread * 0.5,
      cy + Math.sin(i * 1.7) * spread * 0.2,
      rearZ - spread * 0.05 + Math.sin(a) * 0.03,
    );
    group.add(sparkle);
  }
}

function addTailNub(
  group: Group,
  rearZ: number,
  cy: number,
  buttMat: import('three').Material,
): number {
  const nub = new Mesh(new CylinderGeometry(0.025, 0.035, 0.06, 6), buttMat);
  nub.rotation.x = Math.PI / 2;
  nub.position.set(0, cy + 0.05, rearZ - 0.12);
  group.add(nub);
  return 0.1;
}

function addDuckRound(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  buttMat: import('three').Material,
): number {
  const oval = new Mesh(new SphereGeometry(1, 14, 10), buttMat);
  oval.scale.set(spread * 1.35, spread * 0.85, spread * 0.95);
  oval.position.set(0, cy, rearZ - spread * 0.4);
  group.add(oval);
  return spread * 0.95;
}

function addDimple(
  group: Group,
  rearZ: number,
  cy: number,
  shadowMat: import('three').Material,
): void {
  const dimple = new Mesh(new SphereGeometry(0.035, 8, 6), shadowMat);
  dimple.position.set(0, cy, rearZ - 0.04);
  dimple.scale.set(1, 1, 0.35);
  group.add(dimple);
}

function addPuffyCloud(
  group: Group,
  rearZ: number,
  cy: number,
  spread: number,
  buttMat: import('three').Material,
  hiMat: import('three').Material,
): number {
  const puffs = [
    [0, 0, 0.85],
    [-0.35, 0.05, 0.65],
    [0.32, -0.04, 0.7],
    [0.08, 0.12, 0.55],
  ];
  for (const [ox, oy, sc] of puffs) {
    const mat = sc > 0.75 ? hiMat : buttMat;
    const puff = new Mesh(new SphereGeometry(spread * sc * 0.45, 10, 8), mat);
    puff.position.set(ox! * spread, cy + oy! * spread, rearZ - spread * 0.35);
    group.add(puff);
  }
  return spread * 0.75;
}
