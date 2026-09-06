import { createRng } from '../core/rng';
import { generateSpeech } from '../core/names';
import type { VoiceCharacter } from './character';

const RAP_TEMPLATES_UK: readonly string[] = [
  'Я {name} {location}, {strength} у крові, {weakness} у голові.',
  'Flow з {location}, мене звуть {name}, я {strength}, але {weakness}.',
  '{name} на beat: {strength}, не {weakness}, це факт.',
  'Слухай, я {name}, {strength} як ніколи, хоч {weakness} інколи.',
  'Бар один: {name}. Бар два: {strength}. Бар три: забудь {weakness}.',
  'MC {name}, {location}, {strength} у тексті, {weakness} у pauses.',
  'Skrrt — {name} — {strength} — boom — {weakness} — still win.',
  '{name} каже: я {strength}, не perfect, {weakness}, але top.',
];

const RAP_TEMPLATES_EN: readonly string[] = [
  "I'm {name} from {location}, {strength} in my blood, {weakness} in my head.",
  'Flow from {location}, call me {name}, I am {strength} but {weakness}.',
  '{name} on the beat: {strength}, not {weakness}, that is fact.',
  'Listen up, I am {name}, {strength} like never, though {weakness} sometimes.',
  'Bar one: {name}. Bar two: {strength}. Bar three: forget {weakness}.',
  'MC {name}, {location}, {strength} in the text, {weakness} in pauses.',
  'Skrrt — {name} — {strength} — boom — {weakness} — still win.',
  '{name} says: I am {strength}, not perfect, {weakness}, but top.',
];

const STYLE_MODIFIERS: Record<string, (text: string) => string> = {
  staccato: (t) => t.replace(/\./g, '!').replace(/,/g, ' —'),
  whisperRap: (t) => t.toLowerCase(),
  shoutRap: (t) => t.toUpperCase(),
  mumbleFlow: (t) => t.replace(/\s+/g, ' … '),
  theatrical: (t) => `О! ${t}`,
  nonsenseSyllables: (t) => `Skrrt-bap-trr. ${t}`,
  callAndResponse: (t) => `${t} — де монстри? — ТУТ!`,
  doubleTime: (t) => `${t} ${t.split(' ').slice(0, 4).join(' ')}!`,
  slowTrap: (t) => t.replace(/\./g, '…').replace(/,/g, '…'),
  glitchStutter: (t) => t.replace(/\b(\w{2})/g, '$1-$1'),
  thirdPersonSelf: (t) => t.replace(/^Я /, 'Він ').replace(/^I /, 'He '),
};

function pickLocation(seed: string): string {
  const rng = createRng(`${seed}:rap-loc`);
  const locs = [
    'з Підвалу',
    'з Жмеринки',
    'з Каналізації',
    'з Кладовки',
    'from the Basement',
    'from the Sewer',
    'from Room 404',
  ];
  return rng.pick(locs);
}

export function generateRapLine(character: VoiceCharacter, clickIndex = 0): string {
  const rng = createRng(`${character.seed}:rap:${clickIndex}`);
  const templates = character.lang === 'uk' ? RAP_TEMPLATES_UK : RAP_TEMPLATES_EN;
  let text = rng.pick(templates)
    .replace(/\{name\}/g, character.name)
    .replace(/\{location\}/g, pickLocation(character.seed))
    .replace(/\{strength\}/g, character.lang === 'uk' ? character.strength.labelUk : character.strength.label)
    .replace(/\{weakness\}/g, character.lang === 'uk' ? character.weakness.labelUk : character.weakness.label);

  const mod = STYLE_MODIFIERS[character.speechStyle.id];
  if (mod) text = mod(text);

  if (character.personality.verbosity > 0.65 && rng.chance(0.5)) {
    const extra = generateSpeech(character.seed, clickIndex + 100, character.personality, character.name);
    text = `${text} ${extra}`;
  }

  return text;
}

export function generateSpeakLine(character: VoiceCharacter, clickIndex = 0): string {
  return generateSpeech(character.seed, clickIndex, character.personality, character.name);
}
