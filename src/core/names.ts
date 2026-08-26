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
  'свердло',
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

const NICKNAMES = [
  'Молодший',
  'Старший',
  'Тричі Проклятий',
  'з Жмеринки',
  'Без Батька',
  'Мокрий',
  'Липкий',
  'Смердючий',
  'Великий',
  'Малий',
  'Божевільний',
  'Святий',
  'Проклятий',
  'з Підвалу',
  'Треморний',
  'Нічний',
  'Перший',
  'Останній',
  'Без Зубів',
  'з Одним Оком',
] as const;

/**
 * Deterministic silly/vulgar Ukrainian monster name.
 * Uses a separate RNG stream so it never shifts body generation.
 */
export function generateMonsterName(seed: string): string {
  const rng = createRng(`${seed}:name`);
  const prefix = rng.pick(PREFIXES);
  const suffix = rng.pick(SUFFIXES);
  const base = `${prefix}${suffix}`;

  const scheme = rng.pick([0, 0, 0, 1, 1, 2] as const);
  if (scheme === 0) return base;
  if (scheme === 1) return `${base} ${rng.pick(NICKNAMES)}`;
  return `${base}-${rng.pick(SUFFIXES)} ${rng.pick(NICKNAMES)}`;
}
