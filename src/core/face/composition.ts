import type { Rng } from '../rng';
import type { GridCell, MonsterGrid } from '../types';
import type {
  BrowStyle,
  EarStyle,
  EyeArchetype,
  EyeShape,
  EyeSlot,
  HairStyle,
  LashStyle,
  LidStyle,
  MouthStyle,
  MustacheStyle,
  NoseStyle,
  ToothStyle,
} from './types';

/** Harmonized face mood — one roll drives all feature styles. */
export type FacePreset = 'calm' | 'cute' | 'grumpy' | 'cyclops' | 'odd';

export interface FaceLayout {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
  midC: number;
  faceW: number;
  faceH: number;
  /** Eye band center row (body bbox fraction 0.55–0.78). */
  eyeBandR: number;
  /** Mouth band center row (0.28–0.45). */
  mouthBandR: number;
  /** Nose between eyes and mouth. */
  noseR: number;
  base: GridCell;
  region: GridCell[];
}

export interface FaceRecipe {
  preset: FacePreset;
  eyeArchetype: EyeArchetype;
  eyeShapes: EyeShape[];
  browStyle: BrowStyle;
  lidStyle: LidStyle;
  lashStyle: LashStyle | null;
  noseStyle: NoseStyle | null;
  earStyle: EarStyle | null;
  mouthStyle: MouthStyle;
  toothStyle: ToothStyle;
  hairStyle: HairStyle | null;
  mustacheStyle: MustacheStyle | null;
  doBrows: boolean;
  doLids: boolean;
  doAccents: boolean;
  weird: boolean;
}

function pickEar(rng: Rng, pool: EarStyle[]): EarStyle {
  return rng.pick(pool)!;
}

function pickHair(rng: Rng): HairStyle {
  // Dense mane bias; bald_patch rare (~5%)
  if (rng.chance(0.05)) return 'bald_patch';
  return rng.pick([
    'afro_puff',
    'afro_puff',
    'curtain',
    'curtain',
    'wild_mane',
    'wild_mane',
    'mohawk',
    'mohawk',
    'spikes',
    'braid',
  ] as HairStyle[])!;
}

function pickMustache(rng: Rng, chance: number): MustacheStyle | null {
  if (!rng.chance(chance)) return null;
  return rng.pick(['walrus', 'pencil', 'handlebar', 'stubble', 'fu_manchu'] as MustacheStyle[])!;
}

/**
 * Body-only face band with tight center bias (±8% width).
 * Vertical bands: eyes 55–78%, mouth 28–45% of body height from bottom.
 */
export function layoutFace(grid: MonsterGrid, rng: Rng): FaceLayout | null {
  const body = [...grid.cells.values()].filter((c) => c.part === 'body');
  if (body.length < 8) return null;

  const minR = Math.min(...body.map((c) => c.row));
  const maxR = Math.max(...body.map((c) => c.row));
  const minC = Math.min(...body.map((c) => c.col));
  const maxC = Math.max(...body.map((c) => c.col));
  const h = Math.max(4, maxR - minR);
  const w = Math.max(4, maxC - minC);

  const shiftX = rng.float(-0.08, 0.08);
  const midC = Math.round((minC + maxC) / 2 + shiftX * w);
  const halfW = Math.max(2, Math.floor(w * 0.38));

  const eyeBandR = minR + Math.round(h * rng.float(0.55, 0.72));
  const mouthBandR = minR + Math.round(h * rng.float(0.3, 0.42));
  const noseR = Math.round((eyeBandR + mouthBandR) * 0.5);

  const faceLo = Math.max(minR, mouthBandR - Math.floor(h * 0.08));
  const faceHi = Math.min(maxR, eyeBandR + Math.floor(h * 0.12));

  const region = body.filter(
    (c) => c.row >= faceLo && c.row <= faceHi && Math.abs(c.col - midC) <= halfW,
  );
  if (region.length < 8) return null;

  const rMinC = Math.min(...region.map((c) => c.col));
  const rMaxC = Math.max(...region.map((c) => c.col));
  const rMinR = Math.min(...region.map((c) => c.row));
  const rMaxR = Math.max(...region.map((c) => c.row));
  const base = region.reduce((a, b) => (a.z >= b.z ? a : b));

  return {
    minC: rMinC,
    maxC: rMaxC,
    minR: rMinR,
    maxR: rMaxR,
    midC,
    faceW: rMaxC - rMinC,
    faceH: Math.max(4, rMaxR - rMinR),
    eyeBandR,
    mouthBandR,
    noseR,
    base,
    region,
  };
}

/** Pick one mood preset; odd/weird is rare (~8%). */
export function rollFaceRecipe(rng: Rng, bodyArchetype: string): FaceRecipe {
  const weird = rng.chance(0.08);
  const preset: FacePreset = weird
    ? 'odd'
    : bodyArchetype === 'bighead' && rng.chance(0.45)
      ? 'cyclops'
      : rng.pick(['calm', 'calm', 'cute', 'cute', 'grumpy', 'cyclops'] as FacePreset[]);

  switch (preset) {
    case 'calm':
      return {
        preset,
        eyeArchetype: 'goggle',
        eyeShapes: ['round', 'round'],
        browStyle: 'straight',
        lidStyle: 'wide',
        lashStyle: rng.chance(0.55) ? 'fan' : null,
        noseStyle: rng.pick(['button', 'slit', 'bulb'] as NoseStyle[]),
        earStyle: pickEar(rng, ['lobe', 'shell', 'pointy', 'floppy']),
        mouthStyle: rng.pick(['open-maw', 'open-maw', 'tongue-out'] as MouthStyle[]),
        toothStyle: rng.pick(['row_even', 'stump', 'gap_grin'] as ToothStyle[]),
        hairStyle: rng.chance(0.92) ? pickHair(rng) : null,
        mustacheStyle: pickMustache(rng, 0.6),
        doBrows: true,
        doLids: true,
        doAccents: rng.chance(0.45),
        weird: false,
      };
    case 'cute':
      return {
        preset,
        eyeArchetype: 'goggle',
        eyeShapes: [rng.pick(['round', 'heart', 'wide'] as EyeShape[])!, 'round'],
        browStyle: 'surprised',
        lidStyle: 'sleepy_half',
        lashStyle: rng.pick(['fan', 'clump', 'spike'] as LashStyle[]),
        noseStyle: 'button',
        earStyle: pickEar(rng, ['lobe', 'floppy', 'shell', 'pointy']),
        mouthStyle: rng.pick(['open-maw', 'tiny', 'tongue-out'] as MouthStyle[]),
        toothStyle: rng.pick(['buck', 'row_even', 'stump'] as ToothStyle[]),
        hairStyle: rng.chance(0.95) ? pickHair(rng) : null,
        mustacheStyle: pickMustache(rng, 0.5),
        doBrows: true,
        doLids: true,
        doAccents: rng.chance(0.55),
        weird: false,
      };
    case 'grumpy':
      return {
        preset,
        eyeArchetype: 'goggle',
        eyeShapes: ['angry', 'angry'],
        browStyle: 'angry',
        lidStyle: 'heavy',
        lashStyle: rng.chance(0.35) ? 'spider' : null,
        noseStyle: rng.pick(['beak', 'snout', 'slit'] as NoseStyle[]),
        earStyle: pickEar(rng, ['pointy', 'bat', 'notch', 'shell']),
        mouthStyle: 'open-maw',
        toothStyle: rng.pick(['fang_pair', 'shark', 'gold_cap'] as ToothStyle[]),
        hairStyle: rng.chance(0.9) ? pickHair(rng) : null,
        mustacheStyle: pickMustache(rng, 0.8),
        doBrows: true,
        doLids: true,
        doAccents: rng.chance(0.35),
        weird: false,
      };
    case 'cyclops':
      return {
        preset,
        eyeArchetype: 'cyclops-giant',
        eyeShapes: [rng.pick(['round', 'hex', 'diamond'] as EyeShape[])!],
        browStyle: rng.pick(['unibrow', 'straight', 'bushy'] as BrowStyle[]),
        lidStyle: rng.pick(['droopy', 'monolid', 'heavy'] as LidStyle[]),
        lashStyle: rng.chance(0.4) ? 'lower_only' : null,
        noseStyle: rng.pick(['bulb', 'patch', 'slit'] as NoseStyle[]),
        earStyle: pickEar(rng, ['lobe', 'shell', 'pointy']),
        mouthStyle: rng.pick(['open-maw', 'open-maw', 'zigzag'] as MouthStyle[]),
        toothStyle: rng.pick(['row_even', 'fang_pair', 'stump'] as ToothStyle[]),
        hairStyle: rng.chance(0.88) ? pickHair(rng) : null,
        mustacheStyle: pickMustache(rng, 0.55),
        doBrows: true,
        doLids: true,
        doAccents: rng.chance(0.4),
        weird: false,
      };
    case 'odd':
    default:
      return {
        preset: 'odd',
        eyeArchetype: rng.chance(0.5) ? 'mismatched' : 'goggle',
        eyeShapes: [
          rng.pick(['void', 'hex', 'blob', 'cross'] as EyeShape[])!,
          rng.pick(['heart', 'triple', 'diamond'] as EyeShape[])!,
        ],
        browStyle: rng.pick(['bushy', 'unibrow', 'angry'] as BrowStyle[]),
        lidStyle: rng.pick(['monolid', 'droopy', 'wide'] as LidStyle[]),
        lashStyle: rng.chance(0.5) ? rng.pick(['spider', 'clump'] as LashStyle[]) : null,
        noseStyle: rng.pick(['beak', 'patch', 'snout'] as NoseStyle[]),
        // Rare earless odd (~8% of odd ≈ <1% overall)
        earStyle: rng.chance(0.92)
          ? pickEar(rng, ['asymmetric_stub', 'bat', 'floppy', 'notch'])
          : null,
        mouthStyle: rng.pick(['open-maw', 'zigzag', 'tongue-out'] as MouthStyle[]),
        toothStyle: rng.pick(['shark', 'gap_grin', 'gold_cap'] as ToothStyle[]),
        hairStyle: rng.chance(0.9) ? pickHair(rng) : null,
        mustacheStyle: pickMustache(rng, 0.55),
        doBrows: true,
        doLids: rng.chance(0.75),
        doAccents: rng.chance(0.55),
        weird: true,
      };
  }
}

/** Build eye slots from layout + recipe — always body-centered. */
export function buildEyeSlots(
  layout: FaceLayout,
  recipe: FaceRecipe,
  rng: Rng,
  scaleRef: number,
): EyeSlot[] {
  const { midC, faceW, eyeBandR } = layout;
  const eScale = Math.max(1, Math.round(scaleRef * 0.85));
  const eyes: EyeSlot[] = [];

  if (recipe.eyeArchetype === 'cyclops-giant') {
    const w = Math.max(5, Math.min(9 + eScale, Math.floor(faceW * 0.48)));
    const h = Math.max(4, Math.floor(w * rng.float(0.8, 1)));
    eyes.push({
      x: midC - Math.floor(w / 2),
      y: eyeBandR - Math.floor(h / 2),
      w,
      h,
      shape: recipe.eyeShapes[0] ?? 'round',
      side: 0,
    });
    return eyes;
  }

  if (recipe.eyeArchetype === 'mismatched' && recipe.weird) {
    const bigW = rng.int(4, 6 + Math.floor(eScale * 0.4));
    const bigH = rng.int(3, 5);
    const smallW = rng.int(2, 3);
    const smallH = rng.int(2, 3);
    const spread = Math.max(bigW, Math.floor(faceW * 0.24));
    eyes.push({
      x: midC - spread - Math.floor(bigW / 2),
      y: eyeBandR - Math.floor(bigH / 2),
      w: bigW,
      h: bigH,
      shape: recipe.eyeShapes[0] ?? 'round',
      side: -1,
    });
    eyes.push({
      x: midC + spread - Math.floor(smallW / 2),
      y: eyeBandR - Math.floor(smallH / 2),
      w: smallW,
      h: smallH,
      shape: recipe.eyeShapes[1] ?? 'square',
      side: 1,
    });
    return eyes;
  }

  // Default paired goggle — matched sizes, mild Y jitter only when weird
  const w = Math.max(4, Math.min(7 + eScale, Math.floor(faceW * 0.3)));
  const h = w;
  const spread = Math.max(w, Math.floor(faceW * 0.26));
  const y = eyeBandR - Math.floor(h / 2);
  const sL = recipe.eyeShapes[0] ?? 'round';
  const sR = recipe.eyeShapes[1] ?? sL;
  eyes.push({ x: midC - spread - Math.floor(w / 2), y, w, h, shape: sL, side: -1 });
  eyes.push({
    x: midC + spread - Math.floor(w / 2),
    y: recipe.weird ? y + rng.int(-1, 1) : y,
    w,
    h,
    shape: sR,
    side: 1,
  });
  return eyes;
}
