import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const UPLOADED_CAST = ['milk-frog', 'niulai', 'feidudu', 'miaocuijiao', 'banana-cat', 'sword-shield-dog', 'human-lx', 'human-kelly', 'human-bear', 'human-subeike', 'human-jiji', 'human-jiaxin'] as const;
export const EXPECTED_HEIGHTS = [1.25, 1.5, 1.25, 1.125, 1.5, .95, 1.45, 1.45, 1.45, 1.45, 1.45, 1.45];

/** Node-only geometry tests retain full meshes, skin and joints; pixels are checked offline. */
export async function uploadedTemplate(kind: string): Promise<THREE.Group> {
  const bytes = readFileSync(new URL(`../../public/avatars/cast-v1/${kind}.glb`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'TEST_ONLY_NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

export function actualBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.update(); });
  const bounds = new THREE.Box3(); const point = new THREE.Vector3();
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld); bounds.expandByPoint(point);
    }
  });
  return bounds;
}

export function boneState(root: THREE.Object3D): number[] {
  const values: number[] = [];
  root.traverse(node => { if (node instanceof THREE.Bone) values.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()); });
  return values;
}
