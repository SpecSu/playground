import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';

const source = new URL('../lib/fishing-background-boats.ts', import.meta.url);
const boatModule = existsSync(source) ? await import(source.href) : {};
function create() {
  assert.equal(typeof boatModule.createFishingBackgroundBoats, 'function', 'background boat factory is available');
  return boatModule.createFishingBackgroundBoats();
}
function meshes(root) {
  const result = [];
  root.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
}
function localBounds(boat) {
  const bounds = new THREE.Box3();
  for (const mesh of meshes(boat.root)) {
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox);
  }
  return bounds;
}

test('four distinct unoccupied boats sit at separated surrounding bearings', () => {
  const fleet = create();
  try {
    assert.ok(fleet.root.isGroup);
    assert.equal(fleet.boats.length, 4);
    assert.deepEqual(new Set(fleet.boats.map(boat => boat.root.userData.kind)), new Set(['sailboat', 'fishingboat', 'speedboat', 'smalltrawler']));
    const bearings = [];
    for (const boat of fleet.boats) {
      assert.equal(boat.root.parent, fleet.root);
      assert.deepEqual(boat.root.position.toArray(), [boat.x, 0, boat.z]);
      assert.equal(boat.root.rotation.y, boat.heading);
      assert.ok(Math.hypot(boat.x, boat.z) >= 18 && Math.hypot(boat.x, boat.z) <= 28);
      assert.ok(Number.isFinite(boat.heading));
      bearings.push(Math.atan2(boat.z, boat.x));
      const bounds = localBounds(boat), size = bounds.getSize(new THREE.Vector3());
      assert.ok(size.z >= 3 && size.z <= 5, `${boat.root.name} stays a small boat`);
      assert.ok(size.x >= 1 && size.x <= 2);
      assert.ok(bounds.min.y < 0 && bounds.max.y > .5, 'waterline passes through the hull');
    }
    for (let a = 0; a < bearings.length; a++) for (let b = a + 1; b < bearings.length; b++) {
      const difference = Math.abs(Math.atan2(Math.sin(bearings[a] - bearings[b]), Math.cos(bearings[a] - bearings[b])));
      assert.ok(difference > .45, 'boats are spread around the yacht');
    }
    fleet.root.traverse(object => {
      assert.ok(!object.isLight && !object.isSkinnedMesh && !object.isBone, 'only unoccupied decorative geometry');
    });
  } finally { fleet.dispose(); }
});

test('real pointed hulls and height profiles distinguish the four silhouettes', () => {
  const fleet = create();
  try {
    const heights = new Map();
    for (const boat of fleet.boats) {
      heights.set(boat.root.userData.kind, localBounds(boat).max.y);
      const hullVertices = meshes(boat.root).flatMap(mesh => {
        const p = mesh.geometry.attributes.position, points = [];
        for (let i = 0; i < p.count; i++) if (p.getY(i) <= .55) points.push([p.getX(i), p.getZ(i)]);
        return points;
      });
      const bow = Math.max(...hullVertices.map(point => point[1]));
      const fullBeam = Math.max(...hullVertices.map(point => Math.abs(point[0])));
      const bowBeam = Math.max(...hullVertices.filter(point => point[1] > bow - .12).map(point => Math.abs(point[0])));
      assert.ok(bowBeam < fullBeam * .35, 'a tapered bow rather than a box or oval');
    }
    assert.ok(heights.get('sailboat') > 3.3, 'tall mast and sail');
    assert.ok(heights.get('smalltrawler') > 2.1 && heights.get('smalltrawler') < 3.2, 'wheelhouse and small gantry');
    assert.ok(heights.get('fishingboat') > 1.4 && heights.get('fishingboat') < 2.1, 'open boat with canopy');
    assert.ok(heights.get('speedboat') < 1.3, 'low windscreen and cockpit');
  } finally { fleet.dispose(); }
});

test('merged finite geometry stays below the mesh and triangle budgets with shared untextured materials', () => {
  const fleet = create();
  try {
    const allMeshes = meshes(fleet.root), materials = new Set();
    let triangles = 0;
    assert.ok(allMeshes.length <= 20 && allMeshes.length >= 4);
    for (const mesh of allMeshes) {
      const p = mesh.geometry.attributes.position;
      for (const value of p.array) assert.ok(Number.isFinite(value));
      for (const value of mesh.geometry.attributes.normal.array) assert.ok(Number.isFinite(value));
      triangles += (mesh.geometry.index?.count ?? p.count) / 3;
      assert.equal(mesh.castShadow, false);
      assert.equal(mesh.receiveShadow, false);
      assert.ok(!Array.isArray(mesh.material), 'one draw call per merged color');
      materials.add(mesh.material);
      assert.ok(mesh.material.isMeshStandardMaterial);
      for (const value of Object.values(mesh.material)) assert.ok(!value?.isTexture, 'no maps or external textures');
    }
    assert.ok(triangles <= 5000, `${triangles} triangles`);
    assert.ok(materials.size <= 4, 'shared white, navy, wood and sail palette');
    assert.ok(materials.size < allMeshes.length, 'materials shared across boats');
    for (const boat of fleet.boats) assert.equal(new Set(meshes(boat.root).map(mesh => mesh.material)).size, meshes(boat.root).length);
  } finally { fleet.dispose(); }
});

test('background geometry never intercepts scene raycasts', () => {
  const fleet = create();
  try {
    fleet.root.updateMatrixWorld(true);
    for (const mesh of meshes(fleet.root)) {
      mesh.geometry.computeBoundingBox();
      const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
      mesh.localToWorld(center);
      const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 10, 0)), new THREE.Vector3(0, -1, 0));
      const directHits = [];
      mesh.raycast(ray, directHits);
      assert.deepEqual(directHits, [], 'the decorative mesh itself has a no-op raycast');
      assert.deepEqual(ray.intersectObject(fleet.root, true), []);
    }
  } finally { fleet.dispose(); }
});

test('disposal is idempotent and only releases this factory’s own resources', () => {
  const fleet = create(), otherFleet = create();
  const resources = new Set(meshes(fleet.root).flatMap(mesh => [mesh.geometry, mesh.material]));
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  let externalDisposals = 0;
  const external = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  fleet.root.add(external);
  for (const resource of [external.geometry, external.material, ...meshes(otherFleet.root).flatMap(mesh => [mesh.geometry, mesh.material])]) {
    resource.addEventListener('dispose', () => externalDisposals++);
  }
  fleet.dispose(); fleet.dispose();
  for (const count of counts.values()) assert.equal(count, 1);
  assert.equal(externalDisposals, 0, 'unrelated and separately created resources remain alive');
  external.geometry.dispose(); external.material.dispose(); otherFleet.dispose();
});
