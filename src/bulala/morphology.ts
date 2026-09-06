import * as T from "three";
import { rng, palettes, type Genome } from "./genome";

import { nasalAnatomy } from "./anatomy";

const gaussian = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
) => Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
export interface EyeSocket {
  x: number;
  y: number;
  radius: number;
  tilt: number;
  lid: number;
  depth: number;
}
/** A continuous skull field. Every appendage samples the same surface at its root. */
export function morphology(g: Genome) {
  const r = rng(g.seed + "/anatomy-v2");
  const variation = 0.4 + (g.chaos / 100) * 0.6;
  const between = (a: number, b: number) => a + (b - a) * r();
  const families = [
    [1, 1.04, 0.83],
    [0.92, 1.18, 0.87],
    [1.21, 0.88, 0.83],
    [0.83, 1.3, 0.83],
    [1.05, 1.06, 0.86],
    [1.1, 1.06, 0.88],
    [0.79, 1.36, 0.87],
    [1.22, 0.88, 0.82],
    [1.02, 1.08, 0.91],
  ];
  const f = families[g.genes.shape];
  const rx = f[0] * between(0.91, 1.09),
    ry = f[1] * between(0.93, 1.06),
    rz = f[2] * between(0.93, 1.08);
  const skew = between(-0.13, 0.13) * variation;
  const jaw = between(-0.11, 0.18) * variation;
  const phase = between(0, 6.28);
  const mouthY = -0.43 * ry;
  const noNoseAccent = rng(g.seed + "/no-nose")() < 0.5 ? "eye" : "mouth";
  const mouthWidth =
    (g.genes.nose === 10 && noNoseAccent === "mouth" ? 1.45 : 1) *
    between(0.31, 0.42) *
    rx *
    [0.76, 1.0, 1.25, 1.06, 1.02, 0.85][g.genes.mouth];
  const mouthTilt =
    between(-0.1, 0.1) * variation * (g.genes.mouth === 1 ? 1 : 0.25);
  const noseWidth =
    between(0.13, 0.21) * (g.genes.nose === 1 || g.genes.nose === 4 ? 1.6 : 1);
  between(0.13, 0.24); // Preserve the existing skull/eye random stream.
  const eyes: EyeSocket[] = [];
  const layout =
    g.genes.eyes === 3
      ? [[0, 0.31, 0.35]]
      : g.genes.eyes === 4
        ? [
            [-0.39, 0.29, 0.23],
            [0.4, 0.32, 0.26],
            [-0.61, 0.58, 0.13],
            [0.6, 0.65, 0.12],
            [-0.15, 0.7, 0.11],
            [0.17, 0.73, 0.12],
          ]
        : [
            [-0.39, 0.32, 0.28],
            [0.39, 0.36, 0.29],
            ...(g.genes.eyes === 2 ? [[0.03, 0.77, 0.16]] : []),
          ];
  for (const [x, y, rad] of layout)
    eyes.push({
      x: (x + between(-0.04, 0.04) * variation) * rx,
      y: (y + between(-0.07, 0.07) * variation) * ry,
      radius: rad * between(0.83, 1.13),
      tilt:
        between(-0.16, 0.16) +
        (g.genes.eyeCut === 4
          ? x < 0
            ? 0.24
            : -0.24
          : g.genes.eyeCut === 3
            ? x < 0
              ? -0.18
              : 0.18
            : 0),
      depth: between(0.16, 0.47),
      lid:
        between(0.66, 0.84) *
        [1, 0.77, 0.51, 0.84, 0.73][g.genes.eyeCut] *
        (g.genes.eyes === 1 ? 0.8 : 1),
    });
  const cheeks = between(0.07, 0.15);
  const booty = [
    [0.37, -0.3, 0.25],
    [0.4, -0.27, 0.34],
    [0.49, -0.29, 0.26],
    [0.32, -0.43, 0.33],
    [0.35, -0.13, 0.28],
  ][g.genes.booty];
  const cheekSeparation = booty[0] * rx * between(0.91, 1.08);
  const cheekY = booty[1] * ry;
  const bulge = booty[2] * betweenStable(g.seed) * 2.1;
  function width(v: number) {
    let w = rx * (1 + jaw * Math.exp(-(((v + 0.45) / 0.35) ** 2)));
    if (g.genes.shape === 1) w *= 1 - 0.18 * v;
    if (g.genes.shape === 4) w *= 1 + 0.13 * Math.sin(v * 3 + phase);
    if (g.genes.shape === 5)
      w *= 1 + 0.11 * Math.exp(-(((v - 0.6) / 0.3) ** 2));
    if (g.genes.shape === 6)
      w *= 1 - 0.13 * Math.exp(-(((v + 0.28) / 0.25) ** 2));
    if (g.genes.shape === 7)
      w *= 1 + 0.16 * Math.exp(-(((v + 0.1) / 0.37) ** 2));
    if (g.genes.shape === 8) w *= 1 + 0.1 * Math.sin(v * 8 + phase);
    return w;
  }
  function xAt(u: number, v: number) {
    return u * width(v) + skew * v * (1 - v * v);
  }
  const nasal = nasalAnatomy(g, rx, ry);
  const nostrils = nasal.nostrils;
  if (g.genes.nose === 10 && noNoseAccent === "eye") {
    const eye = eyes[0];
    eye.radius *= 1.48;
    eye.x *= 0.78;
    for (let i = 1; i < eyes.length; i++) {
      const other = eyes[i],
        distance = Math.hypot(other.x - eye.x, other.y - eye.y),
        needed = eye.radius + other.radius + 0.07;
      if (distance < needed) {
        const factor = needed / Math.max(distance, 0.01);
        other.x = eye.x + (other.x - eye.x) * factor;
        other.y = eye.y + (other.y - eye.y) * factor;
      }
    }
  }
  if (g.genes.nose !== 10)
    for (const e of eyes) {
      const clearance = nasal.width * 0.72 + e.radius * 0.8;
      if (
        Math.abs(e.x) < clearance &&
        e.y - e.radius < nasal.cy + nasal.height * 0.65
      )
        e.y = Math.max(e.y, nasal.cy + nasal.height * 0.65 + e.radius * 0.8);
    }
  function faceRelief(x: number, y: number) {
    const v = y / ry,
      u = (x - skew * v * (1 - v * v)) / width(v);
    let z = 0;
    // Flesh grows out of the skull: cheek pads, muzzle, chin and orbital ridges.
    z +=
      cheeks *
      (gaussian(x, y, -0.48 * rx, -0.15 * ry, 0.34, 0.28) +
        gaussian(x, y, 0.48 * rx, -0.14 * ry, 0.34, 0.28));
    z += 0.1 * gaussian(x, y, 0, mouthY, 0.52 * rx, 0.26);
    const chinAmount = [0.08, 0.16, 0.12, 0.1][g.genes.chin];
    z +=
      chinAmount *
      gaussian(
        x,
        y,
        g.genes.chin === 3 ? 0.14 : 0,
        mouthY - 0.25,
        0.34,
        g.genes.chin === 1 ? 0.3 : 0.2,
      );
    for (const e of eyes) {
      z -= 0.075 * gaussian(x, y, e.x, e.y, e.radius * 1.1, e.radius * 0.85);
      z +=
        [0.14, 0.23, 0.065, 0.13, 0.15][g.genes.brows] *
        gaussian(x, y, e.x, e.y + e.radius * 0.85, e.radius * 1.3, 0.115);
      z +=
        0.028 *
        gaussian(x, y, e.x, e.y + e.radius * 1.35, e.radius * 1.2, 0.045);
    }
    if (g.genes.brows === 3)
      for (let i = 0; i < 4; i++)
        z += 0.025 * gaussian(x, y, 0, 0.67 * ry + i * 0.09, 0.6, 0.027);
    z += nasal.relief(x, y);
    // Broad low-frequency asymmetry, never vertex noise or disconnected bumps.
    z +=
      variation *
      0.022 *
      Math.sin(x * 7 + phase) *
      Math.sin(y * 6) *
      Math.max(0, 1 - u * u - v * v);
    if (g.genes.mouth === 3 || g.genes.chin === 2) {
      for (let i = 0; i < 2; i++)
        z += 0.035 * gaussian(x, y, 0, mouthY - 0.18 - i * 0.105, 0.38, 0.027);
    }
    return z;
  }
  function rearRelief(x: number, y: number) {
    const base = rz * projectedZ(x, y);
    const smoothMin = (a: number, b: number) => {
      const h = Math.max(0.13 - Math.abs(a - b), 0) / 0.13;
      return Math.min(a, b) - h * h * 0.13 * 0.25;
    };
    const field = (z: number) => {
      let d = -z - base;
      for (const side of [-1, 1]) {
        const q =
          Math.sqrt(
            ((x - side * cheekSeparation) /
              ([0.5, 0.49, 0.58, 0.42, 0.47][g.genes.booty] * rx)) **
              2 +
              ((y - (cheekY - 0.09)) /
                ([0.35, 0.39, 0.35, 0.5, 0.36][g.genes.booty] * ry)) **
                2 +
              ((z + rz * 0.61) / (0.48 + bulge * 0.28)) ** 2,
          ) - 1;
        d = smoothMin(d, q * 0.42);
      }
      return d;
    };
    let outside = -2.7,
      inside = -base;
    for (let i = 0; i < 17; i++) {
      const mid = (outside + inside) * 0.5;
      if (field(mid) > 0) outside = mid;
      else inside = mid;
    }
    return (outside + inside) * 0.5 + base;
  }
  // Relief and its first derivative vanish at the shared side boundary.
  function depth(x: number, y: number, nz: number) {
    const f = T.MathUtils.smoothstep(nz, 0, 0.48),
      b = T.MathUtils.smoothstep(-nz, 0, 0.48);
    return (
      rz * nz +
      (f > 0 ? faceRelief(x, y) * f : 0) +
      (b > 0 ? rearRelief(x, y) * b : 0)
    );
  }
  function projectedZ(x: number, y: number) {
    const v = y / ry,
      u = (x - skew * v * (1 - v * v)) / width(v);
    return Math.sqrt(Math.max(0, 1 - u * u - v * v));
  }
  function front(x: number, y: number) {
    return depth(x, y, projectedZ(x, y));
  }
  function back(x: number, y: number) {
    return depth(x, y, -projectedZ(x, y));
  }
  const p = palettes[g.genes.palette];
  const baseColor = new T.Color(p[0]),
    light = new T.Color(p[1]),
    warm = new T.Color(p[3]),
    dark = new T.Color(p[2]);
  function color(x: number, y: number, z: number) {
    const c = baseColor.clone();
    const frontMask = T.MathUtils.smoothstep(z, 0, 0.45);
    const face = frontMask * gaussian(x, y, 0, -0.13, 0.77 * rx, 0.76 * ry);
    c.lerp(light, face * 0.36);
    const flush =
      frontMask * gaussian(Math.abs(x), y, 0.57 * rx, -0.15, 0.23, 0.19) +
      (1 - frontMask) *
        gaussian(Math.abs(x), y, cheekSeparation, cheekY, 0.33, 0.35) *
        0.18;
    c.lerp(warm, flush * 0.28);
    const noise = Math.sin(x * 8 + Math.sin(y * 6 + phase) * 1.7 + z * 5);
    const stripes = Math.sin(x * 15 + Math.sin(y * 8 + z * 6 + phase) * 2.5);
    const cells =
      Math.sin(x * 19 + Math.sin(y * 11)) * Math.sin(y * 17 + z * 13 + phase);
    let ink = 0;
    if (g.genes.pattern === 1)
      ink =
        T.MathUtils.smoothstep(cells, 0.28, 0.42) *
        (1 - T.MathUtils.smoothstep(cells, 0.63, 0.77));
    if (g.genes.pattern === 2) ink = T.MathUtils.smoothstep(stripes, 0.1, 0.45);
    if (g.genes.pattern === 3) ink = T.MathUtils.smoothstep(cells, 0.38, 0.62);
    if (g.genes.pattern === 4)
      c.lerp(light, (1 - T.MathUtils.smoothstep(y / ry, -0.5, -0.1)) * 0.82);
    if (g.genes.pattern === 5)
      ink =
        T.MathUtils.smoothstep(-z, 0.15, 0.6) *
        T.MathUtils.smoothstep(noise, 0.1, 0.55);
    if (g.genes.pattern === 6)
      ink =
        T.MathUtils.smoothstep(-z, 0.25, 0.7) *
        (1 - T.MathUtils.smoothstep(y, -0.25, 0.15)) *
        T.MathUtils.smoothstep(cells, 0.2, 0.52);
    c.lerp(dark, ink * 0.64);
    if (z > 0)
      for (const hole of nostrils)
        c.lerp(
          dark,
          (1 -
            T.MathUtils.smoothstep(
              Math.hypot((x - hole.x) / hole.sx, (y - hole.y) / hole.sy),
              0.35,
              0.9,
            )) *
            0.94,
        );
    return c;
  }
  function point(n: T.Vector3) {
    const x = xAt(n.x, n.y),
      y = n.y * ry;
    const rear = T.MathUtils.smoothstep(-n.z, 0, 0.55);
    const lobes =
      gaussian(n.x, n.y, -0.38, -0.7, 0.3, 0.35) +
      gaussian(n.x, n.y, 0.38, -0.7, 0.3, 0.35);
    const warped = n.z > 0 ? nasal.warp(x, y) : { x, y };
    return new T.Vector3(
      warped.x + rear * n.x * 0.09 * lobes,
      warped.y -
        rear * 0.11 * lobes +
        rear * 0.08 * gaussian(n.x, n.y, 0, -0.8, 0.17, 0.27),
      depth(x, y, n.z),
    );
  }
  return {
    rx,
    ry,
    rz,
    eyes,
    front,
    back,
    point,
    color,
    mouthY,
    mouthWidth,
    mouthTilt,
    noseWidth,
    nasal,
    noNoseAccent,
    nostrils,
    cheekY,
  };
}
function betweenStable(seed: string) {
  return 0.88 + rng(seed + "/rump")() * 0.24;
}
export type Morphology = ReturnType<typeof morphology>;
