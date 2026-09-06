import * as T from "three";
import { rng, type Genome } from "./genome";
const bell = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
) => Math.exp(-(((x - cx) / w) ** 2) - ((y - cy) / h) ** 2);
const smooth = T.MathUtils.smoothstep;
/** Compact parametric nasal patch. Its collar has zero displacement and derivative.
 * Nasal cavities compress their radial coordinates below the rim, producing
 * an overhanging alar edge rather than a dark sphere attached to the face. */
export function nasalAnatomy(g: Genome, rx: number, ry: number) {
  const kind = g.genes.nose,
    r = rng(g.seed + "/nose-v3");
  const specs = [
    [0.23, 0.19, 0.23, 0.075],
    [0.32, 0.19, 0.25, 0.145],
    [0.19, 0.31, 0.36, 0.078],
    [0.34, 0.23, 0.29, 0.13],
    [0.29, 0.23, 0.3, 0.115],
    [0.22, 0.25, 0.39, 0.092],
    [0.28, 0.15, 0.19, 0.105],
    [0.36, 0.2, 0.27, 0.15],
    [0.39, 0.21, 0.22, 0.15],
    [0.27, 0.36, 0.23, 0.1],
  ];
  const s = specs[kind] ?? specs[0],
    width = s[0] * (0.93 + r() * 0.14) * Math.min(rx, 1.1),
    height = s[1] * (0.93 + r() * 0.14) * Math.min(ry, 1.1),
    depth = s[2] * (0.9 + r() * 0.18),
    cy = -0.035 * ry,
    holeY = cy - (kind === 2 ? 0.12 : kind === 9 ? 0.08 : 0.05),
    spread = s[3] * Math.min(rx, 1.1),
    holeWidth = kind === 1 ? 0.058 : kind === 8 ? 0.055 : 0.042,
    holeHeight = kind === 1 ? 0.043 : kind === 9 ? 0.049 : 0.032;
  const nostrils =
    kind === 10
      ? []
      : [-1, 1].map((side) => ({
          x: side * spread,
          y: holeY,
          sx: holeWidth,
          sy: holeHeight,
        }));
  function relief(x: number, y: number) {
    if (kind === 10) return 0;
    const u = x / width,
      v = (y - cy) / height,
      rr = Math.sqrt(u * u + v * v);
    const collar = 1 - smooth(rr, 1.15, 1.8);
    // Rounded cap and separate alar pads; superellipse gives broad animal noses.
    const p = [2, 4, 2, 4, 2, 4, 3, 4, 4, 2][kind];
    const radial = Math.pow(
      Math.pow(Math.abs(u), p) + Math.pow(Math.abs(v), p),
      1 / p,
    );
    const cap =
      depth * Math.sqrt(Math.max(0, 1 - (radial / 1.12) ** 2)) - 0.055;
    const k = 0.04,
      h = Math.max(k - Math.abs(cap), 0) / k;
    let z = Math.max(0, cap) + h * h * k * 0.25;
    if (kind === 0 || kind === 2 || kind === 4)
      z += 0.055 * bell(x, y, 0, cy + 0.18, 0.085, 0.19);
    z +=
      0.075 *
      (bell(x, y, -spread, holeY, width * 0.38, height * 0.55) +
        bell(x, y, spread, holeY, width * 0.38, height * 0.55));
    if (kind === 2)
      z +=
        0.16 * bell(x, y, 0, cy - 0.1, 0.105, 0.12) +
        0.055 * bell(x, y, 0, cy + 0.21, 0.09, 0.2);
    if (kind === 3 || kind === 8)
      z +=
        0.11 *
        (bell(x, y, -0.2, cy - 0.09, 0.19, 0.15) +
          bell(x, y, 0.2, cy - 0.09, 0.19, 0.15));
    if (kind === 6) z *= 0.52 + 0.48 * smooth(v, -0.8, 0.6);
    if (kind === 9)
      z +=
        0.18 * bell(x, y, 0, cy + 0.24, 0.065, 0.18) +
        0.05 * Math.cos(x * 45) * bell(x, y, 0, cy + 0.14, 0.2, 0.22);
    if (kind === 5)
      z +=
        0.006 * Math.cos((y - cy) * 85) * bell(x, y, 0, cy + 0.06, 0.17, 0.23);
    for (const h of nostrils) {
      const q = Math.hypot((x - h.x) / h.sx, (y - h.y) / h.sy);
      z += 0.012 * Math.exp(-(((q - 1.12) / 0.28) ** 2));
      z -= depth * 0.78 * (1 - smooth(q, 0.25, 1));
    }
    return z * collar;
  }
  function warp(x: number, y: number) {
    if (kind === 10) return { x, y };
    const u = x / width,
      v = (y - cy) / height,
      core =
        Math.exp(-Math.pow(u, 4) - Math.pow(v, 4)) *
        (1 - smooth(Math.hypot(u, v), 1.15, 1.8));
    // Push the tip into a broad bulb and tuck the lower skin underneath it.
    let dx = x * 0.13 * core,
      dy = (kind === 2 ? -0.065 : kind === 5 ? -0.035 : 0) * core;
    dy += 0.055 * Math.max(0, -v) * core;
    for (const h of nostrils) {
      const q = Math.hypot((x - h.x) / h.sx, (y - h.y) / h.sy);
      // Slightly wider chamber behind the lip, continuous at both ends.
      const f = 0.32 * Math.exp(-(((q - 0.63) / 0.22) ** 2));
      dx += (x - h.x) * f;
      dy += (y - h.y) * f;
    }
    return { x: x + dx, y: y + dy };
  }
  return { kind, width, height, cy, nostrils, relief, warp };
}

/** Closed, indexed ear shell: concentric front/back rings meet at one shared rim. */
export function earShell(g: Genome, side: number) {
  const kind = g.genes.ears,
    r = rng(g.seed + "/ear-v3"),
    asym = rng(g.seed + "/ear-side/" + side)();
  const lengths = [
    0.64, 1.03, 0.66, 0.86, 0.28, 0.52, 0.56, 0.72, 0.55, 0.46, 0.76, 0.53,
  ];
  const widths = [
    0.24, 0.17, 0.31, 0.26, 0.17, 0.27, 0.27, 0.29, 0.25, 0.29, 0.32, 0.23,
  ];
  const length = lengths[kind] * (0.92 + r() * 0.16) * (0.97 + asym * 0.06),
    width = widths[kind] * (0.92 + r() * 0.16);
  const segments = 64,
    rings = 18,
    positions: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  const shape = (a: number, t: number, back: boolean) => {
    const c = Math.cos(a),
      s = Math.sin(a),
      pointed = [0, 1, 2, 8].includes(kind);
    const longitudinal = (c + 1) * 0.5;
    let xx = t * c * length * 0.5 + length * 0.43,
      yy = t * s * width * (pointed ? 1 - 0.78 * longitudinal : 1);
    const scallop =
      kind === 7
        ? 1 + 0.08 * Math.cos(a * 7)
        : kind === 2
          ? 1 + 0.07 * Math.cos(a * 5)
          : 1;
    yy *= scallop;
    const bowl = 1 - t * t,
      rim = 0.07 * Math.exp(-(((t - 0.89) / 0.1) ** 2));
    const fold =
      0.04 *
      Math.exp(-(((t - 0.52) / 0.12) ** 2)) *
      (1 + 0.45 * Math.cos(a * 3));
    let z = back ? -0.065 - 0.09 * bowl : -0.025 - 0.19 * bowl + rim + fold;
    if (t === 1) z = -0.025;
    if (kind === 11) {
      yy -= 0.07 * Math.exp(-(((a - Math.PI * 1.5) / 0.55) ** 2)) * t;
    }
    const angle =
      kind === 1
        ? 1.22
        : kind === 8
          ? 0.68
          : kind === 3
            ? -0.35
            : kind === 10
              ? 0.04
              : kind === 11
                ? 0.8
                : 0.42;
    const bend =
      kind === 3
        ? -0.38 * (xx / length) ** 2
        : kind === 0
          ? 0.08 * (xx / length) ** 2
          : 0;
    return new T.Vector3(
      side * (xx * Math.cos(angle) - yy * Math.sin(angle)),
      xx * Math.sin(angle) + yy * Math.cos(angle) + bend,
      z - (kind === 3 ? 0.14 : 0) * (xx / length) ** 2,
    );
  };
  const add = (q: T.Vector3, t: number, back: boolean) => {
    const i = positions.length / 3;
    positions.push(q.x, q.y, q.z);
    colors.push(back ? 0 : Math.max(0, 1 - t) * 0.35);
    return i;
  };
  const front: number[][] = [],
    back: number[][] = [];
  for (let layer = 0; layer < 2; layer++) {
    const arr = layer ? back : front;
    arr.push([add(shape(0, 0, !!layer), 0, !!layer)]);
    for (let j = 1; j <= rings; j++) {
      if (layer && j === rings) {
        arr.push(front[j]);
        continue;
      }
      arr.push(
        Array.from({ length: segments }, (_, i) =>
          add(
            shape((i / segments) * Math.PI * 2, j / rings, !!layer),
            j / rings,
            !!layer,
          ),
        ),
      );
    }
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      const tri = (a: number, b: number, c: number) =>
        indices.push(...(layer ? [a, c, b] : [a, b, c]));
      tri(arr[0][0], arr[1][i], arr[1][n]);
      for (let j = 1; j < rings; j++) {
        tri(arr[j][i], arr[j + 1][i], arr[j + 1][n]);
        tri(arr[j][i], arr[j + 1][n], arr[j][n]);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.innerMix = colors;
  return geo;
}

export function pupilGeometry(kind: number, radius: number) {
  const p: number[] = [0, 0, radius + 0.03],
    idx: number[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a);
    let x = c * 0.23,
      y = s * 0.25;
    if (kind === 1) {
      x = c * 0.095;
      y = s * 0.35;
    }
    if (kind === 2) {
      x = c * 0.35;
      y = s * 0.095;
    }
    if (kind === 3) {
      x = Math.sign(c) * Math.abs(c) ** 0.4 * 0.34;
      y = Math.sign(s) * Math.abs(s) ** 0.4 * 0.12;
    }
    if (kind === 4) {
      x = Math.sign(c) * c * c * 0.25;
      y = Math.sign(s) * s * s * 0.32;
    }
    if (kind === 5) {
      x = c * 0.13 + 0.055 * Math.sin(s * 7);
      y = s * 0.34;
    }
    p.push(
      x * radius,
      y * radius,
      radius + 0.03 - radius * 0.1 * (x * x + y * y),
    );
    idx.push(0, i + 1, ((i + 1) % 64) + 1);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
