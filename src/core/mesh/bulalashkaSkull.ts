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

export interface SkullBuildOptions {
  /** Icosphere subdivision level — 2 for gallery thumbs, 3 default */
  subdivisions?: number;
}

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

/** Port Dy() v2 — stronger boxiness, pear rear, muzzle/butt shelf. */
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

    let r = 0.32;
    for (let t = 0.45; t <= 1.35; t += 0.14) {
      const field = blobField(blobs, dir.x * t, dir.y * t, dir.z * t);
      r = Math.max(r, 0.26 + field * 0.48);
    }

    const box = Math.max(Math.abs(dir.x), Math.abs(dir.y * 0.9), Math.abs(dir.z * 0.85));
    r *= 1 + params.boxiness * (box - 0.48) * 0.55;

    const lump =
      Math.sin(dir.x * 7.3 + dir.y * 5.1) * Math.cos(dir.z * 6.7 + dir.y * 4.2);
    const lump2 = Math.sin(dir.x * 13.7 - dir.z * 9.2) * 0.5;
    r *= 1 + params.lumpiness * (lump * 0.1 + lump2 * 0.06);

    // Pear rear — narrow -Z, wide lower sides
    if (dir.z < 0) {
      r *= 1 - params.jawDrop * (0.18 + Math.max(0, -dir.z) * 0.28);
      if (dir.y < 0.1) r *= 1 + params.jawDrop * 0.1;
    }

    // Butt shelf protrusion (-Z lower)
    if (dir.z < -0.25 && dir.y < 0.15) {
      r *= 1 + (0.15 + params.jawDrop * 0.12) * Math.min(1, (-dir.z - 0.25) * 2.5);
    }

    // Jaw shelf / chin
    if (dir.y < -0.25 && dir.z > -0.15 && dir.z < 0.35) {
      r *= 1 + params.jawDrop * 0.08;
    }

    // Front muzzle bulge (+Z)
    if (dir.z > 0.2) {
      const muzzle = dir.z * (0.18 + Math.max(0, dir.y + 0.05) * 0.08);
      r *= 1 + muzzle;
    }

    // Mushroom cap — widen upper +Z
    if (dir.y > 0.25 && dir.z > -0.1) {
      r *= 1 + dir.y * 0.08;
    }

    pos[ix] = dir.x * r * params.scale;
    pos[ix + 1] = dir.y * r * params.scale;
    pos[ix + 2] = dir.z * r * params.scale;
  }
}

export interface BulalashkaSkull {
  geometry: BufferGeometry;
  mesh: Mesh;
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
export function buildBulalashkaSkull(
  blobs: Blob[],
  params: BulalashkaSkullParams,
  options: SkullBuildOptions = {},
): BulalashkaSkull {
  const subdiv = options.subdivisions ?? 3;
  const ico = new IcosahedronGeometry(1, subdiv);
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

export function anchorOnSurface(skull: BulalashkaSkull, x: number, y: number): SurfaceAnchor | null {
  ORIGIN.set(x, y, skull.bounds.maxZ + 1.5);
  RAY.set(ORIGIN, new Vector3(0, 0, -1));
  const hits = RAY.intersectObject(skull.mesh, false);
  if (hits.length === 0) {
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

/** Mid face point for nose placement between eyes and mouth. */
export function faceCenter(skull: BulalashkaSkull, eyeY: number, mouthY: number): Vector3 {
  const y = eyeY * 0.35 + mouthY * 0.65;
  const anchor = anchorOnSurface(skull, 0, y);
  return anchor?.point ?? new Vector3(0, y, skull.bounds.maxZ * 0.88);
}

/** Raycast from lateral side — for ears. side: -1 left, +1 right. yNorm 0..1 maps minY..maxY */
export function anchorOnSide(
  skull: BulalashkaSkull,
  side: -1 | 1,
  yNorm: number,
): SurfaceAnchor {
  const b = skull.bounds;
  const y = b.minY + (b.maxY - b.minY) * Math.max(0.15, Math.min(0.85, yNorm));
  const x = side > 0 ? b.maxX + 1.5 : b.minX - 1.5;
  ORIGIN.set(x, y, 0);
  RAY.set(ORIGIN, new Vector3(-side, 0, 0));
  const hits = RAY.intersectObject(skull.mesh, false);
  if (hits.length === 0) {
    const px = side * silhouetteWidthAtY(skull, y) * 0.92;
    return { point: new Vector3(px, y, 0), normal: new Vector3(side, 0, 0.1).normalize() };
  }
  const hit = hits[0]!;
  const normal = hit.face?.normal.clone() ?? new Vector3(side, 0, 0);
  normal.transformDirection(skull.mesh.matrixWorld);
  normal.normalize();
  return { point: hit.point.clone(), normal };
}

/** Raycast from above — for crown horns/hairs. xNorm -1..1 across skull width */
export function anchorOnCrown(skull: BulalashkaSkull, xNorm: number): SurfaceAnchor {
  const b = skull.bounds;
  const x = ((b.minX + b.maxX) * 0.5) + xNorm * (b.maxX - b.minX) * 0.35;
  ORIGIN.set(x, b.maxY + 1.5, 0);
  RAY.set(ORIGIN, new Vector3(0, -1, 0));
  const hits = RAY.intersectObject(skull.mesh, false);
  if (hits.length === 0) {
    return {
      point: new Vector3(x, b.maxY * 0.95, b.maxZ * 0.3),
      normal: new Vector3(0, 1, 0.15).normalize(),
    };
  }
  const hit = hits[0]!;
  const normal = hit.face?.normal.clone() ?? new Vector3(0, 1, 0);
  normal.transformDirection(skull.mesh.matrixWorld);
  normal.normalize();
  if (normal.y < 0.2) normal.set(0, 1, 0.1).normalize();
  return { point: hit.point.clone(), normal };
}

/** Inverted hull outline mesh for body rim. */
export function buildBodyOutline(skull: BulalashkaSkull, materials: { outline: import('three').Material }): Mesh {
  const hull = new Mesh(skull.geometry.clone(), materials.outline);
  hull.scale.multiplyScalar(1.045);
  hull.name = 'body-outline';
  return hull;
}
