import { loadEnv, type Plugin } from 'vite';
import {
  buildPreviewText,
  buildVoicePrompt,
  seedToElevenLabsSeed,
} from '../src/core/voicePrompt';
import { generateMonster } from '../src/core/monster';

const ELEVENLABS_DESIGN_URL = 'https://api.elevenlabs.io/v1/text-to-voice/design';

interface DesignPreview {
  generated_voice_id: string;
  audio_base_64?: string;
  duration_secs?: number;
}

interface DesignResponse {
  previews: DesignPreview[];
  text: string;
}

export interface VoiceDesignPayload {
  previewText: string;
  previews: Array<{
    index: number;
    generatedVoiceId: string;
    audioBase64: string;
    durationSecs: number;
  }>;
  monsterName: string;
}

const CACHE_LIMIT = 32;
const memoryCache = new Map<string, VoiceDesignPayload>();

function cacheGet(seed: string): VoiceDesignPayload | undefined {
  const hit = memoryCache.get(seed);
  if (!hit) return undefined;
  // LRU bump
  memoryCache.delete(seed);
  memoryCache.set(seed, hit);
  return hit;
}

function cacheSet(seed: string, value: VoiceDesignPayload): void {
  if (memoryCache.has(seed)) memoryCache.delete(seed);
  memoryCache.set(seed, value);
  while (memoryCache.size > CACHE_LIMIT) {
    const first = memoryCache.keys().next().value as string | undefined;
    if (first === undefined) break;
    memoryCache.delete(first);
  }
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res: import('node:http').ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function streamPreviewAudio(apiKey: string, voiceId: string): Promise<string> {
  const url = `https://api.elevenlabs.io/v1/text-to-voice/${encodeURIComponent(voiceId)}/stream`;
  const res = await fetch(url, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`stream ${res.status}: ${errText.slice(0, 180)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

async function fillMissingAudio(
  apiKey: string,
  previews: DesignPreview[],
): Promise<DesignPreview[]> {
  return Promise.all(
    previews.map(async (p) => {
      if (p.audio_base_64) return p;
      try {
        const audio_base_64 = await streamPreviewAudio(apiKey, p.generated_voice_id);
        return { ...p, audio_base_64 };
      } catch {
        return p;
      }
    }),
  );
}

async function designVoices(
  apiKey: string,
  voiceDescription: string,
  previewText: string,
  elevenSeed: number,
  streamPreviews: boolean,
): Promise<DesignResponse> {
  const elRes = await fetch(ELEVENLABS_DESIGN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      voice_description: voiceDescription,
      model_id: 'eleven_multilingual_ttv_v2',
      text: previewText,
      auto_generate_text: false,
      should_enhance: false,
      guidance_scale: 5,
      seed: elevenSeed,
      stream_previews: streamPreviews,
    }),
  });

  if (!elRes.ok) {
    const errText = await elRes.text();
    const err = new Error(errText.slice(0, 500));
    (err as Error & { status: number }).status = elRes.status;
    throw err;
  }

  return (await elRes.json()) as DesignResponse;
}

function toPayload(
  monsterName: string,
  previewText: string,
  previews: DesignPreview[],
): VoiceDesignPayload {
  return {
    previewText,
    monsterName,
    previews: previews.map((p, index) => ({
      index,
      generatedVoiceId: p.generated_voice_id,
      audioBase64: p.audio_base_64 ?? '',
      durationSecs: p.duration_secs ?? 0,
    })),
  };
}

/**
 * Dev-only middleware: proxy ElevenLabs Voice Design for monster previews.
 */
export function voiceApiPlugin(root = process.cwd()): Plugin {
  return {
    name: 'voice-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, root, '');
      const apiKey = env.ELEVENLABS_API_KEY ?? process.env.ELEVENLABS_API_KEY ?? '';

      server.middlewares.use('/__voice/design', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        void (async () => {
          try {
            if (!apiKey) {
              sendJson(res, 503, { error: 'missing_api_key' });
              return;
            }

            const raw = await readJsonBody(req);
            const { seed } = JSON.parse(raw) as { seed?: string };
            if (!seed || typeof seed !== 'string') {
              sendJson(res, 400, { error: 'seed_required' });
              return;
            }

            const cached = cacheGet(seed);
            if (cached) {
              sendJson(res, 200, cached);
              return;
            }

            const monster = generateMonster(seed);
            const voiceDescription = buildVoicePrompt(monster);
            const previewText = buildPreviewText(monster.name);
            const elevenSeed = seedToElevenLabsSeed(seed);

            let data: DesignResponse;
            try {
              data = await designVoices(apiKey, voiceDescription, previewText, elevenSeed, true);
            } catch (err) {
              const status = (err as Error & { status?: number }).status ?? 500;
              sendJson(res, status, {
                error: 'elevenlabs_error',
                detail: err instanceof Error ? err.message : String(err),
              });
              return;
            }

            let previews = data.previews ?? [];
            if (previews.some((p) => !p.audio_base_64)) {
              previews = await fillMissingAudio(apiKey, previews);
            }
            if (previews.every((p) => !p.audio_base_64)) {
              data = await designVoices(apiKey, voiceDescription, previewText, elevenSeed, false);
              previews = data.previews ?? [];
            }

            const withAudio = previews.filter((p) => p.audio_base_64);
            if (withAudio.length === 0) {
              sendJson(res, 502, { error: 'no_previews' });
              return;
            }

            const payload = toPayload(monster.name, data.text || previewText, withAudio);
            cacheSet(seed, payload);
            sendJson(res, 200, payload);
          } catch (err) {
            sendJson(res, 500, { error: 'server_error', detail: String(err) });
          }
        })();
      });
    },
  };
}
