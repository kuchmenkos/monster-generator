/** Which side of the bulalashka body a cell belongs to. */
export type SurfaceFacing = 'front' | 'back' | 'side';

/** Meme-style rear-end variant (cartoon, not anatomical). */
export type ButtArchetype =
  | 'peach'
  | 'heart_patch'
  | 'bunny_tail'
  | 'wide_sploot'
  | 'glossy_meme'
  | 'tail_nub'
  | 'duck_round'
  | 'deep_dimple'
  | 'puffy_cloud'
  | 'sparkle_cute';

/** Limbless bulalashka body silhouette. */
export type BulalashkaBodyArchetype =
  | 'pear'
  | 'dumpling'
  | 'teardrop'
  | 'blob'
  | 'egg'
  | 'mushroom_cap';

/** Particle role for shading / animation weighting. */
export type ParticlePart =
  | 'body'
  | 'appendage'
  | 'eye'
  | 'pupil'
  | 'mouth'
  | 'tooth'
  | 'outline'
  | 'aura'
  | 'fleck'
  | 'butt'
  | 'butt_highlight'
  | 'tail';

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
  /** Front / back shell tag for 3D rotation */
  facing?: SurfaceFacing;
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
  facing?: SurfaceFacing;
  mouthRole?: MouthRole;
  isRim?: boolean;
  pupilRange?: { x: number; y: number };
  glow?: boolean;
  /** Voxel grid indices — set for 3D shell cells */
  voxelIx?: number;
  voxelIy?: number;
  voxelIz?: number;
}

/** Projection masks for painting face/butt on a 3D voxel shell. */
export interface FeatureMasks {
  /** col,row → storage key of front-most surface cell */
  front: Map<string, string>;
  /** col,row → storage key of back-most surface cell */
  back: Map<string, string>;
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
  /** Front/back 2D masks built after voxel shell extraction */
  featureMasks?: FeatureMasks;
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
  eyeWhite: number;
  pupil: number;
  /** Cartoon butt base tone */
  buttBase: number;
  /** Heart patch / gloss highlight on rear */
  buttHighlight: number;
  /** Cleft shadow on rear */
  buttShadow: number;
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

/** Eye arrangement on the face plane. */
export type EyeLayout = 'row' | 'ring' | 'cluster' | 'column' | 'scatter';

/** Volumetric eye geometry style (HEADDDS Hx). */
export type EyeStyle = 'ball' | 'cluster' | 'hole' | 'bead' | 'stalk' | 'pit' | 'bulb';

export type PupilShape = 'round' | 'slit' | 'cross' | 'goat';

/** One eye slot after layout + solver. */
export interface EyePlan {
  x: number;
  y: number;
  size: number;
  rx: number;
  ry: number;
  bulge: number;
  stand: number;
  pupilSize: number;
}

export type SkullProfile = 'bighead' | 'pear' | 'teardrop' | 'dumpling';

export interface BulalashkaSkullParams {
  boxiness: number;
  lumpiness: number;
  jawDrop: number;
  scale: number;
  profile: SkullProfile;
}

export interface BulalashkaEyeParams {
  eyeCount: number;
  eyeLayout: EyeLayout;
  eyeStyle: EyeStyle;
  eyeSize: number;
  eyeSpread: number;
  eyeY: number;
  eyeBulge: number;
  eyeLid: number;
  eyeJitter: number;
  pupilShape: PupilShape;
}

/** Quality metrics for test-gen / scorer. */
export interface VolumetricEyeMetrics {
  eyeCount: number;
  avgBulge: number;
  socketDepth: number;
  silhouetteClip: number;
}

export type MouthStyle = 'closed-line' | 'zigzag' | 'open-maw' | 'tongue-out' | 'tiny';
export type LipCurveKind = 'smile' | 'scowl' | 'wave' | 'skew' | 'flat';

export interface MouthBundle {
  style: MouthStyle;
  midX: number;
  midY: number;
  halfW: number;
  openUp: number;
  openDown: number;
  curve: LipCurveKind;
  amp: number;
  skew: number;
  hasCavity: boolean;
}

/** Mesh scene quality metrics. */
export interface MeshBundleMetrics {
  eyeCount: number;
  avgBulge: number;
  socketDepth: number;
  silhouetteClip: number;
  mouthCavity: boolean;
  buttProtrusion: number;
  vertexColorSteps: number;
  patternKind: string;
  hasNose: boolean;
  earCount: number;
  crownCount: number;
  earSilhouetteClip: number;
  sparkleCount: number;
  silhouettePinch: number;
  faceProminence: number;
  mouthCavityDepth: number;
  eyeOverlap: number;
}

/** Stable face-zone anchors for mesh features. */
export interface FaceLandmarks {
  eyeLineY: number;
  noseY: number;
  mouthMidY: number;
  mouthFloorY: number;
  crownY: number;
  faceHeight: number;
  faceTopY: number;
}

export type NoseStyle = 'nostril_slit' | 'stalk' | 'patch_bump' | 'ridge';
export type EarStyle = 'lobe' | 'fin' | 'stub' | 'bar';
export type CrownStyle = 'spikes' | 'sprouts' | 'cloud_puff' | 'straw' | 'crystal';

export interface NosePlan {
  style: NoseStyle;
  x: number;
  y: number;
  size: number;
  tilt: number;
}

export interface EarPlan {
  style: EarStyle;
  side: -1 | 1;
  x: number;
  y: number;
  length: number;
  width: number;
  tipAccent: boolean;
}

export interface CrownPlan {
  style: CrownStyle;
  count: number;
  spread: number;
  height: number;
  sparkle: boolean;
}

export interface SparklePlan {
  count: number;
  radius: number;
  y: number;
}

export interface HeadAdornmentBundle {
  nose: NosePlan;
  ears: EarPlan[];
  crown: CrownPlan;
  sparkles: SparklePlan;
  earSilhouetteClip: number;
}

/** Serializable mesh bundle for Three.js renderer. */
export interface MeshBundle {
  volumetricEyes: VolumetricEyeBundle;
  mouth: MouthBundle;
  adornments: HeadAdornmentBundle;
  landmarks: FaceLandmarks;
  patternKind: string;
  metrics: MeshBundleMetrics;
  variantSeed: string;
}

/** Serializable bundle for Three.js detail renderer. */
export interface VolumetricEyeBundle {
  params: BulalashkaEyeParams;
  skullParams: BulalashkaSkullParams;
  plans: EyePlan[];
  metrics: VolumetricEyeMetrics;
  /** Skull-space floor — eyes stay above mouth */
  mouthFloorY: number;
  /** Candidate variant seed for deterministic rebuild */
  variantSeed: string;
}

export interface MonsterData {
  seed: string;
  /** Deterministic silly Ukrainian name from seed */
  name: string;
  /** Body archetype */
  archetype: string;
  /** Rear-end style variant */
  buttArchetype: ButtArchetype;
  particles: Particle[];
  palette: MonsterPalette;
  anim: AnimParams;
  /** World size of one particle cell (for crisp rendering) */
  cellSize: number;
  /** Feature scale vs baseline resolution 28 */
  scaleRef: number;
  /** Bounding box in local particle space (pre-scale) */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  /** HEADDDS-style mesh bundle — primary visual */
  meshBundle?: MeshBundle;
  /** @deprecated use meshBundle.volumetricEyes */
  volumetricEyes?: VolumetricEyeBundle;
  /** Procedural blob set for mesh skull (same seed variant) */
  blobs?: Blob[];
}

/** Legacy flat grid key (single surface). */
export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Dual-surface grid key — front and back can share col/row. */
export function surfaceCellKey(col: number, row: number, facing: SurfaceFacing): string {
  return `${col},${row}:${facing}`;
}

/** Unique 3D voxel key — no col/row collapse. */
export function voxelKey(ix: number, iy: number, iz: number): string {
  return `v:${ix},${iy},${iz}`;
}
