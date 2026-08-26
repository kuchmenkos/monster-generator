import { loadEnv, type Plugin } from 'vite';
import { buildVoicePrompt, seedToElevenLabsSeed } from '../src/core/voicePrompt';
import { generateMonster } from '../src/core/monster';

const ELEVENLABS_DESIGN_URL = 'https://api.elevenlabs.io/v1/text-to-voice/design';

interface DesignPreview {
  generated_voice_id: string;
  audio_base_64: string;
  duration_secs: number;
}

interface DesignResponse {
  previews: DesignPreview[];
  text: string;
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

            const monster = generateMonster(seed);
            const voiceDescription = buildVoicePrompt(monster);
            const elevenSeed = seedToElevenLabsSeed(seed);

            const elRes = await fetch(ELEVENLABS_DESIGN_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
              },
              body: JSON.stringify({
                voice_description: voiceDescription,
                model_id: 'eleven_multilingual_ttv_v2',
                auto_generate_text: true,
                should_enhance: true,
                guidance_scale: 10,
                seed: elevenSeed,
                stream_previews: false,
              }),
            });

            if (!elRes.ok) {
              const errText = await elRes.text();
              sendJson(res, elRes.status, {
                error: 'elevenlabs_error',
                detail: errText.slice(0, 500),
              });
              return;
            }

            const data = (await elRes.json()) as DesignResponse;
            const previews = (data.previews ?? []).map((p, index) => ({
              index,
              generatedVoiceId: p.generated_voice_id,
              audioBase64: p.audio_base_64,
              durationSecs: p.duration_secs,
            }));

            sendJson(res, 200, {
              previewText: data.text,
              previews,
              monsterName: monster.name,
            });
          } catch (err) {
            sendJson(res, 500, { error: 'server_error', detail: String(err) });
          }
        })();
      });
    },
  };
}
