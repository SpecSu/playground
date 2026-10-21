import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { makeClubWorld, type SceneAvatarFactory } from '../lib/club-scene-world.ts';
import { clubGroupMotionAt } from '../lib/club-group-motion.ts';
import { clubMotionAt } from '../lib/club-scene-motion.ts';
import type { GroupAction } from '../lib/room-types.ts';

async function tidal() {
  assert.ok(existsSync(new URL('../lib/club-tidal-wave.ts', import.meta.url)), 'the human wave needs a real pooled sea-wave renderer');
  return import('../lib/club-tidal-wave.ts');
}
const epoch = 1_791_806_400_000;
const event = (startsAt = epoch): GroupAction => ({ id: `wave-${startsAt}`, kind: 'wave', version: 2, startsAt, endsAt: startsAt + 10000, beatMs: 500, sourceClockBySlot: Array.from({ length: 10 }, () => startsAt) });
const factory: SceneAvatarFactory = () => ({ root: new THREE.Group(), height: 2, labelHeight: 2.4, footprintRadius: .65, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} });
const participant = (slot: number) => ({ id: `p${slot}`, name: `Person ${slot}`, preset: 'frog' as const, slot, joinedAt: 0, lastSeenAt: 0, action: 'dance' as const, actionAt: 0 });
const actors = (world: ReturnType<typeof makeClubWorld>) => [...world.players.values(), ...world.ambient];

// The wave has no formation; water starts with the accepted shared event.
test('tidal phase uses the immediate v2 shared event window and leaves other actions and old events alone', async () => {
  const { sampleTidalWave } = await tidal();
  const action = event();
  for (let elapsed = -3000; elapsed <= 10000; elapsed += 25) {
    const phase = clubGroupMotionAt(epoch + elapsed, 0, action, clubMotionAt(epoch + elapsed, 0))?.pose.phase;
    assert.equal(Boolean(sampleTidalWave(epoch + elapsed, action)), phase === 'perform' || phase === 'return');
  }
  for (const kind of ['train', 'unison', 'battle', 'grid'] as const) assert.equal(sampleTidalWave(epoch + 4000, { ...action, kind }), null);
  assert.equal(sampleTidalWave(epoch + 4000, { ...action, version: 1 }), null);
  assert.equal(sampleTidalWave(epoch + 4000, action, true), null);
  for (const now of [NaN, Infinity, -Infinity]) assert.equal(sampleTidalWave(now, action), null);
  for (const bad of [{ startsAt: NaN }, { endsAt: Infinity }, { beatMs: 0 }, { endsAt: epoch }]) assert.equal(sampleTidalWave(epoch + 4000, { ...action, ...bad }), null);
});

// Frame-delta or random-based float motion would fail both replay and late-join checks.
test('the sea rushes across the floor, holds a comic float, then completely drains before return', async () => {
  const { sampleTidalWave, sampleTidalFloat } = await tidal();
  const action = event();
  const a = sampleTidalWave(epoch + 600, action)!, b = sampleTidalWave(epoch + 2200, action)!;
  assert.ok(a.crestU < b.crestU - 5, 'a visible crest sweeps left to right');
  const middle = sampleTidalWave(epoch + 5000, action)!;
  const lifts = Array.from({ length: 10 }, (_, slot) => sampleTidalFloat(middle, slot, slot % 2 ? 4.2 : -4.2));
  assert.ok(lifts.every(pose => pose.y > 1.3 && pose.y < 3.2), 'every dancer clearly floats at normal body scale');
  assert.ok(new Set(lifts.map(pose => pose.y.toFixed(3))).size > 5, 'buoyant stagger avoids rigid identical poses');
  assert.ok(lifts.some(pose => Math.abs(pose.roll) > .15), 'whole bodies comically lean in the water');
  assert.deepEqual(sampleTidalWave(epoch + 5000, action), middle);
  for (const elapsed of [0, 9999.999]) {
    const frame = sampleTidalWave(epoch + elapsed, action)!;
    for (let slot = 0; slot < 10; slot++) {
      const pose = sampleTidalFloat(frame, slot, slot % 2 ? 4.2 : -4.2);
      assert.ok(Math.abs(pose.x) + Math.abs(pose.y) + Math.abs(pose.z) + Math.abs(pose.pitch) + Math.abs(pose.roll) + Math.abs(pose.yaw) < 1e-6, 'exactly settled at performance edges');
    }
  }
  for (let elapsed = 0; elapsed < 10000; elapsed += 13) for (let slot = 0; slot < 10; slot++) {
    const now = sampleTidalWave(epoch + elapsed, action)!;
    const next = sampleTidalWave(epoch + Math.min(9999.999, elapsed + 13), action)!;
    const p = sampleTidalFloat(now, slot, 0), q = sampleTidalFloat(next, slot, 0);
    assert.ok(Object.values(p).every(Number.isFinite));
    assert.ok(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < .12, 'float and landing cannot snap');
  }
});

// Moving the authoritative roots, scaling actors or accumulating transforms fails here.
test('render-only carriers float all ten seats, keep the DJ and collision roots grounded, and fully restore', async () => {
  const { createClubTidalWave } = await tidal();
  const world = makeClubWorld({ createAvatar: factory });
  world.syncParticipants(Array.from({ length: 10 }, (_, slot) => participant(slot)), 'p0');
  const effect = createClubTidalWave(world.scene), action = event();
  effect.prepareFrame();
  world.update(24, 'ice', false, .8, epoch + 5000, undefined, { groupAction: action });
  const before = [...world.players.values()].map(rig => ({ position: rig.root.position.clone(), rotation: rig.root.rotation.clone(), motion: { ...rig.motion } }));
  const dj = world.dj.root.position.clone();
  effect.update(epoch + 5000, action, false, actors(world));
  world.scene.updateMatrixWorld(true);
  [...world.players.values()].forEach((rig, index) => {
    assert.ok(rig.root.position.equals(before[index].position));
    assert.ok(rig.root.rotation.equals(before[index].rotation));
    assert.deepEqual(rig.motion, before[index].motion);
    assert.ok(rig.root.scale.equals(new THREE.Vector3(1, 1, 1)));
    assert.ok(rig.model.root.getWorldPosition(new THREE.Vector3()).y > 1.3);
    assert.equal(rig.shadow.getWorldPosition(new THREE.Vector3()).y, rig.shadow.position.y);
    assert.equal(rig.root.visible, true);
  });
  assert.ok(world.dj.root.position.equals(dj));
  assert.equal(world.dj.model.root.parent, world.dj.root);
  const subject = world.getCameraSubject('p0')!, followed = effect.cameraSubject(subject)!;
  assert.ok(followed.position.y > 1.3, 'immersive framing follows the floating body');
  assert.equal(subject.position.y, 0, 'camera offset never mutates world state');
  assert.equal(followed.heading, subject.heading, 'comic sway cannot spin the camera');
  const label = new THREE.Vector3(0, 3, 0);
  effect.addVisualOffset(world.players.get('p0')!, label);
  assert.ok(label.y > 4.3);
  effect.prepareFrame();
  for (const rig of world.players.values()) assert.equal(rig.model.root.getWorldPosition(new THREE.Vector3()).y, 0, 'IK sees grounded roots before each world update');
  effect.update(epoch + 10000, action, false, actors(world));
  assert.equal(effect.root.visible, false);
  for (const rig of world.players.values()) assert.equal(rig.model.root.parent, rig.root, 'normal hierarchy restored after receding');
  effect.dispose(); world.dispose();
});

test('pooled geometry is truly tall and translucent, deterministic for late viewers, and releases resources once', async () => {
  const { createClubTidalWave } = await tidal();
  const early = makeClubWorld({ createAvatar: factory }), late = makeClubWorld({ createAvatar: factory });
  const first = createClubTidalWave(early.scene), second = createClubTidalWave(late.scene), action = event();
  const draw = (world: typeof early, effect: typeof first, time: number) => { effect.prepareFrame(); world.update(time / 500, 'neon', false, 1, time, undefined, { groupAction: action }); effect.update(time, action, false, actors(world)); world.scene.updateMatrixWorld(true); };
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  first.root.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material)); } });
  for (let elapsed = 0; elapsed < 1200; elapsed += 25) draw(early, first, epoch + elapsed);
  draw(early, first, epoch + 1200); draw(late, second, epoch + 1200);
  const crest = first.root.getObjectByName('tidal-curl') as THREE.Mesh;
  assert.ok(crest?.isMesh, 'real curved water mesh exists');
  crest.geometry.computeBoundingBox();
  assert.ok(crest.geometry.boundingBox!.max.y > 2.3, 'curl is larger than an ordinary avatar');
  assert.equal((crest.material as THREE.Material).depthWrite, false);
  assert.ok((crest.material as THREE.Material).opacity > .2 && (crest.material as THREE.Material).opacity < .65);
  assert.ok(first.root.children.length <= 8, 'particles and foam are instanced, not hundreds of draw calls');
  for (let index = 0; index < early.ambient.length; index++) assert.deepEqual(early.ambient[index].model.root.matrixWorld.elements, late.ambient[index].model.root.matrixWorld.elements);
  for (let repeat = 0; repeat < 4; repeat++) { first.prepareFrame(); first.update(epoch + 5000, action, false, actors(early)); }
  const after = new Set<THREE.BufferGeometry>(); first.root.traverse(node => { if (node instanceof THREE.Mesh) after.add(node.geometry); });
  assert.deepEqual(after, geometries, 'repeated frames reuse every GPU geometry');
  let disposals = 0;
  [...geometries, ...materials].forEach(resource => resource.addEventListener('dispose', () => { disposals++; }));
  first.dispose(); first.dispose();
  assert.equal(disposals, geometries.size + materials.size);
  assert.equal(first.root.parent, null);
  second.dispose(); early.dispose(); late.dispose();
});

test('water rings fade with the draining sea and pooled layers avoid doubled transparent passes', async () => {
  const { createClubTidalWave } = await tidal();
  const world = makeClubWorld({ createAvatar: factory }), effect = createClubTidalWave(world.scene), action = event();
  effect.update(epoch + 5000, action, false, actors(world));
  const wakes = effect.root.getObjectByName('tidal-dancer-wakes') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  const fullOpacity = wakes.material.opacity;
  effect.update(epoch + 9600, action, false, actors(world));
  assert.ok(wakes.material.opacity < fullOpacity * .1, 'white rings fade instead of remaining solid as water disappears');
  effect.root.traverse(node => { if (node instanceof THREE.Mesh) { const material = node.material as THREE.Material; if (material.transparent && material.side === THREE.DoubleSide) assert.equal(material.forceSinglePass, true); } });
  effect.dispose(); world.dispose();
});

test('interruptions, reduced motion, membership replacement and repeat events leave no stale carrier or float', async () => {
  const { createClubTidalWave } = await tidal();
  const world = makeClubWorld({ createAvatar: factory }), effect = createClubTidalWave(world.scene), action = event();
  world.syncParticipants([participant(0)], 'p0');
  const original = world.players.get('p0')!;
  const draw = (time: number, current: GroupAction | null, reduced = false) => { effect.prepareFrame(); world.update(time / 500, 'moon', reduced, 1, time, undefined, { groupAction: current }); effect.update(time, current, reduced, actors(world)); };
  draw(epoch + 5000, action);
  assert.notEqual(original.model.root.parent, original.root);
  world.syncParticipants([{ ...participant(0), preset: 'dog' }], 'p0');
  draw(epoch + 5100, action);
  assert.equal(original.model.root.parent, original.root, 'departed model is not retained by the effect');
  draw(epoch + 5200, action, true);
  assert.equal(effect.root.visible, false);
  assert.equal(world.players.get('p0')!.model.root.parent, world.players.get('p0')!.root);
  draw(epoch + 5000, action);
  draw(epoch + 5025, null);
  assert.equal(effect.root.visible, false);
  const repeated = event(epoch + 30000);
  draw(repeated.startsAt + 5000, repeated);
  assert.ok(world.players.get('p0')!.model.root.getWorldPosition(new THREE.Vector3()).y > 1.3);
  draw(repeated.endsAt, repeated);
  assert.equal(effect.root.visible, false);
  effect.dispose(); world.dispose();
});

test('scene restores IK before world update and uses its shared server clock for water and visual camera offsets', () => {
  const scene = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
  assert.match(scene, /createClubTidalWave\(world\.scene\)/);
  assert.ok(scene.indexOf('tidalWave?.prepareFrame()') < scene.indexOf('world.update(beat'));
  assert.match(scene, /tidalWave\?\.update\(nowServer, snapshot\.groupAction, Boolean\(snapshot\.reducedMotion\),/);
  assert.match(scene, /tidalWave\?\.addVisualOffset\(rig, projected\)/);
  assert.match(scene, /subject: tidalWave\?\.cameraSubject\(world\.getCameraSubject\(snapshot\.ownId\)\)/);
  assert.ok(scene.indexOf('tidalWave?.dispose()') < scene.indexOf('world?.dispose()'));
});

// A retained float transform during world-space IK would stretch real skins on
// the second frame; fake adapters alone cannot detect that integration error.
test('actual human, tiny animal and tall monster skins keep their size through consecutive floating frames', async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { createClubAvatar } = await import('../lib/club-avatar-rig.ts');
  const { createClubTidalWave } = await tidal();
  for (const kind of ['human-subeike', 'frog', 'monster-tower'] as const) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene: template } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const world = makeClubWorld({ createAvatar: (preset, id, options) => id === 'p0' ? createClubAvatar(kind, id, { template }) : factory(preset, id, options) });
    world.syncParticipants([{ ...participant(0), preset: kind }], 'p0');
    const effect = createClubTidalWave(world.scene), rig = world.players.get('p0')!, action = event();
    for (let elapsed = 4000; elapsed <= 4400; elapsed += 25) {
      effect.prepareFrame();
      world.update(elapsed / 500, 'ice', false, .9, epoch + elapsed, undefined, { groupAction: action });
      const groundedSize = new THREE.Box3().setFromObject(rig.model.root, true).getSize(new THREE.Vector3());
      effect.update(epoch + elapsed, action, false, actors(world));
      world.scene.updateMatrixWorld(true);
      const floating = new THREE.Box3().setFromObject(rig.model.root, true), size = floating.getSize(new THREE.Vector3());
      assert.ok(floating.min.y > 1, `${kind} actual skin is lifted clear of the floor`);
      assert.ok(size.length() / groundedSize.length() > .8 && size.length() / groundedSize.length() < 1.3, `${kind} never stretches or shrinks to simulate buoyancy`);
      assert.ok(rig.model.root.scale.equals(new THREE.Vector3(1, 1, 1)));
    }
    effect.dispose(); world.dispose();
  }
});


test('the first surge is visible immediately and scatters dancers beyond a small in-place bob', async () => {
  const { sampleTidalWave, sampleTidalFloat } = await tidal();
  const frame = sampleTidalWave(epoch + 250, event())!;
  assert.ok(frame.crestStrength > .7, 'large foam crest appears in the first quarter-second');
  assert.ok(frame.crestU > -6.5, 'crest is already entering the dance floor');
  const middle = sampleTidalWave(epoch + 3500, event())!;
  const offsets = Array.from({ length: 10 }, (_, slot) => sampleTidalFloat(middle, slot, slot % 2 ? 3 : -3, slot < 5 ? -3 : 3));
  assert.ok(offsets.filter(pose => Math.hypot(pose.x, pose.z) > .7).length >= 6, 'characters are swept around, not merely bobbing on their original spots');
  assert.ok(new Set(offsets.map(pose => Math.sign(pose.z))).size > 1);
});

test('broad scattering stays inside overview side margins even at outer floor positions', async () => {
  const { sampleTidalWave, sampleTidalFloat } = await tidal();
  for (let elapsed = 0; elapsed < 10000; elapsed += 31) for (let slot = 0; slot < 10; slot++) for (const u of [-4.2, 4.2]) {
    const pose = sampleTidalFloat(sampleTidalWave(epoch + elapsed, event())!, slot, u, 3);
    const shownU = u + (pose.x - pose.z) * Math.SQRT1_2;
    assert.ok(Math.abs(shownU) <= 4.2 + 1e-8, 'the sea cannot push a full-size character out of the narrow overview');
  }
});
