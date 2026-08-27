export { applyFace } from './applyFace';
export {
  PARTICLE_BUDGET,
  countFloatingFaceParticles,
  enforceParticleBudget,
  pruneFloatingFeatures,
  pruneOffSilhouetteFace,
  pruneOrphanFlecks,
  stripBottomAppendages,
  stripFloatingFaceParticles,
} from './quality';
export {
  auditIntegrity,
  countEyeLattice,
  countFloatingBrow,
  countHairOverEye,
  countLashInEye,
  countLidOffEye,
  countMustacheOnMouth,
  countOrphanLashEar,
  countSilhouetteLeak,
  sumDefects,
} from './integrity';
export type { IntegrityReport } from './integrity';
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
