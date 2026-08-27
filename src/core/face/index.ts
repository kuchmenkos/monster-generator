/** boolala.boo face feature module. */
export { applyFace } from './applyFace';
export {
  PARTICLE_BUDGET,
  countFloatingFaceParticles,
  enforceParticleBudget,
  pruneFloatingFeatures,
  pruneOrphanFlecks,
  stripBottomAppendages,
  stripFloatingFaceParticles,
} from './quality';
export type { FacePreset } from './composition';
export type {
  AccentStyle,
  BrowStyle,
  EarStyle,
  EyeArchetype,
  EyeShape,
  EyeSlot,
  HairStyle,
  LashStyle,
  LidStyle,
  LipCurveKind,
  MouthStyle,
  MustacheStyle,
  NoseStyle,
  ToothStyle,
} from './types';
