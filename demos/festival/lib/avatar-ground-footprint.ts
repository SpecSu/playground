import * as THREE from 'three';

/** Rest-pose lower-body footprint; never include a raised arm, prop or large head. */
export function measureAvatarGroundFootprint(model: THREE.Object3D): number {
 model.updateWorldMatrix(true, true);
 const bounds = new THREE.Box3(), point = new THREE.Vector3(), inverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
 const vertices: THREE.Vector3[] = [];
 model.traverseVisible(node => {
  if (!(node instanceof THREE.Mesh)) return;
  const count = node.geometry.getAttribute('position')?.count ?? 0;
  for (let index = 0; index < count; index++) {
   node.getVertexPosition(index, point).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
   bounds.expandByPoint(point); vertices.push(point.clone());
  }
 });
 if (bounds.isEmpty()) return .62;
 const cutoff = bounds.min.y + (bounds.max.y - bounds.min.y) * .2;
 let radius = .18;
 for (const vertex of vertices) if (vertex.y <= cutoff) radius = Math.max(radius, Math.hypot(vertex.x, vertex.z));
 return radius;
}
