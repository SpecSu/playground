import * as THREE from 'three';

/** A crisp ground footprint rendered above obstacles, using the caller's actual placement result. */
export function createPlacementPreview() {
 const root = new THREE.Group();
 root.name = 'free-placement-preview';
 root.visible = false;
 const material = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({
  color, opacity, transparent: true, depthWrite: false, depthTest: false,
  toneMapped: false, fog: false, side: THREE.DoubleSide,
 });
 const fill = new THREE.Mesh(new THREE.CircleGeometry(.86, 96), material(0xff202b, .12));
 const outline = new THREE.Mesh(new THREE.RingGeometry(.83, 1.035, 96), material(0x111916));
 const ring = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 96), material(0xff202b));
 // Keep all layers in the transparent pass, but with opaque perimeter pixels.
 // Explicit ordering and disabled depth tests preserve the warning over tall obstructions.
 for (const [index, mesh] of [fill, outline, ring].entries()) {
  mesh.name = ['placement-fill', 'placement-outline', 'placement-ring'][index];
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 100 + index;
  root.add(mesh);
 }
 return {
  root,
  setValid(valid: boolean) {
   const color = valid ? 0x00ee55 : 0xff202b;
   ring.material.color.setHex(color);
   fill.material.color.setHex(color);
  },
  dispose() {
   for (const mesh of [fill, outline, ring]) { mesh.geometry.dispose(); mesh.material.dispose(); }
   root.removeFromParent();
  },
 };
}
