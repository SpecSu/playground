import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { INSTALLATION_DESIGNS, createInstallation, disposeInstallation } from '../src/desert/installations.ts';
import { INSTALLATION_FOOTPRINT_RADII, INSTALLATION_HEIGHTS } from '../src/desert/art-dimensions.ts';

function meshes(group: THREE.Group) {
  const result: THREE.Mesh[] = [];
  group.traverse((object) => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

function signature(group: THREE.Group) {
  group.updateMatrixWorld(true);
  return meshes(group).map((mesh) => {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    return [mesh.geometry.type, mesh.geometry.getAttribute('position').count,
      ...mesh.matrixWorld.elements.map((value) => Math.round(value * 10000) / 10000),
      Array.from(mesh.geometry.getAttribute('position').array, (value) => Math.round(value * 10000) / 10000),
      material instanceof THREE.MeshStandardMaterial ? material.color.getHex() : 0];
  });
}

test('the catalog has twelve stable, distinct and complete installation designs', () => {
  assert.equal(INSTALLATION_DESIGNS.length, 12);
  assert.equal(new Set(INSTALLATION_DESIGNS.map((design) => design.id)).size, 12);
  assert.equal(new Set(INSTALLATION_DESIGNS.map((design) => design.name)).size, 12);
  for (const design of INSTALLATION_DESIGNS) {
    assert.match(design.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(design.name && design.subtitle && design.icon);
    assert.match(design.color, /^#[a-fA-F0-9]{6}$/);
  }
});

for (let kind = 0; kind < 12; kind++) {
  test(`installation ${kind} is grounded, monumental, finite and inside its shared placement footprint`, () => {
    for (const seed of [0, 7, 2147483647]) {
      const group = createInstallation(kind, seed);
      const objects = meshes(group);
      assert.ok(objects.length >= 3 && objects.length <= 12, `${objects.length} meshes`);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group, true);
      const height = box.max.y - box.min.y;
      assert.ok(Math.abs(box.min.y) < 0.001, `ground: ${box.min.y}`);
      assert.ok(Math.abs(height - INSTALLATION_HEIGHTS[kind]) < 0.001, `height: ${height}`);
      let triangles = 0;
      for (const mesh of objects) {
        const position = mesh.geometry.getAttribute('position');
        triangles += (mesh.geometry.index?.count ?? position.count) / 3;
        for (let i = 0; i < position.count; i++) {
          const vertex = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(Number.isFinite(vertex.x + vertex.y + vertex.z));
          assert.ok(Math.hypot(vertex.x, vertex.z) <= INSTALLATION_FOOTPRINT_RADII[kind] + 0.001, `radius: ${Math.hypot(vertex.x, vertex.z)}`);
        }
      }
      assert.ok(triangles <= 18000, `${triangles} triangles`);
      disposeInstallation(group);
    }
  });
}

test('the same seed builds reproducible meshes while seeds alter details', () => {
  for (let kind = 0; kind < 12; kind++) {
    const a = createInstallation(kind, 23);
    const b = createInstallation(kind, 23);
    const c = createInstallation(kind, 79);
    assert.deepEqual(signature(a), signature(b));
    assert.notDeepEqual(signature(a), signature(c), `kind ${kind} should use its seed`);
    disposeInstallation(a); disposeInstallation(b); disposeInstallation(c);
  }
});

test('burning one sculpture cannot recolor another instance', () => {
  const first = createInstallation(0, 1);
  const second = createInstallation(0, 1);
  const materials = new Set(meshes(first).flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  for (const mesh of meshes(second)) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) assert.ok(!materials.has(material));
  }
  disposeInstallation(first); disposeInstallation(second);
});

test('disposing one instance preserves geometry in another and releases resources once', () => {
  const first = createInstallation(0, 1);
  const second = createInstallation(0, 1);
  const shared = meshes(first).map((mesh) => mesh.geometry).find((geometry) => meshes(second).some((mesh) => mesh.geometry === geometry));
  assert.ok(shared, 'primitive geometry should be shared between installations');
  let sharedDisposals = 0;
  let materialDisposals = 0;
  shared.addEventListener('dispose', () => { sharedDisposals++; });
  const material = meshes(first)[0].material as THREE.Material;
  material.addEventListener('dispose', () => { materialDisposals++; });
  disposeInstallation(first);
  assert.equal(sharedDisposals, 0);
  assert.equal(materialDisposals, 1);
  disposeInstallation(first);
  assert.equal(materialDisposals, 1);
  disposeInstallation(second);
  assert.equal(sharedDisposals, 1);
  assert.equal(first.children.length, 0);
  assert.equal(second.children.length, 0);
});

test('invalid indices and non-finite seeds safely resolve to deterministic defaults', () => {
  for (const index of [-1, 99, NaN, Infinity]) {
    const group = createInstallation(index, NaN);
    assert.ok(meshes(group).length >= 3);
    disposeInstallation(group);
  }
});

test('the concave Sun Gate preserves the open inner edge instead of filling its silhouette', () => {
  const group = createInstallation(8, 23);
  const transform = group.getObjectByName('sculpture')!.matrixWorld;
  const ray = new THREE.Raycaster(new THREE.Vector3(0.95, 5, 2).applyMatrix4(transform), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(group).length, 0, 'the void beside the curved horn must remain open');
  ray.set(new THREE.Vector3(1.8, 4, 2).applyMatrix4(transform), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(group).length > 0, 'the solid outer horn must remain present');
  disposeInstallation(group);
});
