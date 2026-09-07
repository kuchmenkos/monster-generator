/** Lazy need decay from timestamps — no setInterval. */

const HOUR = 3600_000;
const FEED_HALF_LIFE = 18 * HOUR;
const WASH_HALF_LIFE = 24 * HOUR;
const TALK_HALF_LIFE = 12 * HOUR;

export type CareStamps = {
  fedAt: number;
  washedAt: number;
  talkedAt: number;
};

export type Needs = {
  hunger: number; // 0 empty → 1 full
  clean: number;
  mood: number;
};

export type NeedKey = keyof Needs;

function decay(age: number, halfLife: number): number {
  if (age <= 0) return 1;
  return Math.max(0, Math.min(1, Math.pow(0.5, age / halfLife)));
}

function halfLifeFor(key: NeedKey): number {
  if (key === "hunger") return FEED_HALF_LIFE;
  if (key === "clean") return WASH_HALF_LIFE;
  return TALK_HALF_LIFE;
}

/** Invert decay: desired level 0..1 → age ms since last care. */
export function ageForNeedLevel(level: number, key: NeedKey): number {
  const v = Math.max(0, Math.min(1, level));
  const half = halfLifeFor(key);
  if (v >= 0.999) return 0;
  if (v <= 0.001) return half * 12;
  return half * Math.log2(1 / v);
}

/** Set one need to an exact 0..1 level by rewriting its timestamp. */
export function setNeedLevel(
  care: CareStamps,
  key: NeedKey,
  level: number,
  now = Date.now(),
): CareStamps {
  const at = now - ageForNeedLevel(level, key);
  if (key === "hunger") return { ...care, fedAt: at };
  if (key === "clean") return { ...care, washedAt: at };
  return { ...care, talkedAt: at };
}

export function needsAt(care: CareStamps, now = Date.now()): Needs {
  return {
    hunger: decay(now - care.fedAt, FEED_HALF_LIFE),
    clean: decay(now - care.washedAt, WASH_HALF_LIFE),
    mood: decay(now - care.talkedAt, TALK_HALF_LIFE),
  };
}

export function isFullyCaredToday(care: CareStamps, now = Date.now()): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  return (
    new Date(care.fedAt).toISOString().slice(0, 10) === day &&
    new Date(care.washedAt).toISOString().slice(0, 10) === day &&
    new Date(care.talkedAt).toISOString().slice(0, 10) === day
  );
}

export function stampCare(
  care: CareStamps,
  action: "feed" | "wash" | "talk",
  now = Date.now(),
): CareStamps {
  if (action === "feed") return { ...care, fedAt: now };
  if (action === "wash") return { ...care, washedAt: now };
  return { ...care, talkedAt: now };
}

export function freshCare(now = Date.now()): CareStamps {
  return { fedAt: now, washedAt: now, talkedAt: now };
}
