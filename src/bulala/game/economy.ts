/** Pure economy numbers — no side effects, no storage. Tunable in one place. */

export const BOX_HYPE_COST = 1000;
export const BOX_USD_STUB = 2;

/** Manual-tuning bounds for the hype wallet and the box price. */
export const MAX_HYPE = 9_999_999;
export const MIN_BOX_COST = 0;
export const MAX_BOX_COST = 999_999;

export const WIN_REP = 40;
export const WIN_HYPE = 60;
export const LOSS_REP = 8;
export const LOSS_HYPE = 15;
export const VOTE_HYPE = 5;
export const DAILY_VOTE_LIMIT = 10;
export const CARE_DAILY_HYPE = 25;
export const FREE_BATTLES_PER_DAY = 3;
export const MAX_ENERGY = 3;
export const MAX_BATTLES_STORED = 30;
export const MAX_CREATURES = 48;
export const STARTER_HYPE = 1200;

export const REP_TIERS = [
  { id: "novice", label: "Новичок", min: 0 },
  { id: "street", label: "Уличный", min: 250 },
  { id: "known", label: "Известный", min: 750 },
  { id: "legend", label: "Легенда квартала", min: 2000 },
  { id: "king", label: "Король базы", min: 5000 },
] as const;

export type RepTierId = (typeof REP_TIERS)[number]["id"];

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Anti-farm Elo-ish multiplier: beating weaklings pays less. */
export function repMultiplier(myRep: number, oppRep: number): number {
  return clamp(0.4 + ((oppRep + 200) / (myRep + 200)) * 0.6, 0.4, 1.6);
}

export function battleRewards(
  won: boolean,
  myRep: number,
  oppRep: number,
): { rep: number; hype: number } {
  const m = repMultiplier(myRep, oppRep);
  if (won) {
    return {
      rep: Math.round(WIN_REP * m),
      hype: Math.round(WIN_HYPE * m),
    };
  }
  return {
    rep: Math.round(LOSS_REP * m),
    hype: Math.round(LOSS_HYPE * m),
  };
}

export function repTier(rep: number): (typeof REP_TIERS)[number] {
  let tier: (typeof REP_TIERS)[number] = REP_TIERS[0];
  for (const t of REP_TIERS) if (rep >= t.min) tier = t;
  return tier;
}

export function nextRepTier(rep: number): (typeof REP_TIERS)[number] | null {
  const current = repTier(rep);
  const i = REP_TIERS.findIndex((t) => t.id === current.id);
  return i < REP_TIERS.length - 1 ? REP_TIERS[i + 1] : null;
}

export function canAffordBox(
  hype: number,
  cost: number = BOX_HYPE_COST,
): boolean {
  return hype >= normalizeBoxCost(cost);
}

/** Coerce any user/legacy input into a valid hype balance. */
export function normalizeHype(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.floor(n), 0, MAX_HYPE);
}

/** Coerce any user/legacy input into a valid box price. */
export function normalizeBoxCost(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return BOX_HYPE_COST;
  return clamp(Math.round(n), MIN_BOX_COST, MAX_BOX_COST);
}

export function dayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function votesRemaining(
  daily: { day: string; count: number },
  now = Date.now(),
): number {
  if (daily.day !== dayKey(now)) return DAILY_VOTE_LIMIT;
  return Math.max(0, DAILY_VOTE_LIMIT - daily.count);
}
