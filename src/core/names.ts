import { createRng } from './rng';
import type { MonsterPersonality, PersonalityQuirk, PersonalityVibe } from './types';

export { generateMonsterName } from './rapNames';

const SPEECH_BY_VIBE: Record<PersonalityVibe, readonly string[]> = {
  cheerful: [
    'Йо! Я тут!',
    'Класно, що ти прийшов!',
    'Погойдаємось?',
    'У мене гарний день!',
    'Ти теж монстр? Круто!',
    'Хочеш потанцювати?',
    'Я не злий, я веселий!',
    'Привіт, друже!',
    'Сьогодні буде огонь!',
    'Я світлюсь від радості!',
  ],
  grumpy: [
    'Що треба?',
    'Відстань.',
    'Не чіпай.',
    'Я зайнятий бурчати.',
    'Ну і що?',
    'Знову ти…',
    'Не в mood.',
    'Пішов би ти…',
    'Тихо.',
    'Дістали всі.',
  ],
  anxious: [
    'Ой… ти хто?',
    'Не підходь…',
    'Я трохи хвилююсь…',
    'Це безпечно?',
    'Можна я сховаюсь?',
    'Ти точно не злий?',
    'Ой-ой-ой…',
    'Я дрімаю… ні, не дрімаю!',
    'Ш-ш-тиша…',
    'Не дивись так…',
  ],
  smug: [
    'Очевидно, я найкращий.',
    'Ти бачиш генія?',
    'Я вже переміг.',
    'Інші — слабкі.',
    'Я топ.',
    'Підлаштовуйся під мене.',
    'Я знаю все.',
    'Тобі пощастило мене бачити.',
    'Геніально, правда?',
    'Я легенда.',
  ],
  naive: [
    'Привітик… ти добрий?',
    'А це що таке?',
    'Можна дружити?',
    'Я тут вперше…',
    'Ти мене не зʼїси?',
    'О, як цікаво!',
    'Я ще маленький…',
    'Покажеш мені світ?',
    'Я не знаю, що робити…',
    'Ти схожий на батько… ні?',
  ],
  fierce: [
    'ГЕТЬ ЗВІДСИ!',
    'Я ЛЮТИЙ!',
    'Не чіпай мене!',
    'Я тут головний!',
    'РРРА!',
    'Бійся мене!',
    'Я зʼїм твій flow!',
    'Спробуй ще раз!',
    'Я монстр, чуєш?!',
    'Назад!',
  ],
  sleepy: [
    'Ммм… привіт…',
    'Я хочу спати…',
    'Ще пʼять хвилин…',
    'Зі мною все ок… zzz',
    'Не буди…',
    'Тихо, я дрімаю…',
    'Потім поговоримо…',
    'Я млявий…',
    'Один глаз відкритий…',
    'Ну привіт… zzz',
  ],
  dramatic: [
    'О! Судба!',
    'Це мій момент!',
    'Слухай уважно…',
    'І ось — я!',
    'Трагедія… або ні?',
    'Сцена моя!',
    'Прожектор на мене!',
    'Епічно, правда?',
    'Слова мають вагу…',
    'О, людство!',
  ],
};

const WARM_LINES: readonly string[] = [
  'Ти милий.',
  'Обійми?',
  'Я не злий на тебе.',
  'Ти гарний.',
  'Давай дружити.',
];

const COLD_LINES: readonly string[] = [
  'Не чіпай.',
  'Відвал.',
  'Мені байдуже.',
  'Пішов.',
  'Дістав.',
];

function applyQuirk(text: string, quirk: PersonalityQuirk, name: string): string {
  switch (quirk) {
    case 'alwaysHungry':
      return `${text} …голодний.`;
    case 'nameDropper':
      return `${name} каже: ${text}`;
    case 'whispers':
      return text.toLowerCase().replace(/\.$/, '…');
    case 'yells':
      return text.toUpperCase();
    case 'philosopher':
      return `Отже… ${text}`;
    case 'giggler':
      return `${text} хі-хі!`;
    case 'complainer':
      return `Знову… ${text}`;
    case 'poet':
      return `${text} — рима.`;
    case 'glitchTalk':
      return text.replace(/([а-яіїєґ])/gi, '$1-$1').slice(0, 48);
    case 'softie':
      return `${text} …мʼяко.`;
    case 'toughGuy':
      return `${text} Без жартів.`;
    case 'echoes':
      return `${text}… ${text.split(' ').pop() ?? ''}…`;
    default:
      return text;
  }
}
/** Short utterance for talk bubble — varies with click counter. */
export function generateSpeech(
  seed: string,
  clickIndex = 0,
  personality?: MonsterPersonality,
  name = '',
): string {
  const rng = createRng(`${seed}:talk:${clickIndex}`);

  if (!personality) {
    const parts: string[] = [];
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) parts.push(rng.pick(['бульк', 'чмих', 'квак', 'плюх', 'гулька']));
    const bang = rng.pick(['!', '!!', '...', '?!']);
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-') + bang;
  }

  let pool = [...SPEECH_BY_VIBE[personality.vibe]];
  if (personality.warmth > 0.65 && rng.chance(0.35)) pool = [...pool, ...WARM_LINES];
  if (personality.warmth < 0.35 && rng.chance(0.35)) pool = [...pool, ...COLD_LINES];

  let text = rng.pick(pool);

  if (personality.verbosity > 0.6 && rng.chance(0.4)) {
    text = `${text} ${rng.pick(pool)}`;
  }

  text = applyQuirk(text, personality.quirk, name || 'Я');

  const bang = rng.pick(
    personality.vibe === 'dramatic'
      ? ['!', '!!', '…']
      : personality.vibe === 'anxious'
        ? ['…', '?', '?!']
        : ['!', '.', '!!'],
  );
  return text + bang;
}
