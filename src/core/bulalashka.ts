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

/**
 * Limbless bulalashka metaballs: front cluster (+Z), mid connector, butt cluster (-Z).
 * No appendages — pure plump body volume.
 */
export function createBulalashkaBlobs(rng: Rng): BulalashkaBlobSet {
  const bodyArchetype = rng.pick<BulalashkaBodyArchetype>([
    'pear',
    'pear',
    'pear',
    'dumpling',
    'dumpling',
    'teardrop',
    'blob',
    'egg',
    'mushroom_cap',
  ]);
  const buttArchetype = rng.pick(BUTT_ARCHETYPES);

  const blobs: Blob[] = [];
  const midStrength = rng.float(0.95, 1.15);
  const frontZ = rng.float(0.22, 0.42);
  const buttZ = -rng.float(0.2, 0.4);

  switch (bodyArchetype) {
    case 'pear': {
      blobs.push(bodyBlob(0, -0.15, 0, 0.42, 0.48, 0.38, midStrength));
      blobs.push(bodyBlob(rng.float(-0.08, 0.08), 0.12, frontZ, 0.36, 0.38, 0.32));
      blobs.push(bodyBlob(0, -0.38, buttZ, 0.58, 0.44, 0.42, 1.1));
      if (rng.chance(0.5)) {
        blobs.push(bodyBlob(0, -0.28, buttZ * 0.6, 0.48, 0.36, 0.36));
      }
      break;
    }
    case 'dumpling': {
      blobs.push(bodyBlob(0, 0, 0, 0.52, 0.52, 0.46, midStrength));
      blobs.push(bodyBlob(rng.float(-0.06, 0.06), 0.18, frontZ, 0.4, 0.36, 0.34));
      blobs.push(bodyBlob(0, -0.32, buttZ, 0.54, 0.46, 0.44, 1.05));
      break;
    }
    case 'teardrop': {
      blobs.push(bodyBlob(0, -0.05, 0.05, 0.38, 0.52, 0.36, midStrength));
      blobs.push(bodyBlob(0, 0.28, frontZ, 0.32, 0.34, 0.28));
      blobs.push(bodyBlob(0, -0.42, buttZ, 0.5, 0.4, 0.4, 1.08));
      break;
    }
    case 'blob': {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        blobs.push(
          bodyBlob(
            rng.float(-0.2, 0.2),
            rng.float(-0.35, 0.25),
            rng.float(buttZ * 0.5, frontZ),
            rng.float(0.3, 0.5),
            rng.float(0.3, 0.5),
            rng.float(0.26, 0.42),
            rng.float(0.85, 1.1),
          ),
        );
        if (t > 0.6) continue;
      }
      blobs.push(bodyBlob(0, -0.35, buttZ, 0.55, 0.42, 0.4, 1.12));
      break;
    }
    case 'egg': {
      blobs.push(bodyBlob(0, 0.05, 0.08, 0.38, 0.55, 0.38, midStrength));
      blobs.push(bodyBlob(0, 0.22, frontZ, 0.34, 0.32, 0.3));
      blobs.push(bodyBlob(0, -0.38, buttZ, 0.46, 0.42, 0.38, 1.06));
      break;
    }
    case 'mushroom_cap': {
      blobs.push(bodyBlob(0, -0.25, 0, 0.28, 0.38, 0.28, midStrength));
      blobs.push(bodyBlob(0, 0.2, frontZ, 0.48, 0.34, 0.38));
      blobs.push(bodyBlob(0, 0.35, frontZ * 0.7, 0.55, 0.28, 0.42));
      blobs.push(bodyBlob(0, -0.42, buttZ, 0.52, 0.4, 0.44, 1.1));
      break;
    }
  }

  // Butt archetype tweaks extra metaball volume on rear
  switch (buttArchetype) {
    case 'wide_sploot':
    case 'duck_round':
      blobs.push(bodyBlob(0, -0.36, buttZ, 0.68, 0.38, 0.48, 0.9));
      break;
    case 'puffy_cloud':
      blobs.push(bodyBlob(0, -0.3, buttZ * 0.85, 0.5, 0.5, 0.46, 0.85));
      break;
    case 'bunny_tail':
    case 'tail_nub':
      blobs.push(bodyBlob(0, -0.22, buttZ - 0.08, 0.12, 0.12, 0.1, 0.75));
      break;
    default:
      break;
  }

  // Slight lateral wobble blobs for organic silhouette (no limbs)
  if (rng.chance(0.45)) {
    const side = rng.chance(0.5) ? -1 : 1;
    blobs.push(
      bodyBlob(
        side * rng.float(0.18, 0.32),
        rng.float(-0.15, 0.1),
        rng.float(-0.05, 0.12),
        0.22,
        0.28,
        0.24,
        0.65,
      ),
    );
  }

  return { blobs, bodyArchetype, buttArchetype };
}
