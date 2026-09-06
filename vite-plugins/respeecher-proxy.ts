import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

const API_BASE = 'https://api.respeecher.com/v1/public/tts';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Dev proxy for Respeecher TTS — keeps API key server-side.
 */
export function respeecherProxyPlugin(): Plugin {
  return {
    name: 'respeecher-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root ?? process.cwd(), '');
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/tts/')) {
          next();
          return;
        }

        const apiKey = env.RESPEECHER_API_KEY ?? process.env.RESPEECHER_API_KEY;
        if (!apiKey) {
          sendJson(res, 503, { error: 'RESPEECHER_API_KEY not set in .env.local' });
          return;
        }

        try {
          if (req.method === 'GET' && url.startsWith('/api/tts/voices')) {
            const parsed = new URL(url, 'http://localhost');
            const lang = parsed.searchParams.get('lang') === 'uk' ? 'ua-rt' : 'en-rt';
            const upstream = await fetch(`${API_BASE}/${lang}/voices`, {
              headers: { 'X-API-Key': apiKey },
            });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
            res.end(text);
            return;
          }

          if (req.method === 'POST' && url.startsWith('/api/tts/bytes')) {
            const body = await readBody(req);
            const parsed = new URL(url, 'http://localhost');
            const lang = parsed.searchParams.get('lang') === 'uk' ? 'ua-rt' : 'en-rt';
            const upstream = await fetch(`${API_BASE}/${lang}/tts/bytes`, {
              method: 'POST',
              headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
              },
              body,
            });
            const buf = Buffer.from(await upstream.arrayBuffer());
            res.statusCode = upstream.status;
            const ct = upstream.headers.get('content-type') ?? 'audio/wav';
            res.setHeader('Content-Type', ct);
            res.end(buf);
            return;
          }

          sendJson(res, 404, { error: 'not found' });
        } catch (err) {
          sendJson(res, 500, { error: String(err) });
        }
      });
    },
  };
}
