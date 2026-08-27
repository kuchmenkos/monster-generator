import type { Rng } from './rng';
import type {
  Blob,
  BulalashkaBodyArchetype,
  ButtArchetype,
} from './types';

export interface BulalashkaBlobSet {
  blobs: Blob[];
  bodyArchetype: BulalashkaBodyArchetype;
  buttArchetype: ButtArchetype;
}

function bodyBlob(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  strength = 1,
): Blob {
  return { x, y, z, rx, ry, rz, strength, kind: 'body' };
}

const BUTT_ARCHETYPES: ButtArchetype[] = [
  'peach',
  'heart_patch',
  'bunny_tail',
  'wide_sploot',
  'glossy_meme',
  'tail_nub',
  'duck_round',
  'deep_dimple',
  'puffy_cloud',
  'sparkle_cute',
];

/** Deterministic pseudo-noise in [-1, 1] from t and channel. */
function spineNoise(t: number, channel: number): number {
  const v = Math.sin(t * 17.13 + channel * 91.7) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/** Rotate blob center and approximate radii for organic pose tilt. */
function applyPose(
  blob: Blob,
  yaw: number,
  pitch: number,
  roll: number,
): Blob {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  let { x, y, z } = blob;

  // Yaw (Y axis)
  let x1 = x * cy + z * sy;
  let z1 = -x * sy + z * cy;
  x = x1;
  z = z1;

  // Pitch (X axis)
  let y1 = y * cp - z * sp;
  z1 = y * sp + z * cp;
  y = y1;
  z = z1;

  // Roll (Z axis)
  x1 = x * cr - y * sr;
  y1 = x * sr + y * cr;
  x = x1;
  y = y1;

  const stretch = 1 + Math.abs(sp) * 0.08 + Math.abs(sy) * 0.06;
  return {
    ...blob,
    x,
    y,
    z,
    rx: blob.rx * stretch,
    ry: blob.ry * stretch,
    rz: blob.rz * stretch,
  };
}

/** Label body shape from blob bbox metrics (debug / scorer only). */
function deriveBodyArchetype(blobs: Blob[]): BulalashkaBodyArchetype {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let topMass = 0;
  let midMass = 0;
  let botMass = 0;

  for (const b of blobs) {
    minX = Math.min(minX, b.x - b.rx);
    maxX = Math.max(maxX, b.x + b.rx);
    minY = Math.min(minY, b.y - b.ry);
    maxY = Math.max(maxY, b.y + b.ry);
    minZ = Math.min(minZ, b.z - b.rz);
    maxZ = Math.max(maxZ, b.z + b.rz);
    const vol = b.rx * b.ry * b.rz * b.strength;
    if (b.y > 0.08) topMass += vol;
    else if (b.y < -0.12) botMass += vol;
    else midMass += vol;
  }

  const h = Math.max(0.2, maxY - minY);
  const w = Math.max(0.2, maxX - minX);
  const aspect = w / h;

  if (topMass > botMass * 1.45 && maxZ - minZ > h * 0.55) return 'mushroom_cap';
  if (botMass > topMass * 1.35 && aspect > 0.85) return 'pear';
  if (h > w * 1.25 && topMass < botMass) return 'teardrop';
  if (h > w * 1.15) return 'egg';
  if (Math.abs(aspect - 1) < 0.18 && midMass > topMass * 0.7) return 'dumpling';
  if (blobs.length >= 14) return 'blob';
  return 'pear';
}

/**
 * Procedural limbless bulalashka: noise spine, random pose, butt shelf — no preset switch.
 */
export function createProceduralBulalashka(rng: Rng): BulalashkaBlobSet {
  const buttArchetype = rng.pick(BUTT_ARCHETYPES);
  const blobs: Blob[] = [];

  const spineCount = rng.int(8, 14);
  const frontAnchor = { x: rng.float(-0.06, 0.06), y: rng.float(0.12, 0.32), z: rng.float(0.22, 0.38) };
  const backAnchor = { x: rng.float(-0.05, 0.05), y: rng.float(-0.38, -0.24), z: rng.float(-0.38, -0.22) };
  const amp = rng.float(0.12, 0.28);
  const baseR = rng.float(0.32, 0.48);

  for (let i = 0; i < spineCount; i++) {
    const t = spineCount <= 1 ? 0.5 : i / (spineCount - 1);
    const n1 = spineNoise(t, 1);
    const n2 = spineNoise(t, 2);
    const n3 = spineNoise(t, 3);

    const x = frontAnchor.x * (1 - t) + backAnchor.x * t + n1 * amp * 0.55;
    const y = frontAnchor.y * (1 - t) + backAnchor.y * t + n2 * amp * 0.45;
    const z = frontAnchor.z * (1 - t) + backAnchor.z * t + n3 * amp * 0.5;

    const rScale = 1 + n1 * 0.4 + n2 * 0.3;
    const rx = baseR * rScale * rng.float(0.85, 1.15);
    const ry = baseR * rScale * rng.float(0.82, 1.12);
    const rz = baseR * rScale * rng.float(0.78, 1.08);
    const strength = rng.float(0.88, 1.18);

    blobs.push(bodyBlob(x, y, z, rx, ry, rz, strength));
  }

  // Front muzzle bump (+Z)
  const frontCount = rng.int(1, 2);
  for (let f = 0; f < frontCount; f++) {
    blobs.push(
      bodyBlob(
        rng.float(-0.1, 0.1),
        rng.float(0.05, 0.28),
        rng.float(0.38, 0.58),
        rng.float(0.26, 0.38),
        rng.float(0.24, 0.36),
        rng.float(0.22, 0.34),
        rng.float(0.9, 1.15),
      ),
    );
  }

  // Butt shelf — protrudes on -Z
  const shelfCount = rng.int(1, 2);
  for (let s = 0; s < shelfCount; s++) {
    blobs.push(
      bodyBlob(
        rng.float(-0.08, 0.08),
        rng.float(-0.42, -0.24),
        -rng.float(0.28, 0.45),
        rng.float(0.4, 0.55),
        rng.float(0.34, 0.48),
        rng.float(0.4, 0.55),
        rng.float(0.9, 1.15),
      ),
    );
  }

  const wobbleCount = rng.int(1, 2);
  for (let w = 0; w < wobbleCount; w++) {
    const side = rng.chance(0.5) ? -1 : 1;
    blobs.push(
      bodyBlob(
        side * rng.float(0.18, 0.3),
        rng.float(-0.18, 0.12),
        rng.float(-0.1, 0.14),
        rng.float(0.16, 0.26),
        rng.float(0.18, 0.28),
        rng.float(0.16, 0.26),
        rng.float(0.6, 0.8),
      ),
    );
  }

  // Butt archetype extra volume on rear bulge
  switch (buttArchetype) {
    case 'wide_sploot':
    case 'duck_round':
      blobs.push(bodyBlob(0, -0.34, -0.42, 0.72, 0.4, 0.52, 1.05));
      break;
    case 'puffy_cloud':
      blobs.push(bodyBlob(0, -0.28, -0.38, 0.55, 0.52, 0.48, 0.95));
      break;
    case 'bunny_tail':
    case 'tail_nub':
      blobs.push(bodyBlob(0, -0.18, -0.52, 0.14, 0.14, 0.12, 0.8));
      break;
    default:
      break;
  }

  const poseYaw = rng.float(-0.44, 0.44);
  const posePitch = rng.float(-0.44, 0.44);
  const poseRoll = rng.float(-0.35, 0.35);
  const posed = blobs.map((b) => applyPose(b, poseYaw, posePitch, poseRoll));

  const bodyArchetype = deriveBodyArchetype(posed);
  return { blobs: posed, bodyArchetype, buttArchetype };
}

/** @deprecated Use createProceduralBulalashka */
export const createBulalashkaBlobs = createProceduralBulalashka;
