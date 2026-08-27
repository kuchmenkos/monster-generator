import type { MonsterData } from './types';

export interface MonsterVoiceTraits {
  eyeCount: number;
  growthCount: number;
  toothCount: number;
  hasCavity: boolean;
  aspectLabel: string;
  sizeLabel: string;
}

const ARCHETYPE_VOICE: Record<string, string> = {
  blob: 'amorphous squishy blob body, burbling guttural sounds',
  pear: 'bottom-heavy pear-shaped body, wobbling deep croaks',
  mushroom: 'mushroom cap silhouette, hollow resonant toad croaks',
  triangle: 'pointed triangular silhouette, sharp squeaks and clicks',
  lanky: 'tall thin spindly silhouette, reedy high-pitched squeals',
  slug: 'low slug body dragging, wet slurping gurgles',
  bighead: 'massive oversized head, booming echoing roars',
  column: 'tall column body, monotone rumbling drone',
  wide: 'broad flat body, low gravelly grunts',
  stack: 'stacked lump body, layered overlapping growls',
  teardrop: 'teardrop body tapering down, dripping wet warbles',
  egg: 'egg-shaped plump body, muffled ovoid coos',
  star: 'star-pointed silhouette, glittering chirps and clicks',
  dumpling: 'soft dumpling body, steamed dumpy mumbles',
  hourglass: 'hourglass pinched waist, two-tone wavering groans',
};

/** ElevenLabs Voice Design requires 100–1000 characters of preview text. */
export function buildPreviewText(name: string): string {
  const line =
    `Бу-ла-ла! Я ${name} — мокре страховисько з темряви. ` +
    `Гарчу, булькаю й хихикаю. Хочу смачненьке, цвірінькаю тобі в вухо ` +
    `і знову бурчу з пащі, друже.`;
  if (line.length >= 100) return line.slice(0, 280);
  return `${line} Буль-буль, хе-хе, гаррр!`.slice(0, 160);
}

/** Deterministic int for ElevenLabs API seed (0 .. 2147483647). */
export function seedToElevenLabsSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647;
}

/** Visual + body stats derived from generated particles. */
export function extractMonsterTraits(data: MonsterData): MonsterVoiceTraits {
  const eyes = data.particles.filter((p) => p.part === 'eye');
  const growths = data.particles.filter((p) => p.part === 'appendage');
  const teeth = data.particles.filter((p) => p.part === 'tooth');
  const hasCavity = data.particles.some((p) => p.mouthRole === 'cavity');

  const { minX, maxX, minY, maxY } = data.bounds;
  const bw = Math.max(0.01, maxX - minX);
  const bh = Math.max(0.01, maxY - minY);
  const aspect = bw / bh;

  let aspectLabel = 'compact round body';
  if (aspect > 1.35) aspectLabel = 'wide squat silhouette';
  else if (aspect < 0.72) aspectLabel = 'tall stretched silhouette';

  const volume = bw * bh;
  let sizeLabel = 'medium-sized creature';
  if (volume > 2.5) sizeLabel = 'large heavy creature';
  else if (volume < 0.9) sizeLabel = 'small twitchy creature';

  return {
    eyeCount: eyes.length,
    growthCount: growths.length,
    toothCount: teeth.length,
    hasCavity,
    aspectLabel,
    sizeLabel,
  };
}

function animTraits(data: MonsterData): string {
  const { heaviness, jitteriness, curiosity } = data.anim;
  const parts: string[] = [];

  if (heaviness > 0.65) parts.push('slow heavy delivery');
  else if (heaviness < 0.35) parts.push('light bouncy delivery');

  if (jitteriness > 0.65) parts.push('nervous stuttering bursts');
  else if (jitteriness < 0.35) parts.push('calm steady rhythm');

  if (curiosity > 0.65) parts.push('inquisitive rising chirps');
  else if (curiosity < 0.35) parts.push('inward muttering');

  return parts.length ? parts.join(', ') : 'erratic monster pacing';
}

function featureTraits(traits: MonsterVoiceTraits): string {
  const parts: string[] = [];
  if (traits.eyeCount === 0) parts.push('no visible eyes, blind groping sounds');
  else if (traits.eyeCount === 1) parts.push('one giant cyclops eye, unsettling focus');
  else if (traits.eyeCount >= 6) parts.push('many scattered eyes, chaotic overlapping voice');
  else parts.push(`${traits.eyeCount} eyes`);

  if (traits.growthCount >= 8) parts.push('horns and head growths, rattling clicks');
  else if (traits.growthCount >= 3) parts.push('a few horn-like nubs');
  else parts.push('smooth head, no limbs');

  if (traits.toothCount >= 4) parts.push('many sharp teeth, snarling consonants');
  if (traits.hasCavity) parts.push('cavernous open maw, echoing hollow vowels');

  parts.push(traits.aspectLabel, traits.sizeLabel);
  return parts.join('; ');
}

/**
 * ElevenLabs Voice Design prompt — strongly non-human monster vocalization.
 */
export function buildVoicePrompt(data: MonsterData): string {
  const traits = extractMonsterTraits(data);
  const bodyLine = ARCHETYPE_VOICE[data.archetype] ?? ARCHETYPE_VOICE.blob;
  const animLine = animTraits(data);
  const visualLine = featureTraits(traits);

  return [
    'Native Ukrainian.',
    'NOT a human voice — a bizarre cartoon creature monster from a gross-out comedy show.',
    'Creature vocalization only — never sound like a person imitating a monster or doing a silly accent.',
    'Gender-neutral beast. Good quality.',
    `Persona: grotesque comedy monster named "${data.name}".`,
    'Emotion: mischievous, hungry, absurd, playful horror.',
    'Timbre: growling, wet, gurgling, raspy, squeaky, snorting — exaggerated non-human texture with grunts and chirps.',
    `Body archetype: ${bodyLine}.`,
    `Movement and speech rhythm: ${animLine}.`,
    `Visual features: ${visualLine}.`,
    'Speaks in short absurd bursts — funny and unsettling, clearly a monster not a human narrator.',
  ].join(' ');
}
