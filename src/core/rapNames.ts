import { createRng, type Rng } from './rng';
import type { MonsterPersonality, PersonalityVibe } from './types';

/** Cringe adjectives — mostly clean, TTS-friendly. */
export const ADJECTIVES = [
  'Липкий',
  'Мокрий',
  'Сонний',
  'Дрижачий',
  'Задумливий',
  'Сморідкий',
  'Блискучий',
  'Кривий',
  'Пухнастий',
  'Липнучий',
  'Треморний',
  'Беззубий',
  'Одноокий',
  'Заляканий',
  'Надутий',
  'Іржавий',
  'Клейкий',
  'Шматковий',
  'Булькливий',
  'Крінжовий',
] as const;

/** Monster nouns / aliases. */
export const NOUNS = [
  'Батон',
  'Свердлорот',
  'Пузоріз',
  'Чмихун',
  'Бульбашка',
  'Хвостик',
  'Шмаркач',
  'Капець',
  'Комок',
  'Плюх',
  'Тюлень',
  'Гулька',
  'Рило',
  'Мозок-міні',
  'Сопло-MC',
  'Квакун',
  'Пухир',
  'Зубодроб',
  'Лапа-Х',
  'Око-Бос',
] as const;

export const TITLES = [
  'DJ',
  'MC',
  'Lil',
  'Big',
  'Young',
  'Old',
  'Sir',
  'Doctor',
  'Professor',
  'Captain',
  'Uncle',
  'Baby',
  'Real',
  'Fake',
  'Ultra',
  'Mega',
  'Turbo',
  'Saint',
  'Cursed',
  'Based',
] as const;

export const LOCATIONS = [
  'з Підвалу',
  'з Жмеринки',
  'з Комори',
  'з Каналізації',
  'з Кладовки',
  'з Двору',
  'з Лісу',
  'з Парковки',
  'з Тунелю',
  'з Смітника',
  'з Болота',
  'з Кухні',
  'з Кімнати 404',
  'з Батареї',
  'з Чердака',
  'з Підʼїзду',
  'з Ліфта',
  'з Прачечні',
  'з Гаража',
  'з Підземки',
] as const;

/** Rare spicy suffixes (~15% chance). */
export const SPICY_SUFFIXES = [
  'Too Real',
  'Explicit Edition',
  'Без Цензури',
  'Dirty Mix',
  'Uncut',
] as const;

export const EN_NAMES = [
  'Lil Slime',
  'Drippy Gobl',
  'Mold King',
  'Basement Boy',
  'Wet Bandit',
  'Cringe Lord',
  'Snotty Rich',
  'Sludge MC',
  'Muck Baby',
  'Rusty Baron',
  'Gunk Saint',
  'Ooze Professor',
  'Fungus Flex',
  'Dank Uncle',
  'Slime Turbo',
  'Moldy Based',
  'Cursed Captain',
  'Drip Demon',
  'Trash Poet',
  'Basement Baron',
] as const;

const VIBE_ADJECTIVE_BIAS: Partial<Record<PersonalityVibe, readonly string[]>> = {
  sleepy: ['Сонний', 'Млявий', 'Дрижачий'],
  fierce: ['Лютий', 'Надутий', 'Кривий'],
  naive: ['Наївний', 'Пухнастий', 'Заляканий'],
  grumpy: ['Сморідкий', 'Іржавий', 'Крінжовий'],
};

type NameScheme =
  | 'singleAlias'
  | 'adjectiveNoun'
  | 'titleAlias'
  | 'locationTag'
  | 'doubleAlias'
  | 'cringeCompound';

function pickAdjective(rng: Rng, vibe?: PersonalityVibe): string {
  if (vibe && VIBE_ADJECTIVE_BIAS[vibe] && rng.chance(0.55)) {
    return rng.pick(VIBE_ADJECTIVE_BIAS[vibe]!);
  }
  return rng.pick(ADJECTIVES);
}

function maybeSpicy(rng: Rng, base: string): string {
  if (rng.chance(0.15)) return `${base} ${rng.pick(SPICY_SUFFIXES)}`;
  return base;
}

function schemeSingleAlias(rng: Rng, _vibe?: PersonalityVibe): string {
  const ordinals = ['', ' Другий', ' Третій', ' Четвертий'];
  return maybeSpicy(rng, `${rng.pick(NOUNS)}${rng.pick(ordinals)}`);
}

function schemeAdjectiveNoun(rng: Rng, vibe?: PersonalityVibe): string {
  return maybeSpicy(rng, `${pickAdjective(rng, vibe)} ${rng.pick(NOUNS)}`);
}

function schemeTitleAlias(rng: Rng, vibe?: PersonalityVibe): string {
  const title = rng.pick(TITLES);
  const alias = rng.pick(NOUNS);
  if (rng.chance(0.5)) {
    return maybeSpicy(rng, `${title} ${alias} aka ${pickAdjective(rng, vibe)} ${rng.pick(NOUNS)}`);
  }
  return maybeSpicy(rng, `${title} ${alias}`);
}

function schemeLocationTag(rng: Rng, vibe?: PersonalityVibe): string {
  const core = rng.chance(0.5)
    ? `${rng.pick(TITLES)} ${rng.pick(NOUNS)}`
    : `${pickAdjective(rng, vibe)} ${rng.pick(NOUNS)}`;
  return maybeSpicy(rng, `${core} ${rng.pick(LOCATIONS)}`);
}

function schemeDoubleAlias(rng: Rng): string {
  const a = `${rng.pick(TITLES)} ${rng.pick(NOUNS)}`;
  const b = `${rng.pick(TITLES)} ${rng.pick(NOUNS)}`;
  return maybeSpicy(rng, `${a} / ${b}`);
}

function schemeCringeCompound(rng: Rng): string {
  const noun = rng.pick(NOUNS).split('-')[0] ?? rng.pick(NOUNS);
  const num = rng.pick(['3000', '9000', 'XL', 'Pro Max', 'Deluxe']);
  return maybeSpicy(rng, `${noun}-${noun} ${num}`);
}

const SCHEMES: NameScheme[] = [
  'singleAlias',
  'adjectiveNoun',
  'titleAlias',
  'locationTag',
  'doubleAlias',
  'cringeCompound',
];

/** Vibe biases scheme weights per plan. */
function pickScheme(rng: Rng, vibe?: PersonalityVibe): NameScheme {
  const pools: Record<PersonalityVibe, NameScheme[]> = {
    cheerful: ['titleAlias', 'doubleAlias', 'cringeCompound', 'adjectiveNoun'],
    grumpy: ['adjectiveNoun', 'singleAlias', 'locationTag', 'doubleAlias'],
    anxious: ['singleAlias', 'locationTag', 'adjectiveNoun'],
    smug: ['titleAlias', 'doubleAlias', 'cringeCompound'],
    naive: ['singleAlias', 'adjectiveNoun', 'locationTag'],
    fierce: ['titleAlias', 'doubleAlias', 'adjectiveNoun', 'cringeCompound'],
    sleepy: ['singleAlias', 'locationTag', 'adjectiveNoun'],
    dramatic: ['titleAlias', 'cringeCompound', 'doubleAlias', 'locationTag'],
  };
  if (vibe && rng.chance(0.65)) return rng.pick(pools[vibe]);
  return rng.pick(SCHEMES);
}

function generateUkName(rng: Rng, vibe?: PersonalityVibe): string {
  const scheme = pickScheme(rng, vibe);
  switch (scheme) {
    case 'singleAlias':
      return schemeSingleAlias(rng, vibe);
    case 'adjectiveNoun':
      return schemeAdjectiveNoun(rng, vibe);
    case 'titleAlias':
      return schemeTitleAlias(rng, vibe);
    case 'locationTag':
      return schemeLocationTag(rng, vibe);
    case 'doubleAlias':
      return schemeDoubleAlias(rng);
    case 'cringeCompound':
      return schemeCringeCompound(rng);
  }
}

/**
 * Deterministic rap stage name.
 * Uses separate RNG stream — never shifts body generation.
 */
export function generateMonsterName(seed: string, personality?: MonsterPersonality, lang: 'uk' | 'en' = 'uk'): string {
  const rng = createRng(`${seed}:name`);
  if (lang === 'en') return rng.pick(EN_NAMES);
  return generateUkName(rng, personality?.vibe);
}
