import { generate, character } from "../genome";
import { BOT_SEEDS } from "./battle";
import { repTier } from "./economy";

export type RankEntry = {
  rank: number;
  name: string;
  rep: number;
  country: string;
  seed: string;
  mine: boolean;
  tier: string;
};

const COUNTRIES = ["UA", "PL", "DE", "US", "BR", "JP", "KR", "TR", "MX", "IN"];

/** Deterministic synthetic leaderboard with player's creatures spliced in. */
export function countryRanking(
  country: string,
  mine: { name: string; rep: number; seed: string }[],
  limit = 12,
): RankEntry[] {
  const bots: RankEntry[] = BOT_SEEDS.map((seed, i) => {
    const g = generate(seed);
    const c = character(g);
    // Spread bot reps so the board looks lived-in.
    const rep = 80 + ((seed.charCodeAt(0) * 17 + i * 91) % 4800);
    return {
      rank: 0,
      name: c.name,
      rep,
      country: COUNTRIES[i % COUNTRIES.length],
      seed,
      mine: false,
      tier: repTier(rep).label,
    };
  }).filter((e) => e.country === country || country === "ALL");

  // If filtering one country leaves the board thin, fill with that country's bots.
  let pool = bots;
  if (country !== "ALL" && pool.length < 6) {
    pool = BOT_SEEDS.slice(0, 10).map((seed, i) => {
      const g = generate(seed + "-" + country);
      const c = character(g);
      const rep = 120 + ((i * 373 + country.charCodeAt(0)) % 4200);
      return {
        rank: 0,
        name: c.name,
        rep,
        country,
        seed: seed + "-" + country,
        mine: false,
        tier: repTier(rep).label,
      };
    });
  }

  const players: RankEntry[] = mine.map((m) => ({
    rank: 0,
    name: m.name,
    rep: m.rep,
    country,
    seed: m.seed,
    mine: true,
    tier: repTier(m.rep).label,
  }));

  const merged = [...pool, ...players].sort((a, b) => b.rep - a.rep);
  return merged.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}

export function guessCountry(): string {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "ru";
  const m = lang.match(/-([A-Z]{2})$/i);
  if (m) return m[1].toUpperCase();
  if (lang.startsWith("uk")) return "UA";
  if (lang.startsWith("ru")) return "UA";
  if (lang.startsWith("pl")) return "PL";
  return "UA";
}

export { COUNTRIES };
