export interface VoicePreview {
  index: number;
  generatedVoiceId: string;
  audioBase64: string;
  durationSecs: number;
}

export interface VoiceDesignResult {
  previewText: string;
  previews: VoicePreview[];
  monsterName?: string;
}

const PREVIEWS_KEY = 'monster-voice-previews';
const SELECTED_KEY = 'monster-voice-selected';

type PreviewCache = Record<string, VoiceDesignResult>;
type SelectedCache = Record<string, number>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function getCachedPreviews(seed: string): VoiceDesignResult | null {
  const cache = readJson<PreviewCache>(PREVIEWS_KEY, {});
  return cache[seed] ?? null;
}

export function setCachedPreviews(seed: string, data: VoiceDesignResult): void {
  const cache = readJson<PreviewCache>(PREVIEWS_KEY, {});
  cache[seed] = data;
  writeJson(PREVIEWS_KEY, cache);
}

export function getSelectedIndex(seed: string): number | null {
  const cache = readJson<SelectedCache>(SELECTED_KEY, {});
  const idx = cache[seed];
  return idx === undefined ? null : idx;
}

export function setSelectedIndex(seed: string, index: number | null): void {
  const cache = readJson<SelectedCache>(SELECTED_KEY, {});
  if (index === null) delete cache[seed];
  else cache[seed] = index;
  writeJson(SELECTED_KEY, cache);
}

export async function generateVoices(
  seed: string,
  signal?: AbortSignal,
): Promise<VoiceDesignResult> {
  const res = await fetch('/__voice/design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
    signal,
  });

  const data = (await res.json()) as VoiceDesignResult & { error?: string; detail?: string };

  if (!res.ok) {
    if (data.error === 'missing_api_key') {
      throw new Error('Додай ELEVENLABS_API_KEY у .env.local');
    }
    throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
  }

  setCachedPreviews(seed, data);
  return data;
}

let currentAudio: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;

function cleanupAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

/** Decode base64 mp3 and play; returns stop fn. */
export function playPreview(
  audioBase64: string,
  onEnd?: () => void,
): { stop: () => void; audio: HTMLAudioElement } {
  cleanupAudio();

  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  currentBlobUrl = URL.createObjectURL(blob);
  const audio = new Audio(currentBlobUrl);
  currentAudio = audio;

  audio.addEventListener('ended', () => {
    cleanupAudio();
    onEnd?.();
  });
  audio.addEventListener('error', () => {
    cleanupAudio();
    onEnd?.();
  });

  void audio.play().catch(() => {
    cleanupAudio();
    onEnd?.();
  });

  return {
    stop: () => {
      cleanupAudio();
      onEnd?.();
    },
    audio,
  };
}

export function stopPreview(): void {
  cleanupAudio();
}

export function isPreviewPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
