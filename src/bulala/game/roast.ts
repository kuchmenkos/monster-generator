import {
  catalogs,
  character,
  rarity,
  rng,
  type Genome,
  type Trait,
} from "../genome";

const CATEGORY_TEMPLATES: Record<Trait, string[]> = {
  mouth: [
    "рот «{label}» — это не мимика, это ошибка формовки",
    "с таким ртом «{label}» ты жуёшь воздух и называешь это флоу",
    "твой рот «{label}» открывается — и сразу хочется закрыть глаза",
  ],
  teeth: [
    "зубы «{label}» — стоматолог бы сдался без боя",
    "твои «{label}» кусают только собственную самооценку",
    "улыбка с «{label}» — оружие массового неловкого молчания",
  ],
  brows: [
    "брови «{label}» сами спорят друг с другом",
    "лицо с «{label}» — и уже ясно: характер тяжелее глины",
    "твои брови «{label}» громче твоих панчей",
  ],
  eyeCut: [
    "разрез «{label}» смотрит мимо такта и мимо смысла",
    "глаза «{label}» — стиль есть, попадания нет",
    "твой взгляд «{label}» ищет победу… и не находит",
  ],
  pupil: [
    "зрачки «{label}» — будто фокус потерян ещё на старте",
    "смотрешь «{label}» — а видишь только свои отмазки",
    "зрачок «{label}» не спасёт слабый текст",
  ],
  finish: [
    "материал «{label}» блестит — содержание нет",
    "ты «{label}» снаружи и пустой внутри трека",
    "покрытие «{label}» не маскирует дыры в рифмах",
  ],
  pattern: [
    "окрас «{label}» кричит громче твоих баров",
    "рисунок «{label}» — единственное яркое, что у тебя есть",
    "паттерн «{label}» не заменит характер на сцене",
  ],
  chin: [
    "подбородок «{label}» выпирает сильнее аргументов",
    "с подбородком «{label}» ты принимаешь удары лицом — буквально",
    "подбородок «{label}» — и всё ещё ноль харизмы",
  ],
  horns: [
    "рожки «{label}» — косплей демона без демонического флоу",
    "с «{label}» ты выглядишь опасно… для собственного имиджа",
    "рога «{label}» торчат, а панчи — нет",
  ],
  shape: [
    "голова «{label}» — форма есть, содержание спорит",
    "череп «{label}» полон воздуха вместо куплетов",
    "форма «{label}» уникальна. Скилл — нет",
  ],
  eyes: [
    "глаза «{label}» — и всё равно не видишь, как проигрываешь",
    "взгляд «{label}» пугает… только зеркало",
    "с глазами «{label}» ты смотришь на батл, а попадаешь мимо",
  ],
  nose: [
    "нос «{label}» — это ошибка лепки, а не признак",
    "с носом «{label}» нюхаешь хайп, а ловишь только пыль",
    "нос «{label}» первым выдаёт, что ты блефуешь",
  ],
  ears: [
    "уши «{label}» слышат бит, но не слышат ритм",
    "с ушами «{label}» ты слушаешь себя и веришь",
    "уши «{label}» — антенны для чужих побед",
  ],
  skin: [
    "покрытие «{label}» мягкое — как твои панчи",
    "шкура «{label}» не спасёт от прожарки",
    "ты весь в «{label}», а флоу гладкий только на словах",
  ],
  hair: [
    "причёска «{label}» — главный аргумент. Жаль, единственный",
    "укладка «{label}» держится лучше, чем твой куплет",
    "«{label}» на голове — и пустота под ней",
  ],
  whiskers: [
    "усы «{label}» щекочут эго, но не зрителей",
    "с усами «{label}» выглядишь старше своих баров",
    "усы «{label}» — вайб есть, вайб-килл тоже",
  ],
  booty: [
    "булочки «{label}» — единственное, что у тебя круглое и цельное",
    "сзади «{label}», спереди — дыры в рифмах",
    "булочки «{label}» спасают карточку. Батл — нет",
  ],
  tail: [
    "хвост «{label}» виляет сильнее, чем твоя позиция",
    "хвост «{label}» — и всё равно убегаешь от правды",
    "с хвостом «{label}» крутишься вокруг темы и не попадаешь",
  ],
  palette: [
    "палитра «{label}» милая — как твои отмазки",
    "цвет «{label}» яркий, текст блёклый",
    "окрас «{label}» не красит слабый флоу",
  ],
};

/** Hand-written gems for memorable trait variants. */
const GEMS: { trait: Trait; index: number; line: string }[] = [
  { trait: "eyes", index: 3, line: "циклоп? один глаз — и всё равно не в фокусе" },
  {
    trait: "eyes",
    index: 5,
    line: "глаза на стеблях — смотришь во все стороны и всё равно мимо такта",
  },
  {
    trait: "eyes",
    index: 4,
    line: "паучий взгляд — восемь углов страха и ноль точности",
  },
  {
    trait: "nose",
    index: 12,
    line: "хоботок? нюхаешь хайп через трубочку — и всё равно пусто",
  },
  {
    trait: "nose",
    index: 11,
    line: "клюв открыт — а мудрости не наклёвывается",
  },
  {
    trait: "booty",
    index: 8,
    line: "огромные булочки — сцена трясётся, текст нет",
  },
  {
    trait: "teeth",
    index: 5,
    line: "акульи зубы — кусаешь воздух, как будто это куплет",
  },
  {
    trait: "hair",
    index: 10,
    line: "афро космос на голове — а в куплете чёрная дыра",
  },
  {
    trait: "skin",
    index: 12,
    line: "иглы ежа — колючий вайб, мягкие панчи",
  },
  {
    trait: "brows",
    index: 5,
    line: "монобровь — одна линия, и она не про победу",
  },
  {
    trait: "mouth",
    index: 6,
    line: "рот-сердечко милый — батл жестокий, тебе не сюда",
  },
  {
    trait: "horns",
    index: 2,
    line: "один рог — единорог без магии и без баров",
  },
  {
    trait: "shape",
    index: 13,
    line: "голова-куб — углы есть, повороты флоу нет",
  },
  {
    trait: "ears",
    index: 1,
    line: "длинные зайчьи — слышишь эхо своих поражений заранее",
  },
  {
    trait: "tail",
    index: 2,
    line: "чертовский хвост — косплей зла без злого скилла",
  },
  {
    trait: "whiskers",
    index: 2,
    line: "моржовые усы — тяжёлый образ, лёгкий текст",
  },
  {
    trait: "pattern",
    index: 1,
    line: "леопард снаружи — домашняя киска в панчах",
  },
  {
    trait: "finish",
    index: 2,
    line: "перламутр блестит — содержание матовое",
  },
  {
    trait: "pupil",
    index: 1,
    line: "вертикальный зрачок — хищник без добычи",
  },
  {
    trait: "chin",
    index: 2,
    line: "двойной подбородок — двойной вес, половина рифм",
  },
];

const FLOW_STYLES = [
  "plain",
  "staccato",
  "shout",
  "mumble",
  "theatrical",
] as const;

type FlowStyle = (typeof FLOW_STYLES)[number];

function applyFlow(text: string, style: FlowStyle): string {
  if (style === "staccato")
    return text.replace(/\./g, "!").replace(/,/g, " —");
  if (style === "shout") return text.toUpperCase();
  if (style === "mumble") return text.replace(/\s+/g, " … ");
  if (style === "theatrical") return `О! ${text}`;
  return text;
}

const TRAIT_ORDER: Trait[] = [
  "eyes",
  "nose",
  "mouth",
  "teeth",
  "brows",
  "shape",
  "ears",
  "horns",
  "skin",
  "hair",
  "whiskers",
  "booty",
  "tail",
  "pattern",
  "finish",
  "palette",
  "chin",
  "eyeCut",
  "pupil",
];

function pickTrait(opp: Genome, r: () => number): Trait {
  // Bias toward visually loud traits.
  const weights = TRAIT_ORDER.map((t) => {
    const label = catalogs[t][opp.genes[t]].label;
    if (/без |гладкая|круглое/i.test(label)) return 0.4;
    return 1;
  });
  let n = r() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < TRAIT_ORDER.length; i++) {
    n -= weights[i];
    if (n < 0) return TRAIT_ORDER[i];
  }
  return "eyes";
}

function gemFor(opp: Genome, trait: Trait): string | null {
  const hit = GEMS.find(
    (g) => g.trait === trait && g.index === opp.genes[trait],
  );
  return hit?.line ?? null;
}

/** Deterministic roast bar about opponent traits. Never empty. */
export function generateRoast(
  speaker: Genome,
  opponent: Genome,
  battleId: string,
  round: number,
  side: "a" | "b",
): string {
  const r = rng(`${battleId}/${round}/${side}/roast`);
  const trait = pickTrait(opponent, r);
  const label = catalogs[trait][opponent.genes[trait]].label;
  const templates = CATEGORY_TEMPLATES[trait];
  let line =
    gemFor(opponent, trait) ??
    templates[Math.floor(r() * templates.length)].replace(/\{label\}/g, label);

  const me = character(speaker);
  const myTier = rarity(speaker).tier;
  const theirTier = rarity(opponent).tier;
  if (r() < 0.35) {
    line += `. я ${myTier.toLowerCase()}, ты ${theirTier.toLowerCase()} — и это слышно`;
  } else if (r() < 0.5) {
    line += `. ${me.name} сказал — и точка`;
  }

  const style = FLOW_STYLES[Math.floor(r() * FLOW_STYLES.length)];
  return applyFlow(line, style);
}
