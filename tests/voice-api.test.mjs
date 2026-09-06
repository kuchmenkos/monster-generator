import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
const dir = await mkdtemp(join(tmpdir(), "bulala-api-test-"));
after(() => rm(dir, { recursive: true, force: true }));
const output = join(dir, "proxy.mjs");
await build({
  entryPoints: ["vite-plugins/bulala-voice.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
  plugins: [
    {
      name: "test-vite-env",
      setup(b) {
        b.onResolve({ filter: /^vite$/ }, () => ({
          path: "vite",
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export function loadEnv(){ return {}; }",
          loader: "js",
        }));
      },
    },
  ],
});
const { bulalaVoicePlugin } = await import(pathToFileURL(output));
const plugin = bulalaVoicePlugin();
plugin.configResolved({ root: dir, mode: "test" });
let middleware;
plugin.configureServer({
  middlewares: {
    use(fn) {
      middleware = fn;
    },
  },
});
function request(path, data, method = "POST", origin) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(data === undefined ? [] : [Buffer.isBuffer(data) ? data : JSON.stringify(data)]);
    Object.assign(req, {
      url: "/api/bulala/" + path,
      method,
      headers: { host: "localhost:5173", ...(origin ? { origin } : {}) },
    });
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k] = v;
      },
      end(body) {
        resolve({
          status: this.statusCode,
          headers,
          body: Buffer.isBuffer(body) ? body : JSON.parse(body),
        });
      },
    };
    Promise.resolve(
      middleware(req, res, () => reject(new Error("not routed"))),
    ).catch(reject);
  });
}
test("API validates input and rejects cross-origin calls before upstream", async () => {
  assert.equal(
    (await request("speak", { seed: "bad<seed>", text: "hi" })).status,
    400,
  );
  assert.equal(
    (await request("speak", { seed: "test", text: "" })).status,
    400,
  );
  assert.equal(
    (await request("speak", { seed: "test", text: "x".repeat(501) })).status,
    400,
  );
  assert.equal(
    (
      await request(
        "speak",
        { seed: "test", text: "hi" },
        "POST",
        "https://example.org",
      )
    ).status,
    403,
  );
  assert.equal((await request("design", {}, "GET")).status, 405);
});
test("Voice Design is cached per seed and TTS uses its saved voice; upstream is mocked", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "unit-test-key-not-real";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, payload });
    assert.equal(options.headers["xi-api-key"], "unit-test-key-not-real");
    if (url.endsWith("/text-to-voice/design")) {
      assert.ok(payload.voice_description.length >= 20);
      assert.ok(payload.text.length >= 100);
      return new Response(
        JSON.stringify({ previews: [{ generated_voice_id: "preview-test" }] }),
      );
    }
    if (url.endsWith("/text-to-voice")) {
      assert.equal(payload.generated_voice_id, "preview-test");
      return new Response(JSON.stringify({ voice_id: "saved-test-voice" }));
    }
    assert.match(url, /text-to-speech\/saved-test-voice/);
    assert.equal(payload.model_id, "eleven_multilingual_v2");
    assert.ok(
      payload.voice_settings.speed >= 0.7 &&
        payload.voice_settings.speed <= 1.2,
    );
    return new Response(new Uint8Array([73, 68, 51]), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  };
  try {
    const [one, two] = await Promise.all([
      request("design", { seed: "voice-test" }),
      request("design", { seed: "voice-test" }),
    ]);
    assert.equal(one.status, 200);
    assert.equal(two.body.voiceId, "saved-test-voice");
    assert.equal(calls.length, 2);
    assert.equal(
      JSON.parse(await readFile(join(dir, ".bulala-voices.local"), "utf8"))[
        "voice-test"
      ],
      "saved-test-voice",
    );
    const speech = await request("speak", {
      seed: "voice-test",
      text: "Привет, мир!",
    });
    assert.equal(speech.status, 200);
    assert.equal(speech.headers["Content-Type"], "audio/mpeg");
    assert.equal(speech.body.toString(), "ID3");
    await request("design", { seed: "voice-test" });
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});

test("PNG cards are returned as real HTTP attachments without an API key", async () => {
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(1200,16);png.writeUInt32BE(1500,20);
  const created=await request("cards",png);assert.equal(created.status,200);assert.match(created.body.url,/^\/api\/bulala\/cards\/.*\.png$/);
  const result=await request(created.body.url.slice("/api/bulala/".length),undefined,"GET");assert.equal(result.status,200);assert.equal(result.headers["Content-Type"],"image/png");assert.match(result.headers["Content-Disposition"],/attachment/);assert.deepEqual(result.body,png);
  assert.equal((await request("cards",Buffer.from("not a PNG"))).status,400);
});
