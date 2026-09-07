import { migrateGenome, signature, character, type Genome } from "../genome";
import { parseCollection } from "../collection";
import {
  freshCare,
  stampCare,
  isFullyCaredToday,
  setNeedLevel,
  type CareStamps,
  type NeedKey,
} from "./care";
import {
  applyVote,
  createBattle,
  pickBotOpponent,
  simulateCrowdSettle,
  type BattleRecord,
  type BattleSide,
} from "./battle";
import {
  BOX_HYPE_COST,
  CARE_DAILY_HYPE,
  FREE_BATTLES_PER_DAY,
  MAX_BATTLES_STORED,
  MAX_CREATURES,
  MAX_ENERGY,
  STARTER_HYPE,
  VOTE_HYPE,
  battleRewards,
  canAffordBox,
  dayKey,
  normalizeBoxCost,
  normalizeHype,
  votesRemaining,
} from "./economy";
import { guessCountry } from "./ranking";
import { putPreview, toWebpPreview, deletePreview } from "./store";

export type OwnedBulala = {
  id: string;
  genome: Genome;
  bornAt: number;
  rep: number;
  wins: number;
  losses: number;
  care: CareStamps;
  energy: number;
  voiceId?: string;
  cosmetics: string[];
  careBonusDay?: string;
  battlesToday?: { day: string; count: number };
};

export type SaveV1 = {
  version: 1;
  creatures: OwnedBulala[];
  activeId: string | null;
  hype: number;
  battles: BattleRecord[];
  country: string;
  dailyVotes: { day: string; count: number };
  /** Box price in hype — tunable by the player in the wallet sheet. */
  boxCost: number;
};

const SAVE_KEY = "bulala-save-v1";
const LEGACY_KEY = "bulala-collection-v1";

export function emptySave(): SaveV1 {
  return {
    version: 1,
    creatures: [],
    activeId: null,
    hype: STARTER_HYPE,
    battles: [],
    country: guessCountry(),
    dailyVotes: { day: dayKey(), count: 0 },
    boxCost: BOX_HYPE_COST,
  };
}

function ownFromGenome(genome: Genome, now = Date.now()): OwnedBulala {
  return {
    id: signature(genome),
    genome,
    bornAt: now,
    rep: 0,
    wins: 0,
    losses: 0,
    care: freshCare(now),
    energy: MAX_ENERGY,
    cosmetics: [],
  };
}

export function migrateFromLegacy(
  raw: string | null,
  now = Date.now(),
): SaveV1 {
  const save = emptySave();
  if (!raw) return save;
  const legacy = parseCollection(raw);
  for (const item of legacy) {
    const owned = ownFromGenome(item.genome, item.at || now);
    save.creatures.push(owned);
    // Fire-and-forget preview migration; failures are non-fatal.
    void toWebpPreview(item.image)
      .then((blob) => putPreview(owned.id, blob))
      .catch(() => {});
  }
  if (save.creatures.length) save.activeId = save.creatures[0].id;
  return save;
}

export function loadSave(): SaveV1 {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveV1;
      if (parsed?.version === 1 && Array.isArray(parsed.creatures)) {
        // Soft-validate genomes.
        parsed.creatures = parsed.creatures
          .map((c) => {
            const g = migrateGenome(c.genome);
            if (!g) return null;
            return { ...c, genome: g, id: signature(g) };
          })
          .filter(Boolean) as OwnedBulala[];
        if (
          parsed.activeId &&
          !parsed.creatures.some((c) => c.id === parsed.activeId)
        )
          parsed.activeId = parsed.creatures[0]?.id ?? null;
        parsed.battles ??= [];
        parsed.dailyVotes ??= { day: dayKey(), count: 0 };
        parsed.country ??= guessCountry();
        parsed.hype = Number.isFinite(parsed.hype)
          ? normalizeHype(parsed.hype)
          : STARTER_HYPE;
        parsed.boxCost = normalizeBoxCost(parsed.boxCost);
        return parsed;
      }
    }
  } catch {
    /* fall through to legacy */
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  const migrated = migrateFromLegacy(legacy);
  saveSave(migrated);
  return migrated;
}

export function saveSave(save: SaveV1) {
  const commit = () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    void navigator.locks.request("bulala-save", commit);
  } else commit();
}

export function getActive(save: SaveV1): OwnedBulala | null {
  return save.creatures.find((c) => c.id === save.activeId) ?? null;
}

export function setActive(save: SaveV1, id: string): SaveV1 {
  if (!save.creatures.some((c) => c.id === id)) return save;
  return { ...save, activeId: id };
}

export function addCreature(
  save: SaveV1,
  genome: Genome,
  previewDataUrl?: string,
  now = Date.now(),
): { save: SaveV1; creature: OwnedBulala; error?: string } {
  if (save.creatures.length >= MAX_CREATURES)
    return {
      save,
      creature: ownFromGenome(genome, now),
      error: "Коллекция полна (48). Отпусти кого-то.",
    };
  const creature = ownFromGenome(genome, now);
  if (save.creatures.some((c) => c.id === creature.id))
    return { save, creature, error: "Такой чудик уже есть." };
  if (previewDataUrl) {
    void toWebpPreview(previewDataUrl)
      .then((blob) => putPreview(creature.id, blob))
      .catch(() => {});
  }
  const next: SaveV1 = {
    ...save,
    creatures: [creature, ...save.creatures],
    activeId: creature.id,
    hype: save.hype,
  };
  return { save: next, creature };
}

export function removeCreature(save: SaveV1, id: string): SaveV1 {
  void deletePreview(id);
  const creatures = save.creatures.filter((c) => c.id !== id);
  return {
    ...save,
    creatures,
    activeId: save.activeId === id ? (creatures[0]?.id ?? null) : save.activeId,
  };
}

export function updateCreatureGenome(
  save: SaveV1,
  id: string,
  genome: Genome,
): SaveV1 {
  const newId = signature(genome);
  return {
    ...save,
    creatures: save.creatures.map((c) =>
      c.id === id ? { ...c, genome, id: newId } : c,
    ),
    activeId: save.activeId === id ? newId : save.activeId,
  };
}

/** Current box price — falls back to the default for legacy saves. */
export function boxCostOf(save: SaveV1): number {
  return normalizeBoxCost(save.boxCost);
}

export function buyBoxWithHype(save: SaveV1): { save: SaveV1; error?: string } {
  const cost = boxCostOf(save);
  if (!canAffordBox(save.hype, cost))
    return { save, error: `Нужно ${cost} хайпа.` };
  return { save: { ...save, hype: normalizeHype(save.hype - cost) } };
}

/** Manual override of the hype wallet (prototype tuning). */
export function setHype(save: SaveV1, hype: number): SaveV1 {
  return { ...save, hype: normalizeHype(hype) };
}

/** Manual override of the box price (prototype tuning). */
export function setBoxCost(save: SaveV1, cost: number): SaveV1 {
  return { ...save, boxCost: normalizeBoxCost(cost) };
}

export function setCreatureNeed(
  save: SaveV1,
  id: string,
  key: NeedKey,
  level: number,
  now = Date.now(),
): SaveV1 {
  return {
    ...save,
    creatures: save.creatures.map((c) =>
      c.id === id ? { ...c, care: setNeedLevel(c.care, key, level, now) } : c,
    ),
  };
}

export function setCreatureRep(save: SaveV1, id: string, rep: number): SaveV1 {
  const next = Math.max(0, Math.floor(rep));
  return {
    ...save,
    creatures: save.creatures.map((c) =>
      c.id === id ? { ...c, rep: next } : c,
    ),
  };
}

export function careAction(
  save: SaveV1,
  id: string,
  action: "feed" | "wash" | "talk",
  now = Date.now(),
): SaveV1 {
  let hypeGain = 0;
  const creatures = save.creatures.map((c) => {
    if (c.id !== id) return c;
    const care = stampCare(c.care, action, now);
    let energy = Math.min(MAX_ENERGY, c.energy + 1);
    let careBonusDay = c.careBonusDay;
    if (isFullyCaredToday(care, now) && careBonusDay !== dayKey(now)) {
      careBonusDay = dayKey(now);
      energy = MAX_ENERGY;
      hypeGain = CARE_DAILY_HYPE;
    }
    return { ...c, care, energy, careBonusDay };
  });
  return { ...save, creatures, hype: save.hype + hypeGain };
}

export function startBattle(
  save: SaveV1,
  myId: string,
  now = Date.now(),
): { save: SaveV1; battle?: BattleRecord; error?: string } {
  const me = save.creatures.find((c) => c.id === myId);
  if (!me) return { save, error: "Нет активной Булалы." };
  const day = dayKey(now);
  const today = me.battlesToday?.day === day ? me.battlesToday.count : 0;
  if (me.energy <= 0 && today >= FREE_BATTLES_PER_DAY)
    return { save, error: "Нет энергии. Покорми, помой или поговори." };
  const exclude = [me.genome.seed, ...save.creatures.map((c) => c.genome.seed)];
  // Prefer another owned creature as opponent when available.
  let opp: BattleSide;
  const others = save.creatures.filter((c) => c.id !== myId);
  if (others.length && Math.random() < 0.35) {
    const o = others[Math.floor(Math.random() * others.length)];
    opp = {
      genome: o.genome,
      rep: o.rep,
      owner: "me",
      creatureId: o.id,
    };
  } else {
    opp = pickBotOpponent(exclude, me.rep);
  }
  const a: BattleSide = {
    genome: me.genome,
    rep: me.rep,
    owner: "me",
    creatureId: me.id,
  };
  const battle = createBattle(a, opp, now);
  const creatures = save.creatures.map((c) =>
    c.id === myId
      ? {
          ...c,
          energy: Math.max(0, c.energy - 1),
          battlesToday: { day, count: today + 1 },
        }
      : c,
  );
  const battles = [battle, ...save.battles].slice(0, MAX_BATTLES_STORED);
  return { save: { ...save, creatures, battles }, battle };
}

export function voteBattle(
  save: SaveV1,
  battleId: string,
  side: "a" | "b",
  now = Date.now(),
): { save: SaveV1; error?: string } {
  const remaining = votesRemaining(save.dailyVotes, now);
  if (remaining <= 0) return { save, error: "Лимит голосов на сегодня." };
  const idx = save.battles.findIndex((b) => b.id === battleId);
  if (idx < 0) return { save, error: "Батл не найден." };
  const before = save.battles[idx];
  if (before.myVote) return { save, error: "Уже голосовал." };
  const after = applyVote(before, side);
  let hype = save.hype + VOTE_HYPE;
  let battles = save.battles.map((b, i) => (i === idx ? after : b));
  let creatures = save.creatures;
  if (after.status === "settled" && after.winner) {
    ({ battles, creatures, hype } = settleRewards(
      battles,
      creatures,
      after,
      hype,
    ));
  }
  const dailyVotes =
    save.dailyVotes.day === dayKey(now)
      ? { day: save.dailyVotes.day, count: save.dailyVotes.count + 1 }
      : { day: dayKey(now), count: 1 };
  return { save: { ...save, battles, creatures, hype, dailyVotes } };
}

function settleRewards(
  battles: BattleRecord[],
  creatures: OwnedBulala[],
  battle: BattleRecord,
  hype: number,
): { battles: BattleRecord[]; creatures: OwnedBulala[]; hype: number } {
  if (!battle.winner) return { battles, creatures, hype };
  const winnerSide = battle.winner === "a" ? battle.a : battle.b;
  const loserSide = battle.winner === "a" ? battle.b : battle.a;
  const winReward = battleRewards(true, winnerSide.rep, loserSide.rep);
  const lossReward = battleRewards(false, loserSide.rep, winnerSide.rep);

  const apply = (
    side: BattleSide,
    won: boolean,
    reward: { rep: number; hype: number },
  ) => {
    if (side.owner !== "me" || !side.creatureId) return;
    creatures = creatures.map((c) => {
      if (c.id !== side.creatureId) return c;
      return {
        ...c,
        rep: c.rep + reward.rep,
        wins: c.wins + (won ? 1 : 0),
        losses: c.losses + (won ? 0 : 1),
      };
    });
    hype += reward.hype;
  };
  apply(winnerSide, true, winReward);
  apply(loserSide, false, lossReward);
  return { battles, creatures, hype };
}

/** Tick pending battles toward settle when user opens Battles tab. */
export function refreshBattles(save: SaveV1, now = Date.now()): SaveV1 {
  let hype = save.hype;
  let creatures = save.creatures;
  const battles = save.battles.map((b) => {
    const next = simulateCrowdSettle(b, now);
    if (b.status === "pending" && next.status === "settled") {
      const rewarded = settleRewards(save.battles, creatures, next, hype);
      creatures = rewarded.creatures;
      hype = rewarded.hype;
      return next;
    }
    return next;
  });
  return { ...save, battles, creatures, hype };
}

export function displayName(c: OwnedBulala): string {
  return character(c.genome).name;
}
