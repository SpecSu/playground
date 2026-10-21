import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDesertEnvironment } from '../src/desert/environment.ts';

const round = { index: 7, startsAt: 0, burnAt: 300_000, ashesAt: 335_000, endsAt: 345_000 };
const ceremonyModule = async () => {
 const result = await import('../src/desert/ceremony.ts').catch(() => null);
 assert.ok(result, 'shared ceremony projection exists'); return result;
};

test('ceremony twilight eases from ignition, stays legible at peak and returns exactly to day after ashes', async () => {
 const { festivalCeremonyAt } = await ceremonyModule();
 assert.equal(festivalCeremonyAt(round.burnAt - 1, round).night, 0);
 assert.equal(festivalCeremonyAt(round.burnAt, round).night, 0);
 assert.ok(festivalCeremonyAt(round.burnAt + 4000, round).night > .2);
 assert.equal(festivalCeremonyAt(round.burnAt + 12000, round).night, 1);
 assert.equal(festivalCeremonyAt(round.ashesAt, round).night, 1);
 assert.ok(festivalCeremonyAt(round.ashesAt + 5000, round).night < .6);
 assert.equal(festivalCeremonyAt(round.endsAt, round).night, 0);
 assert.equal(festivalCeremonyAt(round.endsAt, round).intensity, 0);
 assert.equal(festivalCeremonyAt(round.endsAt, round).turnRadians, 0);
 for (let t = round.burnAt; t < round.endsAt; t += 16) {
  assert.ok(Math.abs(festivalCeremonyAt(t + 16, round).night - festivalCeremonyAt(t, round).night) < .004, 'no lighting flash');
 }
});

test('shared round projections are seekable, late-join deterministic and never celebrate building time', async () => {
 const { festivalCeremonyAt } = await ceremonyModule();
 const peak = festivalCeremonyAt(round.burnAt + 22000, round);
 assert.equal(peak.burning, true); assert.ok(peak.intensity > .95); assert.ok(peak.turnRadians > Math.PI * 4);
 assert.deepEqual(festivalCeremonyAt(round.burnAt + 22000, round), peak);
 assert.equal(festivalCeremonyAt(round.burnAt - 1, round).burning, false);
 assert.equal(festivalCeremonyAt(round.ashesAt, round).burning, false);
 assert.equal(festivalCeremonyAt(round.burnAt + 22000, null).night, 0);
});

test('night sky and stone top share ceremony state while the foundation never moves', async () => {
 const { festivalCeremonyAt } = await ceremonyModule();
 const world = createDesertEnvironment();
 const top = world.monument.getObjectByName('dreamina-weathered-stone')!;
 const base = world.monument.getObjectByName('dreamina-disc-base')!;
 const baseTransform = base.matrix.clone();
 const sky = world.root.getObjectByName('dusk-sky') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
 const peak = festivalCeremonyAt(round.burnAt + 22000, round);
 world.update(22, peak, false); world.root.updateMatrixWorld(true);
 assert.ok(Math.abs(top.rotation.y) > .1); assert.ok(base.matrix.equals(baseTransform));
 assert.equal(sky.material.uniforms.uNight.value, 1);
 assert.ok(new THREE.Box3().setFromObject(top).min.y >= 1.59, 'upright spinning body clears fixed base');
 world.update(23, festivalCeremonyAt(round.burnAt + 23000, round), true);
 assert.equal(top.rotation.y, 0, 'reduced motion keeps landmark still');
 world.update(45, festivalCeremonyAt(round.endsAt, round), false);
 assert.equal(top.rotation.y, 0); assert.equal(sky.material.uniforms.uNight.value, 0);
 world.dispose(); world.dispose();
});

test('fireworks are staggered, deterministic, in real world space and within the portrait aerial framing', async () => {
 const { festivalFireworkSchedule } = await ceremonyModule();
 const bursts = festivalFireworkSchedule(round.index);
 assert.deepEqual(bursts, festivalFireworkSchedule(round.index));
 assert.notDeepEqual(bursts, festivalFireworkSchedule(round.index + 1));
 assert.ok(bursts.length >= 14 && bursts.length <= 24);
 const camera = new THREE.PerspectiveCamera(55, 390 / 758, .25, 1600);
 camera.position.set(Math.sin(.25) * Math.cos(1.05) * 260, Math.sin(1.05) * 260, Math.cos(.25) * Math.cos(1.05) * 260);
 camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
 const starts = new Set<number>();
 for (const burst of bursts) {
  starts.add(burst.startsAt); assert.ok(burst.y >= 25 && burst.y <= 55);
  assert.ok(burst.startsAt > 0 && burst.startsAt + burst.duration <= 35);
  const center = new THREE.Vector3(burst.x, burst.y, burst.z).project(camera);
  assert.ok(Math.abs(center.x) < .87 && Math.abs(center.y) < .87 && center.z < 1, `aerial burst ${JSON.stringify(burst)} is in frame`);
 }
 assert.equal(starts.size, bursts.length, 'bursts are staggered');
 assert.ok(bursts.some(burst => burst.startsAt < 22 && burst.startsAt + burst.duration > 22), 'a burst is alive at photo peak');
});

test('ceremony uses a bounded GPU particle pool with seekable motion and idempotent cleanup', async () => {
 const effectsModule = await import('../src/desert/ceremony-effects.ts').catch(() => null);
 assert.ok(effectsModule, 'ceremony effect renderer exists');
 const { festivalCeremonyAt } = await ceremonyModule();
 const effects = effectsModule.createFestivalCeremonyEffects();
 const scene = new THREE.Scene(); scene.add(effects.root);
 effects.update(festivalCeremonyAt(round.burnAt + 22000, round), round.index, false);
 let draws = 0, particles = 0;
 const resources = new Set<THREE.BufferGeometry | THREE.Material>();
 effects.root.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Points) {
  draws++; resources.add(node.geometry); resources.add(node.material as THREE.Material);
  particles += node.geometry instanceof THREE.InstancedBufferGeometry ? node.geometry.instanceCount : node.geometry.getAttribute('position').count;
  assert.equal(node.castShadow, false); assert.equal(node.receiveShadow, false);
  assert.equal((node.material as THREE.Material).depthWrite, false);
 }});
 assert.ok(draws <= 3, `${draws} ceremony draws`); assert.ok(particles <= 1600, `${particles} particles`);
 const fireworks = effects.root.getObjectByName('festival-aerial-fireworks') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
 assert.ok(fireworks.material.uniforms.uMinimumSize?.value>=4.5,'aerial fireworks have a readable minimum streak size');
 assert.ok(fireworks.material.uniforms.uBrightness?.value>=2,'high-altitude bursts read over the lit terrain');
 assert.ok(fireworks.visible); assert.equal(fireworks.material.uniforms.uTime.value, 22);
 effects.update(festivalCeremonyAt(round.burnAt + 12000, round), round.index, false);
 effects.update(festivalCeremonyAt(round.burnAt + 22000, round), round.index, false);
 assert.equal(fireworks.material.uniforms.uTime.value, 22);
 effects.update(festivalCeremonyAt(round.burnAt + 22000, round), round.index, true);
 const quiet = fireworks.material.uniforms.uTime.value;
 effects.update(festivalCeremonyAt(round.burnAt + 24000, round), round.index, true);
 assert.equal(fireworks.material.uniforms.uTime.value, quiet, 'reduced motion holds a quiet celebratory constellation');
 effects.update(festivalCeremonyAt(round.endsAt, round), round.index, false); assert.equal(effects.root.visible, false);
 let disposed = 0; resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
 effects.dispose(); effects.dispose(); assert.equal(disposed, resources.size); assert.equal(effects.root.parent, null);
});
