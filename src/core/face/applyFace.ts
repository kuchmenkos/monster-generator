import type { Rng } from '../rng';
import type { MonsterGrid, MonsterPalette } from '../types';
import { paintAccents } from './accents';
import { paintBrows } from './brows';
import {
  buildEyeSlots,
  layoutFace,
  rollFaceRecipe,
} from './composition';
import { paintFacialEars } from './ears';
import { paintEyeShaped } from './eyes';
import { paintHair } from './hair';
import { paintLashes } from './lashes';
import { paintLids } from './lids';
import { paintMouthFromCurve } from './mouth';
import { paintMustache } from './mustache';
import { paintNose } from './nose';
import { pruneDetachedAppendages, pruneFloatingFeatures, pruneOffSilhouetteFace, pruneOrphanFlecks, stripBottomAppendages } from './quality';

/**
 * boolala.boo face pipeline:
 * eyes → lids → lashes → brows → nose → mouth → mustache → ears → accents → hair.
 */
export function applyFace(
  rng: Rng,
  grid: MonsterGrid,
  palette: MonsterPalette,
  bodyArchetype = 'blob',
): void {
  const layout = layoutFace(grid, rng);
  if (!layout) return;

  const recipe = rollFaceRecipe(rng, bodyArchetype);
  const { midC, faceW, faceH, mouthBandR, noseR, base, eyeBandR } = layout;

  const eyes = buildEyeSlots(grid, layout, recipe, rng);
  if (eyes.length === 0) return;

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
      1,
      recipe.eyeArchetype === 'cyclops-giant' ? palette.accent : undefined,
      e.side,
    );
  }

  const lowestEye = Math.min(...eyes.map((e) => e.y));

  // Lids before brows so brows sit on real lids, not empty space
  if (recipe.doLids) paintLids(grid, rng, palette, eyes, base, recipe.lidStyle);
  if (recipe.lashStyle) paintLashes(grid, rng, palette, eyes, base, recipe.lashStyle);
  if (recipe.doBrows) paintBrows(grid, rng, palette, eyes, base, recipe.browStyle);

  if (recipe.noseStyle) {
    paintNose(grid, rng, palette, midC, noseR, base, recipe.noseStyle);
  }

  const faceHalf = Math.max(3, Math.floor(faceW * 0.5));
  paintMouthFromCurve(
    grid,
    rng,
    palette,
    midC,
    mouthBandR,
    faceHalf,
    base,
    faceH,
    lowestEye,
    {
      style: recipe.mouthStyle,
      toothStyle: recipe.toothStyle,
      minHalfW: Math.max(2, Math.floor(faceW * 0.12)),
    },
  );

  // Mustache after mouth — protected write won't clobber lips
  if (recipe.mustacheStyle) {
    paintMustache(grid, rng, palette, midC, noseR, mouthBandR, base, recipe.mustacheStyle);
  }

  if (recipe.earStyle) {
    paintFacialEars(grid, rng, palette, midC, eyeBandR, faceW, base, recipe.earStyle);
  }

  if (recipe.doAccents) paintAccents(grid, rng, palette, midC, eyeBandR - 1, faceW, faceH, base);

  if (recipe.hairStyle) {
    paintHair(grid, rng, palette, base, recipe.hairStyle);
  }

  pruneFloatingFeatures(grid);
  pruneOffSilhouetteFace(grid);
  pruneOrphanFlecks(grid);
  stripBottomAppendages(grid);
  pruneDetachedAppendages(grid);
}
