import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDesertEnvironment } from '../src/desert/environment.ts';
import { createInstallation, disposeInstallation } from '../src/desert/installations.ts';
import { DREAMINA_MONUMENT_RADIUS, INSTALLATION_FOOTPRINT_RADII, INSTALLATION_HEIGHTS } from '../src/desert/art-dimensions.ts';

test('Dreamina is a smaller upright weathered-stone top supported by a broad disc', () => {
  const environment = createDesertEnvironment();
  const sculpture = environment.monument.getObjectByName('dreamina-weathered-stone') as THREE.Mesh;
  const base = environment.monument.getObjectByName('dreamina-disc-base') as THREE.Mesh;
  assert.ok(sculpture instanceof THREE.Mesh);assert.ok(base instanceof THREE.Mesh);
  assert.ok(sculpture.material instanceof THREE.MeshStandardMaterial);
  const stone = sculpture.material as THREE.MeshStandardMaterial;
  assert.ok(stone.roughness >= 0.85);assert.equal(stone.metalness, 0);
  assert.ok(stone.bumpMap);assert.ok(sculpture.geometry.getAttribute('color'));
  assert.equal(sculpture.rotation.x, 0);assert.equal(sculpture.rotation.z, 0);
  const box = new THREE.Box3().setFromObject(sculpture, true);
  const footing = new THREE.Box3().setFromObject(base, true);
  assert.ok(box.max.y >= 28 && box.max.y <= 31);
  assert.ok(box.max.x-box.min.x > 22 && box.max.x-box.min.x < 27);
  assert.ok(footing.max.x-footing.min.x >= 20);assert.ok(footing.max.y>=1.5 && footing.max.y<=1.7);
  assert.ok(Math.abs(box.min.y-footing.max.y)<0.05,'lower tip contacts the disc');
  const points=sculpture.geometry.getAttribute('position'),vertex=new THREE.Vector3();let widest=0;
  for(let i=0;i<points.count;i++){vertex.fromBufferAttribute(points,i).applyMatrix4(sculpture.matrixWorld);assert.ok(Number.isFinite(vertex.x+vertex.y+vertex.z));widest=Math.max(widest,Math.hypot(vertex.x,vertex.z));}
  assert.ok(widest<=DREAMINA_MONUMENT_RADIUS-.5);assert.ok(points.count<7000);
  environment.dispose();
});

test('all twelve large installations expose exact measured height and safe footprint metadata', () => {
  for (let kind = 0; kind < 12; kind++) {
    const group = createInstallation(kind, 23);
    const bounds = new THREE.Box3().setFromObject(group, true);
    const height = bounds.max.y - bounds.min.y;
    assert.ok(Math.abs(height - INSTALLATION_HEIGHTS[kind]) < 0.001, `kind ${kind}, height ${height}`);
    assert.ok(Math.abs(bounds.min.y) < 0.001);
    assert.equal(group.userData.footprintRadius, INSTALLATION_FOOTPRINT_RADII[kind]);
    assert.ok(Math.abs(group.userData.height - height) < 0.001);
    assert.ok(group.userData.radius <= group.userData.footprintRadius);
    assert.ok(group.userData.radius > 5.5, `kind ${kind} remains too narrow`);
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const name of ['position', 'normal']) {
        const attribute = object.geometry.getAttribute(name);
        for (const value of attribute.array) assert.ok(Number.isFinite(value), `${kind}: ${name}`);
      }
    });
    disposeInstallation(group);
  }
});

test('the rebuilt collection includes a broad skeletal creature and genuinely smooth glass petals', () => {
  const beast = createInstallation(2, 23);
  const bounds = new THREE.Box3().setFromObject(beast, true).getSize(new THREE.Vector3());
  assert.ok(bounds.x > bounds.y * 1.25, `skeletal creature should be broad: ${bounds.toArray()}`);
  assert.ok(bounds.z > 8, 'skeletal ribs need spatial width');
  disposeInstallation(beast);
  const bloom = createInstallation(6, 23);
  const glass: THREE.MeshPhysicalMaterial[] = [];
  bloom.traverse((object) => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) glass.push(object.material); });
  assert.ok(glass.some(material => material.transmission >= 0.4), 'bloom petals must use frosted cast glass');
  disposeInstallation(bloom);
});

test('kinetic orbit remains an independently animated nested mechanism after monumental scaling', () => {
  const group = createInstallation(4, 23);
  const orbit = group.getObjectByName('kinetic-orbits');
  assert.ok(orbit, 'the animation API discovers the nested kinetic part');
  assert.equal(orbit.userData.livingMotion, 'orbit-gimbals');
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 5) {
    orbit.rotation.y = angle;group.updateMatrixWorld(true);
    const vertex = new THREE.Vector3();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const points = object.geometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        vertex.fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld);
        assert.ok(Math.hypot(vertex.x, vertex.z) <= INSTALLATION_FOOTPRINT_RADII[4]);
      }
    });
  }
  disposeInstallation(group);
});
