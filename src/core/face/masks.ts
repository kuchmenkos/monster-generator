import type { EyeShape } from './types';

/** Build boolean eye silhouette mask in local coords. */
export function eyeMask(shape: EyeShape, w: number, h: number): Set<string> {
  const cells = new Set<string>();
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / Math.max(0.5, cx);
      const ny = (y - cy) / Math.max(0.5, cy);
      let inside = false;

      switch (shape) {
        case 'square':
          inside = true;
          break;
        case 'round':
          inside = nx * nx + ny * ny <= 1.15;
          break;
        case 'tall':
          inside = Math.abs(nx) * 1.35 + Math.abs(ny) * 0.7 <= 1.1;
          break;
        case 'wide':
          inside = Math.abs(nx) * 0.7 + Math.abs(ny) * 1.35 <= 1.1;
          break;
        case 'sleepy':
          inside = ny <= 0.35 && nx * nx + ny * ny * 0.6 <= 1.2;
          break;
        case 'star': {
          const onH = Math.abs(ny) <= 0.35;
          const onV = Math.abs(nx) <= 0.35;
          inside = onH || onV;
          break;
        }
        case 'diamond':
          inside = Math.abs(nx) + Math.abs(ny) <= 1.05;
          break;
        case 'droopy':
          inside = ny <= 0.55 && nx * nx + (ny + 0.2) * (ny + 0.2) <= 1.15;
          break;
        case 'angry':
          inside = nx * nx + ny * ny <= 1.15 && ny <= 0.55 - nx * 0.35;
          break;
        case 'crescent':
          inside = nx * nx + ny * ny <= 1.15 && (nx - 0.35) * (nx - 0.35) + ny * ny > 0.55;
          break;
        case 'slit':
          inside = Math.abs(nx) <= 0.28 && Math.abs(ny) <= 1.0;
          break;
        case 'heart': {
          const hx = nx;
          const hy = -ny + 0.15;
          inside =
            Math.pow(hx * hx + hy * hy - 0.35, 3) - hx * hx * Math.pow(hy, 3) < 0.02 ||
            (Math.abs(hx) < 0.55 && hy > -0.35 && hy < 0.55 && Math.abs(hx) + Math.abs(hy) * 0.6 < 0.85);
          break;
        }
        case 'hex':
          inside = Math.abs(nx) <= 0.95 && Math.abs(ny) <= 0.85 && Math.abs(nx) * 0.5 + Math.abs(ny) <= 1.05;
          break;
        case 'void':
          inside = nx * nx + ny * ny <= 1.15 && nx * nx + ny * ny >= 0.18;
          break;
        case 'triple':
          inside = nx * nx + ny * ny <= 1.15;
          break;
        case 'blob': {
          const n =
            Math.sin(nx * 4.1 + ny * 2.7) * 0.18 + Math.cos(nx * 3.3 - ny * 5.1) * 0.12;
          inside = nx * nx + ny * ny <= 1.05 + n;
          break;
        }
        case 'cross':
          inside = Math.abs(nx) <= 0.35 || Math.abs(ny) <= 0.28;
          break;
      }
      if (inside) cells.add(`${x},${y}`);
    }
  }
  if (cells.size < 4) {
    for (let y = 0; y < Math.min(2, h); y++) {
      for (let x = 0; x < Math.min(2, w); x++) cells.add(`${x},${y}`);
    }
  }
  return cells;
}

/** Horizontal/vertical stretch of a local mask. */
export function stretchMask(mask: Set<string>, sx: number, sy: number): Set<string> {
  if (sx === 1 && sy === 1) return mask;
  const out = new Set<string>();
  for (const key of mask) {
    const [xs, ys] = key.split(',').map(Number) as [number, number];
    const nx = Math.round(xs * sx);
    const ny = Math.round(ys * sy);
    out.add(`${nx},${ny}`);
  }
  return out.size >= 3 ? out : mask;
}

/** Shear mask horizontally by amount * y. */
export function shearMask(mask: Set<string>, amount: number): Set<string> {
  if (Math.abs(amount) < 0.05) return mask;
  const out = new Set<string>();
  for (const key of mask) {
    const [xs, ys] = key.split(',').map(Number) as [number, number];
    out.add(`${xs + Math.round(ys * amount)},${ys}`);
  }
  return out.size >= 3 ? out : mask;
}

export function faceRegion(
  grid: import('../types').MonsterGrid,
  shiftX: number,
  shiftY: number,
): import('../types').GridCell[] {
  const body = [...grid.cells.values()].filter((c) => c.part === 'body');
  if (body.length === 0) return [];
  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const h = maxR - minR;
  const w = maxC - minC;
  const faceLo = minR + Math.floor(h * (0.26 + shiftY * 0.12));
  const faceHi = minR + Math.floor(h * (0.84 + shiftY * 0.08));
  const midC = (minC + maxC) / 2 + shiftX * w * 0.18;
  const halfW = Math.max(2, Math.floor(w * 0.42));

  return body.filter(
    (c) => c.row >= faceLo && c.row <= faceHi && Math.abs(c.col - midC) <= halfW,
  );
}
