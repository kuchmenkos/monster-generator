export interface FeedbackEntry {
  seed: string;
  name: string;
  at: number;
  /** Set true after agent reviewed this dislike and applied fixes */
  processed?: boolean;
}

export type FeedbackKind = 'like' | 'dislike';

const KEYS = {
  like: 'monster-likes',
  dislike: 'monster-dislikes',
} as const;

// Migrate old favorites key once
function migrateFavorites(): void {
  try {
    if (localStorage.getItem(KEYS.like)) return;
    const old = localStorage.getItem('monster-favorites');
    if (!old) return;
    const parsed = JSON.parse(old) as Array<{ seed: string; name: string; likedAt?: number }>;
    if (!Array.isArray(parsed)) return;
    const mapped: FeedbackEntry[] = parsed
      .filter((e) => e && typeof e.seed === 'string')
      .map((e) => ({ seed: e.seed, name: e.name || e.seed, at: e.likedAt ?? Date.now() }));
    localStorage.setItem(KEYS.like, JSON.stringify(mapped));
  } catch {
    /* ignore */
  }
}
migrateFavorites();

function readRaw(kind: FeedbackKind): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FeedbackEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as FeedbackEntry).seed === 'string' &&
        typeof (e as FeedbackEntry).name === 'string',
    );
  } catch {
    return [];
  }
}

function writeRaw(kind: FeedbackKind, entries: FeedbackEntry[]): void {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function listFeedback(kind: FeedbackKind): FeedbackEntry[] {
  return readRaw(kind).sort((a, b) => b.at - a.at);
}

export function hasFeedback(kind: FeedbackKind, seed: string): boolean {
  return readRaw(kind).some((e) => e.seed === seed);
}

export function addFeedback(kind: FeedbackKind, seed: string, name: string): void {
  // Mutual exclusion
  const other: FeedbackKind = kind === 'like' ? 'dislike' : 'like';
  writeRaw(
    other,
    readRaw(other).filter((e) => e.seed !== seed),
  );
  const list = readRaw(kind).filter((e) => e.seed !== seed);
  list.push({ seed, name, at: Date.now() });
  writeRaw(kind, list);
}

export function removeFeedback(kind: FeedbackKind, seed: string): void {
  writeRaw(
    kind,
    readRaw(kind).filter((e) => e.seed !== seed),
  );
}

/** Toggle; returns new active state for this kind. */
export function toggleFeedback(kind: FeedbackKind, seed: string, name: string): boolean {
  if (hasFeedback(kind, seed)) {
    removeFeedback(kind, seed);
    void syncToDisk(kind, seed, name, 'remove');
    return false;
  }
  addFeedback(kind, seed, name);
  return true;
}

export function feedbackCount(kind: FeedbackKind): number {
  return readRaw(kind).length;
}

// ---- Back-compat aliases for likes ----
export const listFavorites = () => listFeedback('like');
export const hasFavorite = (seed: string) => hasFeedback('like', seed);
export const favoriteCount = () => feedbackCount('like');
export const toggleFavorite = (seed: string, name: string) => toggleFeedback('like', seed, name);

export const listDislikes = () => listFeedback('dislike');
export const hasDislike = (seed: string) => hasFeedback('dislike', seed);
export const dislikeCount = () => feedbackCount('dislike');
export const toggleDislike = (seed: string, name: string) => toggleFeedback('dislike', seed, name);

/**
 * Persist like/dislike PNG+JSON via Vite dev middleware.
 * No-op outside of local Vite server.
 */
export async function syncToDisk(
  kind: FeedbackKind,
  seed: string,
  name: string,
  action: 'add' | 'remove',
  pngDataUrl?: string,
): Promise<void> {
  try {
    await fetch('/__feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, seed, name, action, png: pngDataUrl ?? null }),
    });
  } catch {
    // Production / offline — localStorage only
  }
}

export async function fetchDiskList(): Promise<{
  likes: FeedbackEntry[];
  dislikes: FeedbackEntry[];
}> {
  try {
    const res = await fetch('/__feedback/list');
    if (!res.ok) return { likes: [], dislikes: [] };
    return (await res.json()) as { likes: FeedbackEntry[]; dislikes: FeedbackEntry[] };
  } catch {
    return { likes: [], dislikes: [] };
  }
}
