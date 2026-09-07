import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { rng, palettes, type Genome } from "./genome";
import type { Morphology } from "./morphology";
import { sweep, patchGeometry, colorGeometry } from "./sculpt";

type Random = () => number;
type Tint = { base: T.Color; tip: T.Color; shade: T.Color };
/** Colour, wind weight and hand-off to the merge queue. */
type Add = (geo: T.BufferGeometry, color: T.Color, stiffness: number) => void;
/** Fibonacci angle: even coverage without the clumps of random latitudes. */
const GOLDEN = 2.399963229728653;
const vec = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
/** Swept strands carry their length along U, patches along V. */
function patch(
  rows: number,
  columns: number,
  fn: (u: number, t: number) => T.Vector3,
) {
  const geo = patchGeometry(rows, columns, fn);
  geo.userData.alongV = true;
  return geo;
}
/** Any tangent of n, safe at the poles. */
function tangentAt(n: T.Vector3) {
  const t = new T.Vector3().crossVectors(n, vec(0, 1, 0));
  if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
  return t.normalize();
}

type Coat = {
  style: "strand" | "blade" | "lamina" | "spike" | "tuft" | "vane" | "ribbon";
  count: number;
  length: number;
  radius?: (r: Random) => number;
  segments?: number;
  sides?: number;
  end?: number;
  ripple?: number;
  /** Mid-strand thickening, measured along the surface path. */
  bulge?: number;
  steps?: number;
  curl?: boolean;
  frizz?: boolean;
  kink?: boolean;
  width?: number;
  rib?: number;
  thickness?: number;
  wave?: number;
  round?: boolean;
  rows?: number;
  columns?: number;
  fan?: number;
  /** Keep growing under the jaw instead of stopping at the throat. */
  belly?: boolean;
};
/** Indices 1–10 shipped with DNA v3 and must keep their exact geometry. */
const coats: Record<number, Coat> = {
  1: {
    style: "strand",
    count: 4200,
    length: 0.37,
    radius: (r) => 0.004 + r() * 0.003,
    segments: 10,
    sides: 4,
  },
  4: {
    style: "strand",
    count: 100,
    length: 0.48,
    radius: (r) => 0.055 + r() * 0.035,
    segments: 20,
    sides: 8,
    end: 0.015,
    ripple: 0.045,
    bulge: 0.4,
  },
  5: { style: "blade", count: 175, length: 0.34, width: 0.44, rib: 0.033 },
  6: { style: "blade", count: 105, length: 0.28, width: 0.26, rib: 0.045 },
  7: {
    style: "strand",
    count: 650,
    length: 0.5,
    radius: (r) => 0.012 + r() * 0.011,
    segments: 12,
    sides: 4,
  },
  8: {
    style: "strand",
    count: 1800,
    length: 0.27,
    radius: () => 0.014,
    segments: 20,
    sides: 8,
    frizz: true,
  },
  9: {
    style: "strand",
    count: 1200,
    length: 0.4,
    radius: () => 0.026,
    segments: 32,
    sides: 8,
    steps: 32,
    curl: true,
  },
  10: { style: "lamina", count: 1050, length: 0.19, belly: true },
  11: {
    style: "strand",
    count: 2400,
    length: 0.1,
    radius: (r) => 0.005 + r() * 0.003,
    segments: 5,
    sides: 4,
    steps: 5,
    bulge: 0.14,
  },
  12: {
    style: "spike",
    count: 520,
    length: 0.34,
    radius: (r) => 0.028 + r() * 0.012,
    segments: 6,
    sides: 6,
    end: 0.0015,
  },
  13: {
    style: "tuft",
    count: 700,
    length: 0.12,
    fan: 3,
    radius: (r) => 0.009 + r() * 0.005,
    segments: 4,
    sides: 4,
  },
  14: { style: "vane", count: 240, length: 0.3 },
  15: {
    style: "lamina",
    count: 150,
    length: 0.34,
    rows: 12,
    columns: 8,
    width: 0.4,
    thickness: 1.3,
    wave: 1,
  },
  16: {
    style: "spike",
    count: 900,
    length: 0.085,
    radius: (r) => 0.036 + r() * 0.016,
    segments: 4,
    sides: 7,
    end: 0.006,
  },
  17: { style: "ribbon", count: 320, length: 0.4 },
  18: {
    style: "strand",
    count: 900,
    length: 0.45,
    radius: (r) => 0.018 + r() * 0.009,
    segments: 12,
    sides: 5,
    steps: 12,
    end: 0.001,
    bulge: 0.16,
    kink: true,
  },
  19: {
    style: "lamina",
    count: 420,
    length: 0.17,
    rows: 8,
    columns: 10,
    width: 0.62,
    thickness: 2.1,
    round: true,
    belly: true,
  },
  20: {
    style: "tuft",
    count: 420,
    length: 0.3,
    fan: 4,
    radius: (r) => 0.008 + r() * 0.004,
    segments: 6,
    sides: 4,
  },
};

/** Swept fibre that follows the deformed skin before it lifts away. */
function strandFibre(
  spec: Coat,
  m: Morphology,
  r: Random,
  n: T.Vector3,
  flow: T.Vector3,
  length: number,
  bend: number,
  theta: number,
) {
  const steps = spec.steps ?? 10;
  const tangent = flow.clone().addScaledVector(n, -flow.dot(n));
  if (tangent.length() < 0.15)
    tangent.set(0.5, 0, -1).addScaledVector(n, -n.dot(vec(0.5, 0, -1)));
  tangent.normalize();
  const points: T.Vector3[] = [];
  for (let j = 0; j <= steps; j++) {
    const t = j / steps,
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
          Math.sin(Math.PI * t) * length * (spec.bulge ?? 0.18),
      );
    const across = new T.Vector3().crossVectors(nn, tangent).normalize();
    if (spec.curl) {
      const curl = t * Math.PI * (5 + r() * 0.05);
      point
        .addScaledVector(across, Math.sin(curl) * 0.062 * Math.sin(Math.PI * t))
        .addScaledVector(
          nn,
          (1 - Math.cos(curl)) * 0.035 * Math.sin(Math.PI * t),
        );
    }
    if (spec.frizz)
      point
        .addScaledVector(
          across,
          Math.sin(t * 5 + theta) * 0.04 * Math.sin(Math.PI * t),
        )
        .addScaledVector(nn, 0.075 * Math.sin(Math.PI * t));
    if (spec.kink)
      point.addScaledVector(
        across,
        Math.sin(t * 6.5 + theta) * 0.05 * Math.sin(Math.PI * t),
      );
    point.x += bend * Math.sin(t * Math.PI) * 0.7;
    points.push(point);
  }
  return sweep(
    points,
    spec.radius!(r),
    spec.segments!,
    spec.sides!,
    spec.end ?? 0.0007,
    spec.ripple ?? 0,
  );
}

/** Closed fleshy cross-section with a central rib and turned-up edges. */
function bladeFibre(
  spec: Coat,
  n: T.Vector3,
  root: T.Vector3,
  growth: T.Vector3,
  flow: T.Vector3,
  length: number,
) {
  const tangent = vec(-n.z, 0, n.x).normalize();
  const width = length * spec.width!;
  return patch(18, 12, (u, t) => {
    const a = u * Math.PI * 2;
    const mid = root
      .clone()
      .addScaledVector(growth, length * t * 0.84)
      .addScaledVector(flow, length * t * t * 0.54);
    const blade = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.7) * width;
    mid.addScaledVector(tangent, Math.cos(a) * blade);
    mid.addScaledVector(
      n,
      Math.sin(Math.PI * t) *
        (0.05 * Math.cos(a) ** 2 + Math.sin(a) * spec.rib!),
    );
    return mid;
  });
}

/** Plate laid on the skin: leaf, wavy ridge or round scale. */
function laminaFibre(
  spec: Coat,
  m: Morphology,
  n: T.Vector3,
  flow: T.Vector3,
  length: number,
) {
  const tangent = flow.clone().addScaledVector(n, -flow.dot(n)).normalize();
  const across = new T.Vector3().crossVectors(n, tangent).normalize();
  const width = spec.width ?? 0.55,
    thickness = spec.thickness ?? 1,
    wave = spec.wave ?? 0;
  return patch(spec.rows ?? 10, spec.columns ?? 10, (u, t) => {
    const arc = Math.max(0, Math.sin(Math.PI * t));
    const profile = spec.round ? Math.sqrt(arc) : arc ** 0.6;
    const nn = n
      .clone()
      .addScaledVector(tangent, ((t - 0.1) * length) / m.ry)
      .addScaledVector(
        across,
        ((u * 2 - 1) * profile + wave * Math.sin(t * 5.5) * 0.5) *
          length *
          width,
      )
      .normalize();
    return m
      .point(nn)
      .addScaledVector(
        nn,
        thickness *
          (0.007 + arc * 0.026 + Math.sin(Math.PI * u) * 0.012) *
          (spec.round ? Math.sin(Math.PI * u) + 0.2 : 1),
      );
  });
}

/** Quill or nub standing off the skin along its own normal. */
function spikeFibre(
  spec: Coat,
  m: Morphology,
  r: Random,
  n: T.Vector3,
  length: number,
  bend: number,
) {
  const root = m.point(n).addScaledVector(n, -0.03);
  const lean = vec(n.x * 0.4, 0.7, n.z * 0.4).normalize();
  const dir = n.clone().addScaledVector(lean, 0.4).normalize();
  const side = new T.Vector3().crossVectors(n, lean);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  const points = [root];
  for (let j = 1; j <= 3; j++) {
    const t = j / 3;
    points.push(
      root
        .clone()
        .addScaledVector(dir, length * t)
        .addScaledVector(side, bend * Math.sin(Math.PI * t) * 1.6),
    );
  }
  return sweep(
    points,
    spec.radius!(r),
    spec.segments!,
    spec.sides!,
    spec.end ?? 0.001,
  );
}

/** Several fibres splaying out of one follicle. */
function tuftFibre(
  spec: Coat,
  m: Morphology,
  r: Random,
  n: T.Vector3,
  length: number,
) {
  const root = m.point(n).addScaledVector(n, -0.03);
  const tangent = tangentAt(n);
  const across = new T.Vector3().crossVectors(n, tangent).normalize();
  const fan = spec.fan ?? 3;
  const parts: T.BufferGeometry[] = [];
  for (let k = 0; k < fan; k++) {
    const a = (k / fan) * Math.PI * 2 + r() * 0.7,
      tilt = 0.35 + r() * 0.4,
      grown = length * (0.65 + r() * 0.7);
    const dir = n
      .clone()
      .addScaledVector(tangent, Math.cos(a) * tilt)
      .addScaledVector(across, Math.sin(a) * tilt)
      .normalize();
    parts.push(
      sweep(
        [
          root,
          root
            .clone()
            .addScaledVector(dir, grown * 0.45)
            .addScaledVector(n, 0.012),
          root
            .clone()
            .addScaledVector(dir, grown)
            .add(vec(0, -grown * 0.24, 0)),
        ],
        spec.radius!(r),
        spec.segments!,
        spec.sides!,
        spec.end ?? 0.0006,
      ),
    );
  }
  return parts;
}

/** Feather: soft vane around a raised rachis, tip peeling off the skin. */
function vaneFibre(
  m: Morphology,
  n: T.Vector3,
  flow: T.Vector3,
  length: number,
) {
  const tangent = flow.clone().addScaledVector(n, -flow.dot(n)).normalize();
  const across = new T.Vector3().crossVectors(n, tangent).normalize();
  return patch(10, 8, (u, t) => {
    const vane =
      Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.06))) ** 0.35 *
      (1 + 0.05 * Math.sin(t * 17));
    const nn = n
      .clone()
      .addScaledVector(tangent, ((t - 0.08) * length) / m.ry)
      .addScaledVector(across, (u * 2 - 1) * vane * length * 0.34)
      .normalize();
    return m
      .point(nn)
      .addScaledVector(
        nn,
        0.006 +
          0.03 * Math.exp(-(((u - 0.5) / 0.12) ** 2)) * Math.sin(Math.PI * t) +
          0.07 * t * t +
          Math.sin(Math.PI * u) * 0.008,
      );
  });
}

/** Flat band that twists as it grows and curls away from the skin. */
function ribbonFibre(
  m: Morphology,
  n: T.Vector3,
  flow: T.Vector3,
  length: number,
  theta: number,
) {
  const tangent = flow.clone().addScaledVector(n, -flow.dot(n)).normalize();
  const across = new T.Vector3().crossVectors(n, tangent).normalize();
  return patch(12, 5, (u, t) => {
    const twist = theta + t * Math.PI * 2.1;
    const band =
      (u - 0.5) * length * 0.42 * Math.max(0, Math.sin(Math.PI * t)) ** 0.35;
    const nn = n
      .clone()
      .addScaledVector(tangent, (t * length) / m.ry)
      .addScaledVector(across, band * Math.cos(twist))
      .normalize();
    return m
      .point(nn)
      .addScaledVector(
        nn,
        -0.02 * (1 - t) +
          0.012 +
          0.1 * t * t * length +
          band * Math.sin(twist) * 0.9,
      );
  });
}

function coatFibres(g: Genome, m: Morphology, tint: Tint, add: Add) {
  const spec = coats[g.genes.skin];
  if (!spec) return;
  const r = rng(g.seed + "/coat-v2");
  for (let i = 0; i < spec.count; i++) {
    const ny = 1 - (2 * (i + 0.5)) / spec.count,
      theta = i * GOLDEN + r() * 0.3;
    const nr = Math.sqrt(1 - ny * ny),
      n = vec(Math.cos(theta) * nr, ny, Math.sin(theta) * nr);
    // Leave the face and peach cleft readable; lengths taper at the hairline.
    const front = n.z > 0;
    const faceEdge = Math.max(Math.abs(n.x) / 0.69, (n.y - 0.02) / 0.68);
    const hairline=front&&n.y>-.8?T.MathUtils.smoothstep(faceEdge,.82,1.16):1;
    if(r()>hairline)continue;
    if (n.z < -0.55 && n.y < (spec.belly ? -0.55 : 0.23)) continue;
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
    const growth = vec(
      n.x * 0.52,
      Math.max(0.06, n.y * 0.5),
      n.z * 0.48,
    ).normalize();
    const length = spec.length * (0.6 + r() * 0.85) * (.3+.7*hairline);
    const whorl = Math.sin(n.y * 5 + n.z * 4 + theta * 0.12) * 0.35;
    const flow = vec(
      n.x * (front ? 1.5 : 0.45) + whorl,
      -0.7,
      n.z * (front ? -0.5 : 0.25),
    ).normalize();
    const bend = (r() - 0.5) * 0.18;
    const grown =
      spec.style === "lamina"
        ? [laminaFibre(spec, m, n, flow, length)]
        : spec.style === "blade"
          ? [bladeFibre(spec, n, root, growth, flow, length)]
          : spec.style === "spike"
            ? [spikeFibre(spec, m, r, n, length, bend)]
            : spec.style === "tuft"
              ? tuftFibre(spec, m, r, n, length)
              : spec.style === "vane"
                ? [vaneFibre(m, n, flow, length)]
                : spec.style === "ribbon"
                  ? [ribbonFibre(m, n, flow, length, theta)]
                  : [strandFibre(spec, m, r, n, flow, length, bend, theta)];
    const color = tint.base
      .clone()
      .lerp(r() > 0.2 ? tint.tip : tint.shade, r() * 0.48);
    for (const geo of grown) add(geo, color, 1);
  }
}

/** Bare skull under a hair root: no eye, ear base or horn base beneath it. */
function scalp(g: Genome, m: Morphology, n: T.Vector3, root: T.Vector3) {
  if (g.genes.horns === 7 && Math.abs(n.x) < 0.2 && n.y > 0.62) return false;
  if (
    g.genes.horns !== 3 &&
    g.genes.horns !== 7 &&
    Math.abs(n.x) > 0.3 &&
    Math.abs(n.x) < 0.66 &&
    n.y > 0.64
  )
    return false;
  if (Math.abs(n.x) > 0.78 && n.y > 0.3 && n.y < 0.64) return false;
  return !m.eyes.some(
    (e) => Math.hypot(root.x - e.x, root.y - e.y) < e.radius * 1.5,
  );
}
/** Even Fibonacci cap around the crown; spread is the angular radius in radians. */
function crown(
  i: number,
  count: number,
  spread: number,
  jitter: number,
  r: Random,
) {
  const rad = Math.sqrt((i + 0.5) / count) * spread + (r() - 0.5) * jitter,
    a = i * GOLDEN;
  return vec(
    Math.sin(rad) * Math.cos(a),
    Math.cos(rad),
    Math.sin(rad) * Math.sin(a),
  );
}
/** Comb a strand across the deformed skin; it stops before it reaches an eye. */
function comb(
  m: Morphology,
  n: T.Vector3,
  flow: T.Vector3,
  reach: number,
  steps: number,
  lift: (t: number) => number,
  drift?: (t: number, nn: T.Vector3, across: T.Vector3) => T.Vector3,
) {
  const tangent = flow.clone().addScaledVector(n, -flow.dot(n));
  if (tangent.lengthSq() < 0.02) tangent.set(0, -1, 0).addScaledVector(n, n.y);
  tangent.normalize();
  const points: T.Vector3[] = [];
  for (let j = 0; j <= steps; j++) {
    const t = j / steps,
      nn = n
        .clone()
        .addScaledVector(tangent, (t * reach) / m.ry)
        .normalize();
    const point = m.point(nn).addScaledVector(nn, lift(t));
    if (drift)
      point.add(
        drift(t, nn, new T.Vector3().crossVectors(nn, tangent).normalize()),
      );
    if (
      m.eyes.some(
        (e) => Math.hypot(point.x - e.x, point.y - e.y) < e.radius * 1.12,
      )
    )
      break;
    points.push(point);
  }
  return points;
}

function hairFibres(g: Genome, m: Morphology, tint: Tint, add: Add) {
  const kind = g.genes.hair ?? 0;
  if (!kind) return;
  const r = rng(g.seed + "/hair-v1");
  const strand = (
    points: T.Vector3[],
    radius: number,
    segments: number,
    sides: number,
    end = 0.0008,
  ) => {
    if (points.length < 3) return;
    add(
      sweep(points, radius, segments, sides, end),
      tint.base
        .clone()
        .lerp(r() > 0.3 ? tint.shade : tint.tip, 0.4 + r() * 0.38),
      1,
    );
  };
  /** Root sites on the cap, already filtered against face features. */
  const roots = (
    count: number,
    spread: number,
    keep?: (n: T.Vector3, root: T.Vector3) => boolean,
  ) => {
    const sites: { n: T.Vector3; root: T.Vector3 }[] = [];
    for (let i = 0; i < count; i++) {
      const n = crown(i, count, spread, 0.05, r),
        root = m.point(n);
      if (scalp(g, m, n, root) && (!keep || keep(n, root)))
        sites.push({ n, root });
    }
    return sites;
  };
  const sink = (n: T.Vector3, root: T.Vector3) =>
    root.clone().addScaledVector(n, -0.03);

  if (kind === 1)
    for (const { n } of roots(460, 1.15, (q) => q.z > 0 && q.y > 0.5))
      strand(
        comb(
          m,
          n,
          vec(n.x * 0.35, -1, 0.5),
          0.52 + r() * 0.22,
          9,
          (t) => -0.03 * (1 - t) + 0.014 + 0.03 * Math.sin(Math.PI * t),
        ),
        0.016,
        9,
        5,
      );
  if (kind === 2) {
    const count = 150;
    for (let i = 0; i < count; i++) {
      const s = (i + 0.5) / count,
        a = 0.72 + s * 1.85;
      const n = vec((r() - 0.5) * 0.2, Math.sin(a), Math.cos(a)).normalize(),
        root = m.point(n);
      if (!scalp(g, m, n, root)) continue;
      const base = sink(n, root),
        height =
          (0.3 + r() * 0.22) * Math.max(0.2, Math.sin(Math.PI * s)) ** 0.35;
      const dir = vec(n.x * 0.5 + (r() - 0.5) * 0.3, 1, n.z * 0.2).normalize();
      strand(
        [
          base,
          base
            .clone()
            .addScaledVector(dir, height * 0.45)
            .addScaledVector(n, 0.02),
          base.clone().addScaledVector(dir, height * 0.8),
          base
            .clone()
            .addScaledVector(dir, height)
            .add(vec((r() - 0.5) * 0.05, 0, -0.05)),
        ],
        0.028,
        9,
        5,
      );
    }
  }
  if (kind === 3) {
    const up = vec(0.06, 1, -0.08).normalize();
    const gather = m.point(up).addScaledVector(up, 0.38);
    for (const { n, root } of roots(300, 1.25)) {
      const base = sink(n, root);
      strand(
        [
          base,
          base.clone().lerp(gather, 0.5).addScaledVector(n, 0.06),
          gather.clone().add(vec((r() - 0.5) * 0.05, (r() - 0.5) * 0.04, 0)),
        ],
        0.015,
        10,
        4,
        0.004,
      );
    }
    for (let i = 0; i < 120; i++) {
      const a = i * GOLDEN,
        spray = 0.05 + r() * 0.06;
      const off = vec(Math.cos(a) * spray, 0, Math.sin(a) * spray);
      strand(
        [
          gather,
          gather
            .clone()
            .add(vec(0, 0.15, -0.05))
            .add(off),
          gather
            .clone()
            .add(vec(0, 0.06, -0.3))
            .add(off.clone().multiplyScalar(1.8)),
          gather
            .clone()
            .add(vec(0, -0.22, -0.44))
            .add(off.clone().multiplyScalar(2.3)),
        ],
        0.013,
        14,
        4,
      );
    }
  }
  if (kind === 4)
    for (const { n } of roots(420, 1.28)) {
      const phase = r() * 6.28;
      strand(
        comb(
          m,
          n,
          vec(n.x * 0.6 + Math.sin(phase) * 0.5, -1, n.z * 0.5),
          0.24 + r() * 0.12,
          14,
          (t) => -0.03 * (1 - t) + 0.02 + 0.16 * t * t,
          (t, nn, across) =>
            across
              .clone()
              .multiplyScalar(
                Math.sin(phase + t * 9) * 0.055 * Math.sin(Math.PI * t),
              )
              .addScaledVector(nn, (1 - Math.cos(t * 9)) * 0.03),
        ),
        0.014,
        14,
        5,
      );
    }
  if (kind === 5) {
    // Short crown braids only — no free-hanging temple peots.
    for (const { n } of roots(280, 1.3))
      strand(
        comb(
          m,
          n,
          vec(n.x * 0.9, -1, n.z * 0.6),
          0.22 + r() * 0.1,
          6,
          (t) => -0.03 * (1 - t) + 0.014,
        ),
        0.011,
        6,
        4,
      );
    for (const side of [-1, 1]) {
      const rope: T.Vector3[] = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8;
        // Stay on the crown / nape: start near the top, drift back and slightly out.
        const nn = vec(
          side * (0.18 + 0.22 * t),
          0.92 - 0.55 * t,
          -0.05 - 0.55 * t,
        ).normalize();
        rope.push(m.point(nn).addScaledVector(nn, 0.06 + 0.04 * t));
      }
      add(
        sweep(rope, 0.03, 48, 10, 0.048, 0.28),
        tint.base.clone().lerp(tint.shade, 0.45 + r() * 0.3),
        1,
      );
      const tip = rope.at(-1)!;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        strand(
          [
            tip,
            tip.clone().add(vec(Math.cos(a) * 0.035, -0.02, Math.sin(a) * 0.035)),
            tip.clone().add(vec(Math.cos(a) * 0.055, -0.05, Math.sin(a) * 0.055)),
          ],
          0.01,
          5,
          4,
        );
      }
    }
  }
  if (kind === 6) {
    const side = r() > 0.5 ? 1 : -1;
    for (const { n } of roots(420, 1.25))
      strand(
        comb(
          m,
          n,
          vec(side * 1.1, -0.5, 0.25),
          0.5 + r() * 0.25,
          10,
          (t) => -0.03 * (1 - t) + 0.013 + 0.02 * Math.sin(Math.PI * t),
        ),
        0.013,
        10,
        5,
      );
  }
  if (kind === 7)
    for (const { n, root } of roots(900, 1.4)) {
      const base = sink(n, root),
        grown = 0.16 * (0.6 + r() * 0.85);
      const dir = n
        .clone()
        .add(vec((r() - 0.5) * 0.25, 0.15, (r() - 0.5) * 0.25))
        .normalize();
      strand(
        [
          base,
          base.clone().addScaledVector(dir, grown * 0.55),
          base.clone().addScaledVector(dir, grown),
        ],
        0.0065,
        5,
        4,
      );
    }
  if (kind === 8)
    for (const { n } of roots(460, 1.3))
      strand(
        comb(
          m,
          n,
          vec(n.x * 0.25, -1, n.z * 0.25),
          0.8 + r() * 0.2,
          13,
          (t) => -0.03 * (1 - t) + 0.015 + 0.02 * Math.sin(Math.PI * t),
        ),
        0.013,
        13,
        5,
      );
  if (kind === 9) {
    for (const { n, root } of roots(240, 1.3)) {
      const base = sink(n, root),
        grown = 0.07 * (0.6 + r() * 0.8);
      strand(
        [
          base,
          base.clone().addScaledVector(n, grown * 0.6),
          base.clone().addScaledVector(n, grown),
        ],
        0.006,
        4,
        4,
      );
    }
    for (const side of [-0.12, 0.14]) {
      const n = vec(side, 1, -0.05).normalize();
      const base = sink(n, m.point(n)),
        grown = 0.55 + r() * 0.2;
      const antenna = [base];
      for (let j = 1; j <= 10; j++) {
        const t = j / 10;
        antenna.push(
          base
            .clone()
            .add(
              vec(
                Math.sin(t * 4.2 + side * 9) * 0.11 * t + side * 0.4 * t,
                grown * t * (1 - 0.25 * t * t),
                Math.cos(t * 3.6) * 0.05 * t - 0.05 * t,
              ),
            ),
        );
      }
      strand(antenna, 0.014, 26, 6, 0.014);
    }
  }
  if (kind === 10)
    for (const { n, root } of roots(760, 1.45)) {
      const base = sink(n, root),
        grown = 0.3 * (0.86 + r() * 0.28),
        phase = r() * 6.28;
      const tangent = tangentAt(n),
        across = new T.Vector3().crossVectors(n, tangent).normalize();
      const puff = [base];
      for (let j = 1; j <= 6; j++) {
        const t = j / 6;
        // A tightening coil packs the tips into a round puff instead of spikes.
        puff.push(
          base
            .clone()
            .addScaledVector(n, grown * Math.sin(t * 1.35))
            .addScaledVector(tangent, Math.sin(phase + t * 8.5) * 0.085 * t)
            .addScaledVector(across, Math.cos(phase + t * 8.5) * 0.085 * t),
        );
      }
      strand(puff, 0.012, 11, 4, 0.004);
    }
}

function whiskerFibres(g: Genome, m: Morphology, tint: Tint, add: Add) {
  const kind = g.genes.whiskers ?? 0;
  if (!kind) return;
  const r = rng(g.seed + "/whiskers-v1");
  // Whiskers are clay, not wire: they barely follow the wind.
  const strand = (
    points: T.Vector3[],
    radius: number,
    segments: number,
    sides: number,
    end = 0.0008,
  ) => {
    if (points.length < 3) return;
    add(
      sweep(points, radius, segments, sides, end),
      tint.base
        .clone()
        .lerp(r() > 0.3 ? tint.shade : tint.tip, 0.38 + r() * 0.34),
      0.35,
    );
  };
  const limit = m.rx * 0.72;
  const tipY =
    m.nasal.kind === 10
      ? m.mouthY + 0.2
      : Math.min(m.nasal.boundY0 + 0.02, m.nasal.cy - m.nasal.height * 0.15);
  /** Reject roots on the nose tip / nostrils — only the philtrum and cheeks. */
  const onTip = (x: number, y: number) => {
    if (m.nasal.kind === 10 || !m.nostrils.length) return y > tipY + 0.04;
    if (y > tipY + 0.03) return true;
    return m.nostrils.some(
      (h) => ((x - h.x) / (h.sx * 1.8)) ** 2 + ((y - h.y) / (h.sy * 1.8)) ** 2 < 1,
    );
  };
  /** Seat a root on the real muzzle: sample the surface, then sink under it. */
  const seat = (x:number,y:number)=>{
    if(onTip(x,y))return null;
    const at=m.attachment(T.MathUtils.clamp(x,-limit,limit),y);
    return {at:at.position.addScaledVector(at.normal,-.014),out:at.normal};
  };
  // Firmly under the tip, above the lip — never on the nasal mound.
  const padY = Math.min(
    tipY - 0.02,
    Math.max(m.mouthY + 0.12 + m.mouthSpec.thick, m.mouthY + 0.1),
  );
  const pad = Math.max(m.mouthWidth, m.rx * 0.3);

  if (kind === 1)
    for (const side of [-1, 1])
      for (let k = 0; k < 5; k++) {
        const s = seat(
          side * (pad * 0.55 + k * 0.012),
          padY + (k - 2) * 0.028,
        );
        if (!s) continue;
        const { at, out } = s;
        const grown = 0.42 + r() * 0.2 - Math.abs(k - 2) * 0.04;
        const dir = vec(side * 0.9, 0.05 - k * 0.04, 0.35)
          .normalize()
          .addScaledVector(out, 0.35)
          .normalize();
        strand(
          [
            at,
            at.clone().addScaledVector(dir, grown * 0.35),
            at
              .clone()
              .addScaledVector(dir, grown * 0.72)
              .add(vec(0, -grown * 0.06, 0)),
            at
              .clone()
              .addScaledVector(dir, grown)
              .add(vec(0, -grown * 0.18, 0)),
          ],
          0.008,
          14,
          6,
          0.006,
        );
      }
  if (kind === 2)
    for (const side of [-1, 1])
      for (let k = 0; k < 18; k++) {
        const a = k * GOLDEN,
          rad = Math.sqrt((k + 0.5) / 18);
        const s = seat(
          side * (pad * 0.42 + Math.cos(a) * rad * pad * 0.35),
          padY + Math.sin(a) * rad * 0.04,
        );
        if (!s) continue;
        const { at, out } = s;
        const grown = 0.18 + r() * 0.1;
        const dir = vec(side * 0.55, -0.55, 0.35)
          .normalize()
          .addScaledVector(out, 0.4)
          .normalize();
        strand(
          [
            at,
            at
              .clone()
              .addScaledVector(dir, grown * 0.4)
              .addScaledVector(out, 0.02),
            at
              .clone()
              .addScaledVector(dir, grown)
              .add(vec(side * 0.02, -0.02, -0.02)),
          ],
          0.014,
          7,
          6,
          0.016,
        );
      }
  if (kind === 3) {
    // Soft clay pads instead of ~100 vertical bristles (barcode overlay).
    const half = Math.max(m.nasal.width * 0.45, pad * 0.24);
    for (const side of [-1, 0, 1]) {
      const s = seat(side * half * 0.55, padY);
      if (!s) continue;
      const { at, out } = s;
      const grown = 0.09 + r() * 0.03;
      const dir = out
        .clone()
        .addScaledVector(vec(side * 0.15, -1.4, 0.1), 1)
        .normalize();
      strand(
        [
          at,
          at.clone().addScaledVector(dir, grown * 0.45).add(vec(side * 0.02, 0, 0)),
          at.clone().addScaledVector(dir, grown),
        ],
        0.028,
        8,
        8,
        0.034,
      );
    }
  }
  if (kind === 4)
    for (const side of [-1, 1]) {
      // Short horseshoe on the muzzle — no hang past the chin / cheeks.
      const path: T.Vector3[] = [];
      for (const [x, y] of [
        [0.06, padY + 0.01],
        [pad * 0.45, padY - 0.02],
        [pad * 0.72, padY - 0.06],
        [pad * 0.78, m.mouthY + 0.04],
      ] as const) {
        const s = seat(side * x, y);
        if (!s) continue;
        path.push(s.at.addScaledVector(s.out, 0.035));
      }
      strand(path, 0.026, 20, 8, 0.04);
    }
  if (kind === 5)
    for (const side of [-1, 1]) {
      const curl: T.Vector3[] = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8;
        const s = seat(
          side * pad * (0.2 + t * 0.7),
          padY - 0.04 * Math.sin(Math.PI * t),
        );
        if (!s) continue;
        // Stay near the lip line; tip curls forward, not down the cheek.
        curl.push(
          s.at
            .addScaledVector(s.out, 0.04)
            .add(
              vec(
                side * t * 0.08,
                Math.sin(t * Math.PI) * 0.04,
                0.06 * t + Math.sin(t * Math.PI) * 0.05,
              ),
            ),
        );
      }
      strand(curl, 0.024, 22, 8, 0.032);
    }
  if (kind === 6)
    for (const side of [-1, 1])
      for (let k = 0; k < 14; k++) {
        const t = (k + 0.5) / 14;
        const s = seat(
          side * (pad * 0.3 + t * pad * 0.5),
          padY + Math.sin(t * 5) * 0.015,
        );
        if (!s) continue;
        const { at, out } = s;
        const grown = 0.14 + r() * 0.08;
        const dir = vec(side * (0.55 + t * 0.35), -0.45, 0.3)
          .normalize()
          .addScaledVector(out, 0.45)
          .normalize();
        strand(
          [
            at,
            at.clone().addScaledVector(dir, grown * 0.5),
            at.clone().addScaledVector(dir, grown).add(vec(0, -0.025, 0)),
          ],
          0.01,
          6,
          5,
          0.01,
        );
      }
  if (kind === 7)
    for (const side of [-1, 1]) {
      const s = seat(side * pad * 0.55, padY);
      if (!s) continue;
      const { at, out } = s;
      // Short barbels — forward/down slightly, never peot-length drops.
      const grown = 0.28 + r() * 0.08,
        barbel = [at];
      for (let j = 1; j <= 6; j++) {
        const t = j / 6;
        barbel.push(
          at
            .clone()
            .addScaledVector(out, 0.04 + 0.06 * t)
            .add(
              vec(
                side * grown * 0.55 * t,
                grown * (0.05 * t - t * t * 0.28),
                grown * 0.35 * t,
              ),
            ),
        );
      }
      strand(barbel, 0.024, 18, 8, 0.016);
    }
  if (kind === 8) {
    const chin = m.mouthY - 0.18;
    for (let k = 0; k < 36; k++) {
      const a = k * GOLDEN,
        rad = Math.sqrt((k + 0.5) / 36);
      const s = seat(
        Math.cos(a) * rad * pad * 0.5,
        chin + Math.sin(a) * rad * 0.08,
      );
      if (!s) continue;
      const { at, out } = s;
      const grown = 0.12 + r() * 0.08;
      const dir = vec(0, -0.85, 0.3)
        .normalize()
        .addScaledVector(out, 0.35)
        .normalize();
      strand(
        [
          at,
          at.clone().addScaledVector(dir, grown * 0.5),
          at
            .clone()
            .addScaledVector(dir, grown)
            .add(vec((r() - 0.5) * 0.02, 0, -0.015)),
        ],
        0.012,
        6,
        5,
        0.01,
      );
    }
  }
  if (kind === 9) {
    const cy = (padY + m.mouthY - 0.1) / 2;
    for (let k = 0; k < 48; k++) {
      const a = k * GOLDEN,
        rad = Math.sqrt((k + 0.5) / 48);
      const x = Math.cos(a) * rad * pad * 0.95,
        y = cy + Math.sin(a) * rad * 0.18;
      if ((x / (pad + 0.07)) ** 2 + ((y - m.mouthY) / 0.16) ** 2 < 1) continue;
      const s = seat(x, y);
      if (!s) continue;
      const { at, out } = s;
      const grown = 0.07 * (0.7 + r() * 0.6);
      const dir = out
        .clone()
        .addScaledVector(vec(0, -1.2, 0), 1)
        .normalize();
      strand(
        [
          at,
          at.clone().addScaledVector(dir, grown * 0.5),
          at.clone().addScaledVector(dir, grown),
        ],
        0.016,
        5,
        6,
        0.012,
      );
    }
  }
  if (kind === 10)
    for (const side of [-1, 1]) {
      const s = seat(side * pad * 0.5, padY);
      if (!s) continue;
      const { at, out } = s;
      // Compact spring beside the muzzle — no long dangling coil.
      const axis = out
        .clone()
        .addScaledVector(vec(side * 0.7, -0.05, 0.4), 1)
        .normalize();
      const u = axis.clone().cross(vec(0, 1, 0)).normalize(),
        v = axis.clone().cross(u).normalize();
      const spring = [at];
      for (let j = 1; j <= 12; j++) {
        const t = j / 12,
          a = t * Math.PI * 3.2,
          coil = 0.07 * Math.min(1, t * 3);
        spring.push(
          at
            .clone()
            .addScaledVector(axis, 0.04 + 0.22 * t)
            .addScaledVector(u, Math.cos(a) * coil - coil)
            .addScaledVector(v, Math.sin(a) * coil),
        );
      }
      strand(spring, 0.018, 28, 7, 0.014);
    }
}

/** Grown, groomed fibres, hair and whiskers, merged into a single draw call. */
export function growCoat(g: Genome, m: Morphology, material: T.Material) {
  const p = palettes[g.genes.palette];
  const tint: Tint = {
    base: new T.Color(p[0]),
    tip: new T.Color(p[1]),
    shade: new T.Color(p[2]),
  };
  const parts: T.BufferGeometry[] = [];
  const add: Add = (geo, color, stiffness) => {
    const uv=geo.attributes.uv,position=geo.attributes.position,alongV=geo.userData.alongV===true;
    const root=new T.Vector3();let roots=0;
    for(let j=0;j<position.count;j++){const t=alongV?uv.getY(j):uv.getX(j);if(t<.001){root.add(new T.Vector3().fromBufferAttribute(position,j));roots++;}}
    if(roots)root.divideScalar(roots);else root.fromBufferAttribute(position,0);
    // Reject strands crossing the actual eye volumes or the nasal solid.
    for(let j=0;j<position.count;j+=4){
      const t=alongV?uv.getY(j):uv.getX(j);if(t<.18)continue;
      const x=position.getX(j),y=position.getY(j),z=position.getZ(j);
      if(z<=0)continue;
      const eyeHit=m.eyes.some(e=>Math.hypot(x-e.x,y-e.y,z-(m.front(e.x,e.y)-e.radius*e.depth))<e.radius+.014);
      const noseHit=Math.abs(x)<m.nasal.boundX&&y>m.nasal.boundY0&&y<m.nasal.boundY1&&m.nasal.solid(x,y,z-m.front(0,m.nasal.cy))<-.006;
      const mouthHit=Math.abs(x)<m.mouthWidth+.025&&Math.abs(y-m.mouthY)<.105&&z>m.front(x,y)-.02;
      if(eyeHit||noseHit||mouthHit){geo.dispose();return;}
    }
    colorGeometry(geo,color);
    const flex=new Float32Array(position.count),jaw=new Float32Array(position.count*3),smile=new Float32Array(position.count*3);
    const jd=m.deformation(root,1,0),sd=m.deformation(root,0,1);
    for(let j=0;j<position.count;j++){const t=alongV?uv.getY(j):uv.getX(j);flex[j]=t*t*stiffness;jaw.set(jd.toArray(),j*3);smile.set(sd.toArray(),j*3);}
    geo.setAttribute('flex',new T.BufferAttribute(flex,1));geo.setAttribute('jawMorph',new T.BufferAttribute(jaw,3));geo.setAttribute('smileMorph',new T.BufferAttribute(smile,3));parts.push(geo);
  };
  coatFibres(g, m, tint, add);
  hairFibres(g, m, tint, add);
  whiskerFibres(g, m, tint, add);
  if (!parts.length) return null;
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) return null;
  const mesh = new T.Mesh(geo, material);
  mesh.name = "grown-coat";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
