import type { MonsterData } from './types';

export interface MonsterVoiceTraits {
  eyeCount: number;
  limbCount: number;
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
  lanky: 'tall thin spindly limbs, reedy high-pitched squeals',
  slug: 'low slug body dragging, wet slurping gurgles',
  bighead: 'massive oversized head, booming echoing roars',
  column: 'tall column body, monotone rumbling drone',
  wide: 'broad flat body, low gravelly grunts',
  stack: 'stacked lump body, layered overlapping growls',
};

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
  const limbs = data.particles.filter((p) => p.part === 'appendage');
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
    limbCount: limbs.length,
    toothCount: teeth.length,
    hasCavity,
    aspectLabel,
    sizeLabel,
  };
}

function animTraits(data: MonsterData): string {
  const { heaviness, jitteriness, curiosity, talkRate } = data.anim;
  const parts: string[] = [];

  if (heaviness > 0.65) parts.push('slow heavy delivery');
  else if (heaviness < 0.35) parts.push('light bouncy delivery');

  if (jitteriness > 0.65) parts.push('nervous stuttering bursts');
  else if (jitteriness < 0.35) parts.push('calm steady rhythm');

  if (curiosity > 0.65) parts.push('inquisitive rising chirps');
  if (talkRate > 7) parts.push('fast chattery syllables');
  else if (talkRate < 4) parts.push('slow drawn-out groans');

  return parts.length ? parts.join(', ') : 'erratic monster pacing';
}

function featureTraits(traits: MonsterVoiceTraits): string {
  const parts: string[] = [];
  if (traits.eyeCount === 0) parts.push('no visible eyes, blind groping sounds');
  else if (traits.eyeCount === 1) parts.push('one giant cyclops eye, unsettling focus');
  else if (traits.eyeCount >= 6) parts.push('many scattered eyes, chaotic overlapping voice');
  else parts.push(`${traits.eyeCount} eyes`);

  if (traits.limbCount >= 10) parts.push('many writhing limbs');
  else if (traits.limbCount >= 4) parts.push(`${traits.limbCount} limbs`);
  else parts.push('stubby minimal limbs');

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
