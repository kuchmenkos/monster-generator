import { Group, Mesh, SphereGeometry } from 'three';
import type { BulalashkaSkull } from './bulalashkaSkull';
import type { BulalashkaMaterials } from './materials';
import type { ButtArchetype, MonsterPalette } from '../types';
import { lighten } from '../palette';

/** Rear butt shelf as mesh protrusion — replaces grid butt painting in mesh view. */
export function buildMeshButt(
  skull: BulalashkaSkull,
  archetype: ButtArchetype,
  palette: MonsterPalette,
  materials: BulalashkaMaterials,
): { group: Group; protrusion: number } {
  const group = new Group();
  group.name = 'butt';

  const b = skull.bounds;
  const rearZ = b.minZ;
  let rx = 0.22;
  let ry = 0.18;
  let rz = 0.16;
  let cy = (b.minY + b.maxY) * 0.35;

  switch (archetype) {
    case 'wide_sploot':
    case 'duck_round':
      rx = 0.32;
      ry = 0.14;
      rz = 0.22;
      break;
    case 'puffy_cloud':
      rx = 0.26;
      ry = 0.24;
      rz = 0.2;
      break;
    case 'bunny_tail':
    case 'tail_nub':
      rx = 0.08;
      ry = 0.08;
      rz = 0.1;
      cy = b.minY + (b.maxY - b.minY) * 0.55;
      break;
    case 'heart_patch':
      rx = 0.2;
      ry = 0.2;
      break;
    default:
      break;
  }

  const buttMat = materials.skin.clone();
  buttMat.color.setHex(palette.buttBase);
  const shelf = new Mesh(new SphereGeometry(1, 12, 10), buttMat);
  shelf.scale.set(rx, ry, rz);
  shelf.position.set(0, cy, rearZ - rz * 0.55);
  group.add(shelf);

  const hiMat = materials.skin.clone();
  hiMat.color.setHex(lighten(palette.buttHighlight, 0.08));
  const highlight = new Mesh(new SphereGeometry(0.06, 8, 6), hiMat);
  highlight.position.set(0, cy + ry * 0.35, rearZ - rz * 0.2);
  group.add(highlight);

  const protrusion = Math.abs(rearZ - (rearZ - rz * 0.55)) + rz;
  return { group, protrusion };
}
