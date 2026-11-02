import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CLUB_AVATAR_KINDS, createClubAvatar, type ClubAvatarKind } from '../lib/club-avatar-rig.ts';

async function create(kind: ClubAvatarKind, id = 'backflip-regression') {
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return createClubAvatar(kind, id, { template: scene });
}
const transform = (root: THREE.Object3D) => {
  const result: number[][] = [];
  root.traverse(node => { if (node instanceof THREE.Bone || node.name === 'avatar-animation-pivot') result.push(node.matrixWorld.elements.slice()); });
  return result;
};

test('backflip timing is finite: anticipation, airborne full backward turn, landing and quiet recovery', async () => {
  assert.ok(existsSync(new URL('../lib/club-backflip.ts', import.meta.url)), 'shared finite backflip sampler exists');
  const { backflipAt, personalBackflipTime } = await import('../lib/club-backflip.ts');
  const rest = backflipAt(-1);
  assert.equal(rest.rotation, 0); assert.equal(rest.lift, 0);
  assert.ok(backflipAt(200).crouch > .5 && backflipAt(200).lift === 0);
  assert.ok(backflipAt(850).lift > .9 && Math.abs(backflipAt(880).rotation + Math.PI) < .15);
  assert.ok(backflipAt(1300).rotation < -Math.PI * 1.99, 'one full backward turn before touchdown');
  assert.ok(backflipAt(1600).landing > .5);
  assert.deepEqual(backflipAt(2200), rest, 'complete, grounded rest after the finite phrase');
  assert.equal(personalBackflipTime(5900), -1, 'the six-second command ends between flips');
  assert.equal(personalBackflipTime(90000), -1, 'no unbounded pinwheel');
  let flights = 0, airborne = false;
  for (let time = 0; time <= 6000; time += 10) {
    const next = backflipAt(personalBackflipTime(time)).lift > 0;
    if (next && !airborne) flights++;
    airborne = next;
  }
  assert.equal(flights, 2, 'two complete jumps with a breathing pause');
});

test('all twelve live models rotate about their body center, jump high and land without moving the room root', async () => {
  for (const kind of CLUB_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const avatar = await create(kind);
    const pivot = avatar.root.getObjectByName('avatar-animation-pivot')!;
    avatar.root.position.set(4, 0, 7); avatar.root.rotation.y = .8;
    avatar.update(.4, 'wave', false, 1);
    assert.ok(avatar.groundLift === 0 && avatar.landingImpact === 0, `${kind} crouches on the floor first`);
    avatar.update(1.76, 'wave', false, 1);
    assert.ok(avatar.groundLift > .8, `${kind} makes a large jump`);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion).y < -.99, `${kind} is upside down midflight`);
    assert.ok(pivot.position.y > avatar.groundLift + avatar.height * .65 * pivot.scale.y, `${kind} rotates around its center, not its feet`);
    assert.deepEqual(avatar.root.position.toArray(), [4, 0, 7]); assert.equal(avatar.root.rotation.y, .8);
    avatar.update(3.2, 'wave', false, 1);
    assert.ok(avatar.landingImpact > .5 && avatar.groundLift === 0, `${kind} absorbs the landing`);
    avatar.update(11.99, 'wave', false, 1);
    assert.ok(avatar.groundLift === 0 && avatar.landingImpact === 0);
    assert.ok(pivot.quaternion.angleTo(new THREE.Quaternion()) < 1e-8);
    avatar.dispose();
  }
});

test('every personal and team backflip preserves the full authored scale and bone lengths', async () => {
  for (const kind of CLUB_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const avatar = await create(kind);
    const authored = new Map<THREE.Object3D, THREE.Vector3>();
    const limbs: { bone: THREE.Bone; parent: THREE.Bone; length: number }[] = [];
    avatar.root.traverse(node => {
      authored.set(node, node.scale.clone());
      if (node instanceof THREE.Bone && node.parent instanceof THREE.Bone) limbs.push({ bone: node, parent: node.parent, length: node.getWorldPosition(new THREE.Vector3()).distanceTo(node.parent.getWorldPosition(new THREE.Vector3())) });
    });
    for (const team of [false, true]) for (let time = 0; time <= 1800; time += 20) {
      avatar.update(time / 500, team ? 'dance' : 'wave', false, 1, undefined, team ? { kind: 'battle', version: 2, phase: 'perform', beat: 0, weight: 1, wave: 0, activation: 1, backflipElapsedMs: time } : undefined);
      for (const [node, scale] of authored) assert.ok(node.scale.distanceTo(scale) < 1e-9, `${kind}/${time}/${node.name} keeps its authored scale throughout the flip`);
      for (const { bone, parent, length } of limbs) {
        // Hips translate for crouching. Connected limbs retain their dimensions.
        if (bone.name === 'hips') continue;
        const distance = bone.getWorldPosition(new THREE.Vector3()).distanceTo(parent.getWorldPosition(new THREE.Vector3()));
        assert.ok(Math.abs(distance - length) < 1e-8, `${kind}/${time}/${bone.name} never shortens or stretches`);
      }
    }
    avatar.dispose();
  }
});

test('full-size backflip skin clears the floor and stays inside the one-metre route envelope', async (t) => {
  const point = new THREE.Vector3();
  for (const kind of CLUB_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const avatar = await create(kind);
    const core = new Set(['hips', 'spine', 'chest', 'neck', 'head']);
    const masks = new Map<THREE.Mesh, boolean[]>();
    avatar.root.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
      masks.set(node, Array.from({ length: indices.count }, (_, vertex) => {
        let weight = 0;
        for (let channel = 0; channel < 4; channel++) if (core.has(node.skeleton.bones[indices.getComponent(vertex, channel)]?.name)) weight += weights.getComponent(vertex, channel);
        return weight >= .5;
      }));
    });
    let maxCoreRadius = 0;
    for (let time = 0; time <= 1800; time += 20) {
      avatar.update(time / 500, 'wave', false, 1);
      avatar.root.traverseVisible(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
          node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
          assert.ok(Number.isFinite(point.x + point.y + point.z), `${kind}/${time} finite skin`);
          assert.ok(point.y >= -.025, `${kind}/${time} floor: ${point.y}`);
          assert.ok(Math.hypot(point.x, point.z) <= 1, `${kind}/${time} radius: ${Math.hypot(point.x, point.z)}`);
          if (masks.get(node)?.[vertex]) maxCoreRadius = Math.max(maxCoreRadius, Math.hypot(point.x, point.z));
          assert.ok(point.y <= 3.5, `${kind}/${time} fits overview height: ${point.y}`);
        }
      });
    }
    // Airborne inversion is full-size and may exceed the grounded manual core.
    // Spatial collision coverage is separate from the one-metre route contract.
    t.diagnostic(JSON.stringify({ kind, maxCoreRadius }));
    avatar.dispose();
  }
});

test('knife and shield remain rigidly attached throughout all inverted poses', async () => {
  const avatar = await create('sword-shield-dog');
  const point = new THREE.Vector3(), handPosition = new THREE.Vector3();
  const rigid: { mesh: THREE.SkinnedMesh; vertex: number; hand: THREE.Bone; radius: number }[] = [];
  avatar.root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      const hand = node.skeleton.bones[indices.getX(vertex)];
      if (!hand?.name.startsWith('hand_') || weights.getX(vertex) < .99999) continue;
      node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
      rigid.push({ mesh: node, vertex, hand, radius: point.distanceTo(hand.getWorldPosition(handPosition)) });
    }
  });
  assert.ok(rigid.length > 100);
  for (let time = 0; time <= 1800; time += 25) {
    avatar.update(time / 500, 'wave', false, 1);
    for (const sample of rigid) {
      sample.mesh.getVertexPosition(sample.vertex, point).applyMatrix4(sample.mesh.matrixWorld);
      assert.ok(Math.abs(point.distanceTo(sample.hand.getWorldPosition(handPosition)) - sample.radius) < 1e-7, 'grip-to-prop distance is preserved');
    }
  }
  avatar.dispose();
});

test('backflip seeks deterministically, resets into other actions, respects reduced motion and yields to locomotion', async () => {
  const a = await create('capybara'), b = await create('capybara');
  a.update(1.6, 'wave', false, 1); b.update(37.8, 'spin', false, .2); b.update(1.6, 'wave', false, 1);
  assert.deepEqual(transform(a.root), transform(b.root));
  a.update(.4, 'dance', false, .8); b.update(.4, 'dance', false, .8); assert.deepEqual(transform(a.root), transform(b.root));
  a.update(0, 'dance', true, .1); const quiet = transform(a.root);
  a.update(1.6, 'wave', true, 1); assert.deepEqual(transform(a.root), quiet);
  const motion = { slot: 0, x: 0, z: 0, heading: 0, distance: .4, speed: .6, walkBlend: 1, action: 'dance' as const, sampleAtDistance: () => ({ x: 0, z: 0, heading: 0 }) };
  a.update(1.6, 'wave', false, 1, motion);
  assert.equal(a.groundLift, 0);
  assert.ok(a.root.getObjectByName('avatar-animation-pivot')!.quaternion.angleTo(new THREE.Quaternion()) < 1e-8);
  for (const name of ['hand_L', 'hand_R', 'foot_L', 'foot_R']) {
    const y = a.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).y;
    assert.ok(y >= .083 && y < .18, `walking contact ${name}: ${y}`);
  }
  a.dispose(); b.dispose();
});

test('the group team backflip uses the identical complete body pose as the personal action', async () => {
  for (const kind of ['human-subeike', 'capybara', 'sword-shield-dog'] as const) {
    const a = await create(kind), b = await create(kind);
    for (const time of [0, 200, 500, 880, 1100, 1480, 1600, 1800]) {
      a.update(time / 500, 'wave', false, 1);
      b.update(123, 'dance', false, 1, undefined, { kind: 'battle', version: 2, phase: 'perform', beat: 999, weight: 1, wave: 0, activation: 1, backflipElapsedMs: time });
      assert.deepEqual(transform(a.root), transform(b.root), `${kind}/${time} shares exact rig pose`);
    }
    a.dispose(); b.dispose();
  }
});

test('actual first-quarter body pitch carries every model backward in its local forward basis', async () => {
  for (const kind of CLUB_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const avatar = await create(kind);
    const pivot = avatar.root.getObjectByName('avatar-animation-pivot')!;
    const point = new THREE.Vector3();
    let top: { mesh: THREE.SkinnedMesh; vertex: number } | undefined;
    let height = -Infinity;
    avatar.root.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
      for (let vertex = 0; vertex < indices.count; vertex++) {
        let weight = 0;
        for (let channel = 0; channel < 4; channel++) {
          if (['head', 'neck'].includes(node.skeleton.bones[indices.getComponent(vertex, channel)]?.name)) weight += weights.getComponent(vertex, channel);
        }
        if (weight < .5) continue;
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        if (point.y > height) { height = point.y; top = { mesh: node, vertex }; }
      }
    });
    assert.ok(top, `${kind} has an actual head-surface sample`);
    // A short character's head bone may sit below the rotation center. Track
    // the real head's top surface, not that skeletal attachment point.
    avatar.update(440 / 500, 'wave', false, 1);
    const before = top.mesh.getVertexPosition(top.vertex, new THREE.Vector3()).applyMatrix4(top.mesh.matrixWorld);
    avatar.update(740 / 500, 'wave', false, 1);
    const after = top.mesh.getVertexPosition(top.vertex, new THREE.Vector3()).applyMatrix4(top.mesh.matrixWorld);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion).z < -.98, `${kind} pitches backward toward local −Z, never forward +Z`);
    assert.ok(after.z < before.z - .05, `${kind} actual head top travels backward during the first quarter-turn: ${before.z} → ${after.z}`);
    avatar.dispose();
  }
});

test('full-size tower clears booth height before its tucked core widens beyond grounded spacing', async () => {
  const avatar = await create('monster-tower');
  const point = new THREE.Vector3();
  const core = new Set(['hips', 'spine', 'chest', 'neck', 'head']);
  for (let time = 280; time <= 1480; time += 10) {
    avatar.update(time / 500, 'wave', false, 1);
    avatar.root.traverseVisible(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
      for (let vertex = 0; vertex < indices.count; vertex++) {
        let weight = 0;
        for (let channel = 0; channel < 4; channel++) if (core.has(node.skeleton.bones[indices.getComponent(vertex, channel)]?.name)) weight += weights.getComponent(vertex, channel);
        if (weight < .5) continue;
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        if (Math.hypot(point.x, point.z) > .65) assert.ok(point.y > 1.12, `${time} ms wide core has already cleared booth top: ${point.toArray()}`);
      }
    });
  }
  avatar.dispose();
});
