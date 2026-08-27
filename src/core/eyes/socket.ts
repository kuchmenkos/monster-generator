import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Vector3,
} from 'three';
import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnSurface } from '../mesh/bulalashkaSkull';
import type { BulalashkaMaterials } from '../mesh/materials';

const V = new Vector3();
const N = new Vector3();

/**
 * Port wb() — recess vertices along normals inside an elliptical patch.
 * Returns socket mesh + average inward depth for metrics.
 */
export function carveSocketPatch(
  skull: BulalashkaSkull,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  offset: number,
  _rings: number,
  materials: BulalashkaMaterials,
): { mesh: Mesh; depth: number } {
  const src = skull.geometry;
  const pos = src.attributes.position.array as Float32Array;
  const norm = src.attributes.normal!.array as Float32Array;
  const verts: number[] = [];
  const norms: number[] = [];
  const idx: number[] = [];
  let depthSum = 0;
  let depthCount = 0;

  const anchor = anchorOnSurface(skull, cx, cy);
  const center = anchor?.point ?? new Vector3(cx, cy, skull.bounds.maxZ * 0.9);

  for (let i = 0; i < pos.length; i += 3) {
    const px = pos[i]!;
    const py = pos[i + 1]!;
    const pz = pos[i + 2]!;
    const dx = (px - cx) / Math.max(0.02, rx);
    const dy = (py - cy) / Math.max(0.02, ry);
    const d2 = dx * dx + dy * dy;
    if (d2 > 1.05) continue;

    const falloff = 1 - Math.sqrt(d2);
    const inset = offset * falloff * (1 + (1 - d2) * 0.35);
    N.set(norm[i]!, norm[i + 1]!, norm[i + 2]!);
    V.set(px, py, pz).addScaledVector(N, -inset);

    // Pull toward socket center slightly for concavity
    V.lerp(center, falloff * 0.08);

    verts.push(V.x, V.y, V.z);
    norms.push(N.x, N.y, N.z);
    depthSum += inset;
    depthCount++;
  }

  if (verts.length < 9) {
    // Minimal fallback patch — small disc
    const seg = 8;
    for (let a = 0; a <= seg; a++) {
      const t = (a / seg) * Math.PI * 2;
      verts.push(cx + Math.cos(t) * rx * 0.5, cy + Math.sin(t) * ry * 0.5, center.z - offset * 0.5);
      norms.push(0, 0, 1);
    }
    depthCount = seg + 1;
    depthSum = offset * 0.5 * depthCount;
  }

  // Fan triangulation from center vertex
  const centerIdx = verts.length / 3;
  verts.push(center.x, center.y, center.z - offset * 0.85);
  norms.push(0, 0, 1);
  const ringCount = (verts.length / 3) - 1;
  for (let a = 0; a < ringCount - 1; a++) {
    idx.push(centerIdx, a, a + 1);
  }
  if (ringCount > 2) idx.push(centerIdx, ringCount - 1, 0);

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(norms, 3));
  if (idx.length >= 3) geo.setIndex(idx);
  geo.computeVertexNormals();

  const mesh = new Mesh(geo, materials.socket);
  mesh.name = 'socket';
  return { mesh, depth: depthCount ? depthSum / depthCount : offset };
}

/** Also displace skull vertices inward for deeper socket integration. */
export function recessSkullPatch(
  skull: BulalashkaSkull,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  offset: number,
): void {
  const pos = skull.geometry.attributes.position as BufferAttribute;
  const norm = skull.geometry.attributes.normal as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const dx = (px - cx) / Math.max(0.02, rx);
    const dy = (py - cy) / Math.max(0.02, ry);
    const d2 = dx * dx + dy * dy;
    if (d2 > 1.2) continue;
    const falloff = 1 - Math.sqrt(Math.min(1, d2));
    const inset = offset * 0.45 * falloff;
    pos.setXYZ(
      i,
      px - norm.getX(i) * inset,
      py - norm.getY(i) * inset,
      pos.getZ(i) - norm.getZ(i) * inset,
    );
  }
  pos.needsUpdate = true;
  skull.geometry.computeVertexNormals();
}
