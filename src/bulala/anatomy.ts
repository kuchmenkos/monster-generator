import * as T from "three";
import { rng, type Genome } from "./genome";

type NostrilLayout = "none" | "pair" | "front" | "slits" | "triple" | "single";

/** Convex clay primitive in nasal local space (z > 0 sticks out of the face). */
type Blob = {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  p: number;
};

type NoseFamily = {
  bridge: Blob[];
  tip: Blob[];
  wings: Blob[];
  blend: number;
  spread: number;
  holeW: number;
  holeH: number;
  holeY: number;
  holeZ: number;
  holeDepth: number;
  nostrils: NostrilLayout;
  /** Pull parametric vertices toward the tip so the silhouette densifies. */
  warp: number;
};

const b = (
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  p = 2,
): Blob => ({ cx, cy, cz, rx, ry, rz, p });

const noneFamily = (): NoseFamily => ({
  bridge: [],
  tip: [],
  wings: [],
  blend: 0.1,
  spread: 0,
  holeW: 0,
  holeH: 0,
  holeY: 0,
  holeZ: 0,
  holeDepth: 0,
  nostrils: "none",
  warp: 0,
});

/**
 * Declarative clay noses. Index 10 stays empty so old DNA keeps a blank face.
 * Each family is a smooth-min of bridge + tip + wing blobs — never a height map.
 */
const noseFamilies: NoseFamily[] = [
  // 0 Курносый — short upturned tip on a soft bridge
  {
    ...noneFamily(),
    bridge: [b(0, 0.04, 0.08, 0.07, 0.1, 0.1)],
    tip: [b(0, -0.02, 0.16, 0.1, 0.08, 0.11)],
    wings: [
      b(-0.06, -0.04, 0.12, 0.05, 0.045, 0.07),
      b(0.06, -0.04, 0.12, 0.05, 0.045, 0.07),
    ],
    blend: 0.09,
    spread: 0.055,
    holeW: 0.028,
    holeH: 0.022,
    holeY: -0.04,
    holeZ: 0.14,
    holeDepth: 0.07,
    nostrils: "front",
    warp: 0.35,
  },
  // 1 Пятачок — flat disc tip
  {
    ...noneFamily(),
    bridge: [b(0, 0.02, 0.06, 0.08, 0.08, 0.07)],
    tip: [b(0, -0.03, 0.14, 0.16, 0.1, 0.06, 2.4)],
    wings: [],
    blend: 0.1,
    spread: 0.09,
    holeW: 0.04,
    holeH: 0.032,
    holeY: -0.03,
    holeZ: 0.15,
    holeDepth: 0.06,
    nostrils: "front",
    warp: 0.4,
  },
  // 2 Крючковатый — hooked tip below a tall bridge
  {
    ...noneFamily(),
    bridge: [b(0, 0.08, 0.1, 0.06, 0.14, 0.11)],
    tip: [b(0, -0.1, 0.2, 0.09, 0.09, 0.12)],
    wings: [
      b(-0.05, -0.08, 0.14, 0.04, 0.05, 0.06),
      b(0.05, -0.08, 0.14, 0.04, 0.05, 0.06),
    ],
    blend: 0.08,
    spread: 0.05,
    holeW: 0.024,
    holeH: 0.02,
    holeY: -0.12,
    holeZ: 0.18,
    holeDepth: 0.08,
    nostrils: "slits",
    warp: 0.45,
  },
  // 3 Собачья морда — long muzzle of stacked blobs
  {
    ...noneFamily(),
    bridge: [b(0, 0.02, 0.1, 0.1, 0.12, 0.12)],
    tip: [b(0, -0.06, 0.24, 0.12, 0.1, 0.12)],
    wings: [
      b(-0.08, -0.05, 0.18, 0.055, 0.05, 0.08),
      b(0.08, -0.05, 0.18, 0.055, 0.05, 0.08),
    ],
    blend: 0.11,
    spread: 0.08,
    holeW: 0.026,
    holeH: 0.03,
    holeY: -0.08,
    holeZ: 0.22,
    holeDepth: 0.09,
    nostrils: "slits",
    warp: 0.55,
  },
  // 4 Нос-картошка — lumpy potato
  {
    ...noneFamily(),
    bridge: [b(0, 0.04, 0.09, 0.09, 0.1, 0.1)],
    tip: [
      b(-0.04, -0.02, 0.17, 0.09, 0.09, 0.1),
      b(0.05, -0.04, 0.15, 0.08, 0.08, 0.09),
    ],
    wings: [
      b(-0.09, -0.05, 0.12, 0.05, 0.05, 0.06),
      b(0.09, -0.04, 0.12, 0.05, 0.05, 0.06),
    ],
    blend: 0.12,
    spread: 0.075,
    holeW: 0.03,
    holeH: 0.024,
    holeY: -0.05,
    holeZ: 0.15,
    holeDepth: 0.07,
    nostrils: "pair",
    warp: 0.4,
  },
  // 5 Трубконос — tubular snout (wide soft clay tube, not a thin cliff)
  {
    ...noneFamily(),
    bridge: [b(0, 0.0, 0.12, 0.11, 0.1, 0.14)],
    tip: [b(0, -0.04, 0.26, 0.13, 0.1, 0.11)],
    wings: [],
    blend: 0.22,
    spread: 0.045,
    holeW: 0.03,
    holeH: 0.026,
    holeY: -0.04,
    holeZ: 0.26,
    holeDepth: 0.1,
    nostrils: "front",
    warp: 0.28,
  },
  // 6 Кошачий нос — tiny triangle tip
  {
    ...noneFamily(),
    bridge: [b(0, 0.02, 0.05, 0.05, 0.06, 0.05)],
    tip: [b(0, -0.02, 0.1, 0.07, 0.05, 0.055, 2.6)],
    wings: [
      b(-0.045, -0.03, 0.08, 0.03, 0.025, 0.04),
      b(0.045, -0.03, 0.08, 0.03, 0.025, 0.04),
    ],
    blend: 0.07,
    spread: 0.04,
    holeW: 0.016,
    holeH: 0.022,
    holeY: -0.03,
    holeZ: 0.1,
    holeDepth: 0.05,
    nostrils: "slits",
    warp: 0.3,
  },
  // 7 Медвежий нос — broad pad
  {
    ...noneFamily(),
    bridge: [b(0, 0.02, 0.08, 0.1, 0.09, 0.09)],
    tip: [b(0, -0.04, 0.16, 0.15, 0.1, 0.09)],
    wings: [
      b(-0.1, -0.05, 0.12, 0.06, 0.05, 0.07),
      b(0.1, -0.05, 0.12, 0.06, 0.05, 0.07),
    ],
    blend: 0.11,
    spread: 0.1,
    holeW: 0.036,
    holeH: 0.028,
    holeY: -0.05,
    holeZ: 0.16,
    holeDepth: 0.07,
    nostrils: "front",
    warp: 0.4,
  },
  // 8 Морда тюленя — wide flat muzzle
  {
    ...noneFamily(),
    bridge: [b(0, 0.0, 0.08, 0.12, 0.08, 0.08)],
    tip: [b(0, -0.05, 0.14, 0.17, 0.09, 0.07, 2.3)],
    wings: [],
    blend: 0.12,
    spread: 0.1,
    holeW: 0.034,
    holeH: 0.024,
    holeY: -0.05,
    holeZ: 0.14,
    holeDepth: 0.06,
    nostrils: "pair",
    warp: 0.35,
  },
  // 9 Нос-лист — leaf ridge + flared tip
  {
    ...noneFamily(),
    bridge: [b(0, 0.1, 0.1, 0.04, 0.16, 0.08)],
    tip: [b(0, -0.06, 0.14, 0.1, 0.08, 0.09)],
    wings: [
      b(-0.07, 0.02, 0.09, 0.05, 0.1, 0.05),
      b(0.07, 0.02, 0.09, 0.05, 0.1, 0.05),
    ],
    blend: 0.08,
    spread: 0.04,
    holeW: 0.018,
    holeH: 0.024,
    holeY: -0.08,
    holeZ: 0.13,
    holeDepth: 0.06,
    nostrils: "slits",
    warp: 0.4,
  },
  // 10 Без носа
  noneFamily(),
  // 11 Клюв — pointed beak of overlapping ovals
  {
    ...noneFamily(),
    bridge: [b(0, 0.06, 0.1, 0.05, 0.12, 0.1)],
    tip: [b(0, -0.08, 0.22, 0.06, 0.08, 0.12)],
    wings: [],
    blend: 0.07,
    spread: 0.025,
    holeW: 0.014,
    holeH: 0.018,
    holeY: -0.1,
    holeZ: 0.18,
    holeDepth: 0.07,
    nostrils: "slits",
    warp: 0.5,
  },
  // 12 Хоботок — trunk of cascading blobs
  {
    ...noneFamily(),
    bridge: [b(0, 0.04, 0.1, 0.07, 0.1, 0.1)],
    tip: [b(0, -0.04, 0.2, 0.08, 0.09, 0.1), b(0, -0.12, 0.3, 0.07, 0.08, 0.1)],
    wings: [],
    blend: 0.1,
    spread: 0.035,
    holeW: 0.026,
    holeH: 0.022,
    holeY: -0.14,
    holeZ: 0.3,
    holeDepth: 0.1,
    nostrils: "front",
    warp: 0.65,
  },
  // 13 Сердечко — two upper lobes + lower tip
  {
    ...noneFamily(),
    bridge: [],
    tip: [b(0, -0.05, 0.14, 0.07, 0.07, 0.08)],
    wings: [
      b(-0.07, 0.02, 0.13, 0.075, 0.07, 0.09),
      b(0.07, 0.02, 0.13, 0.075, 0.07, 0.09),
    ],
    blend: 0.09,
    spread: 0.07,
    holeW: 0.024,
    holeH: 0.02,
    holeY: -0.04,
    holeZ: 0.13,
    holeDepth: 0.06,
    nostrils: "pair",
    warp: 0.4,
  },
  // 14 Римский — high arched bridge + rounded tip
  {
    ...noneFamily(),
    bridge: [b(0, 0.1, 0.12, 0.055, 0.14, 0.1)],
    tip: [b(0, -0.05, 0.18, 0.09, 0.08, 0.1)],
    wings: [
      b(-0.055, -0.04, 0.13, 0.04, 0.04, 0.06),
      b(0.055, -0.04, 0.13, 0.04, 0.04, 0.06),
    ],
    blend: 0.08,
    spread: 0.055,
    holeW: 0.026,
    holeH: 0.022,
    holeY: -0.06,
    holeZ: 0.16,
    holeDepth: 0.07,
    nostrils: "pair",
    warp: 0.45,
  },
  // 15 Приплюснутый — pancake tip
  {
    ...noneFamily(),
    bridge: [b(0, 0.0, 0.05, 0.1, 0.06, 0.05)],
    tip: [b(0, -0.02, 0.09, 0.16, 0.08, 0.045, 2.5)],
    wings: [],
    blend: 0.1,
    spread: 0.1,
    holeW: 0.038,
    holeH: 0.018,
    holeY: -0.02,
    holeZ: 0.09,
    holeDepth: 0.045,
    nostrils: "front",
    warp: 0.3,
  },
  // 16 Гриб — stalk + cap
  {
    ...noneFamily(),
    bridge: [b(0, 0.0, 0.1, 0.05, 0.06, 0.1)],
    tip: [b(0, 0.04, 0.2, 0.13, 0.1, 0.08)],
    wings: [],
    blend: 0.09,
    spread: 0.055,
    holeW: 0.028,
    holeH: 0.022,
    holeY: -0.04,
    holeZ: 0.16,
    holeDepth: 0.07,
    nostrils: "pair",
    warp: 0.5,
  },
  // 17 Звездчатый — tip with five soft rays
  {
    ...noneFamily(),
    bridge: [b(0, 0.02, 0.07, 0.06, 0.07, 0.07)],
    tip: [b(0, -0.02, 0.14, 0.08, 0.08, 0.08)],
    wings: [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      return b(
        Math.cos(a) * 0.08,
        Math.sin(a) * 0.06 - 0.02,
        0.12,
        0.04,
        0.04,
        0.05,
      );
    }),
    blend: 0.1,
    spread: 0.07,
    holeW: 0.018,
    holeH: 0.018,
    holeY: -0.03,
    holeZ: 0.13,
    holeDepth: 0.055,
    nostrils: "triple",
    warp: 0.4,
  },
  // 18 Утиный — broad bill
  {
    ...noneFamily(),
    bridge: [b(0, 0.02, 0.08, 0.09, 0.07, 0.08)],
    tip: [b(0, -0.04, 0.18, 0.16, 0.07, 0.09, 2.2)],
    wings: [],
    blend: 0.1,
    spread: 0.09,
    holeW: 0.03,
    holeH: 0.018,
    holeY: -0.03,
    holeZ: 0.16,
    holeDepth: 0.06,
    nostrils: "front",
    warp: 0.45,
  },
  // 19 Раздвоенный — cleft tip of two lobes
  {
    ...noneFamily(),
    bridge: [b(0, 0.04, 0.09, 0.07, 0.09, 0.09)],
    tip: [
      b(-0.06, -0.04, 0.16, 0.08, 0.08, 0.09),
      b(0.06, -0.04, 0.16, 0.08, 0.08, 0.09),
    ],
    wings: [],
    blend: 0.08,
    spread: 0.08,
    holeW: 0.028,
    holeH: 0.022,
    holeY: -0.05,
    holeZ: 0.15,
    holeDepth: 0.07,
    nostrils: "pair",
    warp: 0.4,
  },
  // 20 Горошина — tiny pea
  {
    ...noneFamily(),
    bridge: [],
    tip: [b(0, 0.0, 0.11, 0.055, 0.055, 0.07)],
    wings: [],
    blend: 0.08,
    spread: 0.02,
    holeW: 0.016,
    holeH: 0.014,
    holeY: 0.0,
    holeZ: 0.12,
    holeDepth: 0.045,
    nostrils: "single",
    warp: 0.25,
  },
];

function nostrilSites(
  layout: NostrilLayout,
  spread: number,
  holeY: number,
  holeW: number,
  holeH: number,
  holeZ: number,
  holeDepth: number,
) {
  if (layout === "none") return [];
  const base = { sz: holeDepth, cz: holeZ };
  if (layout === "single")
    return [
      {
        x: 0,
        y: holeY,
        sx: holeW * 1.15,
        sy: holeH * 1.15,
        ...base,
      },
    ];
  if (layout === "triple")
    return [
      { x: 0, y: holeY + 0.015, sx: holeW * 0.72, sy: holeH * 0.72, ...base },
      { x: -spread, y: holeY, sx: holeW, sy: holeH, ...base },
      { x: spread, y: holeY, sx: holeW, sy: holeH, ...base },
    ];
  const sx = layout === "slits" ? holeW * 0.62 : holeW;
  const sy = layout === "slits" ? holeH * 1.35 : holeH;
  const x = layout === "front" ? spread * 0.72 : spread;
  return [-1, 1].map((side) => ({
    x: side * x,
    y: holeY,
    sx,
    sy,
    ...base,
  }));
}

const smoothMin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smoothMax = (a: number, b: number, k: number) => -smoothMin(-a, -b, k);

function blobField(x: number, y: number, z: number, blob: Blob) {
  const qx = Math.abs(x - blob.cx) / blob.rx,
    qy = Math.abs(y - blob.cy) / blob.ry,
    qz = Math.abs(z - blob.cz) / blob.rz,
    p = blob.p;
  return (p===2 ? Math.sqrt(qx*qx+qy*qy+qz*qz) : Math.pow(qx ** p + qy ** p + qz ** p, 1 / p)) - 1;
}

/** Smooth-min clay nose: convex blobs + drilled nostrils, solved by bisection. */
export function nasalAnatomy(g: Genome, rx: number, ry: number) {
  const kind = g.genes.nose,
    r = rng(g.seed + "/nose-v3"),
    f = noseFamilies[kind] ?? noseFamilies[0];
  const scale = Math.min(rx, 1.1) * (1.05 + r() * 0.14);
  const s = (v: number) => v * scale;
  const blobs: Blob[] = [...f.bridge, ...f.tip, ...f.wings].map((blob) => ({
    cx: s(blob.cx),
    cy: s(blob.cy) - 0.035 * ry,
    cz: s(blob.cz),
    rx: s(blob.rx) * (0.94 + r() * 0.12),
    ry: s(blob.ry) * (0.94 + r() * 0.12),
    rz: s(blob.rz) * (0.92 + r() * 0.14),
    p: blob.p,
  }));
  // Soft under-tip filler — keep it small so it does not form a hard shelf.
  if (blobs.length) {
    const tip = f.tip[0] ?? f.bridge[0];
    if (tip)
      blobs.push({
        cx: s(tip.cx),
        cy: s(tip.cy) - 0.035 * ry - s(tip.ry) * 0.15,
        cz: s(tip.cz) * 0.35,
        rx: s(tip.rx) * 1.12,
        ry: s(tip.ry) * 1.05,
        rz: s(tip.rz) * 0.4,
        p: 2,
      });
  }
  const cy = -0.035 * ry;
  const spread = f.spread * scale;
  const holeY = cy + f.holeY * scale;
  // Place cavities near the tip front so they punch through the clay surface.
  const tipFront =
    blobs.reduce((a, blob) => Math.max(a, blob.cz + blob.rz * 0.72), 0.12) ||
    f.holeZ * scale;
  const holeZ = tipFront * 0.9;
  const holeDepth = Math.max(0.055, f.holeDepth * scale * 1.25);
  const nostrils = nostrilSites(
    f.nostrils,
    spread,
    holeY,
    f.holeW * scale,
    f.holeH * scale,
    holeZ,
    holeDepth,
  );
  // Distances are in model units, so small wings do not inflate like the bridge.
  const blend = .032 * scale;
  let boundX=.12, boundY0=cy-.12, boundY1=cy+.12, boundZ=.1;
  for(const blob of blobs){boundX=Math.max(boundX,Math.abs(blob.cx)+blob.rx);boundY0=Math.min(boundY0,blob.cy-blob.ry);boundY1=Math.max(boundY1,blob.cy+blob.ry);boundZ=Math.max(boundZ,blob.cz+blob.rz);}
  const solid=(x:number,y:number,z:number)=>{
    let d=10;
    for(const blob of blobs) d=smoothMin(d,blobField(x,y,z,blob)*Math.min(blob.rx,blob.ry,blob.rz),blend);
    return d;
  };
  // Cavities are open toward the exterior, with a rounded blind end inside clay.
  for(const hole of nostrils){hole.sx=Math.max(hole.sx,.027*scale);hole.sy=Math.max(hole.sy,.024*scale);}
  const cavities=(x:number,y:number,z:number)=>{
    let d=10;
    for(const hole of nostrils){
      const end=hole.cz-hole.sz*.65;
      const qx=(x-hole.x)/hole.sx,qy=(y-hole.y)/hole.sy;
      const qz=Math.min(0,z-end)/Math.max(hole.sx,hole.sy);
      d=Math.min(d,(Math.sqrt(qx*qx+qy*qy+qz*qz)-1)*Math.min(hole.sx,hole.sy));
    }return d;
  };
  const field=(x:number,y:number,z:number)=>smoothMax(solid(x,y,z),-cavities(x,y,z),.006*scale);
  // No depth projection or XY warp: the volume is meshed in three dimensions.
  const relief=(_x:number,_y:number)=>0;
  const warp=(x:number,y:number)=>({x,y});
  return {kind, width:boundX, height:(boundY1-boundY0)*.5,cy,boundX,boundY0,boundY1,boundZ,
    nostrils,relief,warp,field,solid,cavities,blend,
    refine:[boundX+.06,boundY0-.06,boundY1+.06] as [number,number,number]};

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
