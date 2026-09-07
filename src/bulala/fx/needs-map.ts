/** Intensity mapping for ambient needs FX — pure, unit-testable. */
export type Needs = { hunger: number; clean: number; mood: number };

export type NeedsFxState = {
  dirty: number;
  stink: boolean;
  flies: number;
  hungry: boolean;
  sad: boolean;
  happy: boolean;
  canvasFilter: string;
};

export function needsFxFrom(needs: Needs): NeedsFxState {
  const dirty = Math.max(0, Math.min(1, 1 - needs.clean));
  const hungry = needs.hunger < 0.35;
  const sad = needs.mood < 0.4;
  const happy =
    needs.mood >= 0.6 && needs.clean >= 0.55 && needs.hunger >= 0.45;
  return {
    dirty,
    stink: dirty > 0.45,
    flies: dirty > 0.7 ? 3 : dirty > 0.5 ? 2 : dirty > 0.3 ? 1 : 0,
    hungry,
    sad,
    happy,
    canvasFilter:
      dirty > 0.25
        ? `saturate(${(0.82 + (1 - dirty) * 0.18).toFixed(2)}) sepia(${(dirty * 0.08).toFixed(2)})`
        : "",
  };
}

/** Split text into words and assign cumulative highlight times (ms). */
export function karaokeTiming(
  text: string,
  durationMs: number,
): { word: string; at: number }[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, "").length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((word, i) => {
    const at = Math.round((acc / total) * durationMs);
    acc += weights[i];
    return { word, at };
  });
}
