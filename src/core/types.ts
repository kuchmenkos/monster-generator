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

/** Jaw groups for static mouth layout: upper, cavity, lower, tongue. */
export type MouthRole = 'upper' | 'cavity' | 'lower' | 'tongue';

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
  /** Mouth jaw piece for static layout */
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
  /** Lip rim — slightly distinct from cavity */
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

/** Core temperament — drives speech packs and anim bias. */
export type PersonalityVibe =
  | 'cheerful'
  | 'grumpy'
  | 'anxious'
  | 'smug'
  | 'naive'
  | 'fierce'
  | 'sleepy'
  | 'dramatic';

/** Discrete flavor tag — audible in word choice. */
export type PersonalityQuirk =
  | 'alwaysHungry'
  | 'nameDropper'
  | 'whispers'
  | 'yells'
  | 'philosopher'
  | 'giggler'
  | 'complainer'
  | 'poet'
  | 'glitchTalk'
  | 'softie'
  | 'toughGuy'
  | 'echoes';

export interface VoiceHints {
  /** Relative TTS pitch bias ~ -1..1 */
  pitch: number;
  /** Speech rate bias ~ 0.7..1.4 */
  rate: number;
  /** Energy / volume feel 0..1 */
  energy: number;
  pauseStyle: 'short' | 'normal' | 'long' | 'stutter';
}

/** Respeecher sampling overrides (optional until TTS demo fills them). */
export interface SamplingParams {
  temperature?: number;
  top_p?: number;
  repetition_penalty?: number;
  seed?: number;
}

export interface VoiceProfile extends VoiceHints {
  voiceId?: string;
  fxPresetId?: string;
  sampling?: SamplingParams;
}

export interface MonsterPersonality {
  vibe: PersonalityVibe;
  energy: number;
  warmth: number;
  boldness: number;
  verbosity: number;
  quirk: PersonalityQuirk;
  voice: VoiceProfile;
  /** Short UA label, e.g. «сонний драматик» */
  label: string;
}

/** Catalog trait used in TTS demo (strength / weakness / speech style / fx). */
export interface Trait {
  id: string;
  label: string;
  labelUk: string;
  description: string;
}

export type VoiceFxPresetId =
  | 'deepCave'
  | 'chipmunkInverse'
  | 'underwater'
  | 'radioStatic'
  | 'demonGrowl'
  | 'echoHall'
  | 'telephone'
  | 'bitcrushed'
  | 'reverseReverbTail'
  | 'megaphone'
  | 'hollowPipe'
  | 'wetMouth'
  | 'rustyRobot'
  | 'windTunnel'
  | 'cathedral'
  | 'vinylCrackle'
  | 'phaseShift'
  | 'subBassBoost'
  | 'nasalPinch'
  | 'alienChorus';

export interface MonsterData {
  seed: string;
  /** Deterministic rap stage name from seed */
  name: string;
  /** Body archetype used for limbs/face tuning */
  archetype: string;
  particles: Particle[];
  palette: MonsterPalette;
  anim: AnimParams;
  personality: MonsterPersonality;
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
