import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';

const APPROVED_SHA256 = '990b964e2bffcd3597d6169a5bbaf7cff1a97a7d194af296d3fcdd7a15b59e2e';
const asset = new URL('../public/avatars/human-subeike.glb', import.meta.url);
const manifest = new URL('../public/avatars/manifest.json', import.meta.url);
async function template() {
  const bytes = readFileSync(asset);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

test('shipping Subeike is the verified rounded-cast sculpt revision', () => {
  const bytes = readFileSync(asset);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), APPROVED_SHA256);
  const entry = JSON.parse(readFileSync(manifest, 'utf8')).avatars.find((item) => item.kind === 'human-subeike');
  assert.equal(entry.sha256, APPROVED_SHA256);
  assert.equal(entry.bytes, bytes.byteLength);
  assert.equal(entry.revision, 'rounded-cast-v2');
});

test('rounded Subeike metadata describes its actual four-material geometry', async () => {
  const scene = await template();
  const entry = JSON.parse(readFileSync(manifest, 'utf8')).avatars.find((item) => item.kind === 'human-subeike');
  let triangles = 0;
  const materials = [];
  scene.traverse((node) => {
    if (!node.isMesh) return;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    materials.push(...(Array.isArray(node.material) ? node.material : [node.material]));
  });
  assert.equal(triangles, 22864);
  assert.equal(entry.triangles, triangles);
  assert.equal(materials.length, 4);
  assert.equal(entry.materialGroups, materials.length);
  assert.ok(new Set(materials.map((material) => material.roughness)).size >= 3, 'skin, hair and clothes retain distinct finishes');
  assert.ok(materials.every((material) => !material.transparent && !material.map), 'original opaque vertex-colored geometry does not need external textures');
});

test('approved Subeike stays finite under current high-energy actions and returns to its stable rest shape', async () => {
  const avatar = createClubAvatar('human-subeike', 'approved-model-motion', { template: await template() });
  const meshes = [];
  avatar.root.traverse((node) => { if (node.isSkinnedMesh) meshes.push(node); });
  const point = new Vector3();
  try {
    avatar.update(0, 'dance', true, 1);
    avatar.root.updateMatrixWorld(true);
    const rest = new Box3().setFromObject(avatar.root);
    for (const action of ['dance', 'bounce', 'wave', 'spin']) {
      for (let beat = 0; beat <= 8; beat += 0.25) {
        avatar.update(beat, action, false, 1);
        avatar.root.updateMatrixWorld(true);
        for (const mesh of meshes) {
          mesh.skeleton.update();
          for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 137) {
            mesh.getVertexPosition(vertex, point);
            mesh.localToWorld(point);
            assert.ok(point.toArray().every(Number.isFinite), `${action} ${beat}: skin is finite`);
            assert.ok(point.length() < 4, `${action} ${beat}: no explosive skin deformation`);
          }
        }
      }
    }
    avatar.update(31.7, 'spin', true, 1);
    avatar.root.updateMatrixWorld(true);
    for (const mesh of meshes) mesh.skeleton.update();
    const reset = new Box3().setFromObject(avatar.root);
    assert.ok(reset.min.distanceTo(rest.min) < 1e-5 && reset.max.distanceTo(rest.max) < 1e-5, 'reduced motion restores the approved neutral silhouette');
  } finally {
    avatar.dispose();
  }
});
