import { Box3, Group, PerspectiveCamera, Vector3 } from 'three';

const CENTER = new Vector3();
const SIZE = new Vector3();

/** Shift scene so its bounding-box center sits at the origin. */
export function centerScene(root: Group): void {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;
  box.getCenter(CENTER);
  root.position.sub(CENTER);
  root.updateMatrixWorld(true);
}

/** Position camera to fit the whole scene in view. */
export function frameCamera(
  camera: PerspectiveCamera,
  root: Group,
  aspect: number,
  padding = 1.15,
): void {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;

  box.getSize(SIZE);
  const maxDim = Math.max(SIZE.x, SIZE.y, SIZE.z, 0.01);
  camera.aspect = aspect;
  const fovRad = (camera.fov * Math.PI) / 180;
  const dist = (maxDim / 2 / Math.tan(fovRad / 2)) * padding;
  camera.position.set(0, maxDim * 0.04, dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
