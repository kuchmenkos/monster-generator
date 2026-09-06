import { createRng } from './rng';
import type { AnimParams, MonsterPersonality, PersonalityQuirk, PersonalityVibe, VoiceProfile } from './types';

const VIBES: PersonalityVibe[] = [
  'cheerful',
  'grumpy',
  'anxious',
  'smug',
  'naive',
  'fierce',
  'sleepy',
  'dramatic',
];

const QUIRKS: PersonalityQuirk[] = [
  'alwaysHungry',
  'nameDropper',
  'whispers',
  'yells',
  'philosopher',
  'giggler',
  'complainer',
  'poet',
  'glitchTalk',
  'softie',
  'toughGuy',
  'echoes',
];

const VIBE_LABELS: Record<PersonalityVibe, string> = {
  cheerful: 'радісний',
  grumpy: 'буркотливий',
  anxious: 'полохливий',
  smug: 'зарозумілий',
  naive: 'наївний',
  fierce: 'лютий',
  sleepy: 'сонний',
  dramatic: 'драматичний',
};

const QUIRK_LABELS: Record<PersonalityQuirk, string> = {
  alwaysHungry: 'завжди голодний',
  nameDropper: 'каже своє імʼя',
  whispers: 'шепоче',
  yells: 'кричить',
  philosopher: 'філософ',
  giggler: 'хихикає',
  complainer: 'скаржник',
  poet: 'поет',
  glitchTalk: 'глючить',
  softie: 'мʼякий',
  toughGuy: 'крутий',
  echoes: 'лунить',
};

function deriveVoice(vibe: PersonalityVibe, energy: number, boldness: number, warmth: number): VoiceProfile {
  const vibePitch: Record<PersonalityVibe, number> = {
    cheerful: 0.15,
    grumpy: -0.25,
    anxious: 0.05,
    smug: -0.1,
    naive: 0.2,
    fierce: -0.35,
    sleepy: -0.3,
    dramatic: 0.1,
  };
  const vibeRate: Record<PersonalityVibe, number> = {
    cheerful: 1.15,
    grumpy: 0.85,
    anxious: 1.05,
    smug: 0.95,
    naive: 1.0,
    fierce: 1.2,
    sleepy: 0.75,
    dramatic: 0.9,
  };
  const pauseStyle =
    vibe === 'anxious' || vibe === 'sleepy'
      ? 'long'
      : vibe === 'dramatic'
        ? 'stutter'
        : energy > 0.7
          ? 'short'
          : 'normal';

  return {
    pitch: Math.max(-1, Math.min(1, vibePitch[vibe] + (energy - 0.5) * 0.3)),
    rate: Math.max(0.7, Math.min(1.4, vibeRate[vibe] + boldness * 0.15)),
    energy: Math.max(0, Math.min(1, energy * 0.6 + boldness * 0.3 + warmth * 0.1)),
    pauseStyle,
  };
}

function buildLabel(vibe: PersonalityVibe, quirk: PersonalityQuirk): string {
  return `${VIBE_LABELS[vibe]} · ${QUIRK_LABELS[quirk]}`;
}

/** Deterministic personality from seed — separate RNG stream from body. */
export function generatePersonality(seed: string): MonsterPersonality {
  const rng = createRng(`${seed}:personality`);
  const vibe = rng.pick(VIBES);
  const quirk = rng.pick(QUIRKS);
  const energy = rng.float(0.15, 0.95);
  const warmth = rng.float(0.1, 0.9);
  const boldness = rng.float(0.1, 0.95);
  const verbosity = rng.float(0.2, 0.95);
  const voice = deriveVoice(vibe, energy, boldness, warmth);

  return {
    vibe,
    energy,
    warmth,
    boldness,
    verbosity,
    quirk,
    voice,
    label: buildLabel(vibe, quirk),
  };
}

/** Soft override of base anim params from personality axes. */
export function personalityToAnim(base: AnimParams, p: MonsterPersonality): AnimParams {
  const jitterBoost = p.energy * 0.25 + (p.vibe === 'anxious' ? 0.15 : 0);
  const heavyBoost = p.vibe === 'sleepy' ? 0.2 : p.vibe === 'fierce' ? -0.1 : 0;
  const curiousBoost = p.boldness * 0.2 + (p.vibe === 'naive' ? 0.1 : 0);

  return {
    ...base,
    jitteriness: Math.min(1, base.jitteriness + jitterBoost),
    heaviness: Math.max(0.05, Math.min(0.95, base.heaviness + heavyBoost)),
    curiosity: Math.min(1, base.curiosity + curiousBoost),
    talkRate: base.talkRate * (0.85 + p.energy * 0.3),
    talkSyllables: Math.round(base.talkSyllables * (0.8 + p.verbosity * 0.5)),
    talkAmp: base.talkAmp * (0.9 + p.boldness * 0.25),
    bounceChance: Math.min(0.45, base.bounceChance + p.energy * 0.08),
  };
}

export { VIBE_LABELS, QUIRK_LABELS };
