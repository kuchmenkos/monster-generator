import { getAudio, putAudio } from "../game/store";

/** In-memory LRU + IndexedDB cache for TTS MP3 payloads. */
const memory = new Map<string, ArrayBuffer>();
const MAX_MEM = 24;

function touch(key: string, buf: ArrayBuffer) {
  if (memory.has(key)) memory.delete(key);
  memory.set(key, buf);
  while (memory.size > MAX_MEM) {
    const oldest = memory.keys().next().value!;
    memory.delete(oldest);
  }
}

export async function hashKey(voiceId: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(voiceId + "\0" + text);
  if (crypto.subtle) {
    const dig = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(dig)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 40);
  }
  // Fallback for rare environments without subtle.
  let h = 2166136261;
  for (const c of voiceId + text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return "h" + (h >>> 0).toString(16);
}

export async function getCachedAudio(
  voiceId: string,
  text: string,
): Promise<ArrayBuffer | null> {
  const key = await hashKey(voiceId, text);
  const mem = memory.get(key);
  if (mem) {
    touch(key, mem);
    return mem.slice(0);
  }
  try {
    const disk = await getAudio(key);
    if (disk) {
      touch(key, disk);
      return disk.slice(0);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function setCachedAudio(
  voiceId: string,
  text: string,
  buffer: ArrayBuffer,
): Promise<void> {
  const key = await hashKey(voiceId, text);
  touch(key, buffer);
  try {
    await putAudio(key, buffer);
  } catch {
    /* quota — memory cache still helps */
  }
}

/** Prefetch helper: kick off a speak request early; caller plays later via Voice. */
export type PrefetchHandle = {
  voiceId: string;
  text: string;
  promise: Promise<ArrayBuffer | null>;
};

export function prefetchSpeak(
  text: string,
  seed: string,
  voiceId: string,
  pitch: number,
): PrefetchHandle {
  const promise = (async () => {
    const cached = await getCachedAudio(voiceId || seed, text);
    if (cached) return cached;
    if (!voiceId && !seed) return null;
    try {
      const response = await fetch("/api/bulala/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId, seed, pitch }),
      });
      if (!response.ok) return null;
      const buf = await response.arrayBuffer();
      if (buf.byteLength)
        await setCachedAudio(voiceId || seed, text, buf);
      return buf.byteLength ? buf : null;
    } catch {
      return null;
    }
  })();
  return { voiceId: voiceId || seed, text, promise };
}
