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
    const req = Readable.from(
      data === undefined
        ? []
        : [Buffer.isBuffer(data) ? data : JSON.stringify(data)],
    );
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

// Regression: `.env.local` held the ElevenLabs key *ID* (hex) rather than the
// `sk_…` secret. Upstream answered 400 `api_key_id_used_as_api_key`, which the
// old status map did not cover, so the UI showed "временно недоступен".
test("An API key ID is rejected up front with a setup hint, never sent upstream", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  globalThis.fetch = () => {
    throw new Error("upstream must not be called with an unusable key");
  };
  try {
    for (const bad of ["a".repeat(32), "0123456789abcdef".repeat(4)]) {
      process.env.ELEVENLABS_API_KEY = bad;
      const status = await request("status", undefined, "GET");
      assert.equal(status.body.elevenlabs, false);
      assert.match(status.body.hint, /sk_/);
      for (const call of [
        request("design", { seed: "key-id" }),
        request("speak", { seed: "key-id", text: "привет" }),
      ]) {
        const result = await call;
        assert.equal(result.status, 503);
        assert.match(result.body.error, /sk_/);
        assert.doesNotMatch(result.body.error, new RegExp(bad));
      }
    }
    // A key pasted with wrapping quotes or a trailing newline still works.
    process.env.ELEVENLABS_API_KEY = ' "sk_quoted_key"\n';
    let seen;
    globalThis.fetch = async (url, options) => {
      seen = options.headers["xi-api-key"];
      return new Response(JSON.stringify({ previews: [] }), { status: 200 });
    };
    assert.equal(
      (await request("status", undefined, "GET")).body.elevenlabs,
      true,
    );
    await request("design", { seed: "quoted" });
    assert.equal(seen, "sk_quoted_key");
    // Whitespace inside the key would make fetch throw on an invalid header.
    process.env.ELEVENLABS_API_KEY = "sk_broken key";
    assert.match(
      (await request("design", { seed: "spaced" })).body.error,
      /пробел/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});

// Upstream failures must become actionable text, and an upstream 400 must not
// be relayed as a 400 (that status means "your input was invalid" here).
test("Upstream ElevenLabs errors map to actionable messages", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "sk_unit_test_key";
  const cases = [
    [400, { detail: { status: "api_key_id_used_as_api_key" } }, 503, /sk_/],
    [401, { detail: { status: "quota_exceeded" } }, 429, /кредиты/],
    [401, { detail: { status: "detected_unusual_activity" } }, 403, /подписка/],
    [404, { detail: { status: "voice_not_found" } }, 404, /Voice ID/],
    [400, "<html>gateway</html>", 502, /ElevenLabs/],
    [500, { detail: "boom" }, 500, /ElevenLabs/],
  ];
  try {
    for (const [status, payload, expected, pattern] of cases) {
      globalThis.fetch = async () =>
        new Response(
          typeof payload === "string" ? payload : JSON.stringify(payload),
          { status },
        );
      const result = await request("speak", {
        seed: "upstream",
        text: "привет",
        voiceId: "some-voice-id",
      });
      assert.equal(result.status, expected, `upstream ${status} → ${expected}`);
      assert.match(result.body.error, pattern);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});

test("PNG cards are returned as real HTTP attachments without an API key", async () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(1500, 20);
  const created = await request("cards", png);
  assert.equal(created.status, 200);
  assert.match(created.body.url, /^\/api\/bulala\/cards\/.*\.png$/);
  const result = await request(
    created.body.url.slice("/api/bulala/".length),
    undefined,
    "GET",
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers["Content-Type"], "image/png");
  assert.match(result.headers["Content-Disposition"], /attachment/);
  assert.deepEqual(result.body, png);
  assert.equal((await request("cards", Buffer.from("not a PNG"))).status, 400);
});
