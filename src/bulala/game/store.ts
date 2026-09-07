/** IndexedDB blob store for creature WebP previews and TTS audio. */

const DB_NAME = "bulala-media-v1";
const PREVIEW_STORE = "previews";
const AUDIO_STORE = "audio";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PREVIEW_STORE))
        db.createObjectStore(PREVIEW_STORE);
      if (!db.objectStoreNames.contains(AUDIO_STORE))
        db.createObjectStore(AUDIO_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putPreview(id: string, blob: Blob): Promise<void> {
  revokePreviewUrl(id);
  const db = await openDb();
  const tx = db.transaction(PREVIEW_STORE, "readwrite");
  tx.objectStore(PREVIEW_STORE).put(blob, id);
  await txDone(tx);
  db.close();
}

export async function getPreview(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(PREVIEW_STORE, "readonly");
  const req = tx.objectStore(PREVIEW_STORE).get(id);
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob ?? null;
}

export async function deletePreview(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREVIEW_STORE, "readwrite");
  tx.objectStore(PREVIEW_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export async function putAudio(key: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(AUDIO_STORE, "readwrite");
  tx.objectStore(AUDIO_STORE).put(buffer, key);
  await txDone(tx);
  db.close();
}

export async function getAudio(key: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const tx = db.transaction(AUDIO_STORE, "readonly");
  const req = tx.objectStore(AUDIO_STORE).get(key);
  const buf = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return buf ?? null;
}

/** Convert a canvas (or data URL) to a compact WebP blob. */
export async function toWebpPreview(
  source: HTMLCanvasElement | string,
  size = 192,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (typeof source === "string") {
    const img = new Image();
    img.src = source;
    await img.decode();
    const s = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - s) / 2,
      (img.height - s) / 2,
      s,
      s,
      0,
      0,
      size,
      size,
    );
  } else {
    const s = Math.min(source.width, source.height);
    ctx.drawImage(
      source,
      (source.width - s) / 2,
      (source.height - s) / 2,
      s,
      s,
      0,
      0,
      size,
      size,
    );
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  if (blob) return blob;
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("preview export failed"))),
      "image/png",
    ),
  );
}

const urlCache = new Map<string, string>();

export async function previewUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const blob = await getPreview(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function revokePreviewUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}
