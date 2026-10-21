import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDesertSandHaze } from '../src/desert/sand-haze.ts';

test('sand haze has one bounded deterministic instanced draw without textures or shadows', () => {
 const a = createDesertSandHaze(), b = createDesertSandHaze();
 assert.equal(a.root.children.length, 1);
 const mesh = a.root.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
 const other = b.root.children[0] as typeof mesh;
 assert.equal(mesh.geometry.instanceCount, 46);
 assert.equal(mesh.geometry.getAttribute('position').count, 4);
 assert.equal(mesh.castShadow, false);
 assert.equal(mesh.receiveShadow, false);
 assert.equal(mesh.material.depthTest, true);
 assert.equal(mesh.material.depthWrite, false);
 assert.equal(mesh.material.transparent, true);
 assert.equal(mesh.material.uniforms.maxOpacity.value, .065);
 assert.deepEqual(mesh.geometry.getAttribute('aSeed').array, other.geometry.getAttribute('aSeed').array);
 const seeds = mesh.geometry.getAttribute('aSeed');
 for (let i = 0; i < seeds.count; i++) {
  assert.ok(Math.abs(seeds.getX(i)) <= 150);
  assert.ok(seeds.getY(i) >= .25 && seeds.getY(i) <= 8);
  assert.ok(Math.abs(seeds.getZ(i)) <= 150);
 }
 a.dispose(); b.dispose();
});

test('sand haze updates only time, freezes reduced motion, and rejects invalid time', () => {
 const haze = createDesertSandHaze();
 const mesh = haze.root.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
 haze.update(42, false); assert.equal(mesh.material.uniforms.time.value, 42);
 haze.update(500, true); assert.equal(mesh.material.uniforms.time.value, 0);
 haze.update(Number.NaN, false); assert.equal(mesh.material.uniforms.time.value, 0);
 haze.update(-5, false); assert.equal(mesh.material.uniforms.time.value, 0);
 haze.dispose();
});

test('sand haze releases GPU resources exactly once and detaches from its scene', () => {
 const haze = createDesertSandHaze(), scene = new THREE.Scene(); scene.add(haze.root);
 const mesh = haze.root.children[0] as THREE.Mesh;
 let geometryDisposals = 0, materialDisposals = 0;
 mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
 (mesh.material as THREE.Material).addEventListener('dispose', () => materialDisposals++);
 haze.dispose(); haze.dispose(); haze.update(5, false);
 assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
 assert.equal(haze.root.parent, null);
});
