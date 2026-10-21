import * as THREE from 'three';
import type { CelebrationPhoto } from '../../lib/celebration-photo.ts';

type CaptureRenderer = Pick<THREE.WebGLRenderer, 'domElement' | 'getPixelRatio' | 'getViewport' | 'render'> & {
 setViewport(x: THREE.Vector4 | number, y?: number, width?: number, height?: number): unknown;
};

/**
 * Called synchronously inside RAF. A one-off square overview is copied before
 * WebGL discards its drawing buffer, then the live camera/viewport is restored
 * before the browser paints. No permanent preserveDrawingBuffer or fake image.
 */
export function captureFestivalCeremonyPhoto(renderer: CaptureRenderer, scene: THREE.Scene, liveCamera: THREE.Camera, roundIndex: number, capturedAt: number): CelebrationPhoto | null {
 const source = renderer.domElement, side = Math.min(source.width, source.height);
 if (side < 1 || typeof document === 'undefined') return null;
 const viewport = renderer.getViewport(new THREE.Vector4());
 const transientVisibility: [THREE.Object3D, boolean][] = [];
 const camera = new THREE.PerspectiveCamera(55, 1, .25, 1600);
 camera.position.set(62, 84, 104); camera.lookAt(0, 13, 0); camera.updateMatrixWorld();
 try {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.min(1600, side);
  const context = canvas.getContext('2d'); if (!context) return null;
  // Speech/emoji and the personal selection ring are live-only UI. Preserve every original
  // visibility value, including already hidden bubbles, for the live repaint.
  scene.traverse(node => {
   if (node.userData.festivalSpeechBubble === true || node.userData.festivalSelfMarker === true) {
    transientVisibility.push([node, node.visible]); node.visible = false;
   }
  });
  const logicalSide = side / renderer.getPixelRatio(); renderer.setViewport(0, 0, logicalSide, logicalSide);
  renderer.render(scene, camera);
  context.drawImage(source, 0, source.height - side, side, side, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', .92);
  return dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length > 24 ? { roundIndex, dataUrl, capturedAt } : null;
 } catch {
  // Security errors, context loss and image-encoding failures never create a
  // placeholder photograph or interrupt the still-running festival.
  return null;
 } finally {
  for (const [node, visible] of transientVisibility) node.visible = visible;
  renderer.setViewport(viewport); renderer.render(scene, liveCamera);
 }
}
