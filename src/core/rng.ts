/**
 * Seeded PRNG — sfc32 + string hash.
 * Same seed string always yields the same monster.
 */

export type Rng = {
  next: () => number;
  float: (min?: number, max?: number) => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  /** Shuffle a copy of the array */
  shuffle: <T>(items: readonly T[]) => T[];
};

/** FNV-1a style mix into 4 uint32 seeds for sfc32. */
export function hashSeed(seed: string): [number, number, number, number] {
  let h0 = 0x811c9dc5;
  let h1 = 0x01000193;
  let h2 = 0x811c9dc5 ^ seed.length;
  let h3 = 0x9e3779b9;

  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193);
    h1 = Math.imul(h1 ^ ((c << 8) | (i & 0xff)), 0x85ebca6b);
    h2 = Math.imul(h2 ^ c, 0xc2b2ae35);
    h3 ^= Math.imul(c + i, 0x27d4eb2d);
    h3 = (h3 << 13) | (h3 >>> 19);
  }

  return [h0 >>> 0, h1 >>> 0, h2 >>> 0, h3 >>> 0];
}

/** sfc32 — fast, high-quality 32-bit PRNG. */
export function createRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed);

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };

  // Warm up
  for (let i = 0; i < 12; i++) next();

  return {
    next,
    float(min = 0, max = 1) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle(items) {
      const arr = items.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
      return arr;
    },
  };
}

/** Random short seed for gallery cells. */
export function randomSeed(length = 10): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      out += alphabet[bytes[i]! % alphabet.length];
    }
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
