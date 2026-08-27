import { Float32BufferAttribute } from 'three';
import { darken, lighten } from '../palette';
import type { Rng } from '../rng';
import type { BulalashkaSkull } from './bulalashkaSkull';
import type { MonsterPalette } from '../types';

export type MeshPatternKind =
  | 'plain'
  | 'belly'
  | 'spots'
  | 'stripes'
  | 'gradient'
  | 'rosettes'
  | 'bio-glow'
  | 'scales'
  | 'curved_stripes'
  | 'mask';

const LX = -0.4;
const LY = 0.6;
const LZ = 0.7;
const LLEN = Math.hypot(LX, LY, LZ) || 1;

function rgbToUnit(rgb: number): [number, number, number] {
  return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255];
}

function pickPattern(rng: Rng): MeshPatternKind {
  return rng.pick<MeshPatternKind>([
    'plain',
    'belly',
    'belly',
    'spots',
    'spots',
    'stripes',
    'gradient',
    'rosettes',
    'bio-glow',
    'scales',
    'curved_stripes',
    'mask',
  ]);
}

/** Apply coat + cel-shade vertex colors (kind known). */
export function applyMeshPatternsToSkull(
  skull: BulalashkaSkull,
  palette: MonsterPalette,
  kind: MeshPatternKind,
): void {
  applyMeshPatternsInternal(skull, palette, kind);
}

/** Procedural coat + cel-shade → vertex colors on skull mesh. */
export function applyMeshPatterns(
  rng: Rng,
  skull: BulalashkaSkull,
  palette: MonsterPalette,
  patternKind?: MeshPatternKind,
): MeshPatternKind {
  const kind = patternKind ?? pickPattern(rng);
  applyMeshPatternsInternal(skull, palette, kind);
  return kind;
}

function applyMeshPatternsInternal(
  skull: BulalashkaSkull,
  palette: MonsterPalette,
  kind: MeshPatternKind,
): void {
  const geo = skull.geometry;
  const pos = geo.attributes.position!.array as Float32Array;
  const norm = geo.attributes.normal!.array as Float32Array;
  const colors = new Float32Array(pos.length);
  const b = skull.bounds;
  const midX = (b.minX + b.maxX) * 0.5;
  const midY = (b.minY + b.maxY) * 0.5;
  const halfW = Math.max(0.01, (b.maxX - b.minX) * 0.5);
  const halfH = Math.max(0.01, (b.maxY - b.minY) * 0.5);

  const [br, bg, bb] = rgbToUnit(palette.base);
  const [hr, hg, hb] = rgbToUnit(palette.highlight);
  const [sr, sg, sb] = rgbToUnit(palette.shadow);
  const [ar, ag, ab] = rgbToUnit(palette.accent);
  const [a2r, a2g, a2b] = rgbToUnit(palette.accent2);

  for (let i = 0; i < pos.length; i += 3) {
    const px = pos[i]!;
    const py = pos[i + 1]!;
    const pz = pos[i + 2]!;
    const nx = norm[i]!;
    const ny = norm[i + 1]!;
    const nz = norm[i + 2]!;

    const d = (nx * LX + ny * LY + nz * LZ) / LLEN;
    const screen = -0.45 * ((px - midX) / halfW) + 0.35 * ((py - midY) / halfH);
    const dither = (Math.floor(px * 40) + Math.floor(py * 40)) % 2 === 0 ? 0.05 : -0.05;
    const t = d * 0.45 + screen * 0.55 + dither;

    let r = br;
    let g = bg;
    let bl = bb;
    if (t > 0.28) {
      r = hr;
      g = hg;
      bl = hb;
    } else if (t < -0.22) {
      r = sr;
      g = sg;
      bl = sb;
    }

    // Coat patterns
    const u = (px - b.minX) / Math.max(0.01, b.maxX - b.minX);
    const v = (py - b.minY) / Math.max(0.01, b.maxY - b.minY);
    switch (kind) {
      case 'belly':
        if (py < midY - halfH * 0.15 && nz > 0.2) {
          const [lr, lg, lb] = rgbToUnit(lighten(palette.base, 0.12));
          r = lr;
          g = lg;
          bl = lb;
        }
        break;
      case 'spots': {
        const spot =
          Math.sin(px * 22 + py * 17) * Math.cos(pz * 19 + py * 13) +
          Math.sin(px * 31 - pz * 11) * 0.5;
        if (spot > 0.55) {
          r = ar;
          g = ag;
          bl = ab;
        }
        break;
      }
      case 'stripes': {
        const stripe = Math.sin(py * 28 + px * 4);
        if (stripe > 0.35) {
          const [dr, dg, db] = rgbToUnit(darken(palette.base, 0.12));
          r = dr;
          g = dg;
          bl = db;
        }
        break;
      }
      case 'gradient': {
        const grad = u * 0.6 + v * 0.4;
        if (grad > 0.55) {
          r = hr;
          g = hg;
          bl = hb;
        } else if (grad < 0.35) {
          r = sr;
          g = sg;
          bl = sb;
        }
        break;
      }
      case 'rosettes': {
        const rosette = Math.sin(px * 18) * Math.sin(py * 18);
        if (rosette > 0.4 && nz > -0.1) {
          r = a2r;
          g = a2g;
          bl = a2b;
        }
        break;
      }
      case 'bio-glow':
        if (py > midY + halfH * 0.35 && (nx * nx + ny * ny) > 0.5) {
          r = a2r;
          g = a2g;
          bl = ab;
        }
        break;
      case 'scales': {
        const period = 0.14;
        const shift = Math.floor(v / period) % 2 === 0 ? 0 : period * 0.5;
        const lx = ((u + shift) % period) / period;
        const ly = (v % period) / period;
        if (lx < 0.12 || ly < 0.12) {
          const [dr, dg, db] = rgbToUnit(darken(palette.base, 0.18));
          r = dr;
          g = dg;
          bl = db;
        } else if (lx > 0.55 && ly > 0.55) {
          r = hr;
          g = hg;
          bl = hb;
        }
        break;
      }
      case 'curved_stripes': {
        const bent = v + Math.sin(u * Math.PI) * 0.08;
        if (Math.floor(bent * 14) % 2 === 0) {
          r = ar;
          g = ag;
          bl = ab;
        }
        break;
      }
      case 'mask':
        if (py > midY - halfH * 0.15 && py < midY + halfH * 0.35 && Math.abs(px) < halfW * 0.55 && nz > 0.15) {
          const [lr, lg, lb] = rgbToUnit(lighten(palette.base, 0.14));
          r = lr;
          g = lg;
          bl = lb;
        }
        break;
      default:
        break;
    }

    // Rear butt tint (-Z hemisphere)
    if (pz < b.minZ + (b.maxZ - b.minZ) * 0.35) {
      const [butr, butg, butb] = rgbToUnit(palette.buttBase);
      const mix = Math.min(1, Math.max(0, (-pz - 0.05) * 2));
      r = r * (1 - mix) + butr * mix;
      g = g * (1 - mix) + butg * mix;
      bl = bl * (1 - mix) + butb * mix;
    }

    colors[i] = r;
    colors[i + 1] = g;
    colors[i + 2] = bl;
  }

  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

export function countVertexColorSteps(skull: BulalashkaSkull): number {
  const col = skull.geometry.attributes.color?.array as Float32Array | undefined;
  if (!col) return 1;
  const set = new Set<string>();
  for (let i = 0; i < col.length; i += 3) {
    set.add(`${col[i]!.toFixed(2)},${col[i + 1]!.toFixed(2)},${col[i + 2]!.toFixed(2)}`);
  }
  return set.size;
}
