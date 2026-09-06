import { createRng } from '../core/rng';
import { generateMonsterName } from '../core/rapNames';
import { generatePersonality } from '../core/personality';
import type { MonsterPersonality, SamplingParams, Trait, VoiceFxPresetId } from '../core/types';
import {
  SPEECH_STYLES,
  STRENGTHS,
  VOICE_FX_PRESETS,
  WEAKNESSES,
  getFxPreset,
  type VoiceFxPreset,
} from './traitCatalogs';
import { fetchVoices, type RespeecherVoice } from './respeecher';

export interface VoiceCharacter {
  seed: string;
  lang: 'uk' | 'en';
  name: string;
  voiceId: string;
  strength: Trait;
  weakness: Trait;
  speechStyle: Trait;
  fxPreset: VoiceFxPreset;
  sampling: SamplingParams;
  personality: MonsterPersonality;
  label: string;
  /** Set when voices API failed — surfaced in demo UI */
  voicesError?: string;
}

function deriveSampling(
  personality: MonsterPersonality,
  strength: Trait,
  weakness: Trait,
  seed: string,
): SamplingParams {
  const rng = createRng(`${seed}:sampling`);
  let temperature = 0.7 + personality.energy * 0.5;
  let repetition_penalty = 1.05 + personality.boldness * 0.15;

  if (weakness.id === 'stageFright') temperature -= 0.15;
  if (weakness.id === 'monotone') temperature -= 0.2;
  if (strength.id === 'rhythmMaster') repetition_penalty -= 0.05;
  if (strength.id === 'unpredictable') temperature += 0.2;

  return {
    temperature: Math.max(0.3, Math.min(1.2, temperature)),
    top_p: 0.85 + rng.float(-0.05, 0.1),
    repetition_penalty: Math.max(1.0, Math.min(1.35, repetition_penalty)),
    seed: rng.int(1, 999999),
  };
}

function pickVoice(
  voices: RespeecherVoice[],
  personality: MonsterPersonality,
  rng: ReturnType<typeof createRng>,
): string {
  if (voices.length === 0) return '';
  const idx =
    personality.vibe === 'fierce' || personality.vibe === 'grumpy'
      ? Math.floor(rng.float(0, voices.length * 0.4))
      : personality.vibe === 'naive' || personality.vibe === 'anxious'
        ? Math.floor(rng.float(voices.length * 0.5, voices.length))
        : Math.floor(rng.float(0, voices.length));
  return voices[Math.min(voices.length - 1, Math.max(0, idx))]!.id;
}

export async function generateVoiceCharacter(seed: string, lang: 'uk' | 'en'): Promise<VoiceCharacter> {
  const rng = createRng(`${seed}:voice-character`);
  const personality = generatePersonality(seed);
  const name = generateMonsterName(seed, personality, lang);

  let voices: RespeecherVoice[] = [];
  let voicesError: string | undefined;
  try {
    voices = await fetchVoices(lang);
    if (voices.length === 0) voicesError = 'Voice list empty from API';
  } catch (e) {
    voicesError = String(e);
    voices = [];
  }

  const strength = rng.pick(STRENGTHS);
  const weakness = rng.pick(WEAKNESSES);
  const speechStyle = rng.pick(SPEECH_STYLES);
  const fxPreset = getFxPreset(rng.pick(VOICE_FX_PRESETS.map((p) => p.id)) as VoiceFxPresetId);
  const voiceId = pickVoice(voices, personality, rng);
  const sampling = deriveSampling(personality, strength, weakness, seed);

  const label =
    lang === 'uk'
      ? `${personality.label} · ${speechStyle.labelUk}`
      : `${personality.vibe} · ${speechStyle.label}`;

  return {
    seed,
    lang,
    name,
    voiceId,
    strength,
    weakness,
    speechStyle,
    fxPreset,
    sampling,
    personality,
    label,
    voicesError,
  };
}
