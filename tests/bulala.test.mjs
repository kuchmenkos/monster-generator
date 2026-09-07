import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "bulala-tests-"));
const output = join(dir, "bundle.mjs");
await build({
  stdin: {
    contents:
      "export * from './src/bulala/genome';export * from './src/bulala/creature';export * from './src/bulala/morphology';export * from './src/bulala/motion';export * from './src/bulala/demo';export * from './src/bulala/collection';export * from './src/bulala/voice';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const {
  parseCollection,
  updatePreview,
  RENDER_VERSION,
  Voice,
  signature,
  morphology,
  migrateGenome,
  pupilTypes,
  ExpressionController,
  SoftSpring,
  DemoPhraseDeck,
  demoPhrases,
  generate,
  encode,
  decode,
  validGenome,
  rarity,
  catalogs,
  traitKeys,
  buildCreature,
} = await import(pathToFileURL(output));
after(() => rm(dir, { recursive: true, force: true }));
test("DNA round trip is deterministic and canonical despite field order", () => {
  const a = generate("round-trip");
  assert.deepEqual(a, generate("round-trip"));
  assert.deepEqual(decode(encode(a)), a);
  const b = {
    ...a,
    genes: Object.fromEntries(Object.entries(a.genes).reverse()),
  };
  assert.equal(encode(a), encode(b));
});
test("invalid DNA is rejected without throwing", () => {
  for (const v of [
    null,
    [],
    {},
    "bad",
    { ...generate("test"), seed: "<script>" },
    { ...generate("test"), chaos: NaN },
    { ...generate("test"), genes: { eyes: 500 } },
  ])
    assert.equal(validGenome(v), false);
  for (const v of [
    "%%%%",
    btoa("null"),
    btoa("[]"),
    btoa('{"version":1,"genes":5}'),
  ])
    assert.equal(decode(v), null);
});
test("categorical weights sum to 100 and 12000 samples follow declared weights", () => {
  const counts = Object.fromEntries(
    traitKeys.map((k) => [k, new Array(catalogs[k].length).fill(0)]),
  );
  for (let i = 0; i < 12000; i++) {
    const g = generate("stat-" + i);
    assert.ok(validGenome(g));
    for (const k of traitKeys) counts[k][g.genes[k]]++;
  }
  for (const k of traitKeys) {
    assert.equal(
      catalogs[k].reduce((v, x) => v + x.w, 0),
      100,
    );
    catalogs[k].forEach((x, i) =>
      assert.ok(Math.abs(counts[k][i] / 120 - x.w) < 2, `${k}/${i} biased`),
    );
  }
});
test("rarity follows probability and does not depend on continuous styling", () => {
  const common = generate("rarity");
  const rare = structuredClone(common);
  for (const k of traitKeys) {
    common.genes[k] = catalogs[k].reduce(
      (a, x, i) => (x.w > catalogs[k][a].w ? i : a),
      0,
    );
    rare.genes[k] = catalogs[k].reduce(
      (a, x, i) => (x.w < catalogs[k][a].w ? i : a),
      0,
    );
  }
  assert.ok(rarity(common).tail > rarity(rare).tail);
  assert.equal(rarity(rare).tier, "Легендарный");
  assert.equal(rarity({ ...rare, chaos: 100 }).tail, rarity(rare).tail);
});
test("every anatomy variant builds finite geometry and disposes resources", () => {
  let checked = 0;
  for (const key of traitKeys) {
    for (let value = 0; value < catalogs[key].length; value++) {
      const g = generate("geometry-" + key);
      g.genes[key] = value;
      const creature = buildCreature(g);
      creature.animate(2, 0.8, 1, false);
      let meshes = 0;
      creature.root.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        for (const attribute of ["position", "normal"]) {
          const a = o.geometry.attributes[attribute];
          if (a)
            for (const n of a.array)
              assert.ok(Number.isFinite(n), `${key} ${value}: ${attribute}`);
        }
        if (o.isInstancedMesh)
          for (const n of o.instanceMatrix.array) assert.ok(Number.isFinite(n));
      });
      assert.ok(meshes > 0);
      assert.ok(creature.root.getObjectByName("continuous-skull"));
      assert.ok(creature.root.getObjectByName("living-lips"));
      const resources = new Set();
      creature.root.traverse((o) => {
        if (o.isMesh) {
          resources.add(o.geometry);
          for (const mat of Array.isArray(o.material)
            ? o.material
            : [o.material])
            resources.add(mat);
        }
      });
      let disposed = 0;
      for (const resource of resources)
        resource.addEventListener("dispose", () => disposed++);
      creature.dispose();
      assert.equal(disposed, resources.size);
      checked++;
    }
  }
  assert.ok(checked >= 50);
});

test("same anatomy categories grow different reproducible skulls for different seeds", () => {
  const a = generate("sculpt-a");
  const b = { ...a, seed: "sculpt-b" };
  const first = buildCreature(a),
    repeat = buildCreature(a),
    other = buildCreature(b);
  const positions = (c) =>
    Array.from(
      c.root.getObjectByName("continuous-skull").geometry.attributes.position
        .array,
    );
  assert.deepEqual(positions(first), positions(repeat));
  assert.notDeepEqual(positions(first), positions(other));
  [first, repeat, other].forEach((c) => c.dispose());
});

test("mouth rests closed, exposes recessed teeth for speech, then closes again", () => {
  const c = buildCreature(generate("mouth-motion"));
  const upper = c.root.getObjectByName("upper-teeth"),
    lower = c.root.getObjectByName("lower-teeth");
  assert.equal(c.root.userData.mouthOpen, 0);
  assert.equal(upper.visible, false);
  for (let t = 0; t < 1; t += 1 / 60) c.animate(t, 0.9, 0, false);
  assert.ok(c.root.userData.mouthOpen > 0.8);
  assert.equal(upper.visible, true);
  assert.equal(lower.visible, true);
  const cavity =
    c.root.getObjectByName("oral-cavity").geometry.attributes.position;
  const centerTooth = upper.children
    .filter((x) => x.name === "tooth")
    .sort((a, b) => Math.abs(a.position.x) - Math.abs(b.position.x))[0];
  assert.ok(cavity.getZ(0) < centerTooth.position.z - 0.1);
  for (let t = 1; t < 3; t += 1 / 60) c.animate(t, 0, 0, false);
  assert.equal(c.root.userData.mouthOpen, 0);
  assert.equal(upper.visible, false);
  assert.equal(lower.visible, false);
  c.dispose();
});

test("eyelids blink independently without squashing eyeballs; breathing stays grounded", () => {
  const g = generate("blink-test");
  g.genes.eyes = 4;
  g.genes.skin = 0;
  g.genes.tail = 4;
  const c = buildCreature(g),
    eyes = [];
  c.root.traverse((o) => {
    if (o.name === "eyeball") eyes.push({ eye: o, scale: o.scale.clone() });
  });
  let firstBlinked = false,
    secondBlinked = false,
    independent = false;
  const first = c.root.getObjectByName("eyelids-0"),
    second = c.root.getObjectByName("eyelids-1");
  for (let t = 0; t < 12; t += 0.04) {
    c.animate(t, 0, 0, false);
    firstBlinked ||= first.userData.closure > 0.7;
    secondBlinked ||= second.userData.closure > 0.7;
    independent ||=
      Math.abs(first.userData.closure - second.userData.closure) > 0.5;
    const body = c.root.children[0],
      p =
        c.root.getObjectByName("continuous-skull").geometry.attributes.position;
    let bottom = Infinity;
    for (let i = 0; i < p.count; i++) bottom = Math.min(bottom, p.getY(i));
    assert.ok(Math.abs(bottom * body.scale.y + body.position.y + 1.245) < 1e-6);
  }
  assert.ok(firstBlinked && secondBlinked && independent);
  for (const { eye, scale } of eyes) assert.ok(eye.scale.equals(scale));
  c.dispose();
});

test("v1 DNA migrates without losing identity or existing appearance choices", () => {
  const old = {
    version: 1,
    seed: "old-collection",
    chaos: 83,
    genes: {
      mouth: 2,
      chin: 1,
      horns: 3,
      shape: 6,
      eyes: 1,
      nose: 4,
      ears: 0,
      skin: 2,
      booty: 2,
      tail: 0,
      palette: 2,
    },
  };
  const migrated = migrateGenome(old);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.seed, old.seed);
  assert.equal(migrated.chaos, 83);
  for (const key of [
    "chin",
    "horns",
    "shape",
    "eyes",
    "nose",
    "ears",
    "skin",
    "booty",
    "tail",
    "palette",
  ])
    assert.equal(migrated.genes[key], old.genes[key]);
  assert.equal(migrated.genes.teeth, 4);
  assert.equal(migrated.genes.pattern, 3);
  assert.deepEqual(decode(btoa(JSON.stringify(old))), migrated);
  assert.deepEqual(migrateGenome(migrated), migrated);
});
test("surface and pigment meet continuously at both side boundaries and poles", () => {
  for (let seed = 0; seed < 10; seed++) {
    const m = morphology(generate("seam-" + seed));
    for (const y of [-1, -0.9, -0.6, 0, 0.6, 0.9, 1])
      for (const side of [-1, 1]) {
        const eps = Math.abs(y) === 1 ? 0 : 1e-7,
          x = side * Math.sqrt(Math.max(0, 1 - y * y - eps * eps));
        const a = m.point({ x, y, z: eps }),
          b = m.point({ x, y, z: -eps });
        assert.ok(a.distanceTo(b) < 0.00001, "side split");
        const ca = m.color(a.x, a.y, a.z),
          cb = m.color(b.x, b.y, b.z);
        assert.ok(
          Math.abs(ca.r - cb.r) +
            Math.abs(ca.g - cb.g) +
            Math.abs(ca.b - cb.b) <
            0.001,
          "pigment seam",
        );
      }
  }
});
test("pupil difference occurs only for two eyes, at 1% over a fixed population", () => {
  let odd = 0;
  for (let i = 0; i < 20000; i++) {
    const g = generate("pupils-" + i),
      p = pupilTypes(g, 2);
    odd += Number(p[0] !== p[1]);
    for (const count of [1, 3, 6])
      assert.equal(new Set(pupilTypes(g, count)).size, 1);
    assert.deepEqual(pupilTypes(g, 2), p);
  }
  assert.ok(odd / 20000 > 0.007 && odd / 20000 < 0.014, String(odd));
});
test("expressions return to mood, pet hops twice, reduced motion retains expression", () => {
  const c = new ExpressionController();
  c.mood = "sad";
  c.trigger("pet");
  let positive = false,
    negative = false;
  for (let i = 0; i < 130; i++) {
    const p = c.update(1 / 60, 0, false);
    positive ||= p.roll > 0.05;
    negative ||= p.roll < -0.05;
  }
  assert.ok(positive && negative);
  assert.equal(c.reaction, null);
  assert.equal(c.update(0.02, 0, false).smile, -0.55);
  c.trigger("pet");
  const p = c.update(0.1, 0, true);
  assert.equal(p.hop, 0);
  assert.equal(p.roll, 0);
  assert.ok(p.smile > -0.55);
  c.trigger("shout");
  assert.ok(c.update(0.1, 0, false).open > 0);
});
test("rear spring is bounded and settles at 30, 60 and 144 fps", () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const s = new SoftSpring();
    for (let i = 0; i < fps; i++) s.update(1 / fps, 4);
    results.push(s.value);
    assert.ok(s.value < -0.01 && Math.abs(s.value) <= 0.12);
    for (let i = 0; i < fps * 3; i++) s.update(1 / fps, 0);
    assert.ok(Math.abs(s.value) < 0.0001);
    s.update(0.1, 8, true);
    assert.equal(s.value, 0);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 0.003);
});
test("demo phrases rotate without repetitions and preserve manually entered text", () => {
  const deck = new DemoPhraseDeck();
  let value = demoPhrases[0],
    last = "";
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    value = deck.next(value);
    assert.notEqual(value, last);
    last = value;
    seen.add(value);
  }
  assert.equal(seen.size, 12);
  assert.equal(deck.next("Моя фраза"), "Моя фраза");
});

test("preview refresh preserves concurrent additions and never resurrects deleted creatures", () => {
  const a = {
    genome: generate("saved-a"),
    image: "data:image/png;base64,old",
    at: 1,
  };
  const b = {
    genome: generate("saved-b"),
    image: "data:image/png;base64,new",
    at: 2,
    renderVersion: RENDER_VERSION,
  };
  const latest = parseCollection(JSON.stringify([b, a]));
  const updated = updatePreview(
    latest,
    signature(a.genome),
    "data:image/png;base64,refreshed",
  );
  assert.equal(updated.length, 2);
  assert.deepEqual(updated[0], b);
  assert.equal(updated[1].renderVersion, RENDER_VERSION);
  assert.equal(
    updatePreview([b], signature(a.genome), "data:image/png;base64,refreshed"),
    null,
  );
  assert.equal(
    updatePreview(updated, signature(a.genome), "data:image/png;base64,stale"),
    null,
  );
  assert.deepEqual(parseCollection("bad"), []);
});
test("demo audio animation starts on speech start, respects pauses and ignores stale completion", async () => {
  const original = {
    AudioContext: globalThis.AudioContext,
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
    speechSynthesis: globalThis.speechSynthesis,
    performance: globalThis.performance,
  };
  let now = 0,
    current;
  globalThis.AudioContext = class {
    async resume() {}
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  globalThis.speechSynthesis = {
    cancel() {},
    speak(u) {
      current = u;
    },
  };
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => now },
  });
  const voice = new Voice();
  try {
    await voice.speak("Hello there", generate("voice-demo"), "demo", "");
    assert.equal(voice.active, false);
    assert.equal(voice.level(), 0);
    current.onstart();
    now = 150;
    assert.ok(voice.level() > 0);
    current.onboundary({ name: "word" });
    now = 900;
    for (let i = 0; i < 20; i++) {
      now += 50;
      voice.level();
    }
    assert.equal(voice.level(), 0);
    const stale = current;
    await voice.speak("Second phrase", generate("voice-demo"), "demo", "");
    current.onstart();
    stale.onend();
    assert.equal(voice.active, true);
    current.onend();
    assert.equal(voice.active, false);
  } finally {
    voice.stop();
    globalThis.AudioContext = original.AudioContext;
    globalThis.SpeechSynthesisUtterance = original.SpeechSynthesisUtterance;
    globalThis.speechSynthesis = original.speechSynthesis;
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: original.performance,
    });
  }
});

test("v2 upgrades pupils and replaces the pompom without shifting other tail IDs", () => {
  for (let tail = 0; tail < 5; tail++) {
    const source = generate("legacy-tail-" + tail);
    source.version = 2;
    delete source.genes.pupil;
    source.genes.tail = tail;
    const migrated = migrateGenome(source);
    assert.equal(migrated.version, 3);
    assert.equal(migrated.seed, source.seed);
    assert.equal(migrated.genes.tail, tail);
    for (const [key, value] of Object.entries(source.genes))
      assert.equal(migrated.genes[key], value);
    assert.ok([0, 1].includes(migrated.genes.pupil));
    assert.equal(migrateGenome(migrated).genes.pupil, migrated.genes.pupil);
  }
  assert.equal(
    catalogs.tail.some((x) => /помпон/i.test(x.label)),
    false,
  );
});

test("nasal patch collar is continuous; no-nose removes every nasal displacement", () => {
  for (let kind = 0; kind < catalogs.nose.length; kind++) {
    const g = generate("nose-boundary");
    g.genes.nose = kind;
    const m = morphology(g),
      n = m.nasal;
    for (let a = 0; a < 32; a++) {
      const x = Math.cos(a) * n.width * 2.4,
        y = n.cy + Math.sin(a) * n.height * 2.4;
      assert.ok(Math.abs(n.relief(x, y)) < 1e-8);
      const q = n.warp(x, y);
      assert.ok(Math.hypot(q.x - x, q.y - y) < 1e-6);
    }
    if (kind === 10) {
      assert.equal(n.nostrils.length, 0);
      assert.equal(n.relief(0, 0), 0);
      assert.deepEqual(n.warp(0.1, 0.1), { x: 0.1, y: 0.1 });
    } else {
      let previous = n.relief(0, n.cy);
      assert.ok(previous > 0.02, `nose ${kind} should protrude at center`);
      let drops = 0;
      for (let i = 1; i <= 40; i++) {
        const t = i / 40;
        const z = n.relief(n.boundX * t, n.cy);
        if (previous - z > 0.16) drops++;
        previous = z;
      }
      assert.ok(drops <= 1, `nose ${kind} too many cliffs (${drops})`);
      assert.ok(Math.abs(n.relief(n.boundX * 1.35, n.cy)) < 1e-6);
      assert.ok(Math.abs(n.relief(0, n.boundY1 + 0.15)) < 1e-6);
    }
  }
});

test("drilled nostrils are concave cavities on the nasal tip", () => {
  for (const kind of [0, 1, 3, 7, 13, 20]) {
    const g = generate("nostril-concave-" + kind);
    g.genes.nose = kind;
    const m = morphology(g),
      n = m.nasal;
    assert.ok(n.nostrils.length > 0);
    for (const hole of n.nostrils) {
      const center = n.relief(hole.x, hole.y);
      const rim = Math.max(
        n.relief(hole.x + Math.sign(hole.x || 1) * hole.sx * 1.9, hole.y),
        n.relief(hole.x, hole.y + hole.sy * 1.9),
        n.relief(0, hole.y),
      );
      assert.ok(rim > 0.02, `nose ${kind} rim should still have clay (${rim})`);
      assert.ok(
        center < rim - 0.015,
        `nose ${kind} nostril should be a pit (center=${center}, rim=${rim})`,
      );
    }
  }
});

test("ear shells are closed indexed manifolds with no zero-area faces", () => {
  for (let kind = 0; kind < catalogs.ears.length; kind++) {
    const g = generate("ear-topology");
    Object.assign(g.genes, { ears: kind, skin: 0, horns: 3 });
    const c = buildCreature(g);
    let count = 0;
    c.root.traverse((o) => {
      if (o.name !== "anatomical-ear") return;
      count++;
      const geo = o.geometry,
        p = geo.attributes.position,
        idx = geo.index,
        edges = new Map();
      for (let i = 0; i < idx.count; i += 3) {
        const v = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
        const a = v.map((j) => [p.getX(j), p.getY(j), p.getZ(j)]),
          u = a[1].map((x, j) => x - a[0][j]),
          w = a[2].map((x, j) => x - a[0][j]);
        assert.ok(
          Math.hypot(
            u[1] * w[2] - u[2] * w[1],
            u[2] * w[0] - u[0] * w[2],
            u[0] * w[1] - u[1] * w[0],
          ) > 1e-10,
        );
        for (let j = 0; j < 3; j++) {
          const k = [v[j], v[(j + 1) % 3]].sort((a, b) => a - b).join("/");
          edges.set(k, (edges.get(k) || 0) + 1);
        }
      }
      assert.ok(
        [...edges.values()].every((x) => x === 2),
        `ear ${kind} is open`,
      );
    });
    assert.equal(count, 2);
    c.dispose();
  }
});

test("all pupil contours stay in front of the iris and inside the eyeball silhouette", () => {
  for (let kind = 0; kind < 6; kind++) {
    const g = generate("pupil-depth");
    Object.assign(g.genes, { pupil: kind, skin: 0 });
    const c = buildCreature(g);
    c.root.traverse((o) => {
      if (o.name !== "shaped-pupil") return;
      const p = o.geometry.attributes.position;
      const radius = p.getZ(0) - 0.03;
      for (let i = 0; i < p.count; i++) {
        assert.ok(Number.isFinite(p.getZ(i)));
        assert.ok(p.getZ(i) > radius + 0.024);
        assert.ok(Math.hypot(p.getX(i), p.getY(i)) < radius * 0.38);
      }
    });
    c.dispose();
  }
});

test("refined nasal region shares all mesh edges with its surrounding skin", () => {
  const g = generate("nose-weld");
  Object.assign(g.genes, { nose: 1, skin: 0 });
  const c = buildCreature(g);
  const m = morphology(g);
  const head = c.root.getObjectByName("continuous-skull").geometry,
    p = head.attributes.position,
    idx = head.index,
    edges = new Map();
  for (let i = 0; i < idx.count; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = idx.getX(i + j),
        b = idx.getX(i + ((j + 1) % 3)),
        key = [a, b].sort((x, y) => x - y).join("/");
      const entry = edges.get(key) || { a, b, count: 0 };
      entry.count++;
      edges.set(key, entry);
    }
  const nearNostril = (i) =>
    m.nostrils.some(
      (h) =>
        ((p.getX(i) - h.x) / (h.sx * 1.6)) ** 2 +
          ((p.getY(i) - h.y) / (h.sy * 1.6)) ** 2 <
        1,
    );
  for (const { a, b, count } of edges.values()) {
    if (
      [a, b].every(
        (i) =>
          p.getZ(i) > 0.65 &&
          Math.abs(p.getX(i)) < 0.5 &&
          p.getY(i) > -0.24 &&
          p.getY(i) < 0.4,
      ) &&
      !nearNostril(a) &&
      !nearNostril(b)
    )
      assert.equal(count, 2);
  }
  assert.ok(
    [...c.root.children].some(Boolean) ||
      c.root.getObjectByName("nasal-cavity"),
  );
  let cavities = 0;
  c.root.traverse((o) => {
    if (o.name === "nasal-cavity") cavities++;
  });
  assert.equal(cavities, m.nostrils.length);
  c.dispose();
});

test("skull keeps sphere UVs after weld so bump grain does not shear at the muzzle", () => {
  const g = generate("uv-seam");
  Object.assign(g.genes, { nose: 12, skin: 0 });
  const c = buildCreature(g);
  const head = c.root.getObjectByName("continuous-skull").geometry,
    uv = head.attributes.uv,
    p = head.attributes.position;
  assert.ok(uv);
  assert.equal(uv.count, p.count);
  for (let i = 0; i < uv.count; i++) {
    assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)));
    assert.ok(uv.getX(i) >= -0.05 && uv.getX(i) <= 1.05);
    assert.ok(uv.getY(i) >= -0.05 && uv.getY(i) <= 1.05);
  }
  c.dispose();
});

test("no-nose composition keeps eye counts and deterministically chooses both accents", () => {
  const accents = new Set();
  for (let i = 0; i < 200; i++) {
    const g = generate("no-nose-" + i);
    g.genes.nose = 10;
    const m = morphology(g);
    accents.add(m.noNoseAccent);
    assert.equal(m.nostrils.length, 0);
    assert.equal(
      m.eyes.length,
      g.genes.eyes === 3
        ? 1
        : g.genes.eyes === 4
          ? 6
          : g.genes.eyes === 2
            ? 3
            : 2,
    );
    assert.equal(morphology(g).noNoseAccent, m.noNoseAccent);
    assert.ok(m.eyes.every((e) => Number.isFinite(e.radius) && e.radius > 0));
  }
  assert.equal(accents.size, 2);
});
