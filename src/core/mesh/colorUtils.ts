import { Color } from 'three';

/** Pack 0xRRGGBB → Three.js Color. */
export function rgbToColor(rgb: number): Color {
  return new Color(
    ((rgb >> 16) & 0xff) / 255,
    ((rgb >> 8) & 0xff) / 255,
    (rgb & 0xff) / 255,
  );
}
