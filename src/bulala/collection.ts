import { migrateGenome, signature, type Genome } from "./genome";
export const RENDER_VERSION = 4;
export type Saved = {
  genome: Genome;
  image: string;
  at: number;
  renderVersion?: number;
};
export function parseCollection(raw: string): Saved[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const saved: Saved[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const genome = migrateGenome(row.genome);
      if (
        !genome ||
        typeof row.image !== "string" ||
        !row.image.startsWith("data:image/png;base64,")
      )
        continue;
      saved.push({
        genome,
        image: row.image,
        at: typeof row.at === "number" ? row.at : 0,
        renderVersion: row.renderVersion,
      });
      if (saved.length === 48) break;
    }
    return saved;
  } catch {
    return [];
  }
}
/** Apply a completed render to a fresh snapshot, never to the queue's old array. */
export function updatePreview(
  latest: Saved[],
  key: string,
  image: string,
): Saved[] | null {
  const index = latest.findIndex((s) => signature(s.genome) === key);
  if (index < 0 || latest[index].renderVersion === RENDER_VERSION) return null;
  return latest.map((s, i) =>
    i === index ? { ...s, image, renderVersion: RENDER_VERSION } : s,
  );
}
