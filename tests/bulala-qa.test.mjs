/**
 * Fast regression subset of `scripts/bulala-qa.mjs`.
 *
 * The full harness sweeps hundreds of seeds and every trait variant; this file
 * keeps only the invariants that must never regress, on a handful of seeds, so
 * `npm test` stays quick. Run the full audit with:
 *   node scripts/bulala-qa.mjs --seeds=300 --sweep
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = await mkdtemp(join(tmpdir(), "bulala-qa-tests-"));
const output = join(dir, "bundle.mjs");
await build({
  stdin: {
    contents:
      "export * from './src/bulala/genome';export * from './src/bulala/creature';export * from './src/bulala/morphology';export * from './src/bulala/sculpt';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { generate, buildCreature, morphology, lipContour } = await import(
  pathToFileURL(output)
);
after(() => rm(dir, { recursive: true, force: true }));

const SEEDS = ["qa-1", "qa-2", "qa-3", "qa-4", "qa-5", "qa-6"];

/** Every triangle of an indexed or non-indexed geometry. */
function* faces(geo) {
  const index = geo.index?.array;
  const count = index ? index.length : geo.attributes.position.count;
  for (let i = 0; i + 2 < count; i += 3)
    yield index ? [index[i], index[i + 1], index[i + 2]] : [i, i + 1, i + 2];
}

test("no mesh carries NaN or Infinity, at rest or mid-animation", () => {
  for (const seed of SEEDS) {
    const creature = buildCreature(generate(seed));
    for (const time of [0, 0.4, 1.2]) creature.animate(time, 0.9, 1, false);
    creature.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const [name, attribute] of Object.entries(o.geometry.attributes))
        for (const v of attribute.array)
          assert.ok(
            Number.isFinite(v),
            `${seed} ${o.name || "unnamed"} ${name} is not finite`,
          );
      for (const list of Object.values(o.geometry.morphAttributes ?? {}))
        for (const attribute of list)
          for (const v of attribute.array)
            assert.ok(Number.isFinite(v), `${seed} ${o.name} morph`);
    });
    creature.dispose();
  }
});

test("the welded skull only opens where the generator drills: mouth + nostrils", () => {
  for (const seed of SEEDS) {
    const g = generate(seed);
    const creature = buildCreature(g);
    const m = morphology(g);
    const geo = creature.root.getObjectByName("continuous-skull").geometry;
    const p = geo.attributes.position;
    const N = p.count;

    // Count how many triangles use each undirected edge.
    const edges = new Map();
    for (const tri of faces(geo))
      for (let j = 0; j < 3; j++) {
        const a = tri[j];
        const b = tri[(j + 1) % 3];
        const key = a < b ? a * N + b : b * N + a;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    const adjacency = new Map();
    for (const [key, count] of edges) {
      assert.ok(count <= 2, `${seed}: non-manifold edge shared by ${count}`);
      if (count !== 1) continue;
      const a = Math.floor(key / N);
      const b = key % N;
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    }
    // Walk the boundary edges into connected loops.
    const seen = new Set();
    let loops = 0;
    for (const start of adjacency.keys()) {
      if (seen.has(start)) continue;
      loops++;
      const stack = [start];
      seen.add(start);
      while (stack.length)
        for (const n of adjacency.get(stack.pop()))
          if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
    }
    // One mouth, plus at most one loop per nostril the driller could reach.
    assert.ok(loops >= 1, `${seed}: the skull has no mouth aperture`);
    assert.ok(
      loops <= 1 + m.nostrils.length,
      `${seed}: ${loops} boundary loops but only ${1 + m.nostrils.length} apertures are intended — the weld cracked`,
    );
    creature.dispose();
  }
});

/**
 * The aperture is cut at (x/(mouthWidth+0.035))^2 + ((y-mouthY)/0.125)^2 < 1,
 * and the lips are an annulus whose outer ring sits at (mouthWidth+0.155). The
 * ring must enclose the ellipse or the raw hole edge shows through the skin.
 * @returns the largest amount by which the ring dips inside, or 0.
 */
function apertureLeak(m) {
  let worst = 0;
  for (let j = 0; j < 256; j++) {
    const a = (j / 256) * Math.PI * 2;
    const { c, s } = lipContour(m.mouthSpec.contour, Math.cos(a), Math.sin(a), a);
    const ox = c * (m.mouthWidth + 0.155);
    const oy = m.mouthY + s * 0.25;
    const inside =
      (ox / (m.mouthWidth + 0.035)) ** 2 + ((oy - m.mouthY) / 0.125) ** 2;
    worst = Math.max(worst, 1 - inside);
  }
  return worst;
}

test("the lip annulus covers the aperture for the sampled population", () => {
  for (const seed of SEEDS) {
    const m = morphology(generate(seed));
    assert.equal(
      apertureLeak(m) > 0,
      false,
      `${seed} (${m.mouthSpec.contour}): the lip ring dips inside the aperture`,
    );
  }
});

// TODO: currently failing — `lipContour` narrows the outer ring for the "fish"
// and other pinched contours, while the aperture is always cut at the full
// mouthWidth, so wide fish mouths expose the raw hole edge at the corners.
test("every mouth contour covers the aperture, not just the common ones", { todo: true }, () => {
  for (const seed of SEEDS)
    for (let mouth = 0; mouth < 16; mouth++) {
      const g = generate(seed);
      g.genes.mouth = mouth;
      const m = morphology(g);
      const leak = apertureLeak(m);
      assert.equal(
        leak > 0,
        false,
        `${seed} mouth=${mouth} (${m.mouthSpec.contour}, width ${m.mouthWidth.toFixed(3)}): lip ring dips ${leak.toFixed(3)} inside the aperture`,
      );
    }
});

// TODO: currently failing — `nasalAnatomy` unions the clay blobs with the
// z <= 0 face plane above the blob equator, so the relief ends in a vertical
// wall instead of a fillet. Flip to a normal `test(...)` once that is fixed.
test("the nasal relief blends into the face instead of ending in a wall", { todo: true }, () => {
  for (const seed of SEEDS) {
    const m = morphology(generate(seed));
    if (!m.nasal.width) continue;
    const steps = 400;
    const step = 2.4 / steps;
    let worst = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const ds =
        step *
        Math.hypot(Math.cos(a) * m.nasal.width, Math.sin(a) * m.nasal.height);
      let previous = null;
      for (let i = 0; i <= steps; i++) {
        const rr = i * step;
        const z = m.nasal.relief(
          Math.cos(a) * rr * m.nasal.width,
          m.nasal.cy + Math.sin(a) * rr * m.nasal.height,
        );
        if (previous !== null) worst = Math.max(worst, Math.abs(z - previous) / ds);
        previous = z;
      }
    }
    assert.ok(
      worst < 8,
      `${seed}: nasal relief rises at |dz/ds| = ${worst.toFixed(1)} — a vertical seam ring around the nose`,
    );
  }
});

// TODO: currently failing — `morphology.front(x, y)` returns 0 (rather than the
// rim height) outside the projected head outline, so wide eyelid rims, brow
// anchors and horn roots snap back to the z = 0 plane. Flip to `test(...)`
// once `front` clamps to the silhouette.
test("every eyelid rim, brow root and horn root lands on the head outline", { todo: true }, () => {
  for (const seed of SEEDS) {
    const g = generate(seed);
    const m = morphology(g);
    // `front` is exactly 0 only when projectedZ collapses, i.e. when (x, y)
    // lies outside the silhouette — a reliable detector for the bug.
    const onOutline = (what, x, y) =>
      assert.notEqual(
        m.front(x, y),
        0,
        `${seed}: ${what} anchors at (${x.toFixed(3)}, ${y.toFixed(3)}), outside the head outline`,
      );
    m.eyes.forEach((e, i) => {
      onOutline(`brow ${i}`, e.x, e.y + e.radius * 0.98);
      for (let j = 0; j < 16; j++) {
        const a = (j / 16) * Math.PI * 2;
        onOutline(
          `eyelid ${i} rim`,
          e.x + Math.cos(a) * e.radius * 1.4,
          e.y + Math.sin(a) * e.radius * 1.24,
        );
      }
    });
    if (g.genes.horns !== 3 && g.genes.horns !== 7)
      for (const side of g.genes.horns === 2 ? [0] : [-1, 1])
        onOutline(
          `horn ${side}`,
          side * m.rx * 0.445,
          m.ry * (side === 0 ? 0.94 : 0.88),
        );
  }
});

test("the same seed builds byte-identical geometry twice", () => {
  for (const seed of ["qa-1", "qa-4"]) {
    const a = buildCreature(generate(seed));
    const b = buildCreature(generate(seed));
    const read = (c) =>
      c.root.getObjectByName("continuous-skull").geometry.attributes.position
        .array;
    assert.deepEqual(Array.from(read(a)), Array.from(read(b)));
    a.dispose();
    b.dispose();
  }
});
