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
  | 'stack';

/**
 * Build a continuous 3D metaball field (no preset sprites).
 * Appendages are elongated blobs that merge into the body.
 */
export function createBlobs(rng: Rng): { blobs: Blob[]; archetype: BodyArchetype } {
  // No column/wide — those read as boxes. Organic silhouettes only.
  const archetype = rng.pick<BodyArchetype>([
    'blob',
    'blob',
    'blob',
    'pear',
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
        // Small body in upper third — legs added later as long sticks
        y = 0.15 + t * 0.45;
        rx = rng.float(0.18, 0.32);
        ry = rng.float(0.18, 0.3);
        rz = rng.float(0.16, 0.28);
        x = rng.float(-0.1, 0.1);
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
          y = 0.2;
          rx = rng.float(0.55, 0.85);
          ry = rng.float(0.5, 0.75);
          rz = rng.float(0.45, 0.65);
          x = 0;
        } else {
          // Tiny stub body under head
          y = -0.35;
          rx = rng.float(0.12, 0.22);
          ry = rng.float(0.1, 0.18);
          rz = rx;
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

  // Appendages: horns, antennae, spikes, stubs — elongated metaballs
  const appendageSets = rng.int(0, 3);
  for (let s = 0; s < appendageSets; s++) {
    const style = rng.pick(['horn', 'antenna', 'spike', 'ear', 'halo', 'leg'] as const);
    const count = style === 'halo' ? rng.int(4, 7) : rng.int(1, 2);

    for (let i = 0; i < count; i++) {
      const side = count === 1 ? (rng.chance(0.5) ? 1 : -1) : i % 2 === 0 ? -1 : 1;
      let x = 0;
      let y = 0;
      let z = 0;
      let rx = 0.12;
      let ry = 0.28;
      let rz = 0.12;

      switch (style) {
        case 'horn':
          x = side * rng.float(0.2, 0.45);
          y = rng.float(0.35, 0.75);
          z = rng.float(-0.1, 0.15);
          rx = rng.float(0.08, 0.16);
          ry = rng.float(0.22, 0.45);
          rz = rx;
          break;
        case 'antenna':
          x = side * rng.float(0.1, 0.35);
          y = rng.float(0.45, 0.9);
          z = rng.float(-0.05, 0.2);
          rx = rng.float(0.05, 0.1);
          ry = rng.float(0.25, 0.5);
          rz = rx;
          break;
        case 'spike':
          x = side * rng.float(0.35, 0.7);
          y = rng.float(-0.2, 0.4);
          z = rng.float(-0.15, 0.15);
          rx = rng.float(0.1, 0.22);
          ry = rng.float(0.08, 0.18);
          rz = rng.float(0.08, 0.16);
          break;
        case 'ear':
          x = side * rng.float(0.35, 0.6);
          y = rng.float(0.15, 0.45);
          z = rng.float(-0.05, 0.1);
          rx = rng.float(0.12, 0.22);
          ry = rng.float(0.14, 0.28);
          rz = rng.float(0.08, 0.14);
          break;
        case 'halo': {
          const ang = (i / count) * Math.PI * 2;
          const rad = rng.float(0.35, 0.55);
          x = Math.cos(ang) * rad;
          y = rng.float(0.55, 0.85);
          z = Math.sin(ang) * rad * 0.4;
          rx = rng.float(0.06, 0.1);
          ry = rx;
          rz = rx;
          break;
        }
        case 'leg':
          x = side * rng.float(0.12, 0.35);
          y = rng.float(-0.85, -0.45);
          z = rng.float(-0.08, 0.08);
          rx = rng.float(0.06, 0.12);
          ry = rng.float(0.2, 0.4);
          rz = rx;
          break;
      }

      const blob: Blob = {
        x,
        y,
        z,
        rx,
        ry,
        rz,
        strength: rng.float(0.7, 1.1),
        kind: 'appendage',
      };
      blobs.push(blob);
      // Mirror appendages (except single centered ones / halo already full)
      if (style !== 'halo' && Math.abs(x) > 0.05 && count === 1) {
        blobs.push({ ...blob, x: -x });
      }
    }
  }

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
