import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { silhouetteWidthAtY } from '../mesh/bulalashkaSkull';
import type { BulalashkaBodyArchetype, EyePlan, MouthBundle } from '../types';

/** Stable face-zone Y coords derived from skull bounds — single source for eyes/mouth/adornments. */
export interface FaceLandmarks {
  eyeLineY: number;
  noseY: number;
  mouthMidY: number;
  mouthFloorY: number;
  crownY: number;
  faceHeight: number;
  faceTopY: number;
}

/** Peanut/dumbbell pinch score 0..1 — reject below ~0.72. */
export function computeSilhouettePinch(skull: BulalashkaSkull): number {
  const b = skull.bounds;
  const h = Math.max(0.01, b.maxY - b.minY);
  const samples = 9;
  const radii: number[] = [];
  for (let i = 0; i < samples; i++) {
    const y = b.minY + (h * i) / (samples - 1);
    radii.push(silhouetteWidthAtY(skull, y, h * 0.08));
  }
  const mid = radii[Math.floor(samples / 2)] ?? 0.2;
  const top = ((radii[0] ?? 0) + (radii[1] ?? 0)) * 0.5;
  const bot = ((radii[samples - 1] ?? 0) + (radii[samples - 2] ?? 0)) * 0.5;
  const ref = Math.max(0.08, (top + bot) * 0.5);
  return mid / ref;
}

export function computeFaceLandmarks(
  skull: BulalashkaSkull,
  bodyArchetype: BulalashkaBodyArchetype,
  gridMouthFloorY?: number,
): FaceLandmarks {
  const b = skull.bounds;
  const h = b.maxY - b.minY;
  const faceTopY = b.minY + h * (bodyArchetype === 'mushroom_cap' ? 0.52 : 0.38);
  const faceBottomY = b.minY + h * 0.08;
  const faceHeight = Math.max(0.12, faceTopY - faceBottomY);

  const eyeLineY = faceBottomY + faceHeight * (bodyArchetype === 'mushroom_cap' ? 0.72 : 0.68);
  const noseY = faceBottomY + faceHeight * 0.48;
  const mouthMidY = faceBottomY + faceHeight * 0.22;
  const mouthFloorY =
    gridMouthFloorY !== undefined
      ? Math.min(gridMouthFloorY, mouthMidY - faceHeight * 0.06)
      : mouthMidY - faceHeight * 0.08;
  const crownY = b.maxY - h * 0.04;

  return {
    eyeLineY,
    noseY,
    mouthMidY,
    mouthFloorY,
    crownY,
    faceHeight,
    faceTopY,
  };
}

/** Eyes + mouth vertical span vs face zone — target 0.25–0.55 for readable faces. */
export function computeFaceProminence(
  landmarks: FaceLandmarks,
  plans: EyePlan[],
  mouth: MouthBundle,
): number {
  if (plans.length === 0) return 0;
  const eyeYs = plans.map((p) => p.y);
  const eyeSizes = plans.map((p) => p.ry);
  const eyeTop = Math.max(...eyeYs.map((y, i) => y + (eyeSizes[i] ?? 0)));
  const eyeBot = Math.min(...eyeYs.map((y, i) => y - (eyeSizes[i] ?? 0)));
  const mouthTop = mouth.midY + mouth.openUp + 0.02;
  const mouthBot = mouth.midY - mouth.openDown - 0.02;
  const span = Math.max(eyeTop, mouthTop) - Math.min(eyeBot, mouthBot);
  return span / Math.max(0.08, landmarks.faceHeight);
}

/** Pairwise eye ellipse overlap ratio 0..1. */
export function computeEyeOverlap(plans: EyePlan[]): number {
  if (plans.length < 2) return 0;
  let maxOv = 0;
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const a = plans[i]!;
      const b = plans[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const rx = a.rx + b.rx;
      const ry = a.ry + b.ry;
      const nx = dx / Math.max(0.01, rx);
      const ny = dy / Math.max(0.01, ry);
      maxOv = Math.max(maxOv, Math.max(0, 1 - nx * nx - ny * ny));
    }
  }
  return maxOv;
}

/** Cavity recess depth from mouth bundle open amounts. */
export function computeMouthCavityDepth(mouth: MouthBundle): number {
  if (mouth.style === 'closed-line' && !mouth.hasCavity) return 0.01;
  const base = mouth.openUp + mouth.openDown;
  if (mouth.style === 'open-maw') return Math.max(0.04, base);
  if (mouth.style === 'tongue-out') return Math.max(0.03, base * 0.85);
  if (mouth.style === 'zigzag') return Math.max(0.02, base * 0.5);
  return Math.max(0.015, base * 0.6);
}
