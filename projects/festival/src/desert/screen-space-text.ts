import * as THREE from 'three';

/**
 * Match projected DOM labels while retaining the text in WebGL photo captures.
 * Dimensions are logical CSS pixels, never drawing-buffer pixels. The active
 * render camera/viewport is used, including the one-off square photo camera.
 */
export function configureScreenSpaceText(sprite: THREE.Sprite, width: number, height: number, bottomOffset = 0): void {
 sprite.material.sizeAttenuation = false;
 sprite.frustumCulled = false;
 sprite.center.set(.5, -bottomOffset / height);
 sprite.userData.screenSpaceText = { width, height, bottomOffset };
 const viewport = new THREE.Vector4();
 sprite.onBeforeRender = (renderer, _scene, camera) => {
  renderer.getViewport(viewport);
  if (viewport.z <= 0 || viewport.w <= 0) return;
  const projection = camera.projectionMatrix.elements;
  // Sprite's non-attenuated shader cancels perspective depth; compensate the
  // remaining projection and viewport factors so FOV/zoom/resizing cancel too.
  sprite.scale.set(2 * width / (viewport.z * projection[0]), 2 * height / (viewport.w * projection[5]), 1);
  // WebGLRenderer has already updated scene matrices before onBeforeRender.
  sprite.updateMatrixWorld();
 };
}
