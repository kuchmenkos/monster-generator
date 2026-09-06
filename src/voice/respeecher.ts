export interface RespeecherVoice {
  id: string;
  name?: string;
  language?: string;
  sampling_params?: Record<string, number>;
}

export interface TtsBytesRequest {
  transcript: string;
  voice: { id: string; sampling_params?: Record<string, number> };
  output_format?: { encoding: string; sample_rate: number };
}

let voicesCache: { en: RespeecherVoice[]; uk: RespeecherVoice[] } | null = null;

function normalizeVoices(data: unknown): RespeecherVoice[] {
  const raw = Array.isArray(data)
    ? data
    : ((data as { voices?: unknown[] })?.voices ?? []);
  return raw
    .map((item) => {
      if (typeof item === 'string') return { id: item };
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const id = String(o.id ?? o.voice_id ?? o.name ?? '');
        if (!id) return null;
        return {
          id,
          name: o.name ? String(o.name) : undefined,
          language: o.language ? String(o.language) : undefined,
          sampling_params: o.sampling_params as Record<string, number> | undefined,
        };
      }
      return null;
    })
    .filter((v): v is RespeecherVoice => v !== null && v.id.length > 0);
}

export async function fetchVoices(lang: 'uk' | 'en'): Promise<RespeecherVoice[]> {
  if (!voicesCache) voicesCache = { en: [], uk: [] };
  const key = lang;
  if (voicesCache[key].length > 0) return voicesCache[key];

  const res = await fetch(`/api/tts/voices?lang=${lang}`);
  if (!res.ok) throw new Error(`Voices fetch failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const list = normalizeVoices(data);
  voicesCache[key] = list;
  return list;
}

export async function synthesizeBytes(req: TtsBytesRequest, lang: 'uk' | 'en' = 'en'): Promise<ArrayBuffer> {
  const res = await fetch(`/api/tts/bytes?lang=${lang}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: req.transcript,
      voice: req.voice,
      output_format: req.output_format ?? { encoding: 'pcm_s16le', sample_rate: 24000 },
    }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text()}`);
  return res.arrayBuffer();
}

/** Wrap raw PCM s16le in a WAV container for decodeAudioData. */
export function pcmToWav(pcm: ArrayBuffer, sampleRate = 24000, channels = 1): ArrayBuffer {
  const bytes = new Uint8Array(pcm);
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = bytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(bytes);
  return buffer;
}

export async function synthesizeWav(req: TtsBytesRequest, lang: 'uk' | 'en' = 'en'): Promise<ArrayBuffer> {
  const raw = await synthesizeBytes(req, lang);
  const head = new Uint8Array(raw, 0, 4);
  const isWav = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
  if (isWav || (req.output_format?.encoding ?? '').includes('wav')) return raw;
  return pcmToWav(raw, req.output_format?.sample_rate ?? 24000);
}
