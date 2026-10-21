import * as THREE from 'three';

export interface FestivalSelfMarkerState {
 self: { id: string; role: string } | null | undefined;
 participant: { id: string; joinedAt: number; lastSeenAt: number; ambient?: boolean } | null | undefined;
 connected: boolean; now: number; x: number; z: number; groundY: number;
 footprintRadius: number; viewportHeight: number; camera: THREE.Camera;
}

/** A single, scene-owned ground decal. It never follows an animated avatar node. */
export function createFestivalSelfMarker() {
 const root = new THREE.Group(); root.name = 'festival-self-marker'; root.visible = false; root.userData.festivalSelfMarker = true;
 const material = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, fog: false, side: THREE.DoubleSide });
 const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 96), material(0xffe600, .10)); fill.name = 'self-marker-fill';
 const edge = new THREE.Mesh(new THREE.RingGeometry(.89, 1, 96), material(0x514300, .78)); edge.name = 'self-marker-edge';
 const ring = new THREE.Mesh(new THREE.RingGeometry(.92, .98, 96), material(0xffe600, .98)); ring.name = 'self-marker-ring';
 const halo = new THREE.Mesh(new THREE.RingGeometry(.98, 1.12, 96), material(0xffe600, .12)); halo.name = 'self-marker-halo';
 const meshes = [fill, halo, edge, ring];
 meshes.forEach((mesh, index) => { mesh.rotation.x = -Math.PI / 2; mesh.position.y = index * .001; mesh.renderOrder = 6 + index; root.add(mesh); });
 const point = new THREE.Vector3();
 const angles = Array.from({length:97}, (_, index) => index / 96 * Math.PI * 2);
 const setBand = (mesh: THREE.Mesh<THREE.RingGeometry>, inner: number, outer: number) => {
  const positions = mesh.geometry.getAttribute('position');
  for (let band = 0; band < 2; band++) for (let index = 0; index <= 96; index++) {
   const radius = band === 0 ? inner : outer;
   positions.setXY(band * 97 + index, Math.cos(angles[index]) * radius, Math.sin(angles[index]) * radius);
  }
  positions.needsUpdate = true;
 };

 let disposed = false;
 return {
  root,
  update(state: FestivalSelfMarkerState) {
   const { self, participant, connected, now, x, z, groundY, footprintRadius, viewportHeight, camera } = state;
   root.visible = !disposed && connected && self?.role === 'participant' && !!self.id && participant?.id === self.id && !participant.ambient && !participant.id.startsWith('ambient:') && now - participant.lastSeenAt < 60_000 && [x, z, groundY, footprintRadius].every(Number.isFinite);
   if (!root.visible) return;
   root.position.set(x, groundY + .12, z);
   // Keep the true feet footprint near the camera and at least a 32px diameter
   // in distant views. The decal remains ground-anchored above road overlays.
   camera.updateMatrixWorld(); point.set(x, groundY, z).applyMatrix4(camera.matrixWorldInverse);
   const pixelsPerUnit = Math.max(.001, viewportHeight * camera.projectionMatrix.elements[5] / (2 * Math.max(.1, -point.z)));
   const natural = Math.max(footprintRadius + .18, .55);
   const radius = Math.max(16.25 / pixelsPerUnit, natural);
   root.scale.setScalar(radius);
   // Keep a substantial yellow band even when the ground footprint is tiny.
   const thickness = THREE.MathUtils.clamp(2.75 / (radius * pixelsPerUnit), .018, .18);
   const border = THREE.MathUtils.clamp(.55 / (radius * pixelsPerUnit), .008, .05);
   setBand(ring, .985 - thickness, .985);
   setBand(edge, Math.max(.6, .985 - thickness - border), 1);
   setBand(halo, .985, 1 + Math.min(.12, 1.5 / (radius * pixelsPerUnit)));

  },
  dispose() {
   if (disposed) return; disposed = true; root.visible = false; root.removeFromParent();
   meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); }); root.clear();
  },
 };
}
