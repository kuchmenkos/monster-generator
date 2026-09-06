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

/** Conforming local refinement: neighboring triangles share edge midpoints.
 * The nose is a dense patch of the head mesh, not a second intersecting object. */
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
      const v = new T.Vector3()
        .fromBufferAttribute(p, a)
        .add(new T.Vector3().fromBufferAttribute(p, b))
        .normalize();
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
    center.normalize();
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
