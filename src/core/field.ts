import type { Rng } from './rng';
import type { Blob } from './types';

export type BodyArchetype =
  | 'blob'
  | 'pear'
  | 'column'
  | 'wide'
  | 'mushroom'
  | 'triangle'
  | 'lanky'
  | 'slug'
  | 'bighead'
  | 'stack'
  | 'egg'
  | 'dumpling'
  | 'teardrop'
  | 'hourglass'
  | 'star';

/**
 * Build a continuous 3D metaball field (no preset sprites).
 * Appendages are elongated blobs that merge into the body.
 */
export function createBlobs(rng: Rng): { blobs: Blob[]; archetype: BodyArchetype } {
  // No column/wide — those read as boxes. Organic silhouettes only.
  const archetype = rng.pick<BodyArchetype>([
    'blob',
    'blob',
    'pear',
    'pear',
    'mushroom',
    'mushroom',
    'triangle',
    'lanky',
    'lanky',
    'slug',
    'bighead',
    'bighead',
    'egg',
    'dumpling',
    'teardrop',
    'hourglass',
    'star',
  ]);

  const blobs: Blob[] = [];
  const bodyCount =
    archetype === 'bighead'
      ? rng.int(2, 3)
      : archetype === 'stack'
        ? rng.int(3, 4)
        : rng.int(3, 6);

  for (let i = 0; i < bodyCount; i++) {
    const t = i / Math.max(1, bodyCount - 1);
    let x = rng.float(-0.15, 0.15);
    let y = 0;
    let z = rng.float(-0.12, 0.12);
    let rx = 0.35;
    let ry = 0.35;
    let rz = 0.28;

    switch (archetype) {
      case 'blob':
        x = rng.float(-0.35, 0.35);
        y = rng.float(-0.45, 0.45);
        z = rng.float(-0.25, 0.25);
        rx = rng.float(0.28, 0.55);
        ry = rng.float(0.28, 0.55);
        rz = rng.float(0.22, 0.42);
        break;
      case 'pear':
        y = -0.35 + t * 0.85;
        rx = rng.float(0.32, 0.48) * (0.65 + t * 0.7);
        ry = rng.float(0.28, 0.42);
        rz = rng.float(0.24, 0.38) * (0.7 + t * 0.5);
        x = rng.float(-0.12, 0.12);
        break;
      case 'column':
        y = -0.5 + t * 1.05;
        // Varying radii so stack doesn't read as a rectangle
        rx = rng.float(0.18, 0.38) * (0.75 + Math.sin(t * Math.PI * 1.5 + i) * 0.35);
        ry = rng.float(0.2, 0.36);
        rz = rng.float(0.18, 0.34) * (0.8 + Math.cos(t * Math.PI) * 0.25);
        x = rng.float(-0.12, 0.12) + Math.sin(t * Math.PI) * rng.float(0.05, 0.18);
        break;
      case 'wide':
        x = rng.float(-0.55, 0.55);
        y = rng.float(-0.28, 0.28);
        z = rng.float(-0.2, 0.2);
        rx = rng.float(0.28, 0.52);
        ry = rng.float(0.2, 0.42);
        rz = rng.float(0.2, 0.4);
        break;
      case 'mushroom':
        if (i < bodyCount / 2) {
          y = rng.float(-0.55, -0.1);
          rx = rng.float(0.18, 0.28);
          ry = rng.float(0.25, 0.4);
          rz = rx;
        } else {
          y = rng.float(0.05, 0.45);
          rx = rng.float(0.4, 0.7);
          ry = rng.float(0.22, 0.38);
          rz = rng.float(0.35, 0.55);
        }
        x = rng.float(-0.1, 0.1);
        break;
      case 'triangle': {
        y = -0.4 + t * 0.9;
        const w = 0.15 + (1 - t) * 0.55;
        rx = rng.float(0.85, 1.1) * w;
        ry = rng.float(0.22, 0.34);
        rz = rng.float(0.2, 0.36) * w;
        x = rng.float(-0.08, 0.08);
        break;
      }
      case 'lanky':
        // Compact tall torso (no stick legs — limbless silhouette)
        y = -0.05 + t * 0.55;
        rx = rng.float(0.2, 0.34);
        ry = rng.float(0.22, 0.38);
        rz = rng.float(0.18, 0.3);
        x = rng.float(-0.08, 0.08);
        break;
      case 'slug':
        // Horizontal elongated body
        x = -0.45 + t * 0.9;
        y = rng.float(-0.15, 0.15);
        rx = rng.float(0.35, 0.55);
        ry = rng.float(0.16, 0.28);
        rz = rng.float(0.2, 0.35);
        break;
      case 'bighead':
        if (i === 0) {
          // Huge head sphere
          y = 0.15;
          rx = rng.float(0.55, 0.85);
          ry = rng.float(0.5, 0.75);
          rz = rng.float(0.45, 0.65);
          x = 0;
        } else {
          // Fuller under-head mass (no stub meant for legs)
          y = -0.22;
          rx = rng.float(0.22, 0.38);
          ry = rng.float(0.18, 0.3);
          rz = rx * rng.float(0.85, 1);
          x = rng.float(-0.05, 0.05);
        }
        break;
      case 'stack': {
        // Snowman / totem — strong width jumps between segments
        y = -0.5 + t * 1.1;
        const jump = rng.float(0.55, 1.35);
        const segW = rng.float(0.22, 0.5) * jump;
        rx = segW;
        ry = rng.float(0.16, 0.26);
        rz = segW * rng.float(0.7, 0.95);
        x = rng.float(-0.12, 0.12);
        break;
      }
      case 'egg':
        y = -0.35 + t * 0.85;
        rx = rng.float(0.28, 0.4) * (0.75 + t * 0.35);
        ry = rng.float(0.32, 0.48);
        rz = rng.float(0.24, 0.36) * (0.8 + t * 0.25);
        x = rng.float(-0.08, 0.08);
        break;
      case 'dumpling':
        x = rng.float(-0.28, 0.28);
        y = rng.float(-0.22, 0.22);
        z = rng.float(-0.18, 0.18);
        rx = rng.float(0.38, 0.58);
        ry = rng.float(0.28, 0.42);
        rz = rng.float(0.3, 0.48);
        break;
      case 'teardrop':
        y = -0.4 + t * 0.95;
        rx = rng.float(0.3, 0.5) * (1.15 - t * 0.55);
        ry = rng.float(0.26, 0.4);
        rz = rng.float(0.24, 0.4) * (1.1 - t * 0.4);
        x = rng.float(-0.1, 0.1);
        break;
      case 'hourglass': {
        y = -0.45 + t * 1.0;
        // Wide ends, controlled waist — min width floor so not peanut
        const waist = 0.55 + Math.abs(t - 0.5) * 0.9;
        rx = rng.float(0.28, 0.42) * waist;
        ry = rng.float(0.22, 0.34);
        rz = rng.float(0.22, 0.36) * waist;
        x = rng.float(-0.08, 0.08);
        break;
      }
      case 'star': {
        const a = (i / Math.max(1, bodyCount)) * Math.PI * 2;
        x = Math.cos(a) * rng.float(0.2, 0.4);
        y = Math.sin(a) * rng.float(0.18, 0.38);
        z = rng.float(-0.12, 0.12);
        rx = rng.float(0.2, 0.35);
        ry = rng.float(0.18, 0.32);
        rz = rng.float(0.16, 0.28);
        break;
      }
    }

    blobs.push({
      x,
      y,
      z,
      rx,
      ry,
      rz,
      strength: rng.float(0.85, 1.25),
      kind: 'body',
    });
  }

  // Mirror body blobs across X for bilateral symmetry (with slight asymmetry noise later)
  const mirrored: Blob[] = [];
  for (const b of blobs) {
    if (Math.abs(b.x) > 0.08) {
      mirrored.push({ ...b, x: -b.x });
    }
  }
  blobs.push(...mirrored);

  // No field appendage metaballs — legs/spikes/stubs broke silhouette integrity.
  // Sparse horns/antennae come only from applyLimbs head toppers.

  return { blobs, archetype };
}

/** Ellipsoidal metaball contribution. */
export function blobContribution(blob: Blob, x: number, y: number, z: number): number {
  const dx = (x - blob.x) / blob.rx;
  const dy = (y - blob.y) / blob.ry;
  const dz = (z - blob.z) / blob.rz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < 1e-6) return blob.strength * 4;
  // Soft falloff — classic metaball-ish
  return blob.strength / d2;
}

export function sampleField(blobs: Blob[], x: number, y: number, z: number): number {
  let sum = 0;
  for (const b of blobs) {
    sum += blobContribution(b, x, y, z);
  }
  return sum;
}

/** Central difference gradient → surface normal. */
export function fieldNormal(
  blobs: Blob[],
  x: number,
  y: number,
  z: number,
  eps = 0.04,
): { nx: number; ny: number; nz: number } {
  const gx = sampleField(blobs, x + eps, y, z) - sampleField(blobs, x - eps, y, z);
  const gy = sampleField(blobs, x, y + eps, z) - sampleField(blobs, x, y - eps, z);
  const gz = sampleField(blobs, x, y, z + eps) - sampleField(blobs, x, y, z - eps);
  const len = Math.hypot(gx, gy, gz) || 1;
  // Gradient points outward from high field → flip for outward normal
  return { nx: -gx / len, ny: -gy / len, nz: -gz / len };
}

export function dominantKind(blobs: Blob[], x: number, y: number, z: number): 'body' | 'appendage' {
  let best = 0;
  let kind: 'body' | 'appendage' = 'body';
  for (const b of blobs) {
    const c = blobContribution(b, x, y, z);
    if (c > best) {
      best = c;
      kind = b.kind;
    }
  }
  return kind;
}
