import type { Rng } from '../rng';
import type { MonsterGrid, MonsterPalette } from '../types';
import { paintAccents } from './accents';
import { paintBrows } from './brows';
import { paintFacialEars } from './ears';
import { paintEyeShaped } from './eyes';
import { paintHair } from './hair';
import { paintLashes } from './lashes';
import { paintLids } from './lids';
import { faceRegion } from './masks';
import { paintMouthFromCurve } from './mouth';
import { paintNose } from './nose';
import type {
  BrowStyle,
  EarStyle,
  EyeArchetype,
  EyeShape,
  EyeSlot,
  HairStyle,
  LashStyle,
  LidStyle,
  NoseStyle,
} from './types';

const ALL_SHAPES: EyeShape[] = [
  'round',
  'square',
  'tall',
  'wide',
  'sleepy',
  'star',
  'diamond',
  'droopy',
  'angry',
  'crescent',
  'slit',
  'heart',
  'hex',
  'void',
  'triple',
  'blob',
  'cross',
];

/**
 * boolala.boo face pipeline: eyes → brows → lids → lashes → nose → ears → mouth → accents → hair.
 * Quality: nearBody checks, cell budgets, asymmetry, cel shadows.
 */
export function applyFace(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  bodyArchetype = 'blob',
): void {
  const shiftX = rng.float(-1.15, 1.15);
  const shiftY = rng.float(-0.7, 0.9);
  const region = faceRegion(grid, shiftX, shiftY);
  if (region.length < 8) return;

  const minC = Math.min(...region.map((c) => c.col));
  const maxC = Math.max(...region.map((c) => c.col));
  const minR = Math.min(...region.map((c) => c.row));
  const maxR = Math.max(...region.map((c) => c.row));
  const midC = Math.round((minC + maxC) / 2);
  const midR = Math.round((minR + maxR) / 2);
  const faceW = maxC - minC;
  const faceH = Math.max(4, maxR - minR);
  const base = region.reduce((a, b) => (a.z >= b.z ? a : b));
  const sr = grid.scaleRef;
  const weird = rng.chance(0.25);

  const eyePick: EyeArchetype[] =
    bodyArchetype === 'bighead'
      ? ['goggle', 'cyclops-giant', 'cyclops-giant', 'mismatched']
      : ['masks', 'goggle', 'goggle', 'cyclops-giant', 'cluster', 'mismatched'];
  const archetype = rng.pick(eyePick);
  const eScale = Math.max(1, Math.round(sr * 0.85));
  const eyes: EyeSlot[] = [];

  if (archetype === 'goggle') {
    const w = Math.max(4, Math.min(7 + eScale, Math.floor(faceW * 0.32)));
    const h = w;
    const spread = Math.max(w, Math.floor(faceW * 0.28));
    const y = midR - Math.floor(h / 2);
    const sL = weird ? rng.pick(['void', 'heart', 'hex'] as EyeShape[]) : rng.pick(['round', 'diamond', 'wide'] as EyeShape[]);
    const sR = weird ? rng.pick(['heart', 'blob', 'cross'] as EyeShape[]) : rng.pick(['round', 'diamond', 'wide'] as EyeShape[]);
    eyes.push({ x: midC - spread - Math.floor(w / 2), y, w, h, shape: sL!, side: -1 });
    eyes.push({
      x: midC + spread - Math.floor(w / 2),
      y: y + rng.int(-1, 1),
      w: weird ? Math.max(3, w + rng.int(-2, 1)) : w,
      h: weird ? Math.max(3, h + rng.int(-1, 2)) : h,
      shape: sR!,
      side: 1,
    });
  } else if (archetype === 'cyclops-giant') {
    const w = Math.max(5, Math.min(10 + eScale, Math.floor(faceW * rng.float(0.4, 0.6))));
    const h = Math.max(4, Math.floor(w * rng.float(0.75, 1)));
    const y = midR - Math.floor(h / 2);
    eyes.push({
      x: midC - Math.floor(w / 2) + rng.int(-1, 1),
      y,
      w,
      h,
      shape: weird ? rng.pick(['void', 'hex', 'heart'] as EyeShape[])! : 'round',
      side: 0,
    });
  } else if (archetype === 'cluster') {
    const count = rng.int(3, 6);
    for (let i = 0; i < count; i++) {
      const s = rng.int(1, 2 + Math.floor(eScale * 0.3));
      const x = midC + rng.int(-Math.floor(faceW * 0.45), Math.floor(faceW * 0.45));
      const y = midR + rng.int(-2, Math.floor((maxR - minR) * 0.35));
      eyes.push({
        x,
        y,
        w: s,
        h: s,
        shape: rng.pick(['round', 'square', 'blob'] as EyeShape[])!,
        side: x < midC ? -1 : 1,
      });
    }
  } else if (archetype === 'mismatched') {
    const bigW = rng.int(4, 6 + Math.floor(eScale * 0.5));
    const bigH = rng.int(3, 5 + Math.floor(eScale * 0.3));
    const smallW = rng.int(2, 3);
    const smallH = rng.int(2, 3);
    const spread = Math.max(bigW, Math.floor(faceW * 0.25));
    const yBig = midR - Math.floor(bigH / 2) + rng.int(-1, 2);
    const ySmall = midR - Math.floor(smallH / 2) + rng.int(-2, 1);
    if (rng.chance(0.5)) {
      eyes.push({ x: midC - spread - Math.floor(bigW / 2), y: yBig, w: bigW, h: bigH, shape: 'round', side: -1 });
      eyes.push({
        x: midC + spread - Math.floor(smallW / 2),
        y: ySmall,
        w: smallW,
        h: smallH,
        shape: weird ? 'void' : 'square',
        side: 1,
      });
    } else {
      eyes.push({
        x: midC - spread - Math.floor(smallW / 2),
        y: ySmall,
        w: smallW,
        h: smallH,
        shape: 'square',
        side: -1,
      });
      eyes.push({
        x: midC + spread - Math.floor(bigW / 2),
        y: yBig,
        w: bigW,
        h: bigH,
        shape: weird ? 'heart' : 'round',
        side: 1,
      });
    }
  } else {
    const shapes = rng.shuffle([...ALL_SHAPES]);
    const eyeCount = rng.pick([1, 2, 2, 2, 3]);
    const makeSize = () => ({
      w: rng.int(2, Math.min(5 + Math.floor(eScale * 0.4), Math.max(2, Math.floor(faceW / 4)))),
      h: rng.int(2, 4 + Math.floor(eScale * 0.3)),
    });
    if (eyeCount === 1) {
      const s = makeSize();
      eyes.push({ x: midC - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]!, side: 0 });
    } else if (eyeCount === 2) {
      const left = makeSize();
      const right = rng.chance(0.45) ? makeSize() : { ...left };
      const spread = Math.max(left.w + 1, Math.floor(faceW * 0.22));
      eyes.push({
        x: midC - spread - Math.floor(left.w / 2),
        y: midR - Math.floor(left.h / 2) + rng.int(-1, 1),
        ...left,
        shape: shapes[0]!,
        side: -1,
      });
      eyes.push({
        x: midC + spread - Math.floor(right.w / 2),
        y: midR - Math.floor(right.h / 2) + rng.int(-1, 1),
        ...right,
        shape: rng.chance(0.5) ? shapes[1]! : shapes[0]!,
        side: 1,
      });
    } else {
      const s = makeSize();
      const spread = Math.max(s.w + 1, Math.floor(faceW * 0.22));
      eyes.push({ x: midC - spread - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]!, side: -1 });
      eyes.push({ x: midC + spread - Math.floor(s.w / 2), y: midR - Math.floor(s.h / 2), ...s, shape: shapes[0]!, side: 1 });
      const mid = makeSize();
      eyes.push({ x: midC - Math.floor(mid.w / 2), y: midR + s.h, ...mid, shape: shapes[1]!, side: 0 });
    }
  }

  for (const e of eyes) {
    paintEyeShaped(
      grid,
      rng,
      palette,
      e.x,
      e.y,
      e.w,
      e.h,
      e.shape,
      base,
      archetype === 'goggle' ? 2 : 1,
      archetype === 'cyclops-giant' ? palette.accent : undefined,
      e.side,
    );
  }

  const lowestEye = Math.min(...eyes.map((e) => e.y));
  const browStyle = rng.pick<BrowStyle>(['straight', 'angry', 'surprised', 'bushy', 'thin', 'unibrow']);
  const lidStyle = rng.pick<LidStyle>(['heavy', 'monolid', 'droopy', 'wide', 'sleepy_half']);
  const lashStyle = rng.pick<LashStyle>(['spike', 'fan', 'clump', 'lower_only', 'spider']);

  if (rng.chance(0.88)) paintBrows(grid, rng, palette, eyes, base, browStyle);
  if (rng.chance(0.75)) paintLids(grid, rng, palette, eyes, base, lidStyle);
  if (rng.chance(0.7)) paintLashes(grid, rng, palette, eyes, base, lashStyle);

  const noseY = Math.round((lowestEye + midR) * 0.5) - 1;
  if (rng.chance(0.92)) {
    paintNose(
      grid,
      rng,
      palette,
      midC + rng.int(-1, 1),
      noseY,
      base,
      rng.pick<NoseStyle>(['button', 'beak', 'slit', 'bulb', 'snout', 'patch']),
    );
  }

  if (rng.chance(0.85)) {
    paintFacialEars(
      grid,
      rng,
      palette,
      midC,
      midR + Math.floor(faceH * 0.15),
      faceW,
      base,
      rng.pick<EarStyle>(['lobe', 'pointy', 'floppy', 'notch', 'bat', 'shell', 'asymmetric_stub']),
    );
  }

  const faceHalf = Math.max(3, Math.floor(faceW * 0.5));
  paintMouthFromCurve(grid, rng, palette, midC + rng.int(-1, 1), midR - 1, faceHalf, base, faceH, lowestEye);

  if (rng.chance(0.7)) paintAccents(grid, rng, palette, midC, midR, faceW, faceH, base);

  // Hair last so bangs can overlay forehead but eyes already placed (zBoost)
  if (rng.chance(0.95)) {
    paintHair(
      grid,
      rng,
      palette,
      base,
      rng.pick<HairStyle>(['mohawk', 'curtain', 'afro_puff', 'spikes', 'braid', 'wild_mane', 'bald_patch']),
    );
  }
}
