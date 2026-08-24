import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type Kind = 'like' | 'dislike';

interface FeedbackBody {
  kind: Kind;
  seed: string;
  name: string;
  action: 'add' | 'remove';
  png?: string | null;
}

function safeSeed(seed: string): string {
  return seed.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Dev-only middleware: write likes/dislikes as JSON+PNG under feedback/.
 */
export function feedbackWriterPlugin(root = process.cwd()): Plugin {
  const feedbackRoot = path.join(root, 'feedback');

  return {
    name: 'feedback-writer',
    configureServer(server) {
      server.middlewares.use('/__feedback/list', (_req, res) => {
        const readDir = (kind: Kind) => {
          const dir = path.join(feedbackRoot, kind === 'like' ? 'likes' : 'dislikes');
          if (!fs.existsSync(dir)) return [];
          return fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
              try {
                return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
              } catch {
                return null;
              }
            })
            .filter(Boolean);
        };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ likes: readDir('like'), dislikes: readDir('dislike') }));
      });

      server.middlewares.use('/__feedback', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as FeedbackBody;
            if (!data.seed || !data.kind || !data.action) {
              res.statusCode = 400;
              res.end('bad request');
              return;
            }
            const folder = data.kind === 'like' ? 'likes' : 'dislikes';
            const dir = path.join(feedbackRoot, folder);
            ensureDir(dir);
            const id = safeSeed(data.seed);
            const jsonPath = path.join(dir, `${id}.json`);
            const pngPath = path.join(dir, `${id}.png`);

            if (data.action === 'remove') {
              if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
              if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
            } else {
              let processed = false;
              if (fs.existsSync(jsonPath)) {
                try {
                  const prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
                    processed?: boolean;
                  };
                  processed = !!prev.processed;
                } catch {
                  /* ignore */
                }
              }
              fs.writeFileSync(
                jsonPath,
                JSON.stringify(
                  {
                    seed: data.seed,
                    name: data.name,
                    at: Date.now(),
                    processed,
                  },
                  null,
                  2,
                ),
              );
              if (data.png && data.png.startsWith('data:image')) {
                const b64 = data.png.replace(/^data:image\/\w+;base64,/, '');
                fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}
