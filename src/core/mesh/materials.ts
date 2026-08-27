import {
  BackSide,
  CanvasTexture,
  MeshToonMaterial,
  NearestFilter,
  type Material,
} from 'three';
import { darken } from '../palette';
import type { MonsterPalette } from '../types';
import { rgbToColor } from './colorUtils';

let gradientMap: CanvasTexture | null = null;

/** 4-step toon ramp — port Gy() gradientMap. */
function getGradientMap(): CanvasTexture {
  if (gradientMap) return gradientMap;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const stops = ['#444444', '#888888', '#bbbbbb', '#ffffff'];
  for (let i = 0; i < stops.length; i++) {
    ctx.fillStyle = stops[i]!;
    ctx.fillRect(i, 0, 1, 1);
  }
  gradientMap = new CanvasTexture(canvas);
  gradientMap.minFilter = NearestFilter;
  gradientMap.magFilter = NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export interface BulalashkaMaterials {
  skin: MeshToonMaterial;
  socket: MeshToonMaterial;
  eye: MeshToonMaterial;
  pupil: MeshToonMaterial;
  outline: MeshToonMaterial;
}

/** Toon materials for skull + eye assembly. */
export function createBulalashkaMaterials(palette: MonsterPalette): BulalashkaMaterials {
  const map = getGradientMap();
  const skin = new MeshToonMaterial({
    color: rgbToColor(palette.base),
    gradientMap: map,
  });
  const socket = new MeshToonMaterial({
    color: rgbToColor(darken(palette.base, 0.45)),
    gradientMap: map,
  });
  const eye = new MeshToonMaterial({
    color: rgbToColor(palette.eyeWhite),
    gradientMap: map,
  });
  const pupil = new MeshToonMaterial({
    color: rgbToColor(palette.pupil),
    gradientMap: map,
  });
  const outline = new MeshToonMaterial({
    color: rgbToColor(palette.outline),
    gradientMap: map,
    side: BackSide,
  });
  return { skin, socket, eye, pupil, outline };
}

export function disposeMaterials(mats: BulalashkaMaterials): void {
  for (const m of Object.values(mats) as Material[]) {
    m.dispose();
  }
}
