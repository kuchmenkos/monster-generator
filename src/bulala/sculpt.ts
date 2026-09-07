import * as T from "three";
/** Swept, tapered organic strand, with a parallel-transport frame from Three. */
export function sweep(
  points: T.Vector3[],
  radius: number,
  segments = 24,
  sides = 8,
  end = 0.003,
  ripple = 0,
) {
  const curve = new T.CatmullRomCurve3(points);
  const geo = new T.TubeGeometry(curve, segments, 1, sides, false);
  const p = geo.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      c = curve.getPointAt(t);
    const rad =
      (end + radius * Math.pow(1 - t, 0.7)) * (1 + ripple * Math.sin(t * 60));
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      p.setXYZ(
        k,
        c.x + (p.getX(k) - c.x) * rad,
        c.y + (p.getY(k) - c.y) * rad,
        c.z + (p.getZ(k) - c.z) * rad,
      );
    }
  }
  geo.computeVertexNormals();
  return geo;
}
export function colorGeometry(geo: T.BufferGeometry, color: T.Color) {
  const a = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) {
    a[i] = color.r;
    a[i + 1] = color.g;
    a[i + 2] = color.b;
  }
  geo.setAttribute("color", new T.BufferAttribute(a, 3));
  return geo;
}
export function patchGeometry(
  rows: number,
  columns: number,
  fn: (u: number, v: number) => T.Vector3,
) {
  const p: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= columns; j++) {
      const q = fn(j / columns, i / rows);
      p.push(q.x, q.y, q.z);
      uv.push(j / columns, i / rows);
    }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j,
        b = a + columns + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Remap a unit circle sample into a lip silhouette. */
export function lipContour(kind: string, c: number, s: number, a: number) {
  if (kind === "heart") {
    const dip = Math.max(0, s) * 0.32 * Math.exp(-(c * c * 22));
    return { c, s: s - dip + Math.max(0, -s) * 0.1 };
  }
  if (kind === "cat")
    return { c, s: s - 0.12 * Math.cos(a * 3) * (s > 0 ? 0.35 : 1) };
  if (kind === "duck") return { c: c * 1.08, s: s * 0.55 };
  if (kind === "tiny") return { c: c * 0.92, s: s * 1.15 };
  if (kind === "bow")
    return { c, s: s + 0.16 * Math.cos(a * 2) * Math.max(0, s) };
  if (kind === "wave") return { c, s: s + 0.1 * Math.sin(a * 4) };
  if (kind === "square") {
    const p = 0.58;
    return {
      c: Math.sign(c) * Math.abs(c) ** p,
      s: Math.sign(s) * Math.abs(s) ** p,
    };
  }
  if (kind === "side") return { c, s: s + c * 0.12 };
  if (kind === "fish") return { c: c * (0.78 + 0.22 * s * s), s: s * 0.72 };
  if (kind === "beak")
    return {
      c: Math.sign(c) * Math.abs(c) ** 0.62 * 0.88,
      s: s * (0.72 + 0.4 * (1 - Math.abs(c))),
    };
  return { c, s };
}

/** Conforming local refinement: neighboring triangles share edge midpoints.
 * Midpoints stay in the sphere's tangent sense (average then reproject) so densify
 * happens in param-UV of the undeformed head before nasal displace. */
export function refineNasalPatch(
  source: T.BufferGeometry,
  halfWidth = 0.53,
  lower = -0.34,
  upper = 0.45,
) {
  const p = source.attributes.position,
    index = source.index!;
  const vertices: number[] = Array.from(p.array),
    edges = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}/${b}` : `${b}/${a}`);
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (
      !tri.some(
        (a) =>
          p.getZ(a) > 0.6 &&
          Math.abs(p.getX(a)) < halfWidth &&
          p.getY(a) > lower &&
          p.getY(a) < upper,
      )
    )
      continue;
    for (let j = 0; j < 3; j++) {
      const a = tri[j],
        b = tri[(j + 1) % 3],
        k = key(a, b);
      if (edges.has(k)) continue;
      // Average in Cartesian then reproject — denser param (x,y) without chord bias.
      const va = new T.Vector3().fromBufferAttribute(p, a),
        vb = new T.Vector3().fromBufferAttribute(p, b);
      const v = new T.Vector3().addVectors(va, vb).multiplyScalar(0.5);
      const len = v.length();
      if (len > 1e-8) v.multiplyScalar(1 / len);
      else v.set(0, 0, 1);
      edges.set(k, vertices.length / 3);
      vertices.push(v.x, v.y, v.z);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)],
      loop: number[] = [];
    for (let j = 0; j < 3; j++) {
      loop.push(tri[j]);
      const mid = edges.get(key(tri[j], tri[(j + 1) % 3]));
      if (mid !== undefined) loop.push(mid);
    }
    if (loop.length === 3) {
      out.push(...tri);
      continue;
    }
    const center = new T.Vector3();
    for (const a of tri) center.add(new T.Vector3().fromBufferAttribute(p, a));
    const cl = center.length();
    if (cl > 1e-8) center.multiplyScalar(1 / cl);
    else center.set(0, 0, 1);
    const c = vertices.length / 3;
    vertices.push(center.x, center.y, center.z);
    for (let j = 0; j < loop.length; j++)
      out.push(c, loop[j], loop[(j + 1) % loop.length]);
  }
  source.dispose();
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geo.setIndex(out);
  return geo;
}

/** Soften facet normals in a param box (nose patch) without moving vertices. */
export function softenPatchNormals(
  geo: T.BufferGeometry,
  paramX: Float32Array,
  paramY: Float32Array,
  halfWidth: number,
  lower: number,
  upper: number,
  passes = 2,
) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.normal as T.BufferAttribute;
  const index = geo.index;
  if (!index) return;
  const count = n.count;
  const inPatch = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (
      Math.abs(paramX[i]) <= halfWidth &&
      paramY[i] >= lower &&
      paramY[i] <= upper
    )
      inPatch[i] = 1;
  }
  const scratch = new Float32Array(count * 3);
  for (let pass = 0; pass < passes; pass++) {
    scratch.set(n.array as Float32Array);
    const accum = new Float32Array(count * 3);
    const weight = new Float32Array(count);
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2);
      if (!inPatch[a] && !inPatch[b] && !inPatch[c]) continue;
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        if (!inPatch[u] || !inPatch[v]) continue;
        for (let k = 0; k < 3; k++) {
          accum[u * 3 + k] += scratch[v * 3 + k];
          accum[v * 3 + k] += scratch[u * 3 + k];
        }
        weight[u]++;
        weight[v]++;
      }
    }
    for (let i = 0; i < count; i++) {
      if (!inPatch[i] || weight[i] < 1) continue;
      let nx = scratch[i * 3] * 0.45 + accum[i * 3] / weight[i],
        ny = scratch[i * 3 + 1] * 0.45 + accum[i * 3 + 1] / weight[i],
        nz = scratch[i * 3 + 2] * 0.45 + accum[i * 3 + 2] / weight[i];
      const len = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(i, nx / len, ny / len, nz / len);
    }
  }
  n.needsUpdate = true;
}
