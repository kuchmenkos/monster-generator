import { createRng } from './rng';

const PREFIXES = [
  'Хуйо',
  'Пиздо',
  'Срако',
  'Дупо',
  'Бздо',
  'Мудо',
  'Пердо',
  'Гівно',
  'Лайо',
  'Йобо',
  'Дрищо',
  'Како',
  'Сморко',
  'Фирко',
  'Булько',
  'Чмихо',
  'Гепо',
  'Квако',
  'Пузо',
  'Сопло',
] as const;

const SUFFIXES = [
  'пуп',
  'бульк',
  'чмих',
  'гепа',
  'дрищ',
  'поц',
  'квак',
  'тюлень',
  'шмарк',
  'пухир',
  'хрюн',
  'батя',
  'нявка',
  'плюх',
  'гулька',
  'пиріг',
  'хвіст',
  'око',
  'зуб',
  'лапа',
  'вухо',
  'рило',
  'пузо',
  'мозок',
  'капець',
  'шматок',
  'комок',
] as const;

/** Single-word epithets only — always exactly two words in the final name. */
const EPITHETS = [
  'Мокрий',
  'Липкий',
  'Смердючий',
  'Великий',
  'Малий',
  'Божевільний',
  'Святий',
  'Проклятий',
  'Треморний',
  'Нічний',
  'Перший',
  'Останній',
  'Молодший',
  'Старший',
] as const;

/**
 * Deterministic silly/vulgar Ukrainian monster name.
 * Always exactly two words: `{Prefix}{suffix} {Епітет}`.
 * Uses a separate RNG stream so it never shifts body generation.
 */
export function generateMonsterName(seed: string): string {
  const rng = createRng(`${seed}:name`);
  const prefix = rng.pick(PREFIXES);
  const suffix = rng.pick(SUFFIXES);
  const epithet = rng.pick(EPITHETS);
  return `${prefix}${suffix} ${epithet}`;
}

/** Short utterance for talk bubble — varies with click counter. */
export function generateSpeech(seed: string, clickIndex = 0): string {
  const rng = createRng(`${seed}:talk:${clickIndex}`);
  const n = rng.int(1, 2);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(rng.pick(SUFFIXES));
  }
  const bang = rng.pick(['!', '!!', '...', '?!']);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-') + bang;
}
