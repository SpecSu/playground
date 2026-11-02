import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDesertEnvironment } from '../src/desert/environment.ts';
import { createDesertFire } from '../src/desert/fire.ts';
import { festivalCeremonyAt, festivalFireworkSchedule } from '../src/desert/ceremony.ts';

const round = { index: 7, burnAt: 300_000, ashesAt: 335_000, endsAt: 345_000 };
const at = (seconds: number) => festivalCeremonyAt(round.burnAt + seconds * 1000, round);

test('burn terrain uses a blue-hour base and muted roads return exactly to their daylight colors', () => {
 const world = createDesertEnvironment();
 const sand = world.ground.material as THREE.MeshStandardMaterial;
 let roads: THREE.MeshStandardMaterial | undefined;
 world.root.traverse(node => { if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name === 'desert-path') roads = node.material as THREE.MeshStandardMaterial; });
 assert.ok(roads);
 const daySand = sand.color.clone(), dayRoads = roads.color.clone();
 world.update(22, at(22));
 assert.ok(sand.color.b > sand.color.g && sand.color.g > sand.color.r, 'blue-hour terrain avoids purple and orange ground washes');
 assert.ok(roads.color.r < dayRoads.r * .3, 'dark road substrate keeps its additive amber line from washing out');
 const paths = world.root.getObjectByName('festival-ignited-paths') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
 assert.ok(paths.material.uniforms.uGlowStrength?.value <= .32, 'road glow stays subordinate to the actual fire and fireworks');
 const aura = world.root.getObjectByName('festival-monument-ground-glow') as THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
 assert.ok(aura, 'the warm monument has a soft local reflection on the sand');
 assert.ok(aura.geometry.parameters.radius <= 45, 'the monument aura never covers the entire playa');
 assert.equal(aura.material.depthWrite, false); assert.equal(aura.visible, true);
 world.update(45, at(45));
 assert.ok(sand.color.equals(daySand)); assert.ok(roads.color.equals(dayRoads)); assert.equal(aura.visible, false);
 world.dispose(); world.dispose();
});

test('every shell stays inside a varied amber peach and warm-white palette', () => {
 for (const index of [0, 7, 31]) {
  const colors = festivalFireworkSchedule(index).map(burst => new THREE.Color(burst.color));
  assert.ok(new Set(colors.map(color => color.getHex())).size >= 4, 'warm shells retain tonal variety');
  assert.ok(colors.every(color => color.r > color.g && color.g > color.b), 'no cyan or violet shells interrupt the warm ritual');
 }
});

test('each fire owns one local gradient pool that follows intensity and disposes once', () => {
 const fire = createDesertFire(17, 20, 12);
 const aura = fire.root.getObjectByName('festival-fire-ground-glow') as THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
 assert.ok(aura, 'installation fires tint only the ground around the flame');
 assert.ok(aura.geometry.parameters.radius <= 15);
 assert.equal(aura.material.blending, THREE.AdditiveBlending); assert.equal(aura.material.depthWrite, false);
 fire.update(22, .8); assert.equal(aura.material.uniforms.uIntensity.value, .8);
 const geometry = aura.geometry, material = aura.material;
 fire.update(23, .2); assert.equal(aura.geometry, geometry); assert.equal(aura.material, material); assert.equal(material.uniforms.uIntensity.value, .2);
 fire.update(45, 0); assert.equal(fire.root.visible, false);
 let disposed = 0; geometry.addEventListener('dispose', () => disposed++); material.addEventListener('dispose', () => disposed++);
 fire.dispose(); fire.dispose(); assert.equal(disposed, 2);
});
