import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { rng, palettes, type Genome } from "./genome";
import type { Morphology } from "./morphology";
import { sweep, patchGeometry, colorGeometry } from "./sculpt";

/** Grown, groomed fibres and folded laminae, merged into a single draw call. */
export function growCoat(g: Genome, m: Morphology, material: T.Material) {
  const kind = g.genes.skin;
  if (![1, 4, 5, 6, 7, 8, 9, 10].includes(kind)) return null;
  const r = rng(g.seed + "/coat-v2"),
    p = palettes[g.genes.palette];
  const base = new T.Color(p[0]),
    tip = new T.Color(p[1]),
    shade = new T.Color(p[2]);
  const count =
    kind === 8
      ? 1800
      : kind === 9
        ? 1200
        : kind === 10
          ? 1050
          : kind === 1
            ? 4200
            : kind === 4
              ? 100
              : kind === 5
                ? 175
                : kind === 6
                  ? 105
                  : 650;
  const parts: T.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    // Fibonacci distribution avoids clumps caused by random latitude sampling.
    const ny = 1 - (2 * (i + 0.5)) / count,
      theta = i * 2.399963229728653 + r() * 0.3;
    const nr = Math.sqrt(1 - ny * ny),
      n = new T.Vector3(Math.cos(theta) * nr, ny, Math.sin(theta) * nr);
    // Leave the face and peach cleft readable; lengths taper at the hairline.
    const front = n.z > 0;
    const faceEdge = Math.max(Math.abs(n.x) / 0.69, (n.y - 0.02) / 0.68);
    if (front && faceEdge < 1 && n.y > -0.8) continue;
    if (n.z < -0.55 && n.y < (kind === 10 ? -0.55 : 0.23)) continue;
    if (g.genes.horns === 7 && Math.abs(n.x) < 0.18 && n.y > 0.7) continue;
    if (
      g.genes.horns !== 3 &&
      g.genes.horns !== 7 &&
      Math.abs(n.x) > 0.32 &&
      Math.abs(n.x) < 0.63 &&
      n.y > 0.69
    )
      continue;
    if (Math.abs(n.x) > 0.8 && n.y > 0.33 && n.y < 0.62) continue;
    if (n.y < -0.78) continue;
    const root = m.point(n).addScaledVector(n, -0.025);
    const growth = new T.Vector3(
      n.x * 0.52,
      Math.max(0.06, n.y * 0.5),
      n.z * 0.48,
    ).normalize();
    const length =
      (kind === 10
        ? 0.19
        : kind === 8
          ? 0.27
          : kind === 9
            ? 0.4
            : kind === 1
              ? 0.37
              : kind === 4
                ? 0.48
                : kind === 5
                  ? 0.34
                  : kind === 6
                    ? 0.28
                    : 0.5) *
      (0.6 + r() * 0.85);
    const whorl = Math.sin(n.y * 5 + n.z * 4 + theta * 0.12) * 0.35;
    const flow = new T.Vector3(
      n.x * (front ? 1.5 : 0.45) + whorl,
      -0.7,
      n.z * (front ? -0.5 : 0.25),
    ).normalize();
    const bend = (r() - 0.5) * 0.18;
    let geo: T.BufferGeometry;
    if (kind === 10) {
      const tangent = flow.clone().addScaledVector(n, -flow.dot(n)).normalize();
      const across = new T.Vector3().crossVectors(n, tangent).normalize();
      geo = patchGeometry(10, 10, (u, t) => {
        const nn = n
          .clone()
          .addScaledVector(tangent, ((t - 0.1) * length) / m.ry)
          .addScaledVector(
            across,
            (u * 2 - 1) * length * 0.55 * Math.sin(Math.PI * t) ** 0.6,
          )
          .normalize();
        return m
          .point(nn)
          .addScaledVector(
            nn,
            0.007 +
              Math.sin(Math.PI * t) * 0.026 +
              Math.sin(Math.PI * u) * 0.012,
          );
      });
    } else if (kind === 5 || kind === 6) {
      const tangent = new T.Vector3(-n.z, 0, n.x).normalize();
      const width = length * (kind === 5 ? 0.44 : 0.26);
      geo = patchGeometry(18, 12, (u, t) => {
        const a = u * Math.PI * 2;
        const mid = root
          .clone()
          .addScaledVector(growth, length * t * 0.84)
          .addScaledVector(flow, length * t * t * 0.54);
        const blade = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.7) * width;
        mid.addScaledVector(tangent, Math.cos(a) * blade);
        // Closed fleshy cross-section, central rib and turned-up edges.
        mid.addScaledVector(
          n,
          Math.sin(Math.PI * t) *
            (0.05 * Math.cos(a) ** 2 +
              Math.sin(a) * (kind === 5 ? 0.033 : 0.045)),
        );
        return mid;
      });
    } else {
      const tangent = flow.clone().addScaledVector(n, -flow.dot(n));
      if (tangent.length() < 0.15)
        tangent
          .set(0.5, 0, -1)
          .addScaledVector(n, -n.dot(new T.Vector3(0.5, 0, -1)));
      tangent.normalize();
      const points: T.Vector3[] = [];
      for (let j = 0; j <= (kind === 9 ? 32 : 10); j++) {
        const t = j / (kind === 9 ? 32 : 10),
          nn = n
            .clone()
            .addScaledVector(tangent, (t * length) / m.ry)
            .normalize();
        const point = m
          .point(nn)
          .addScaledVector(
            nn,
            -0.025 * (1 - t) +
              0.009 * t +
              Math.sin(Math.PI * t) * length * (kind === 4 ? 0.4 : 0.18),
          );
        const across = new T.Vector3().crossVectors(nn, tangent).normalize();
        if (kind === 9) {
          const curl = t * Math.PI * (5 + r() * 0.05);
          point
            .addScaledVector(
              across,
              Math.sin(curl) * 0.062 * Math.sin(Math.PI * t),
            )
            .addScaledVector(
              nn,
              (1 - Math.cos(curl)) * 0.035 * Math.sin(Math.PI * t),
            );
        }
        if (kind === 8)
          point
            .addScaledVector(
              across,
              Math.sin(t * 5 + theta) * 0.04 * Math.sin(Math.PI * t),
            )
            .addScaledVector(nn, 0.075 * Math.sin(Math.PI * t));
        point.x += bend * Math.sin(t * Math.PI) * 0.7;
        points.push(point);
      }
      geo = sweep(
        points,
        kind === 8
          ? 0.014
          : kind === 9
            ? 0.026
            : kind === 4
              ? 0.055 + r() * 0.035
              : kind === 7
                ? 0.012 + r() * 0.011
                : 0.004 + r() * 0.003,
        kind === 9 ? 32 : kind === 1 ? 10 : kind === 7 ? 12 : 20,
        kind === 1 ? 4 : kind === 7 ? 4 : 8,
        kind === 4 ? 0.015 : 0.0007,
        kind === 4 ? 0.045 : 0,
      );
    }
    const color = base.clone().lerp(r() > 0.2 ? tip : shade, r() * 0.48);
    colorGeometry(geo, color);
    const flex = new Float32Array(geo.attributes.position.count);
    for (let j = 0; j < flex.length; j++) {
      const t =
        kind === 5 || kind === 6 || kind === 10
          ? geo.attributes.uv.getY(j)
          : geo.attributes.uv.getX(j);
      flex[j] = t * t;
    }
    geo.setAttribute("flex", new T.BufferAttribute(flex, 1));
    parts.push(geo);
  }
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) return null;
  const mesh = new T.Mesh(geo, material);
  mesh.name = "grown-coat";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
