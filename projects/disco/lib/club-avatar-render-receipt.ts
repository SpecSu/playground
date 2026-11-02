import type * as THREE from 'three';
/** Observe real mesh draw calls for one frame, preserving every existing callback. */
export function observeAvatarDraw(root?: THREE.Object3D) {
  let drawn = false;
  const restore: (() => void)[] = [];
  root?.traverseVisible(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const previous = mesh.onAfterRender;
    mesh.onAfterRender = function (...args) {
      previous.apply(this, args);
      drawn = true;
    };
    restore.push(() => { mesh.onAfterRender = previous; });
  });
  return { get drawn() { return drawn; }, restore() { for (const reset of restore) reset(); } };
}
