import { randomSeed } from '../core/rng';
import { generateVoiceCharacter, type VoiceCharacter } from '../voice/character';
import { sharedFxEngine } from '../voice/fxEngine';
import { generateRapLine, generateSpeakLine } from '../voice/rapLines';
import { synthesizeWav } from '../voice/respeecher';

const langEl = document.getElementById('lang') as HTMLSelectElement;
const rollBtn = document.getElementById('roll') as HTMLButtonElement;
const speakBtn = document.getElementById('speak') as HTMLButtonElement;
const rapBtn = document.getElementById('rap') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const charName = document.getElementById('charName')!;
const charLabel = document.getElementById('charLabel')!;
const traitsEl = document.getElementById('traits')!;
const textOut = document.getElementById('textOut')!;
const debugEl = document.getElementById('debug')!;
const errEl = document.getElementById('err')!;

let character: VoiceCharacter | null = null;
let clickIndex = 0;
let busy = false;

function lang(): 'uk' | 'en' {
  return langEl.value === 'en' ? 'en' : 'uk';
}

function renderCharacter(c: VoiceCharacter): void {
  charName.textContent = c.name;
  charLabel.textContent = c.label;
  traitsEl.innerHTML = [
    `<b>Strength:</b> ${c.strength.labelUk} (${c.strength.id})`,
    `<b>Weakness:</b> ${c.weakness.labelUk} (${c.weakness.id})`,
    `<b>Speech:</b> ${c.speechStyle.labelUk} (${c.speechStyle.id})`,
    `<b>FX:</b> ${c.fxPreset.labelUk} (${c.fxPreset.id})`,
    `<b>Voice:</b> ${c.voiceId}`,
    `<b>Personality:</b> ${c.personality.label}`,
  ].join('<br>');
  debugEl.textContent = JSON.stringify(
    {
      seed: c.seed,
      voiceId: c.voiceId || '(none)',
      voicesError: c.voicesError,
      sampling: c.sampling,
      fx: c.fxPreset.id,
      voiceHints: c.personality.voice,
    },
    null,
    2,
  );
  if (c.voicesError) errEl.textContent = c.voicesError;
}

async function roll(): Promise<void> {
  errEl.textContent = '';
  const seed = randomSeed(10);
  rollBtn.disabled = true;
  try {
    character = await generateVoiceCharacter(seed, lang());
    clickIndex = 0;
    renderCharacter(character);
    textOut.textContent = '';
  } catch (e) {
    errEl.textContent = String(e);
  } finally {
    rollBtn.disabled = false;
  }
}

async function playLine(text: string): Promise<void> {
  if (!character || busy) return;
  busy = true;
  errEl.textContent = '';
  speakBtn.disabled = true;
  rapBtn.disabled = true;
  textOut.textContent = text;

  try {
    if (!character.voiceId) {
      throw new Error(
        character.voicesError ??
          'No Respeecher voices loaded — check RESPEECHER_API_KEY in .env.local and restart npm run dev',
      );
    }
    const wav = await synthesizeWav(
      {
        transcript: text,
        voice: {
          id: character.voiceId,
          sampling_params: character.sampling as Record<string, number>,
        },
        output_format: { encoding: 'pcm_s16le', sample_rate: 24000 },
      },
      character.lang,
    );
    await sharedFxEngine.decodeAndPlay(
      wav,
      character.fxPreset,
      character.personality.voice.pitch,
    );
  } catch (e) {
    errEl.textContent = String(e);
  } finally {
    busy = false;
    speakBtn.disabled = false;
    rapBtn.disabled = false;
  }
}

rollBtn.addEventListener('click', () => void roll());
speakBtn.addEventListener('click', () => {
  if (!character) return;
  void playLine(generateSpeakLine(character, clickIndex++));
});
rapBtn.addEventListener('click', () => {
  if (!character) return;
  void playLine(generateRapLine(character, clickIndex++));
});
stopBtn.addEventListener('click', () => sharedFxEngine.stop());
langEl.addEventListener('change', () => {
  character = null;
  charName.textContent = '—';
  charLabel.textContent = '—';
  traitsEl.textContent = 'Roll a character to start.';
  textOut.textContent = '';
  debugEl.textContent = '';
});

void roll();
