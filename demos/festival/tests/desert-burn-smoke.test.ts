import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { installationBurn } from '../src/desert/visual-math.ts';

const burnAt = 100_000, ashesAt = 135_000, endsAt = 145_000;
const project = (now: number, seed = 0, end = endsAt) => installationBurn(now, burnAt, ashesAt, seed, end);

test('burn emits smoke before collapse and retains dark smoke into the ash phase', () => {
 assert.equal(project(burnAt - 1).smoke, 0);
 assert.ok(project(burnAt + 5000).smoke > .5);
 assert.ok(project(ashesAt).smoke > .3);
 assert.ok(project(ashesAt + 5000).smoke > .1);
 assert.equal(project(endsAt).smoke, 0);
});

test('scorch and residual smoke fade together continuously before round cleanup', () => {
 const initial = project(ashesAt);
 assert.equal(initial.ash, 1);
 let previous = initial;
 for (let now = ashesAt + 16; now <= endsAt; now += 16) {
  const current = project(now);
  assert.ok(current.ash <= previous.ash && current.smoke <= previous.smoke);
  assert.ok(Math.abs(current.ash - previous.ash) < .004, 'no opacity step');
  assert.ok(Math.abs(current.ash - current.smoke / initial.smoke) < 1e-9, 'shared dissipation envelope');
  previous = current;
 }
 assert.equal(project(endsAt - 250).ash, 0);
 assert.equal(project(endsAt - 250).smoke, 0);
 assert.equal(project(endsAt + 1000).ash, 0);
});

test('fade uses the authoritative ash duration and is deterministic for late joiners', () => {
 const shortEnd = ashesAt + 4000;
 assert.ok(project(ashesAt + 2000, 12, shortEnd).ash < .6);
 assert.equal(project(shortEnd, 12, shortEnd).ash, 0);
 assert.deepEqual(project(ashesAt + 6500, 12), project(ashesAt + 6500, 12));
 for (const seed of [0, 3, 12, -19]) {
  const before = project(ashesAt - 1, seed), after = project(ashesAt + 1, seed);
  assert.ok(Math.abs(before.smoke - after.smoke) < .001);
  assert.ok(Math.abs(before.ash - after.ash) < .001);
 }
});

test('smoke is one local bounded instanced draw with deterministic seeds and no shadows', async () => {
 const smokeModule = await import('../src/desert/smoke.ts').catch(() => null);
 assert.ok(smokeModule, 'artwork smoke renderer exists');
 const a = smokeModule.createDesertSmoke(7, 16, 6), b = smokeModule.createDesertSmoke(7, 16, 6);
 assert.equal(a.root.visible, false);
 assert.equal(a.root.children.length, 1);
 const mesh = a.root.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
 const other = b.root.children[0] as typeof mesh;
 assert.equal(mesh.geometry.instanceCount, 12);
 assert.equal(mesh.geometry.getAttribute('position').count, 4);
 assert.deepEqual(mesh.geometry.getAttribute('aSeed').array, other.geometry.getAttribute('aSeed').array);
 assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
 assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.material.depthTest, true);
 assert.equal(mesh.material.blending, THREE.NormalBlending);
 assert.equal(mesh.material.transparent, true);
 a.update(6, .8, false, 0);
 assert.equal(a.root.visible, true);
 assert.equal(mesh.material.uniforms.uTime.value, 6);
 assert.equal(mesh.material.uniforms.uIntensity.value, .8);
 a.update(50, .4, true, 1);
 const frozen = mesh.material.uniforms.uTime.value;
 a.update(90, .2, true, 1);
 assert.equal(mesh.material.uniforms.uTime.value, frozen, 'reduced motion freezes drifting but opacity still fades');
 assert.equal(mesh.material.uniforms.uIntensity.value, .2);
 a.update(95, 0, false, 1); assert.equal(a.root.visible, false);
 a.dispose(); b.dispose();
});

test('smoke releases all owned GPU resources once and detaches on cleanup', async () => {
 const smokeModule = await import('../src/desert/smoke.ts').catch(() => null);
 assert.ok(smokeModule, 'artwork smoke renderer exists');
 const smoke = smokeModule.createDesertSmoke(1), scene = new THREE.Scene(); scene.add(smoke.root);
 const mesh = smoke.root.children[0] as THREE.Mesh;
 let geometry = 0, material = 0;
 mesh.geometry.addEventListener('dispose', () => geometry++);
 (mesh.material as THREE.Material).addEventListener('dispose', () => material++);
 smoke.dispose(); smoke.dispose(); smoke.update(5, 1, false, 0);
 assert.equal(geometry, 1); assert.equal(material, 1); assert.equal(smoke.root.parent, null);
});

test('scene wires local smoke, shared round fade and disposal without restoring ambient sand haze', () => {
 const source = readFileSync(new URL('../components/DesertScene.tsx', import.meta.url), 'utf8');
 assert.match(source, /createDesertSmoke\(seed/);
 assert.match(source, /installationBurn\(now,[^;]+snapshot\.round\.endsAt\)/);
 assert.match(source, /visual\.smoke\.update\(/);
 assert.match(source, /art\.smoke\.dispose\(\)/);
 assert.doesNotMatch(source, /createDesertSandHaze/);
 assert.doesNotMatch(source, /ash\.scale\.setScalar\([^;]*burn\.ash/);
});
