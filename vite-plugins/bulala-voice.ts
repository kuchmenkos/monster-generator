import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadEnv, type Plugin, type Connect } from "vite";
import { character, generate, rng } from "../src/bulala/genome";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 8192)
      throw new ApiError(413, "Слишком большой запрос.");
  }
  try {
    return JSON.parse(data);
  } catch {
    throw new ApiError(400, "Некорректный JSON.");
  }
}
export function bulalaVoicePlugin(): Plugin {
  let root = "";
  let env: Record<string, string> = {};
  let voices: Record<string, string> = Object.create(null);
  let initialized: Promise<void> | undefined;
  let writing = Promise.resolve();
  const pending = new Map<string, Promise<string>>();
  let inFlight = 0;
  const cards = new Map<string, Buffer>();
  const init = () =>
    (initialized ??= readFile(resolve(root, ".bulala-voices.local"), "utf8")
      .then((raw) => {
        const parsed = JSON.parse(raw);
        for (const [seed, id] of Object.entries(parsed)) {
          if (
            /^[a-zA-Z0-9-]{1,40}$/.test(seed) &&
            typeof id === "string" &&
            /^[\w-]{1,100}$/.test(id)
          )
            voices[seed] = id;
        }
      })
      .catch(() => {}));
  async function upstream(path: string, payload: unknown) {
    const key = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
    if (!key)
      throw new ApiError(
        503,
        "Добавь ELEVENLABS_API_KEY в .env.local и перезапусти сервер.",
      );
    let response: Response;
    try {
      response = await fetch("https://api.elevenlabs.io/v1" + path, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      throw new ApiError(
        504,
        "ElevenLabs не ответил вовремя. Попробуй ещё раз.",
      );
    }
    if (!response.ok) {
      const errors: Record<number, string> = {
        401: "ElevenLabs: проверь API-ключ.",
        403: "ElevenLabs: у ключа нет разрешения на эту операцию.",
        404: "ElevenLabs: голос не найден. Проверь Voice ID.",
        422: "ElevenLabs не принял параметры голоса.",
        429: "ElevenLabs: исчерпан лимит или слишком много запросов.",
      };
      throw new ApiError(
        response.status,
        errors[response.status] ||
          "ElevenLabs временно недоступен. Попробуй позже.",
      );
    }
    return response;
  }
  async function design(seed: string) {
    if (voices[seed]) return voices[seed];
    if (pending.has(seed)) return pending.get(seed)!;
    const promise = (async () => {
      const c = character(generate(seed));
      const r = rng(seed + "voice");
      const texture = [
        "raspy and warm",
        "nasal and mischievous",
        "breathy and sleepy",
        "gravelly but tender",
        "squeaky and excitable",
      ][Math.floor(r() * 5)];
      const description = `An original tiny fantasy creature speaking Russian, ${c.pitch < 1 ? "low pitched" : "high pitched"}, ${texture}. Charming oddball with expressive comic timing, little growls between words and clear understandable speech. Intimate studio recording, no music, not a real person imitation.`;
      const preview = await (
        await upstream("/text-to-voice/design", {
          voice_description: description,
          model_id: "eleven_multilingual_ttv_v2",
          text: "Привет! Я маленькое чудище с очень большим характером. Не смотри на мои зубы, я сегодня уже поел. Лучше посмотри, какие у меня прекрасные булочки. Давай дружить!",
          seed: Math.floor(r() * 4294967295),
        })
      ).json();
      const id = preview.previews?.[0]?.generated_voice_id;
      if (typeof id !== "string")
        throw new ApiError(502, "ElevenLabs не вернул вариант голоса.");
      const created = await (
        await upstream("/text-to-voice", {
          voice_name: `Bulala ${c.name} ${seed}`,
          voice_description: description,
          generated_voice_id: id,
        })
      ).json();
      if (typeof created.voice_id !== "string")
        throw new ApiError(502, "ElevenLabs не вернул ID голоса.");
      voices[seed] = created.voice_id;
      writing = writing
        .catch(() => {})
        .then(async () => {
          const target = resolve(root, ".bulala-voices.local");
          await writeFile(target + ".tmp", JSON.stringify(voices, null, 2), {
            mode: 0o600,
          });
          await rename(target + ".tmp", target);
        });
      await writing;
      return created.voice_id;
    })();
    pending.set(seed, promise);
    try {
      return await promise;
    } finally {
      pending.delete(seed);
    }
  }
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const path = (req.url || "").split("?")[0];
    if (!path.startsWith("/api/bulala/")) return next();
    try {
      await init();
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        throw new ApiError(403, "Запрос должен быть отправлен из мастерской.");
      // Real HTTP downloads also work in webviews that cannot save blob: URLs.
      if (path === "/api/bulala/cards" && req.method === "POST") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > 6 * 1024 * 1024)
            throw new ApiError(413, "Карточка слишком большая.");
          chunks.push(bytes);
        }
        const png = Buffer.concat(chunks);
        if (
          png.length < 24 ||
          !png
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          png.readUInt32BE(16) !== 1200 ||
          png.readUInt32BE(20) !== 1500
        )
          throw new ApiError(400, "Нужна карточка PNG 1200 × 1500.");
        const id = randomUUID();
        cards.set(id, png);
        if (cards.size > 8) cards.delete(cards.keys().next().value!);
        json(res, 200, { url: "/api/bulala/cards/" + id + ".png" });
        return;
      }
      if (path.startsWith("/api/bulala/cards/") && req.method === "GET") {
        const id = path
            .slice("/api/bulala/cards/".length)
            .replace(/\.png$/, ""),
          png = cards.get(id);
        if (!png)
          throw new ApiError(
            404,
            "Создай карточку ещё раз: временная ссылка истекла.",
          );
        res.setHeader("Content-Type", "image/png");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="bulala-card.png"',
        );
        res.setHeader("Content-Length", png.length);
        res.setHeader("Cache-Control", "no-store");
        res.end(png);
        return;
      }
      if (path === "/api/bulala/status" && req.method === "GET") {
        json(res, 200, {
          elevenlabs: !!(
            env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY
          ),
          defaultVoice: !!env.ELEVENLABS_VOICE_ID,
        });
        return;
      }
      if (!["/api/bulala/speak", "/api/bulala/design"].includes(path)) {
        json(res, 404, { error: "Неизвестный метод." });
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { error: "Используй POST." });
        return;
      }
      const data = await body(req);
      if (
        !data ||
        typeof data !== "object" ||
        typeof data.seed !== "string" ||
        !/^[a-zA-Z0-9-]{1,40}$/.test(data.seed)
      )
        throw new ApiError(400, "Некорректный seed.");
      if (
        path === "/api/bulala/speak" &&
        (typeof data.text !== "string" ||
          !data.text.trim() ||
          data.text.length > 500)
      )
        throw new ApiError(400, "Фраза должна содержать от 1 до 500 символов.");
      if (
        data.voiceId !== undefined &&
        (typeof data.voiceId !== "string" ||
          (data.voiceId && !/^[\w-]{1,100}$/.test(data.voiceId)))
      )
        throw new ApiError(400, "Некорректный Voice ID.");
      if (!(env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY))
        throw new ApiError(
          503,
          "Добавь ELEVENLABS_API_KEY в .env.local и перезапусти сервер.",
        );
      if (inFlight >= 2)
        throw new ApiError(429, "Подожди завершения предыдущей озвучки.");
      inFlight++;
      try {
        if (path === "/api/bulala/design") {
          json(res, 200, { voiceId: await design(data.seed) });
          return;
        }
        const id =
          data.voiceId ||
          voices[data.seed] ||
          env.ELEVENLABS_VOICE_ID ||
          process.env.ELEVENLABS_VOICE_ID;
        if (!id)
          throw new ApiError(
            400,
            "Создай уникальный голос или укажи Voice ID.",
          );
        const r = rng(data.seed + "tts");
        const response = await upstream(
          "/text-to-speech/" +
            encodeURIComponent(id) +
            "?output_format=mp3_44100_128",
          {
            text: data.text.trim(),
            model_id: "eleven_multilingual_v2",
            seed: Math.floor(r() * 4294967295),
            voice_settings: {
              stability: 0.35 + r() * 0.25,
              similarity_boost: 0.75,
              style: 0.25 + r() * 0.3,
              use_speaker_boost: true,
              speed: 0.85 + r() * 0.25,
            },
          },
        );
        const audio = Buffer.from(await response.arrayBuffer());
        res.statusCode = 200;
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-store");
        res.end(audio);
      } finally {
        inFlight--;
      }
    } catch (e) {
      json(res, e instanceof ApiError ? e.status : 500, {
        error:
          e instanceof ApiError
            ? e.message
            : "Не удалось завершить операцию. Проверь соединение и повтори.",
      });
    }
  };
  return {
    name: "bulala-voice",
    configResolved(config) {
      root = config.root;
      env = loadEnv(config.mode, root, "");
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
