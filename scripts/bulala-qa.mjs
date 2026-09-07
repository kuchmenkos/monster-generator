#!/usr/bin/env node
/**
 * Headless generation QA for Булала.
 *
 * Builds hundreds of creatures with `buildCreature(generate(seed))` in Node (no
 * WebGL required — Three.js geometry is pure JS) and audits every mesh for:
 *   - non-finite attribute data (NaN / Infinity)
 *   - degenerate triangles
 *   - weld / manifold health of the `continuous-skull` mesh
 *   - seams: attached props that float above the skin or sink into it
 *   - interpenetration (eyes vs eyes, brows vs eyeballs, teeth vs mouth, ...)
 *   - scale outliers, nostril sanity, nose relief continuity
 *   - determinism, DNA round trips, catalog weights
 *   - build time / vertex / triangle / draw-call budgets and dispose() hygiene
 *
 * Usage:
 *   node scripts/bulala-qa.mjs --seeds=300
 *   node scripts/bulala-qa.mjs --seeds=300 --sweep --json=qa.json
 *   node scripts/bulala-qa.mjs --seeds=300 --shard=1/6      # parallel shards
 *
 * Exits non-zero when a HARD failure is found (non-finite data, broken weld,
 * a variant that throws). Quality concerns are reported but do not fail.
 *
 * Performance note: every geometry walk below reads raw typed arrays instead of
 * BufferAttribute getters — the coat alone can carry ~340k triangles, and the
 * accessor overhead dominated everything else.
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ CLI -- */

const flags = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const SEEDS = Number(flags.seeds ?? 300);
const SEED_PREFIX = flags.prefix ?? "qa";
const RUN_SWEEP = flags.sweep === "true";
const JSON_OUT = flags.json && flags.json !== "true" ? flags.json : null;
const [SHARD_I, SHARD_N] = (flags.shard ?? "1/1").split("/").map(Number);
const SKIP_INVARIANTS = flags["skip-invariants"] === "true";
const VERBOSE = flags.verbose === "true";

/* --------------------------------------------------------- thresholds -- */

/** A prop whose closest approach to the skin exceeds this never touches it. */
const FLOAT_TOLERANCE = 0.05;
/** An external prop buried deeper than this everywhere is invisible. */
const SINK_TOLERANCE = 0.06;
/** Triangle area below this counts as degenerate (skull edges are ~0.03 long). */
const DEGENERATE_AREA = 1e-9;
/** Slow-build alarm, milliseconds. */
const SLOW_BUILD_MS = 1500;

/* --------------------------------------------------- bundle the sources -- */

const tempDir = await mkdtemp(join(tmpdir(), "bulala-qa-"));
const bundlePath = join(tempDir, "bundle.mjs");
await build({
  stdin: {
    contents: ["genome", "creature", "morphology", "anatomy", "sculpt", "coats"]
      .map((m) => `export * from './src/bulala/${m}';`)
      .join(""),
    resolveDir: repoRoot,
    loader: "ts",
  },
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const api = await import(pathToFileURL(bundlePath));
const {
  generate,
  buildCreature,
  morphology,
  lipContour,
  catalogs,
  traitKeys,
  encode,
  decode,
  migrateGenome,
  validGenome,
  NOSE_NONE,
} = api;
process.on("exit", () => {
  rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

/* ------------------------------------------------- geometry primitives -- */

/**
 * Uniform-grid nearest-surface probe over the welded skull.
 *
 * `query` returns the signed gap to the tangent plane of the nearest skull
 * vertex (positive = outside the skin) plus the tangential offset, so callers
 * can tell "0.4 above the skin" from "0.4 sideways past the head's edge".
 */
class SurfaceProbe {
  constructor(positions, normals, cell = 0.07) {
    this.p = positions;
    this.n = normals;
    this.cell = cell;
    this.buckets = new Map();
    for (let i = 0; i < positions.length; i += 3) {
      const k = this.key(positions[i], positions[i + 1], positions[i + 2]);
      const bucket = this.buckets.get(k);
      if (bucket) bucket.push(i);
      else this.buckets.set(k, [i]);
    }
  }
  key(x, y, z) {
    const c = this.cell;
    // 1024 slots per axis is far more than the ±3 unit working volume needs.
    return (
      (Math.floor(x / c) + 512) * 1048576 +
      (Math.floor(y / c) + 512) * 1024 +
      Math.floor(z / c) +
      512
    );
  }
  /** @returns {{distance:number, gap:number, tangential:number}} */
  query(x, y, z) {
    const c = this.cell;
    const cx = Math.floor(x / c);
    const cy = Math.floor(y / c);
    const cz = Math.floor(z / c);
    let best = Infinity;
    let bestIndex = -1;
    for (let ring = 0; ring <= 6; ring++) {
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++)
          for (let k = -ring; k <= ring; k++) {
            // Only walk the new shell each round.
            if (
              ring > 0 &&
              Math.abs(i) !== ring &&
              Math.abs(j) !== ring &&
              Math.abs(k) !== ring
            )
              continue;
            const bucket = this.buckets.get(
              (cx + i + 512) * 1048576 + (cy + j + 512) * 1024 + cz + k + 512,
            );
            if (!bucket) continue;
            for (const o of bucket) {
              const d =
                (this.p[o] - x) ** 2 +
                (this.p[o + 1] - y) ** 2 +
                (this.p[o + 2] - z) ** 2;
              if (d < best) {
                best = d;
                bestIndex = o;
              }
            }
          }
      // One extra ring after the first hit guarantees the true nearest cell.
      if (bestIndex >= 0 && ring >= 1) break;
    }
    if (bestIndex < 0)
      return { distance: Infinity, gap: Infinity, tangential: Infinity };
    const distance = Math.sqrt(best);
    const gap =
      (x - this.p[bestIndex]) * this.n[bestIndex] +
      (y - this.p[bestIndex + 1]) * this.n[bestIndex + 1] +
      (z - this.p[bestIndex + 2]) * this.n[bestIndex + 2];
    return {
      distance,
      gap,
      tangential: Math.sqrt(Math.max(0, distance * distance - gap * gap)),
    };
  }
}

/* ------------------------------------------------------- scene walking -- */

/**
 * Collect every mesh with its vertices already transformed into body space.
 * `label` collapses per-instance suffixes (eyelids-0/1/2 -> eyelids-*).
 */
function collectMeshes(creature) {
  const root = creature.root;
  root.updateMatrixWorld(true);
  const body = root.children[0];
  const inverse = body.matrixWorld.clone().invert();
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const e = inverse.clone().multiply(o.matrixWorld).elements;
    const source = o.geometry.attributes.position.array;
    const count = source.length / 3;
    const p = new Float64Array(source.length);
    for (let i = 0; i < count; i++) {
      const x = source[i * 3],
        y = source[i * 3 + 1],
        z = source[i * 3 + 2];
      p[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      p[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      p[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    let label = o.name;
    if (!label) {
      let parent = o.parent;
      while (parent && !parent.name) parent = parent.parent;
      label = (parent?.name ?? "body") + "/unnamed";
    }
    meshes.push({
      object: o,
      rawLabel: label,
      label: label.replace(/-\d+$/, "-*"),
      geometry: o.geometry,
      positions: p,
      count,
      index: o.geometry.index ? o.geometry.index.array : null,
      visible: o.visible,
    });
  });
  return meshes;
}

/** Axis-aligned bounds of already-transformed positions. */
function boundsOf(p) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < b[k]) b[k] = p[i + k];
      if (p[i + k] > b[k + 3]) b[k + 3] = p[i + k];
    }
  return b;
}

/* -------------------------------------------------------------- checks -- */

/** 1. Every numeric attribute (and morph target) must be finite. */
function checkFinite(meshes, issues) {
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    for (const [name, attribute] of Object.entries(geo.attributes)) {
      const a = attribute.array;
      for (let i = 0; i < a.length; i++)
        if (!Number.isFinite(a[i])) {
          issues.push({
            severity: "hard",
            kind: "non-finite-attribute",
            part: mesh.label,
            detail: `${name}[${i}] = ${a[i]}`,
          });
          break;
        }
    }
    for (const [name, list] of Object.entries(geo.morphAttributes ?? {}))
      for (const attribute of list) {
        const a = attribute.array;
        for (let i = 0; i < a.length; i++)
          if (!Number.isFinite(a[i])) {
            issues.push({
              severity: "hard",
              kind: "non-finite-morph",
              part: mesh.label,
              detail: `morph.${name}[${i}]`,
            });
            break;
          }
      }
  }
}

/** 2. Near-zero-area triangles, measured in body space. */
function checkDegenerate(meshes, issues, stats) {
  for (const mesh of meshes) {
    const p = mesh.positions;
    const index = mesh.index;
    const faces = index ? index.length / 3 : mesh.count / 3;
    let degenerate = 0;
    for (let f = 0; f < faces; f++) {
      const a = (index ? index[f * 3] : f * 3) * 3;
      const b = (index ? index[f * 3 + 1] : f * 3 + 1) * 3;
      const c = (index ? index[f * 3 + 2] : f * 3 + 2) * 3;
      const ux = p[b] - p[a],
        uy = p[b + 1] - p[a + 1],
        uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a],
        vy = p[c + 1] - p[a + 1],
        vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      // 4 * area^2, compared against the squared threshold to skip the sqrt.
      if (nx * nx + ny * ny + nz * nz < 4 * DEGENERATE_AREA * DEGENERATE_AREA)
        degenerate++;
    }
    stats.triangles += faces;
    if (degenerate > 0)
      issues.push({
        severity: "quality",
        kind: "degenerate-triangles",
        part: mesh.label,
        detail: `${degenerate}/${faces} zero-area faces`,
        value: degenerate / faces,
      });
  }
}

/**
 * 3. Weld / manifold sanity on the skull.
 * A correctly welded skull is a closed surface whose only boundary loops are
 * the deliberate apertures: the mouth plus one loop per drilled nostril.
 * Anything else is a crack; a missing loop means the drill never cut through.
 */
function checkSkullTopology(mesh, m, meshes, issues, stats) {
  const p = mesh.positions;
  const index = mesh.index;
  const N = mesh.count;
  const edges = new Map();
  for (let i = 0; i < index.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = index[i + j];
      const b = index[i + ((j + 1) % 3)];
      const key = a < b ? a * N + b : b * N + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  const adjacency = new Map();
  let nonManifold = 0;
  for (const [key, count] of edges) {
    if (count === 1) {
      const a = Math.floor(key / N);
      const b = key % N;
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    } else if (count > 2) nonManifold++;
  }
  if (nonManifold)
    issues.push({
      severity: "hard",
      kind: "non-manifold-edges",
      part: "continuous-skull",
      detail: `${nonManifold} edges shared by 3+ triangles`,
      value: nonManifold,
    });
  // Chain the boundary edges into connected loops so each hole can be located.
  const seen = new Set();
  const loops = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const stack = [start];
    const loop = [];
    seen.add(start);
    while (stack.length) {
      const v = stack.pop();
      loop.push(v);
      for (const n of adjacency.get(v))
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
    }
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const centroid = [0, 0, 0];
    for (const v of loop)
      for (let k = 0; k < 3; k++) {
        if (p[v * 3 + k] < b[k]) b[k] = p[v * 3 + k];
        if (p[v * 3 + k] > b[k + 3]) b[k + 3] = p[v * 3 + k];
        centroid[k] += p[v * 3 + k] / loop.length;
      }
    loops.push({
      loop,
      centroid,
      vertices: loop.length,
      box: b.map((v) => +v.toFixed(3)),
      size: +Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]).toFixed(4),
    });
  }
  loops.sort((a, b) => b.vertices - a.vertices);
  stats.skullLoops.push(loops.length);

  // Classify each loop against the apertures the generator means to cut.
  const mouth = loops.find(
    (l) =>
      Math.abs(l.centroid[1] - m.mouthY) < 0.25 &&
      Math.abs(l.centroid[0]) < m.mouthWidth + 0.2 &&
      l.centroid[2] > 0,
  );
  if (mouth) mouth.owner = "mouth";
  m.nostrils.forEach((hole, i) => {
    const w = m.nasal.warp(hole.x, hole.y);
    const reach = Math.max(hole.sx, hole.sy) * 3 + 0.05;
    const match = loops.find(
      (l) =>
        !l.owner &&
        Math.hypot(l.centroid[0] - w.x, l.centroid[1] - w.y) < reach &&
        l.centroid[2] > 0,
    );
    if (match) {
      match.owner = `nostril${i}`;
      match.hole = hole;
      return;
    }
    // No loop of its own: either the twin's hole swallowed it (the nostrils
    // touch and drill as one slot) or the ellipse was too small to remove any
    // triangle and the dark plug now sits behind intact skin.
    const merged = loops.find(
      (l) =>
        l.owner?.startsWith("nostril") &&
        w.x > l.box[0] - 0.01 &&
        w.x < l.box[3] + 0.01 &&
        w.y > l.box[1] - 0.01 &&
        w.y < l.box[4] + 0.01,
    );
    issues.push({
      severity: "quality",
      kind: merged ? "nostrils-merged-into-one-hole" : "nostril-not-drilled",
      part: "continuous-skull",
      detail: merged
        ? `nostril ${i} shares a single drilled slot with ${merged.owner}: centres are ${(Math.abs(hole.x) * 2).toFixed(4)} apart but each ellipse is ${(hole.sx * 2).toFixed(4)} wide, so the pair reads as one wide hole (slot bbox ${(merged.box[3] - merged.box[0]).toFixed(4)} x ${(merged.box[4] - merged.box[1]).toFixed(4)})`
        : `nostril ${i} (sx=${hole.sx.toFixed(4)}, sy=${hole.sy.toFixed(4)}) removed no triangle — the dark nasal-cavity patch sits behind intact skin`,
      value: 1,
    });
  });
  if (!mouth)
    issues.push({
      severity: "hard",
      kind: "no-mouth-aperture",
      part: "continuous-skull",
      detail: "no boundary loop near the mouth",
    });
  const stray = loops.filter((l) => !l.owner);
  if (stray.length)
    issues.push({
      severity: "hard",
      kind: "unexplained-skull-hole",
      part: "continuous-skull",
      detail:
        `${stray.length} boundary loop(s) that are neither mouth nor nostril: ` +
        JSON.stringify(stray.slice(0, 3).map(({ vertices, box }) => ({ vertices, box }))),
      value: stray.length,
    });

  // Does the nasal-cavity plug actually reach the drilled rim?
  const cavities = meshes.filter((x) => x.rawLabel === "nasal-cavity");
  for (const l of loops) {
    if (!l.owner?.startsWith("nostril") || !cavities.length) continue;
    let worst = 0;
    for (const v of l.loop) {
      let best = Infinity;
      for (const cavity of cavities)
        for (let i = 0; i < cavity.count; i++) {
          const d = Math.hypot(
            cavity.positions[i * 3] - p[v * 3],
            cavity.positions[i * 3 + 1] - p[v * 3 + 1],
            cavity.positions[i * 3 + 2] - p[v * 3 + 2],
          );
          if (d < best) best = d;
        }
      if (best > worst) worst = best;
    }
    (stats.nostrilRim ??= []).push(worst);
    // How much wider is the drilled hole than the ellipse the plug was sized
    // to? The drill removes whole triangles, so the rim overshoots the ellipse.
    const overshoot =
      Math.max(
        (l.box[3] - l.box[0]) / (l.hole.sx * 2),
        (l.box[4] - l.box[1]) / (l.hole.sy * 2),
      ) - 1;
    if (worst > 0.025)
      issues.push({
        severity: "quality",
        kind: "nostril-rim-uncovered",
        part: "continuous-skull",
        detail: `${l.owner}: drilled rim runs up to ${worst.toFixed(3)} from the nasal-cavity plug; the hole is ${(overshoot * 100).toFixed(0)}% wider than the ellipse the plug was built from (hole bbox ${(l.box[3] - l.box[0]).toFixed(4)} x ${(l.box[4] - l.box[1]).toFixed(4)} vs ellipse ${(l.hole.sx * 2).toFixed(4)} x ${(l.hole.sy * 2).toFixed(4)})`,
        value: worst,
      });
  }
}

/** Props that are supposed to be seated on / grown out of the skin. */
const SEATED = new Set([
  "anatomical-ear",
  "grown-horn",
  "broad-crest",
  "brow",
  "eye-stalk",
  "eyeball",
  "eyelids-*",
  "living-lips",
  "grown-coat",
  "tail",
]);
/**
 * Parts measured for reference only: they either live inside the head (mouth
 * and nasal interior) or hang off another prop rather than off the skin.
 */
const OBSERVED = new Set([
  "tooth",
  "gums",
  "tongue",
  "oral-cavity",
  "nasal-cavity",
  "horn-branch",
  "tail-fin",
]);

/**
 * 4. Seam audit: does the prop actually reach the skin?
 * Reports the closest approach of each attached part to the skull surface.
 */
function checkSeating(meshes, probe, issues, stats) {
  for (const mesh of meshes) {
    const external = SEATED.has(mesh.label);
    if (!external && !OBSERVED.has(mesh.label)) continue;
    const stride = Math.max(1, Math.ceil(mesh.count / 1600));
    let minAbs = Infinity;
    let bestGap = Infinity;
    let deepest = 0;
    let allOutside = true;
    let allInside = true;
    for (let i = 0; i < mesh.count; i += stride) {
      const q = probe.query(
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1],
        mesh.positions[i * 3 + 2],
      );
      // Points far off to the side of the head are not "above the skin" —
      // for those the straight-line distance is the honest measure.
      const effective = q.tangential > 0.06 ? q.distance : Math.abs(q.gap);
      if (effective < minAbs) {
        minAbs = effective;
        bestGap = q.gap;
      }
      if (q.gap > 0) allInside = false;
      else {
        allOutside = false;
        if (-q.gap > deepest) deepest = -q.gap;
      }
    }
    (stats.seating[mesh.label] ??= []).push(minAbs);
    if (!external) continue;
    if (minAbs > FLOAT_TOLERANCE)
      issues.push({
        severity: "quality",
        kind: allOutside ? "floating-part" : "detached-part",
        part: mesh.label,
        detail: `closest approach to the skin ${minAbs.toFixed(3)} (signed ${bestGap.toFixed(3)})`,
        value: minAbs,
      });
    if (allInside && deepest > SINK_TOLERANCE)
      issues.push({
        severity: "quality",
        kind: "buried-part",
        part: mesh.label,
        detail: `entirely inside the skull, deepest ${deepest.toFixed(3)}`,
        value: deepest,
      });
  }
}

/**
 * 5. Interpenetration between features that should stay apart.
 * Analytic morphology where possible (cheap and exact), bounds for swept props.
 */
function checkInterpenetration(g, m, meshes, issues) {
  // Eyeballs must not overlap each other.
  for (let i = 0; i < m.eyes.length; i++)
    for (let j = i + 1; j < m.eyes.length; j++) {
      const a = m.eyes[i];
      const b = m.eyes[j];
      const overlap =
        a.radius + b.radius - Math.hypot(a.x - b.x, a.y - b.y);
      if (overlap > 0.02)
        issues.push({
          severity: "quality",
          kind: "eyes-overlap",
          part: `eye${i}/eye${j}`,
          detail: `sclera spheres interpenetrate by ${overlap.toFixed(3)}`,
          value: overlap,
        });
    }
  // Eyes must respect the nasal clearance rule morphology() tries to enforce.
  if (g.genes.nose !== NOSE_NONE)
    for (const [i, e] of m.eyes.entries()) {
      const dx = Math.abs(e.x) - (m.nasal.width * 0.72 + e.radius * 0.8);
      const dy = e.y - e.radius - (m.nasal.cy + m.nasal.height * 0.65);
      if (dx < 0 && dy < -0.01)
        issues.push({
          severity: "quality",
          kind: "eye-inside-nose",
          part: `eye${i}`,
          detail: `clearance rule violated by ${(-dy).toFixed(3)}`,
          value: -dy,
        });
    }
  // Brow strands must not be pushed inside the eyeball.
  for (const brow of meshes) {
    if (brow.label !== "brow") continue;
    let worst = 0;
    const stride = Math.max(1, Math.ceil(brow.count / 1200));
    for (const e of m.eyes) {
      const ez = m.front(e.x, e.y) - e.radius * e.depth;
      for (let i = 0; i < brow.count; i += stride) {
        const d = Math.hypot(
          brow.positions[i * 3] - e.x,
          brow.positions[i * 3 + 1] - e.y,
          brow.positions[i * 3 + 2] - ez,
        );
        if (e.radius - d > worst) worst = e.radius - d;
      }
    }
    if (worst > 0.02)
      issues.push({
        severity: "quality",
        kind: "brow-inside-eyeball",
        part: "brow",
        detail: `brow dips ${worst.toFixed(3)} into the sclera`,
        value: worst,
      });
  }
  // Horns must not pass through the ear shells.
  const ears = meshes
    .filter((x) => x.label === "anatomical-ear")
    .map((x) => boundsOf(x.positions));
  const horns = meshes
    .filter((x) => x.label === "grown-horn" || x.label === "horn-branch")
    .map((x) => boundsOf(x.positions));
  for (const ear of ears)
    for (const horn of horns) {
      const overlap = [0, 1, 2].map(
        (k) => Math.min(ear[k + 3], horn[k + 3]) - Math.max(ear[k], horn[k]),
      );
      if (overlap.every((v) => v > 0.02))
        issues.push({
          severity: "quality",
          kind: "horn-through-ear",
          part: "grown-horn/anatomical-ear",
          detail: `bounds overlap by ${overlap.map((v) => v.toFixed(2)).join(" x ")}`,
          value: Math.min(...overlap),
        });
    }
  // Teeth must stay inside the lip silhouette.
  for (const mesh of meshes) {
    if (mesh.label !== "tooth") continue;
    let worst = 0;
    for (let i = 0; i < mesh.count; i++) {
      const outside = Math.abs(mesh.positions[i * 3]) - (m.mouthWidth + 0.155);
      if (outside > worst) worst = outside;
    }
    if (worst > 0.005)
      issues.push({
        severity: "quality",
        kind: "tooth-outside-mouth",
        part: "tooth",
        detail: `tooth sticks ${worst.toFixed(3)} past the lip corner`,
        value: worst,
      });
  }
}

/**
 * 5b. The fleshy lip annulus must fully cover the aperture cut in the skull,
 * otherwise the raw hole edge shows and you can see into the head.
 * The hole is cut at (x/(mouthWidth+0.035))^2 + ((y-mouthY)/0.125)^2 < 1.
 */
function checkLipCoverage(g, m, issues) {
  const spec = m.mouthSpec;
  let worst = 0;
  let worstAngle = 0;
  for (let j = 0; j < 512; j++) {
    const a = (j / 512) * Math.PI * 2;
    const { c, s } = lipContour(spec.contour, Math.cos(a), Math.sin(a), a);
    const ox = c * (m.mouthWidth + 0.155);
    const oy = m.mouthY + s * 0.25;
    // < 1 means the outer lip ring is *inside* the aperture => uncovered rim.
    const inside =
      (ox / (m.mouthWidth + 0.035)) ** 2 + ((oy - m.mouthY) / 0.125) ** 2;
    if (1 - inside > worst) {
      worst = 1 - inside;
      worstAngle = a;
    }
  }
  if (worst > 0)
    issues.push({
      severity: "quality",
      kind: "lips-do-not-cover-aperture",
      part: "living-lips",
      detail:
        `outer lip ring falls inside the cut aperture by ${worst.toFixed(3)} ` +
        `at a=${worstAngle.toFixed(2)} (contour=${spec.contour}, mouthWidth=${m.mouthWidth.toFixed(3)})`,
      value: worst,
    });
}

/** 6. Scale sanity relative to the head. */
function checkScale(m, meshes, issues, stats) {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    const b = boundsOf(mesh.positions);
    for (let k = 0; k < 3; k++) {
      if (b[k] < box[k]) box[k] = b[k];
      if (b[k + 3] > box[k + 3]) box[k + 3] = b[k + 3];
    }
  }
  const size = [box[3] - box[0], box[4] - box[1], box[5] - box[2]];
  const largest = Math.max(...size);
  stats.bbox.push(largest);
  const head = Math.max(m.rx, m.ry, m.rz);
  if (largest > head * 4)
    issues.push({
      severity: "quality",
      kind: "oversized-silhouette",
      part: "scene",
      detail: `bbox ${size.map((v) => v.toFixed(2)).join(" x ")} vs head radius ${head.toFixed(2)}`,
      value: largest / head,
    });
}

/** 7. Nostrils and the nasal relief profile. */
function checkNose(g, m, issues, stats) {
  if (g.genes.nose === NOSE_NONE) {
    if (m.nasal.nostrils.length)
      issues.push({
        severity: "quality",
        kind: "noseless-has-nostrils",
        part: "nose",
        detail: `${m.nasal.nostrils.length} nostrils on a noseless face`,
      });
    return;
  }
  for (const [i, hole] of m.nasal.nostrils.entries()) {
    if (!(hole.sx > 0) || !(hole.sy > 0)) {
      issues.push({
        severity: "hard",
        kind: "degenerate-nostril",
        part: "nose",
        detail: `nostril ${i} has zero extent`,
      });
      continue;
    }
    const ratioX = hole.sx / m.nasal.width;
    const ratioY = hole.sy / m.nasal.height;
    if (ratioX > 0.55 || ratioY > 0.55)
      issues.push({
        severity: "quality",
        kind: "oversized-nostril",
        part: `nose=${g.genes.nose}`,
        detail: `nostril ${i} is ${(ratioX * 100) | 0}% x ${(ratioY * 100) | 0}% of the nose patch`,
        value: Math.max(ratioX, ratioY),
      });
    // Nostril must live inside the patch that gets refined and displaced.
    const outsideU = Math.abs(hole.x) + hole.sx - m.nasal.width * 1.05;
    const outsideV =
      Math.abs(hole.y - m.nasal.cy) + hole.sy - m.nasal.height * 1.05;
    if (outsideU > 0 || outsideV > 0)
      issues.push({
        severity: "quality",
        kind: "nostril-outside-patch",
        part: `nose=${g.genes.nose}`,
        detail: `nostril ${i} spills ${Math.max(outsideU, outsideV).toFixed(3)} past the nose patch`,
        value: Math.max(outsideU, outsideV),
      });
  }
  // Radial relief profile. A nose that blends into the face has a bounded
  // slope; a blob that is unioned with the face plane above its own equator
  // leaves a vertical cliff, which renders as a hard seam ring.
  const steps = 600;
  const step = 2.4 / steps;
  let worstSlope = 0;
  let worstDrop = 0;
  let worstAt = 0;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    // Arc length per radial step, so the slope is dz/d(distance on the face).
    const ds =
      step * Math.hypot(Math.cos(a) * m.nasal.width, Math.sin(a) * m.nasal.height);
    let previous = null;
    for (let i = 0; i <= steps; i++) {
      const rr = i * step;
      const z = m.nasal.relief(
        Math.cos(a) * rr * m.nasal.width,
        m.nasal.cy + Math.sin(a) * rr * m.nasal.height,
      );
      if (previous !== null) {
        const slope = Math.abs(z - previous) / ds;
        if (slope > worstSlope) {
          worstSlope = slope;
          worstDrop = Math.abs(z - previous);
          worstAt = rr;
        }
      }
      previous = z;
    }
  }
  (stats.noseCliff[g.genes.nose] ??= []).push(worstSlope);
  // |dz/ds| > 8 means the surface rises ~83 degrees off the face — a wall.
  if (worstSlope > 8)
    issues.push({
      severity: "quality",
      kind: "nose-relief-cliff",
      part: `nose=${g.genes.nose}`,
      detail: `|dz/ds| = ${worstSlope.toFixed(1)} (drops ${worstDrop.toFixed(3)} over ${(worstDrop / worstSlope).toFixed(4)} of face travel) at r=${worstAt.toFixed(2)} patch radii`,
      value: worstSlope,
    });
}

/**
 * 7b. Eyelid funnels.
 * The lid's outer ring is lerped onto `m.front(x, y)`. When that ring leaves
 * the head outline `front` returns 0 instead of the rim height, and the ring
 * snaps back to the z = 0 plane — the lid becomes a long cone stretching from
 * the eyeball to the equator instead of a shallow rim on the skin.
 */
function checkEyelidShape(m, meshes, probe, issues, stats) {
  for (const mesh of meshes) {
    if (!mesh.rawLabel.startsWith("eyelids-")) continue;
    const index = Number(mesh.rawLabel.split("-")[1]);
    const e = m.eyes[index];
    // The outer rim is the v = 1 row of the lid patch; identify it via uv so
    // the check survives a change of row/column counts.
    const uv = mesh.geometry.attributes.uv;
    if (!e || !uv) continue;
    let worst = 0;
    for (let i = 0; i < mesh.count; i++) {
      if (uv.getY(i) < 0.999) continue;
      const q = probe.query(
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1],
        mesh.positions[i * 3 + 2],
      );
      const effective = q.tangential > 0.06 ? q.distance : Math.abs(q.gap);
      if (effective > worst) worst = effective;
    }
    stats.lidRim.push(worst);
    if (worst > 0.05)
      issues.push({
        severity: "quality",
        kind: "eyelid-rim-off-skin",
        part: "eyelids-*",
        detail: `lid ${index} (eye radius ${e.radius.toFixed(3)}) has outer-rim vertices up to ${worst.toFixed(3)} away from the skin — the rim fell to the z = 0 plane`,
        value: worst,
      });
  }
}

/**
 * 8. Anchors evaluated outside the head silhouette.
 * `morphology.front(x, y)` returns 0 (not the rim height) when (x, y) lies
 * outside the projected outline, so anything seated with it lands on the z=0
 * plane instead of on the skin.
 */
function checkSilhouetteAnchors(g, m, issues) {
  const report = (what, x, y) => {
    if (m.front(x, y) === 0)
      issues.push({
        severity: "quality",
        kind: "anchor-outside-silhouette",
        part: what,
        detail: `front(${x.toFixed(3)}, ${y.toFixed(3)}) === 0 — the anchor falls off the head outline and collapses to z = 0`,
        value: 1,
      });
  };
  m.eyes.forEach((e, i) => {
    report(`brow${i}`, e.x, e.y + e.radius * 0.98);
    // Outer eyelid rim, the ring that is lerped onto `front`.
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2;
      report(
        `eyelid${i}`,
        e.x + Math.cos(a) * e.radius * 1.4,
        e.y + Math.sin(a) * e.radius * 1.24,
      );
    }
  });
  if (g.genes.horns !== 3 && g.genes.horns !== 7)
    for (const side of g.genes.horns === 2 ? [0] : [-1, 1])
      for (const t of [0.4, 0.445, 0.49])
        report(
          `horn(side=${side})`,
          side * m.rx * t,
          m.ry * (side === 0 ? 0.94 : 0.88),
        );
  for (let i = 0; i < 2; i++)
    report(`tooth-corner${i}`, (i ? 1 : -1) * 0.86 * m.mouthWidth, m.mouthY);
}

/* ---------------------------------------------------- one full creature -- */

function auditCreature(g, stats, label) {
  const issues = [];
  const t0 = performance.now();
  let creature;
  try {
    creature = buildCreature(g);
  } catch (error) {
    return {
      issues: [
        {
          severity: "hard",
          kind: "build-threw",
          part: label,
          detail: String(error?.stack ?? error)
            .split("\n")
            .slice(0, 3)
            .join(" | "),
        },
      ],
    };
  }
  const buildMs = performance.now() - t0;
  stats.buildTimes.push(buildMs);
  if (buildMs > SLOW_BUILD_MS)
    issues.push({
      severity: "quality",
      kind: "slow-build",
      part: "performance",
      detail: `${label}: ${buildMs.toFixed(0)}ms`,
      value: buildMs,
    });

  const m = morphology(g);
  const meshes = collectMeshes(creature);
  stats.drawCalls.push(meshes.length);
  stats.vertices.push(meshes.reduce((v, x) => v + x.count, 0));

  const head = meshes.find((x) => x.rawLabel === "continuous-skull");
  if (!head) {
    issues.push({
      severity: "hard",
      kind: "missing-skull",
      part: label,
      detail: "no `continuous-skull` mesh in the scene graph",
    });
    creature.dispose();
    return { issues };
  }

  const probe = new SurfaceProbe(
    head.positions,
    head.geometry.attributes.normal.array,
  );
  checkFinite(meshes, issues);
  checkDegenerate(meshes, issues, stats);
  checkSkullTopology(head, m, meshes, issues, stats);
  checkSeating(meshes, probe, issues, stats);
  checkInterpenetration(g, m, meshes, issues);
  checkLipCoverage(g, m, issues);
  checkScale(m, meshes, issues, stats);
  checkNose(g, m, issues, stats);
  checkEyelidShape(m, meshes, probe, issues, stats);
  checkSilhouetteAnchors(g, m, issues);

  // 10. dispose() must release every geometry and material it created.
  const resources = new Set();
  creature.root.traverse((o) => {
    if (!o.isMesh) return;
    resources.add(o.geometry);
    for (const mat of Array.isArray(o.material) ? o.material : [o.material])
      resources.add(mat);
  });
  let disposed = 0;
  for (const resource of resources)
    resource.addEventListener("dispose", () => disposed++);
  creature.dispose();
  if (disposed !== resources.size)
    issues.push({
      severity: "hard",
      kind: "leaked-resources",
      part: label,
      detail: `${resources.size - disposed}/${resources.size} resources not disposed`,
      value: resources.size - disposed,
    });

  return { issues };
}

/* ---------------------------------------------- non-geometry invariants -- */

function checkGlobalInvariants(issues) {
  for (const key of traitKeys) {
    const sum = catalogs[key].reduce((v, x) => v + x.w, 0);
    if (sum !== 100)
      issues.push({
        severity: "hard",
        kind: "weights-do-not-sum-to-100",
        part: key,
        detail: `sum = ${sum}`,
        value: sum,
      });
  }
  // Sampled distribution vs declared weights over a large population.
  const N = 24000;
  const counts = Object.fromEntries(
    traitKeys.map((k) => [k, new Array(catalogs[k].length).fill(0)]),
  );
  for (let i = 0; i < N; i++) {
    const g = generate("dist-" + i);
    if (!validGenome(g))
      issues.push({
        severity: "hard",
        kind: "invalid-generated-genome",
        part: "generate",
        detail: `seed dist-${i}`,
      });
    for (const k of traitKeys) counts[k][g.genes[k]]++;
  }
  for (const k of traitKeys)
    catalogs[k].forEach((x, i) => {
      const observed = (counts[k][i] / N) * 100;
      // ~4 sigma of a binomial with n = 24000 stays well under 1.4pp.
      if (Math.abs(observed - x.w) > 1.4)
        issues.push({
          severity: "quality",
          kind: "biased-sampler",
          part: `${k}/${i}`,
          detail: `declared ${x.w}%, observed ${observed.toFixed(2)}%`,
          value: Math.abs(observed - x.w),
        });
    });
  // Round trips + migration of legacy DNA.
  for (let i = 0; i < 500; i++) {
    const g = generate("codec-" + i);
    if (JSON.stringify(decode(encode(g))) !== JSON.stringify(g))
      issues.push({
        severity: "hard",
        kind: "codec-round-trip",
        part: "encode/decode",
        detail: `seed codec-${i}`,
      });
    const v1 = {
      version: 1,
      seed: "legacy-" + i,
      chaos: 40,
      genes: {
        mouth: i % 5,
        chin: i % 4,
        horns: i % 11,
        shape: i % 19,
        eyes: i % 6,
        nose: i % 21,
        ears: i % 12,
        skin: i % 11,
        booty: i % 15,
        tail: i % 10,
        palette: i % 12,
      },
    };
    try {
      const migrated = migrateGenome(v1);
      if (migrated && !validGenome(migrated))
        issues.push({
          severity: "hard",
          kind: "migration-produced-invalid-dna",
          part: "migrateGenome",
          detail: `legacy-${i}`,
        });
      migrateGenome({ ...v1, version: 2, genes: generate("m" + i).genes });
    } catch (error) {
      issues.push({
        severity: "hard",
        kind: "migration-threw",
        part: "migrateGenome",
        detail: String(error),
      });
    }
  }
}

/** Determinism: the same seed must produce byte-identical skull positions. */
function checkDeterminism(seeds, issues) {
  for (const seed of seeds) {
    const a = buildCreature(generate(seed));
    const b = buildCreature(generate(seed));
    const pa = a.root.getObjectByName("continuous-skull").geometry.attributes
      .position.array;
    const pb = b.root.getObjectByName("continuous-skull").geometry.attributes
      .position.array;
    let differs = -1;
    if (pa.length !== pb.length) differs = -2;
    else
      for (let i = 0; i < pa.length; i++)
        if (pa[i] !== pb[i]) {
          differs = i;
          break;
        }
    if (differs !== -1)
      issues.push({
        severity: "hard",
        kind: "non-deterministic-build",
        part: seed,
        detail: differs === -2 ? "vertex count differs" : `position[${differs}]`,
      });
    a.dispose();
    b.dispose();
  }
}

/* ----------------------------------------------------------- reporting -- */

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

function summarise(all) {
  const byKind = new Map();
  for (const record of all)
    for (const issue of record.issues) {
      const key = issue.kind + " :: " + issue.part;
      let bucket = byKind.get(key);
      if (!bucket)
        byKind.set(
          key,
          (bucket = {
            kind: issue.kind,
            part: issue.part,
            severity: issue.severity,
            count: 0,
            worst: -Infinity,
            worstCase: null,
            examples: [],
          }),
        );
      bucket.count++;
      const v = issue.value ?? 0;
      if (v > bucket.worst) {
        bucket.worst = v;
        bucket.worstCase = { case: record.label, detail: issue.detail };
      }
      if (bucket.examples.length < 3)
        bucket.examples.push({ case: record.label, detail: issue.detail });
    }
  return [...byKind.values()].sort((a, b) => b.count - a.count);
}

/* ---------------------------------------------------------------- main -- */

const stats = {
  buildTimes: [],
  vertices: [],
  triangles: 0,
  drawCalls: [],
  bbox: [],
  seating: {},
  skullLoops: [],
  noseCliff: {},
  lidRim: [],
  nostrilRim: [],
};
const records = [];
const globalIssues = [];

// Diagnostic mode: dump the radial nose relief profile for one seed so a
// suspected discontinuity can be read off directly instead of inferred.
if (flags["nose-profile"]) {
  const g = generate(flags["nose-profile"]);
  const m = morphology(g);
  console.log(
    `seed=${g.seed} nose=${g.genes.nose} width=${m.nasal.width.toFixed(4)} height=${m.nasal.height.toFixed(4)} cy=${m.nasal.cy.toFixed(4)}`,
  );
  console.log(`nostrils: ${JSON.stringify(m.nasal.nostrils)}`);
  for (const angle of [0, Math.PI / 2, Math.PI]) {
    console.log(`\n-- ray a=${angle.toFixed(2)} (rr, x, y, relief) --`);
    let previous = null;
    for (let i = 0; i <= 240; i++) {
      const rr = (i / 240) * 2.4;
      const x = Math.cos(angle) * rr * m.nasal.width;
      const y = m.nasal.cy + Math.sin(angle) * rr * m.nasal.height;
      const z = m.nasal.relief(x, y);
      const jump = previous === null ? 0 : z - previous;
      previous = z;
      if (Math.abs(jump) > 0.004 || i % 20 === 0)
        console.log(
          `  rr=${rr.toFixed(3)} x=${x.toFixed(4)} y=${y.toFixed(4)} z=${z.toFixed(6)} dz=${jump.toFixed(6)}`,
        );
    }
  }
  process.exit(0);
}

// Diagnostic mode: compare the drilled nostril rim in the skull against the
// analytic nostril ellipse and against the nasal-cavity plug that should fill
// it, so the "you can see through the nose" ring can be sized exactly.
if (flags["nostril-probe"]) {
  for (const seed of flags["nostril-probe"].split(",")) {
    const g = generate(seed);
    const m = morphology(g);
    const creature = buildCreature(g);
    const meshes = collectMeshes(creature);
    const head = meshes.find((x) => x.rawLabel === "continuous-skull");
    const issues = [];
    const stats = { skullLoops: [], nostrilRim: [] };
    checkSkullTopology(head, m, meshes, issues, stats);
    console.log(
      `\nseed=${seed} nose=${g.genes.nose} nostrils=${m.nostrils.length} loops=${stats.skullLoops[0]}`,
    );
    for (const [i, hole] of m.nostrils.entries())
      console.log(
        `  nostril ${i}: ellipse 2sx=${(hole.sx * 2).toFixed(4)} 2sy=${(hole.sy * 2).toFixed(4)} at (${hole.x.toFixed(4)}, ${hole.y.toFixed(4)})`,
      );
    for (const issue of issues) console.log(`  ! ${issue.kind}: ${issue.detail}`);
    console.log(
      `  rim -> plug distance: ${stats.nostrilRim.map((v) => v.toFixed(4)).join(", ")}`,
    );
    creature.dispose();
  }
  process.exit(0);
}

console.log(
  `bulala-qa: seeds=${SEEDS} sweep=${RUN_SWEEP} shard=${SHARD_I}/${SHARD_N}`,
);

if (SHARD_I === 1 && !SKIP_INVARIANTS) {
  const t = performance.now();
  checkGlobalInvariants(globalIssues);
  checkDeterminism(["det-a", "det-b"], globalIssues);
  console.log(
    `  invariants + determinism: ${((performance.now() - t) / 1000).toFixed(1)}s, ${globalIssues.length} issues`,
  );
}

// --- random population -------------------------------------------------- //
const t1 = performance.now();
let done = 0;
for (let i = 0; i < SEEDS; i++) {
  if (i % SHARD_N !== SHARD_I - 1) continue;
  const seed = `${SEED_PREFIX}-${i}`;
  const g = generate(seed);
  const label = `seed=${seed}`;
  const { issues } = auditCreature(g, stats, label);
  records.push({ label, seed, genes: g.genes, issues });
  if (VERBOSE && issues.length)
    console.log(`  ${label}: ${issues.map((x) => x.kind).join(", ")}`);
  if (++done % 25 === 0)
    console.log(
      `  ...${done} creatures (${((performance.now() - t1) / 1000).toFixed(0)}s)`,
    );
}
console.log(
  `  random population: ${((performance.now() - t1) / 1000).toFixed(1)}s`,
);

// --- exhaustive per-trait sweep ----------------------------------------- //
const sweepFailures = {};
if (RUN_SWEEP) {
  const t2 = performance.now();
  let n = 0;
  for (const key of traitKeys) {
    sweepFailures[key] = [];
    for (let value = 0; value < catalogs[key].length; value++) {
      // Two different backgrounds so a variant is not judged by one skull.
      for (const base of ["sweep-a", "sweep-b"]) {
        if (n++ % SHARD_N !== SHARD_I - 1) continue;
        const g = generate(base);
        g.genes[key] = value;
        const label = `${key}=${value} "${catalogs[key][value].label}" base=${base}`;
        const { issues } = auditCreature(g, stats, label);
        records.push({
          label,
          seed: base,
          trait: key,
          value,
          genes: g.genes,
          issues,
        });
        if (issues.length)
          sweepFailures[key].push({
            value,
            variant: catalogs[key][value].label,
            base,
            kinds: [...new Set(issues.map((x) => x.kind))],
          });
      }
    }
  }
  console.log(`  trait sweep: ${((performance.now() - t2) / 1000).toFixed(1)}s`);
}

/* --------------------------------------------------------------- output */

const summary = summarise([
  ...records,
  { label: "global", issues: globalIssues },
]);
const hard = summary.filter((x) => x.severity === "hard");
const quality = summary.filter((x) => x.severity !== "hard");

const line = (x) =>
  `${String(x.count).padStart(5)}  ${x.kind}  [${x.part}]\n` +
  `         worst: ${x.worstCase.case} — ${x.worstCase.detail}` +
  (x.examples[0] && x.examples[0].case !== x.worstCase.case
    ? `\n         also : ${x.examples[0].case} — ${x.examples[0].detail}`
    : "");

console.log("\n================ HARD FAILURES ================");
console.log(hard.length ? hard.map(line).join("\n") : "  none");
console.log("\n================ QUALITY CONCERNS ================");
console.log(quality.length ? quality.map(line).join("\n") : "  none");

console.log("\n================ STATISTICS ================");
const b = stats.buildTimes;
console.log(
  `  creatures built     : ${b.length}\n` +
    `  build p50/p95/max   : ${percentile(b, 0.5).toFixed(0)} / ${percentile(b, 0.95).toFixed(0)} / ${Math.max(...b).toFixed(0)} ms\n` +
    `  vertices p50/max    : ${percentile(stats.vertices, 0.5)} / ${Math.max(...stats.vertices)}\n` +
    `  triangles total     : ${stats.triangles}\n` +
    `  draw calls p50/max  : ${percentile(stats.drawCalls, 0.5)} / ${Math.max(...stats.drawCalls)}\n` +
    `  scene bbox p50/max  : ${percentile(stats.bbox, 0.5).toFixed(2)} / ${Math.max(...stats.bbox).toFixed(2)}\n` +
    `  skull boundary loops: ${[...new Set(stats.skullLoops)].sort().join(", ")}\n` +
    `  eyelid outer rim -> skin p50/max   : ${percentile(stats.lidRim, 0.5).toFixed(4)} / ${Math.max(0, ...stats.lidRim).toFixed(4)}\n` +
    `  drilled nostril rim -> cavity plug p50/max : ${percentile(stats.nostrilRim, 0.5).toFixed(4)} / ${Math.max(0, ...stats.nostrilRim).toFixed(4)}`,
);

console.log("\n  closest approach to the skin, per part (min / median / p95):");
for (const [part, values] of Object.entries(stats.seating).sort())
  console.log(
    `    ${part.padEnd(18)} ${Math.min(...values).toFixed(3)}  ${percentile(values, 0.5).toFixed(3)}  ${percentile(values, 0.95).toFixed(3)}   (n=${values.length})`,
  );

if (Object.keys(stats.noseCliff).length) {
  console.log("\n  nose relief max |dz/ds| (wall steepness), per nose gene:");
  for (const [kind, values] of Object.entries(stats.noseCliff).sort(
    (a, b) => Math.max(...b[1]) - Math.max(...a[1]),
  ))
    console.log(
      `    nose=${String(kind).padEnd(3)} ${Math.max(...values).toFixed(2)}  (n=${values.length})`,
    );
}

if (RUN_SWEEP) {
  console.log("\n  per-trait sweep findings:");
  for (const [key, list] of Object.entries(sweepFailures))
    if (list.length)
      console.log(
        `    ${key.padEnd(10)} ${list.length} flagged builds: ` +
          list
            .slice(0, 8)
            .map((x) => `#${x.value} ${x.variant} [${x.kinds.join("|")}]`)
            .join("; "),
      );
}

if (JSON_OUT)
  await writeFile(
    JSON_OUT,
    JSON.stringify({ summary, stats, sweepFailures, records }, null, 1),
  );

const hardCount = hard.reduce((v, x) => v + x.count, 0);
console.log(
  `\nRESULT: ${hardCount} hard failures, ${quality.reduce((v, x) => v + x.count, 0)} quality findings.`,
);
process.exit(hardCount ? 1 : 0);
