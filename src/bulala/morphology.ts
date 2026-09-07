import * as T from "three";
import { pigment } from "./pigment";
import { rng, palettes, NOSE_NONE, type Genome } from "./genome";

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
  squareness: number;
  tear: number;
  heart: number;
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
    [0.86, 1.28, 0.84],
    [1.02, 1.12, 0.86],
    [0.92, 1.22, 0.85],
    [1.22, 0.78, 0.62],
    [1.08, 1.06, 0.92],
    [0.9, 1.24, 0.84],
    [1.05, 1.18, 0.88],
    [0.84, 1.32, 0.8],
    [1.1, 1.04, 0.9],
    [1.0, 1.16, 0.86],
  ];
  const f = families[g.genes.shape] ?? families[0];
  const rx = f[0] * between(0.91, 1.09),
    ry = f[1] * between(0.93, 1.06),
    rz = f[2] * between(0.93, 1.08);
  const skew = between(-0.03, 0.03) * variation;
  const jaw = between(-0.11, 0.18) * variation;
  const phase = between(0, 6.28);
  const mouthY = -0.43 * ry;
  const noNoseAccent = rng(g.seed + "/no-nose")() < 0.5 ? "eye" : "mouth";
  const mouthSpec = (
    [
      { w: 0.76, thick: 0.025, droop: 0, contour: "oval" },
      { w: 1.0, thick: 0.033, droop: 0, contour: "oval" },
      { w: 1.25, thick: 0.04, droop: 0, contour: "oval" },
      { w: 1.06, thick: 0.095, droop: 0, contour: "oval" },
      { w: 1.02, thick: 0.045, droop: 0.075, contour: "oval" },
      { w: 0.85, thick: 0.13, droop: 0, contour: "oval" },
      { w: 0.92, thick: 0.05, droop: 0, contour: "heart" },
      { w: 1.08, thick: 0.036, droop: 0, contour: "cat" },
      { w: 1.22, thick: 0.055, droop: 0, contour: "duck" },
      { w: 0.42, thick: 0.07, droop: 0, contour: "tiny" },
      { w: 0.98, thick: 0.048, droop: 0, contour: "bow" },
      { w: 1.12, thick: 0.04, droop: 0, contour: "wave" },
      { w: 1.05, thick: 0.05, droop: 0, contour: "square" },
      { w: 1.08, thick: 0.038, droop: 0, contour: "side" },
      { w: 1.18, thick: 0.03, droop: 0, contour: "fish" },
      { w: 0.72, thick: 0.08, droop: 0, contour: "beak" },
    ] as const
  )[g.genes.mouth] ?? { w: 1, thick: 0.04, droop: 0, contour: "oval" as const };
  const mouthWidth =
    (g.genes.nose === NOSE_NONE && noNoseAccent === "mouth" ? 1.45 : 1) *
    between(0.31, 0.42) *
    rx *
    mouthSpec.w;
  const mouthTilt =
    between(-0.1, 0.1) *
    variation *
    (g.genes.mouth === 1 || g.genes.mouth === 13 ? 1 : 0.25);
  const noseWidth =
    between(0.13, 0.21) * (g.genes.nose === 1 || g.genes.nose === 4 ? 1.6 : 1);
  between(0.13, 0.24); // Preserve the existing skull/eye random stream.
  const eyeCut = [
    { lid: 1, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.77, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.51, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.84, tilt: -0.18, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.73, tilt: 0.24, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 1.08, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.72, tilt: 0.12, square: 0.55, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.36, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 1 },
    { lid: 0.7, tilt: -0.1, square: 0, tear: 1, heart: 0, crescent: 0 },
    { lid: 0.62, tilt: 0.2, square: 0, tear: 0.2, heart: 0, crescent: 0 },
    { lid: 0.48, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.4, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 1.14, tilt: 0, square: 0, tear: 0, heart: 0, crescent: 0 },
    { lid: 0.78, tilt: 0, square: 0, tear: 0, heart: 1, crescent: 0 },
    { lid: 0.68, tilt: 0, square: 0.85, tear: 0, heart: 0, crescent: 0 },
  ][g.genes.eyeCut] ?? {
    lid: 1,
    tilt: 0,
    square: 0,
    tear: 0,
    heart: 0,
    crescent: 0,
  };
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
      radius: rad * between(0.83, 1.13) * (g.genes.eyeCut === 5 ? 1.12 : 1),
      tilt: between(-0.16, 0.16) + (x < 0 ? eyeCut.tilt : -eyeCut.tilt),
      depth: between(0.16, 0.47),
      lid: between(0.66, 0.84) * eyeCut.lid * (g.genes.eyes === 1 ? 0.8 : 1),
      squareness: eyeCut.square,
      tear: eyeCut.tear,
      heart: eyeCut.heart,
    });
  const imperfections = rng(g.seed+"/soft-face-v4");
  const cheekBias=(imperfections()-.5)*.04*rx;
  const foldBias=(imperfections()-.5)*.012*rx;
  const cheeks = between(0.07, 0.15);
  const bootySpec = [
    {
      sep: 0.37,
      y: -0.3,
      bulge: 0.25,
      rx: 0.5,
      ry: 0.35,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.4,
      y: -0.27,
      bulge: 0.34,
      rx: 0.49,
      ry: 0.39,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.49,
      y: -0.29,
      bulge: 0.26,
      rx: 0.58,
      ry: 0.35,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.32,
      y: -0.43,
      bulge: 0.33,
      rx: 0.42,
      ry: 0.5,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.35,
      y: -0.13,
      bulge: 0.28,
      rx: 0.47,
      ry: 0.36,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.34,
      y: -0.22,
      bulge: 0.3,
      rx: 0.46,
      ry: 0.4,
      p: 2,
      heart: 1,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.44,
      y: -0.32,
      bulge: 0.18,
      rx: 0.62,
      ry: 0.24,
      p: 2.4,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.28,
      y: -0.3,
      bulge: 0.14,
      rx: 0.32,
      ry: 0.26,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.46,
      y: -0.28,
      bulge: 0.42,
      rx: 0.58,
      ry: 0.44,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.36,
      y: -0.26,
      bulge: 0.32,
      rx: 0.5,
      ry: 0.42,
      p: 2.6,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.16,
      y: -0.3,
      bulge: 0.3,
      rx: 0.52,
      ry: 0.36,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.58,
      y: -0.3,
      bulge: 0.26,
      rx: 0.42,
      ry: 0.34,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.4,
      y: -0.29,
      bulge: 0.28,
      rx: 0.5,
      ry: 0.34,
      p: 2.6,
      heart: 0,
      third: 0,
      dimple: 0,
    },
    {
      sep: 0.38,
      y: -0.28,
      bulge: 0.27,
      rx: 0.42,
      ry: 0.34,
      p: 2,
      heart: 0,
      third: 1,
      dimple: 0,
    },
    {
      sep: 0.38,
      y: -0.3,
      bulge: 0.3,
      rx: 0.5,
      ry: 0.36,
      p: 2,
      heart: 0,
      third: 0,
      dimple: 1,
    },
  ][g.genes.booty] ?? {
    sep: 0.37,
    y: -0.3,
    bulge: 0.25,
    rx: 0.5,
    ry: 0.35,
    p: 2,
    heart: 0,
    third: 0,
    dimple: 0,
  };
  const cheekSeparation = bootySpec.sep * rx * between(0.91, 1.08);
  const cheekY = bootySpec.y * ry;
  const bulge = bootySpec.bulge * betweenStable(g.seed) * 2.1;
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
    if (g.genes.shape === 8) w *= 1 + 0.1 * Math.sin(v * 3.2 + phase);
    if (g.genes.shape === 9) w *= 1 - 0.16 * v;
    if (g.genes.shape === 10) {
      w *= 1 - 0.26 * Math.exp(-(((v - 0.78) / 0.16) ** 2));
      w *= 1 - 0.2 * Math.exp(-(((v + 0.88) / 0.2) ** 2));
    }
    if (g.genes.shape === 11) w *= 1 - 0.22 * Math.exp(-((v / 0.16) ** 2));
    if (g.genes.shape === 14)
      w *= 1 - 0.2 * Math.exp(-(((v - 0.72) / 0.28) ** 2));
    if (g.genes.shape === 15)
      w *= 1 + 0.16 * Math.exp(-(((v - 0.55) / 0.28) ** 2));
    if (g.genes.shape === 17)
      w *= 1 - 0.14 * Math.exp(-(((v - 0.86) / 0.1) ** 2));
    if (g.genes.shape === 18) {
      w *= 1 + 0.14 * Math.exp(-(((v - 0.62) / 0.18) ** 2));
      w *= 1 - 0.18 * Math.exp(-(((v + 0.55) / 0.28) ** 2));
    }
    return w;
  }
  function xAt(u: number, v: number) {
    return u * width(v) + skew * v * (1 - v * v);
  }
  const nasal = nasalAnatomy(g, rx, ry);
  const nostrils = nasal.nostrils;
  if (g.genes.nose === NOSE_NONE && noNoseAccent === "eye") {
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
  if (g.genes.nose !== NOSE_NONE)
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
        [
          0.14, 0.23, 0.065, 0.13, 0.15, 0.16, 0.12, 0.1, 0.04, 0.09, 0.08,
          0.06, 0.07, 0.11, 0.13,
        ][g.genes.brows] *
        gaussian(x, y, e.x, e.y + e.radius * 0.85, e.radius * 1.3, 0.115);
      z +=
        0.028 *
        gaussian(x, y, e.x, e.y + e.radius * 1.35, e.radius * 1.2, 0.045);
    }
    if (g.genes.brows === 3)
      for (let i = 0; i < 4; i++)
        z += 0.025 * gaussian(x, y, 0, 0.67 * ry + i * 0.09, 0.6, 0.027);
    z += cheekBias*(gaussian(x,y,-.47*rx,-.12*ry,.35,.3)-gaussian(x,y,.47*rx,-.12*ry,.35,.3));
    z -= .012*rx*variation*gaussian(Math.abs(x),y,.43*rx,mouthY+.04,.065,.16);
    z += foldBias*gaussian(x,y,.22*rx,mouthY-.12,.22,.18);
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
      const p = bootySpec.p;
      const lobes = bootySpec.third ? [-1, 0, 1] : [-1, 1];
      for (const side of lobes) {
        const cx = side * cheekSeparation * (side === 0 ? 0 : 1);
        const cy =
          cheekY - 0.09 + (bootySpec.heart ? 0.06 * (1 - Math.abs(side)) : 0);
        const qx =
          Math.abs(x - cx) / (bootySpec.rx * rx * (side === 0 ? 0.72 : 1));
        const qy = Math.abs(y - cy) / (bootySpec.ry * ry);
        const qz = Math.abs(z + rz * 0.61) / (0.48 + bulge * 0.28);
        const q =
          Math.pow(Math.pow(qx, p) + Math.pow(qy, p) + Math.pow(qz, p), 1 / p) -
          1;
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
    return (
      (outside + inside) * 0.5 +
      base +
      (bootySpec.dimple
        ? 0.045 *
          (gaussian(x, y, -cheekSeparation * 0.55, cheekY, 0.12, 0.1) +
            gaussian(x, y, cheekSeparation * 0.55, cheekY, 0.12, 0.1))
        : 0)
    );
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
    const p =
      g.genes.shape === 13
        ? 2.55
        : g.genes.shape === 16
          ? 2.35
          : g.genes.shape === 12
            ? 2.25
            : 2;
    return Math.pow(
      Math.max(0, 1 - Math.pow(Math.abs(u), p) - Math.pow(Math.abs(v), p)),
      1 / p,
    );
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
  const patternInk=pigment(g);
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
    const eyeMask=eyes.reduce((v,e)=>Math.max(v,gaussian(x,y,e.x,e.y,e.radius*1.5,e.radius*1.3)),0)*frontMask;
    const mouthMask=gaussian(x,y,0,mouthY,mouthWidth*1.25,.20)*frontMask;
    const ink=patternInk(x/rx,y/ry,z/rz)*(1-.7*Math.max(eyeMask,mouthMask));
    if(g.genes.pattern===4)c.lerp(light,(1-T.MathUtils.smoothstep(y/ry,-.5,-.1))*.82);
    c.lerp(dark,ink*.60);
    // Nostrils are real mesh cavities — no painted dark stickers.
    return c;
  }
  function point(n: T.Vector3) {
    const x = xAt(n.x, n.y),
      y = n.y * ry;
    const rear = T.MathUtils.smoothstep(-n.z, 0, 0.55);
    const lobes =
      gaussian(n.x, n.y, -0.38, -0.7, 0.3, 0.35) +
      gaussian(n.x, n.y, 0.38, -0.7, 0.3, 0.35);
    const warped = nasal.warp(x, y);
    const face = T.MathUtils.smoothstep(n.z, 0.02, 0.22);
    // Depth follows the face-warped XY (not rear offsets) to avoid shear crinkle.
    const faceX = x + (warped.x - x) * face;
    const faceY = y + (warped.y - y) * face;
    return new T.Vector3(
      faceX + rear * n.x * 0.09 * lobes,
      faceY -
        rear * 0.11 * lobes +
        rear * 0.08 * gaussian(n.x, n.y, 0, -0.8, 0.17, 0.27),
      depth(faceX, faceY, n.z),
    );
  }
  function surface(n: T.Vector3) {
    const x = xAt(n.x, n.y),
      y = n.y * ry,
      pos = point(n);
    return { pos, color: color(pos.x, pos.y, pos.z), x, y };
  }
  function skinFront(x:number,y:number,dz=0){return new T.Vector3(x,y,front(x,y)+dz);}
  function deformation(pos:T.Vector3,open:number,smile:number){
    const face=T.MathUtils.smoothstep(pos.z,0,.4),below=T.MathUtils.smoothstep(mouthY+.11-pos.y,0,.33);
    const jaw=-open*.125*below*Math.exp(-((pos.x/(mouthWidth+.22))**4))*face;
    const cheek=gaussian(Math.abs(pos.x),pos.y,.48*rx,-.13,.30,.30)*face;
    return new T.Vector3(0,jaw+smile*cheek*.055,smile*cheek*.045);
  }
  function attachment(x:number,y:number){const rest=skinFront(x,y),e=.001;const normal=new T.Vector3(-(front(x+e,y)-front(x-e,y))/(2*e),-(front(x,y+e)-front(x,y-e))/(2*e),1).normalize();return {position:rest,normal,rest:rest.clone(),deform:(open:number,smile:number)=>rest.clone().add(deformation(rest,open,smile))};}
  return {
    rx,
    ry,
    rz,
    eyes,
    front,
    back,
    point,
    surface,
    skinFront,
    attachment,
    deformation,
    color,
    mouthY,
    mouthWidth,
    mouthTilt,
    mouthSpec,
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
