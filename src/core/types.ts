/** Particle role for shading / animation weighting. */
export type ParticlePart =
  | 'body'
  | 'appendage'
  | 'eye'
  | 'pupil'
  | 'mouth'
  | 'tooth'
  | 'nose'
  | 'outline'
  | 'aura'
  | 'fleck';

/** Jaw groups for talk: upper stays, cavity stretches, lower+tongue drop. */
export type MouthRole = 'upper' | 'cavity' | 'lower' | 'tongue';

/** Rest mouth pose — drives talk animation mode. */
export type MouthRest = 'sealed' | 'grin' | 'open';

export interface Particle {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  /** Packed RGB 0xRRGGBB */
  color: number;
  part: ParticlePart;
  /** Per-particle phase offset for jiggle */
  phase: number;
  /** Relative size (1 = one grid cell) */
  size: number;
  /** Grid column index (for coherent animation / features) */
  col: number;
  /** Grid row index */
  row: number;
  /** 0 at body root → 1 at limb tip (sway weighting) */
  tipFactor: number;
  /** Mouth jaw piece for talk animation */
  mouthRole?: MouthRole;
  /** Silhouette rim — jiggle allowed; interior stays coherent */
  isRim?: boolean;
  /** Max pupil offset in world units (pupils only) */
  pupilRange?: { x: number; y: number };
  /** Bio-glow / antenna tips — pulse alpha in render */
  glow?: boolean;
}

/** Sparse grid cell used during generation before flattening to particles. */
export interface GridCell {
  col: number;
  row: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  color: number;
  part: ParticlePart;
  phase: number;
  size: number;
  tipFactor: number;
  mouthRole?: MouthRole;
  isRim?: boolean;
  pupilRange?: { x: number; y: number };
  glow?: boolean;
}

export interface MonsterGrid {
  cols: number;
  rows: number;
  /** World size of one cell */
  cell: number;
  /** World X of column 0 center */
  originX: number;
  /** World Y of row 0 center (row increases upward in world Y) */
  originY: number;
  /** Feature size multiplier vs baseline resolution 28 (e.g. 50/28 ≈ 1.8) */
  scaleRef: number;
  /** World-X lean applied at flatten: x += shear * (row - shearOriginRow) */
  shear: number;
  shearOriginRow: number;
  cells: Map<string, GridCell>;
}

export interface AnimParams {
  breathAmp: number;
  breathFreq: number;
  swayAmp: number;
  swayFreq: number;
  jiggleAmp: number;
  bounceChance: number;
  blinkInterval: number;
  /** 0–1: how twitchy / nervous the idle is */
  jitteriness: number;
  /** 0–1: heavier = slower bounce, less spin */
  heaviness: number;
  /** 0–1: how often pupils look around / body turns */
  curiosity: number;
  /** Talk animation: syllables per second */
  talkRate: number;
  /** Talk animation: number of syllables per utterance */
  talkSyllables: number;
  /** Talk animation: jaw open amplitude in cell units */
  talkAmp: number;
}

export interface MonsterPalette {
  base: number;
  highlight: number;
  shadow: number;
  outline: number;
  accent: number;
  /** Secondary accent — extra coat color / glow */
  accent2: number;
  mouth: number;
  /** Lip rim — slightly lighter/warmer than cavity */
  lip: number;
  eyeWhite: number;
  pupil: number;
}

export interface Blob {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  strength: number;
  kind: 'body' | 'appendage';
}

export interface MonsterData {
  seed: string;
  /** Deterministic silly Ukrainian name from seed */
  name: string;
  /** Body archetype used for limbs/face tuning */
  archetype: string;
  particles: Particle[];
  palette: MonsterPalette;
  anim: AnimParams;
  /** Rest mouth pose for talk animation */
  mouthRest: MouthRest;
  /** World size of one particle cell (for crisp rendering) */
  cellSize: number;
  /** Feature scale vs baseline resolution 28 */
  scaleRef: number;
  /** Bounding box in local particle space (pre-scale) */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}
