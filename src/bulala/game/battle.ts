import { generate, type Genome } from "../genome";
import { generateRoast } from "./roast";

export type BattleSide = {
  genome: Genome;
  rep: number;
  owner: "me" | "bot";
  creatureId?: string;
};

export type BattleBar = {
  round: 1 | 2 | 3;
  side: "a" | "b";
  text: string;
};

export type BattleRecord = {
  id: string;
  at: number;
  a: BattleSide;
  b: BattleSide;
  bars: BattleBar[];
  status: "pending" | "settled";
  votes: { a: number; b: number };
  myVote?: "a" | "b";
  winner?: "a" | "b";
};

/** Fixed bot seeds — stable "world" between sessions. */
export const BOT_SEEDS = [
  "street-king-01",
  "basement-mc-02",
  "peach-punch-03",
  "clay-cipher-04",
  "soft-threat-05",
  "neon-nibble-06",
  "grumpy-glow-07",
  "tiny-tyrant-08",
  "velvet-venom-09",
  "cookie-crusher-10",
  "moon-muzzle-11",
  "sugar-spike-12",
] as const;

export function botGenome(seed: string, rep = 100): BattleSide {
  return { genome: generate(seed), rep, owner: "bot" };
}

export function pickBotOpponent(
  excludeSeeds: string[],
  myRep: number,
): BattleSide {
  const pool = BOT_SEEDS.filter((s) => !excludeSeeds.includes(s));
  const seed =
    pool[
      Math.abs(
        [...(excludeSeeds[0] || "x")].reduce(
          (h, c) => h + c.charCodeAt(0),
          myRep,
        ),
      ) % pool.length
    ] || BOT_SEEDS[0];
  // Bot rep roughly near player so rewards stay meaningful.
  const jitter = ((seed.charCodeAt(0) + seed.charCodeAt(seed.length - 1)) % 7) - 3;
  const rep = Math.max(0, Math.round(myRep * (0.7 + (jitter + 3) * 0.08)));
  return botGenome(seed, rep);
}

/** Build a deterministic 6-bar battle script: a-b-a-b-a-b across 3 rounds. */
export function createBattle(
  a: BattleSide,
  b: BattleSide,
  at = Date.now(),
): BattleRecord {
  const id = `${a.genome.seed}__${b.genome.seed}__${at}`;
  const bars: BattleBar[] = [];
  for (let round = 1; round <= 3; round++) {
    const r = round as 1 | 2 | 3;
    bars.push({
      round: r,
      side: "a",
      text: generateRoast(a.genome, b.genome, id, r, "a"),
    });
    bars.push({
      round: r,
      side: "b",
      text: generateRoast(b.genome, a.genome, id, r, "b"),
    });
  }
  // Seed some spectator votes so pending battles feel alive.
  const seedVotes = (id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % 5;
  return {
    id,
    at,
    a,
    b,
    bars,
    status: "pending",
    votes: { a: seedVotes, b: (seedVotes + 2) % 4 },
  };
}

/** Apply a user vote. Idempotent if already voted. Settles when threshold hit. */
export function applyVote(
  battle: BattleRecord,
  side: "a" | "b",
  settleThreshold = 5,
): BattleRecord {
  if (battle.myVote || battle.status === "settled") return battle;
  const votes = {
    a: battle.votes.a + (side === "a" ? 1 : 0),
    b: battle.votes.b + (side === "b" ? 1 : 0),
  };
  const total = votes.a + votes.b;
  if (total >= settleThreshold) {
    return {
      ...battle,
      votes,
      myVote: side,
      status: "settled",
      winner: votes.a === votes.b ? side : votes.a > votes.b ? "a" : "b",
    };
  }
  return { ...battle, votes, myVote: side };
}

/** Simulate crowd settling a pending battle (prototype retention hook). */
export function simulateCrowdSettle(
  battle: BattleRecord,
  now = Date.now(),
): BattleRecord {
  if (battle.status === "settled") return battle;
  // Demo pace: settle ~30s after creation when the user revisits.
  if (now - battle.at < 30_000) return battle;
  const lean =
    battle.a.rep + battle.votes.a * 10 >= battle.b.rep + battle.votes.b * 10
      ? "a"
      : "b";
  const votes = {
    a: battle.votes.a + (lean === "a" ? 4 : 2),
    b: battle.votes.b + (lean === "b" ? 4 : 2),
  };
  return {
    ...battle,
    votes,
    status: "settled",
    winner: votes.a >= votes.b ? "a" : "b",
  };
}
