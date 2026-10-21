import * as THREE from 'three';

type PackedAttribute = { array: THREE.TypedArray; itemSize: number; normalized: boolean; stride?: number; offset?: number };
type PackedMesh = {
  name: string; position: PackedAttribute; index?: PackedAttribute; transform: number[];
  skinIndex?: PackedAttribute; skinWeight?: PackedAttribute; bind?: number[]; bindInverse?: number[];
  bones?: number[][]; inverses?: number[][]; morph?: PackedAttribute[]; influences?: number[]; relative?: boolean;
};
export type FishingMeshSnapshot = PackedMesh[];
export type FishingExpandedGeometry = { triangles: THREE.Triangle[]; supportTriangles: THREE.Triangle[]; points: THREE.Vector3[]; componentPoints: THREE.Vector3[]; bounds: THREE.Box3 };
function pack(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): PackedAttribute {
  if (attribute instanceof THREE.InterleavedBufferAttribute) return { array: attribute.data.array.slice(), itemSize: attribute.itemSize, normalized: attribute.normalized, stride: attribute.data.stride, offset: attribute.offset };
  return { array: attribute.array.slice(), itemSize: attribute.itemSize, normalized: attribute.normalized };
}
function unpack(attribute: PackedAttribute) {
  return attribute.stride === undefined ? new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized)
    : new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(attribute.array, attribute.stride), attribute.itemSize, attribute.offset!, attribute.normalized);
}
function localTransform(root: THREE.Group, mode: 'avatar' | 'catch') {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  return mode === 'avatar' ? inverse : new THREE.Matrix4().compose(new THREE.Vector3(), root.quaternion, root.scale).multiply(inverse);
}
/** Copies buffer storage and frozen matrices, never skins the full model on the UI thread. */
export function captureFishingMeshSnapshot(root: THREE.Group, mode: 'avatar' | 'catch'): FishingMeshSnapshot {
  const basis = localTransform(root, mode), meshes: FishingMeshSnapshot = [];
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || (mode === 'avatar' && !(node instanceof THREE.SkinnedMesh))) return;
    const geometry = node.geometry, position = geometry.getAttribute('position'); if (!position) return;
    const record: PackedMesh = { name: node.name, position: pack(position), transform: new THREE.Matrix4().multiplyMatrices(basis, node.matrixWorld).toArray() };
    if (geometry.index) record.index = pack(geometry.index);
    if (node instanceof THREE.SkinnedMesh) {
      record.skinIndex = pack(geometry.getAttribute('skinIndex')); record.skinWeight = pack(geometry.getAttribute('skinWeight'));
      record.bind = Array.from(node.bindMatrix.elements); record.bindInverse = Array.from(node.bindMatrixInverse.elements);
      record.bones = node.skeleton.bones.map(bone => bone.matrixWorld.toArray()); record.inverses = node.skeleton.boneInverses.map(matrix => matrix.toArray());
      record.morph = geometry.morphAttributes.position?.map(pack); record.influences = node.morphTargetInfluences?.slice(); record.relative = geometry.morphTargetsRelative;
    }
    meshes.push(record);
  });
  return meshes;
}
/** Expansion is resumable both in the Worker and in the cooperative fallback. */
export function* expandFishingMeshSnapshot(snapshot: FishingMeshSnapshot): Generator<void, FishingExpandedGeometry> {
  const triangles: THREE.Triangle[] = [], supportTriangles: THREE.Triangle[] = [], points: THREE.Vector3[] = [], componentPoints: THREE.Vector3[] = [], bounds = new THREE.Box3();
  for (const record of snapshot) {
    const position = unpack(record.position), index = record.index ? unpack(record.index) : undefined, transform = new THREE.Matrix4().fromArray(record.transform);
    let mesh: THREE.SkinnedMesh | undefined;
    if (record.bones) {
      const geometry = new THREE.BufferGeometry().setAttribute('position', position).setAttribute('skinIndex', unpack(record.skinIndex!)).setAttribute('skinWeight', unpack(record.skinWeight!));
      if (record.morph) geometry.morphAttributes.position = record.morph.map(unpack);
      geometry.morphTargetsRelative = record.relative ?? false;
      mesh = new THREE.SkinnedMesh(geometry);
      const bones = record.bones.map(elements => { const bone = new THREE.Bone(); bone.matrixWorld.fromArray(elements); return bone; });
      mesh.skeleton = new THREE.Skeleton(bones, record.inverses!.map(elements => new THREE.Matrix4().fromArray(elements)));
      mesh.bindMatrix.fromArray(record.bind!); mesh.bindMatrixInverse.fromArray(record.bindInverse!); mesh.morphTargetInfluences = record.influences;
    }
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      const point = mesh ? mesh.getVertexPosition(i, new THREE.Vector3()) : new THREE.Vector3().fromBufferAttribute(position, i);
      point.applyMatrix4(transform); vertices.push(point); points.push(point); bounds.expandByPoint(point);
      if ((i & 127) === 127) yield;
    }
    if (vertices.length) componentPoints.push(vertices[0]);
    const support = /body|mantle|wing-(?:top|belly)/.test(record.name);
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const triangle = new THREE.Triangle(vertices[index ? index.getX(i) : i], vertices[index ? index.getX(i + 1) : i + 1], vertices[index ? index.getX(i + 2) : i + 2]);
      triangles.push(triangle); if (support) supportTriangles.push(triangle);
      if (i % 384 === 0) yield;
    }
    mesh?.geometry.dispose();
  }
  return { triangles, supportTriangles, points, componentPoints, bounds };
}
/** Exact marine vertex bounds only: no contact grids, BVH or layout search. */
export function measureFishingCatchBounds(root: THREE.Group) {
  const basis = localTransform(root, 'catch'), transform = new THREE.Matrix4(), point = new THREE.Vector3(), bounds = new THREE.Box3();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    transform.multiplyMatrices(basis, node.matrixWorld); const attribute = node.geometry.getAttribute('position');
    for (let i = 0; i < attribute.count; i++) bounds.expandByPoint(point.fromBufferAttribute(attribute, i).applyMatrix4(transform));
  });
  return bounds;
}
