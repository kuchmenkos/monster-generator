import {
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  Raycaster,
  Vector3,
} from 'three';
import type { Blob, BulalashkaSkullParams } from '../types';

const TMP = new Vector3();
const RAY = new Raycaster();
const ORIGIN = new Vector3();

/** Sample merged blob SDF-ish field — higher = inside body. */
function blobField(blobs: Blob[], x: number, y: number, z: number): number {
  let sum = 0;
  for (const b of blobs) {
    const dx = (x - b.x) / Math.max(0.08, b.rx);
    const dy = (y - b.y) / Math.max(0.08, b.ry);
    const dz = (z - b.z) / Math.max(0.08, b.rz);
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1) sum += b.strength * (1 - d2);
  }
  return sum;
}

/** Port Dy() — boxiness, lumps, rear pear taper on icosphere. */
function deformBulalashka(
  pos: Float32Array,
  blobs: Blob[],
  params: BulalashkaSkullParams,
): void {
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const ix = i * 3;
    TMP.set(pos[ix]!, pos[ix + 1]!, pos[ix + 2]!);
    const dir = TMP.clone().normalize();

    // Base radius from blob field along ray
    let r = 0.35;
    for (let t = 0.55; t <= 1.25; t += 0.18) {
      const field = blobField(blobs, dir.x * t, dir.y * t, dir.z * t);
      r = Math.max(r, 0.28 + field * 0.42);
    }

    // Boxiness — flatten toward cube silhouette
    const box = Math.max(Math.abs(dir.x), Math.abs(dir.y * 0.92), Math.abs(dir.z * 0.88));
    r *= 1 + params.boxiness * (box - 0.55) * 0.35;

    // Lumps — low-frequency wobble
    const lump =
      Math.sin(dir.x * 7.3 + dir.y * 5.1) * Math.cos(dir.z * 6.7 + dir.y * 4.2);
    r *= 1 + params.lumpiness * lump * 0.08;

    // Pear / jaw — shrink rear (-Z) and widen lower hemisphere
    if (dir.z < -0.05) r *= 1 - params.jawDrop * (0.12 + Math.max(0, -dir.z) * 0.18);
    if (dir.y < -0.15 && dir.z < 0.1) r *= 1 + params.jawDrop * 0.06;

    // Front muzzle bulge (+Z)
    if (dir.z > 0.35 && dir.y > -0.05) r *= 1 + dir.z * 0.12;

    pos[ix] = dir.x * r * params.scale;
    pos[ix + 1] = dir.y * r * params.scale;
    pos[ix + 2] = dir.z * r * params.scale;
  }
}

export interface BulalashkaSkull {
  geometry: BufferGeometry;
  mesh: Mesh;
  /** Axis-aligned bounds after deform */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

function computeBounds(pos: Float32Array) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]!);
    maxX = Math.max(maxX, pos[i]!);
    minY = Math.min(minY, pos[i + 1]!);
    maxY = Math.max(maxY, pos[i + 1]!);
    minZ = Math.min(minZ, pos[i + 2]!);
    maxZ = Math.max(maxZ, pos[i + 2]!);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** Build deformed icosphere skull from procedural blobs. */
export function buildBulalashkaSkull(blobs: Blob[], params: BulalashkaSkullParams): BulalashkaSkull {
  const ico = new IcosahedronGeometry(1, 3);
  const pos = new Float32Array(ico.attributes.position.array as ArrayLike<number>);
  deformBulalashka(pos, blobs, params);
  ico.setAttribute('position', new Float32BufferAttribute(pos, 3));
  ico.computeVertexNormals();

  const bounds = computeBounds(pos);
  const mesh = new Mesh(ico);
  mesh.name = 'skull';
  return { geometry: ico, mesh, bounds };
}

export interface SurfaceAnchor {
  point: Vector3;
  normal: Vector3;
}

/**
 * Raycast anchor on front hemisphere — port cb()/Ly().
 * Face-plane x,y are world coords on the skull.
 */
export function anchorOnSurface(skull: BulalashkaSkull, x: number, y: number): SurfaceAnchor | null {
  ORIGIN.set(x, y, skull.bounds.maxZ + 1.5);
  RAY.set(ORIGIN, new Vector3(0, 0, -1));
  const hits = RAY.intersectObject(skull.mesh, false);
  if (hits.length === 0) {
    // Fallback: project toward front
    const z = skull.bounds.maxZ * 0.85;
    return { point: new Vector3(x, y, z), normal: new Vector3(0, 0, 1) };
  }
  const hit = hits[0]!;
  const normal = hit.face?.normal.clone() ?? new Vector3(0, 0, 1);
  if (hit.object.matrixWorld) {
    normal.transformDirection(hit.object.matrixWorld);
  }
  normal.normalize();
  if (normal.z < 0.05) normal.set(0, 0, 1);
  return { point: hit.point.clone(), normal };
}

/** Max |x| on silhouette at world Y — port Hy()/Tx(). */
export function silhouetteWidthAtY(skull: BulalashkaSkull, y: number, tolerance = 0.06): number {
  const pos = skull.geometry.attributes.position.array as Float32Array;
  let maxAbsX = 0.15;
  for (let i = 0; i < pos.length; i += 3) {
    const py = pos[i + 1]!;
    if (Math.abs(py - y) > tolerance) continue;
    maxAbsX = Math.max(maxAbsX, Math.abs(pos[i]!));
  }
  return maxAbsX;
}
