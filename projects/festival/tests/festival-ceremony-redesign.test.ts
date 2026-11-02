import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDesertEnvironment } from '../src/desert/environment.ts';
import { createFestivalCeremonyEffects } from '../src/desert/ceremony-effects.ts';
import { festivalCeremonyAt, festivalFireworkSchedule } from '../src/desert/ceremony.ts';

const round = { index: 7, burnAt: 300_000, ashesAt: 335_000, endsAt: 345_000 };
const at = (seconds: number) => festivalCeremonyAt(round.burnAt + seconds * 1000, round);

test('burn illuminates exactly the existing road footprint and restores its daylight state', () => {
 const world = createDesertEnvironment();
 const daySand = (world.ground.material as THREE.MeshStandardMaterial).color.clone();
 const glow = world.root.getObjectByName('festival-ignited-paths') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
 assert.ok(glow, 'the actual road network gets its own controlled glow');
 let road: THREE.Mesh | undefined;
 world.root.traverse(node => { if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name === 'desert-path') road = node; });
 assert.ok(road);
 assert.deepEqual(Array.from(glow.geometry.getAttribute('position').array), Array.from(road.geometry.getAttribute('position').array), 'no invented floor patches');
 assert.equal(glow.material.depthWrite, false); assert.equal(glow.material.blending, THREE.AdditiveBlending);
 world.update(0, at(-1)); assert.equal(glow.visible, false);
 world.update(22, at(22)); assert.ok((world.ground.material as THREE.MeshStandardMaterial).color.r < daySand.r * .5, 'night sand gives fireworks a dark backdrop'); assert.equal(glow.visible, true); assert.equal(glow.material.uniforms.uIntensity.value, 1);
 world.update(23, at(23), true); const quiet = glow.material.uniforms.uTime.value;
 world.update(24, at(24), true); assert.equal(glow.material.uniforms.uTime.value, quiet);
 world.update(45, at(45)); assert.ok((world.ground.material as THREE.MeshStandardMaterial).color.equals(daySand)); assert.equal(glow.visible, false); assert.equal(glow.material.uniforms.uIntensity.value, 0);
 world.dispose();
});

test('the original upright stone top emits amber light without replacing its stone material or moving the base', () => {
 const world = createDesertEnvironment();
 const top = world.monument.getObjectByName('dreamina-weathered-stone') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
 const originalMaterial = top.material;
 const base = world.monument.getObjectByName('dreamina-disc-base')!;
 const position = base.position.clone();
 world.update(22, at(22));
 assert.equal(top.material, originalMaterial); assert.ok(top.material.emissiveIntensity > .7); assert.ok(top.material.emissive.r > .8);
 assert.ok(top.material.bumpMap, 'stone grain survives the glow'); assert.ok(base.position.equals(position));
 const rim = top.getObjectByName('festival-monument-radiance') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
 assert.ok(rim); assert.equal(rim.geometry, top.geometry); assert.equal(rim.visible, true);
 world.update(45, at(45)); assert.equal(top.material.emissiveIntensity, 0); assert.equal(rim.visible, false);
 world.dispose();
});

test('aerial fireworks use broad world-space ribbon quads with launch fireballs and spherical radial crowns', () => {
 const effects = createFestivalCeremonyEffects(1.65);
 effects.update(at(22), round.index);
 const fireworks = effects.root.getObjectByName('festival-aerial-fireworks') as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
 assert.ok(fireworks instanceof THREE.Mesh, 'streaks are real quads, not hardware-limited point sprites');
 assert.ok(fireworks.geometry instanceof THREE.InstancedBufferGeometry);
 assert.equal(fireworks.geometry.getAttribute('position').count, 4);
 assert.ok(fireworks.geometry.instanceCount <= 1360);
 const modes = new Set(Array.from({ length: fireworks.geometry.getAttribute('aInfo').count }, (_, i) => fireworks.geometry.getAttribute('aInfo').getY(i)));
 for (const mode of [0, 1, 2, 3]) assert.ok(modes.has(mode), `stage ${mode} has a persistent GPU slot`);
 assert.ok(festivalFireworkSchedule(7).every(burst => burst.radius >= 14), 'large crowns read from aerial');
 assert.ok(!fireworks.material.vertexShader.includes('gl_PointSize'));
 assert.equal(fireworks.material.side, THREE.DoubleSide);
 const burstAttribute = fireworks.geometry.getAttribute('aBurst') as THREE.InstancedBufferAttribute;
 const version = burstAttribute.version;
 effects.update(at(23), round.index); assert.equal(burstAttribute.version, version, 'no per-frame buffer uploads');
 effects.update(at(23), round.index, true); const quiet = fireworks.material.uniforms.uTime.value;
 effects.update(at(24), round.index, true); assert.equal(fireworks.material.uniforms.uTime.value, quiet);
 effects.dispose(); effects.dispose();
});
