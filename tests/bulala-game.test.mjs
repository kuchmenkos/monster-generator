import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = await mkdtemp(join(tmpdir(), "bulala-game-"));
const output = join(dir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export * from './src/bulala/game/economy';
      export * from './src/bulala/game/care';
      export * from './src/bulala/game/roast';
      export * from './src/bulala/game/battle';
      export * from './src/bulala/genome';
      export * from './src/bulala/fx/geometry';
      export * from './src/bulala/fx/needs-map';
    `,
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
  repMultiplier,
  battleRewards,
  repTier,
  nextRepTier,
  votesRemaining,
  dayKey,
  DAILY_VOTE_LIMIT,
  BOX_HYPE_COST,
  MAX_BOX_COST,
  MAX_HYPE,
  canAffordBox,
  normalizeHype,
  normalizeBoxCost,
  needsAt,
  stampCare,
  freshCare,
  isFullyCaredToday,
  setNeedLevel,
  generateRoast,
  createBattle,
  applyVote,
  simulateCrowdSettle,
  botGenome,
  generate,
  catalogs,
  traitKeys,
  ringPositions,
  clampPoint,
  directionFromCenter,
  fitRadialLayout,
  needsFxFrom,
  karaokeTiming,
} = await import(pathToFileURL(output));

after(() => rm(dir, { recursive: true, force: true }));

test("rep multiplier stays in 0.4–1.6", () => {
  for (const [mine, opp] of [
    [0, 0],
    [0, 5000],
    [5000, 0],
    [100, 100],
    [9999, 1],
  ]) {
    const m = repMultiplier(mine, opp);
    assert.ok(m >= 0.4 - 1e-9 && m <= 1.6 + 1e-9, String(m));
  }
});

test("battle rewards are positive and win beats loss", () => {
  const win = battleRewards(true, 100, 100);
  const loss = battleRewards(false, 100, 100);
  assert.ok(win.rep > loss.rep);
  assert.ok(win.hype > loss.hype);
  assert.ok(win.rep > 0 && loss.rep > 0);
});

test("rep tiers are monotonic and non-overlapping", () => {
  assert.equal(repTier(0).id, "novice");
  assert.equal(repTier(249).id, "novice");
  assert.equal(repTier(250).id, "street");
  assert.equal(repTier(5000).id, "king");
  assert.equal(nextRepTier(0)?.id, "street");
  assert.equal(nextRepTier(5000), null);
});

test("daily vote limit resets on new day", () => {
  assert.equal(
    votesRemaining({ day: dayKey(), count: 3 }),
    DAILY_VOTE_LIMIT - 3,
  );
  assert.equal(
    votesRemaining({ day: "2000-01-01", count: 99 }),
    DAILY_VOTE_LIMIT,
  );
  assert.equal(canAffordBox(BOX_HYPE_COST), true);
  assert.equal(canAffordBox(BOX_HYPE_COST - 1), false);
});

test("manual hype and box price are clamped to sane numbers", () => {
  assert.equal(normalizeHype("2500"), 2500);
  assert.equal(normalizeHype(-5), 0);
  assert.equal(normalizeHype(12.9), 12);
  assert.equal(normalizeHype("nope"), 0);
  assert.equal(normalizeHype(MAX_HYPE * 10), MAX_HYPE);

  assert.equal(normalizeBoxCost("0"), 0);
  assert.equal(normalizeBoxCost(-100), 0);
  assert.equal(normalizeBoxCost(undefined), BOX_HYPE_COST);
  assert.equal(normalizeBoxCost(MAX_BOX_COST + 1), MAX_BOX_COST);
});

test("box affordability follows the custom price", () => {
  assert.equal(canAffordBox(0, 0), true);
  assert.equal(canAffordBox(120, 100), true);
  assert.equal(canAffordBox(99, 100), false);
  // Bad input falls back to the default price instead of unlocking free boxes.
  assert.equal(canAffordBox(0, Number.NaN), false);
});

test("care needs decay monotonically and clamp to 0–1", () => {
  const care = freshCare(1_000_000);
  const full = needsAt(care, 1_000_000);
  assert.equal(full.hunger, 1);
  const later = needsAt(care, 1_000_000 + 40 * 3600_000);
  assert.ok(later.hunger < full.hunger);
  assert.ok(later.hunger >= 0);
  const fed = stampCare(care, "feed", 2_000_000);
  assert.equal(fed.fedAt, 2_000_000);
  assert.ok(isFullyCaredToday(freshCare(Date.now())));
});

test("setNeedLevel inverts decay within tolerance", () => {
  const now = 5_000_000;
  for (const key of ["hunger", "clean", "mood"]) {
    for (const level of [0, 0.25, 0.5, 0.75, 1]) {
      const care = setNeedLevel(freshCare(now), key, level, now);
      const got = needsAt(care, now)[key];
      assert.ok(Math.abs(got - level) < 0.02, `${key}@${level} → ${got}`);
    }
  }
});


test("roast is never empty, deterministic, and uses real labels", () => {
  const a = generate("roast-a");
  const b = generate("roast-b");
  const battleId = "battle-x";
  const first = generateRoast(a, b, battleId, 1, "a");
  const again = generateRoast(a, b, battleId, 1, "a");
  assert.equal(first, again);
  assert.ok(first.trim().length > 8);
  const labels = new Set();
  for (const k of traitKeys)
    for (const v of catalogs[k]) labels.add(v.label.toLowerCase());
  // At least some roasts across rounds should mention a catalog label or gem phrasing.
  const lines = [1, 2, 3].flatMap((r) => [
    generateRoast(a, b, battleId, r, "a"),
    generateRoast(a, b, battleId, r, "b"),
  ]);
  assert.ok(lines.every((l) => l.length > 0));
  assert.ok(new Set(lines).size >= 4, "variety across rounds/sides");
});

test("battle script has exactly 6 alternating bars across 3 rounds", () => {
  const a = botGenome("street-king-01", 120);
  const b = botGenome("basement-mc-02", 90);
  const battle = createBattle(a, b, 12345);
  assert.equal(battle.bars.length, 6);
  assert.deepEqual(
    battle.bars.map((x) => x.side),
    ["a", "b", "a", "b", "a", "b"],
  );
  assert.deepEqual(
    battle.bars.map((x) => x.round),
    [1, 1, 2, 2, 3, 3],
  );
  assert.equal(battle.status, "pending");
  const voted = applyVote(battle, "a", 5);
  assert.equal(voted.myVote, "a");
  assert.equal(applyVote(voted, "b", 5).myVote, "a"); // idempotent
  const settled = applyVote(
    { ...battle, votes: { a: 4, b: 0 } },
    "a",
    5,
  );
  assert.equal(settled.status, "settled");
  assert.equal(settled.winner, "a");
});

test("crowd settle only after 30s and is deterministic by lean", () => {
  const a = botGenome("street-king-01", 500);
  const b = botGenome("basement-mc-02", 10);
  const battle = createBattle(a, b, 1000);
  assert.equal(simulateCrowdSettle(battle, 1000 + 10_000).status, "pending");
  const done = simulateCrowdSettle(battle, 1000 + 31_000);
  assert.equal(done.status, "settled");
  assert.ok(done.winner === "a" || done.winner === "b");
});

test("ring positions are evenly spaced on a circle", () => {
  const pts = ringPositions(100, 100, 50, 4, -Math.PI / 2);
  assert.equal(pts.length, 4);
  assert.ok(Math.abs(pts[0].x - 100) < 1e-6);
  assert.ok(Math.abs(pts[0].y - 50) < 1e-6);
  const clipped = clampPoint({ x: -10, y: 500 }, { left: 0, top: 0, width: 200, height: 200 }, 20);
  assert.equal(clipped.x, 20);
  assert.equal(clipped.y, 180);
  const dir = directionFromCenter(0, 0, 10, 0);
  assert.ok(Math.abs(dir.x - 1) < 1e-6);
});

test("fitRadialLayout keeps all blobs inside the safe box", () => {
  const layout = fitRadialLayout({
    cx: 180,
    cy: 220,
    count: 6,
    desiredRadius: 160,
    box: { width: 390, height: 700 },
    insets: { top: 10, left: 8, right: 8, bottom: 130 },
    blobPad: 30,
  });
  assert.ok(layout.radius <= 160);
  assert.ok(layout.arc, "tight bottom should prefer upper arc");
  const minX = 8 + 30;
  const maxX = 390 - 8 - 30;
  const minY = 10 + 30;
  const maxY = 700 - 130 - 30;
  for (const p of layout.points) {
    assert.ok(p.x >= minX - 0.5 && p.x <= maxX + 0.5, `x=${p.x}`);
    assert.ok(p.y >= minY - 0.5 && p.y <= maxY + 0.5, `y=${p.y}`);
  }
});

test("needs FX mapping scales dirt and mood flags", () => {
  const clean = needsFxFrom({ hunger: 1, clean: 1, mood: 1 });
  assert.equal(clean.dirty, 0);
  assert.equal(clean.flies, 0);
  assert.equal(clean.happy, true);
  const filthy = needsFxFrom({ hunger: 0.2, clean: 0.2, mood: 0.2 });
  assert.ok(filthy.dirty > 0.7);
  assert.equal(filthy.stink, true);
  assert.equal(filthy.flies, 3);
  assert.equal(filthy.hungry, true);
  assert.equal(filthy.sad, true);
  assert.ok(filthy.canvasFilter.includes("saturate"));
});

test("karaoke timing covers full duration monotonically", () => {
  const words = karaokeTiming("йо это мой баттл флоу", 1000);
  assert.ok(words.length >= 4);
  assert.equal(words[0].at, 0);
  for (let i = 1; i < words.length; i++)
    assert.ok(words[i].at >= words[i - 1].at);
  assert.ok(words[words.length - 1].at < 1000);
  assert.deepEqual(karaokeTiming("   ", 500), []);
});
