import { LEGACY_AVATAR_KINDS } from './helpers/legacy-avatar.ts';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar, type ClubAvatarKind } from '../lib/club-avatar-rig.ts';

const ACTIONS = ['love', 'laugh', 'punch', 'ghost'] as const;
async function create(kind: ClubAvatarKind, id = 'emotion-review') {
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return createClubAvatar(kind, id, { template: scene });
}
const pose = (root: THREE.Object3D) => {
  const values: Record<string, number[]> = {};
  root.traverse(node => { if (node instanceof THREE.Bone || node.name === 'avatar-animation-pivot') values[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]; });
  return values;
};
const position = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

test('four emotion samplers share a finite six-second envelope with anticipation and quiet recovery', async () => {
  assert.ok(existsSync(new URL('../lib/club-emotion-motion.ts', import.meta.url)), 'finite emotion sampler exists');
  const { emotionMotionAt, EMOTION_DURATION_MS, isEmotionAction } = await import('../lib/club-emotion-motion.ts');
  assert.equal(EMOTION_DURATION_MS, 6000);
  assert.equal(isEmotionAction('wave'), false);
  for (const action of ACTIONS) {
    assert.equal(isEmotionAction(action), true);
    const rest = emotionMotionAt(action, -1);
    for (const time of [0, 6000, 90000, NaN, Infinity]) assert.deepEqual(emotionMotionAt(action, time), rest);
    assert.ok(emotionMotionAt(action, 200).weight > 0 && emotionMotionAt(action, 200).weight < .6);
    assert.equal(emotionMotionAt(action, 2000).weight, 1);
    assert.ok(emotionMotionAt(action, 5750).weight < .3);
    assert.deepEqual(emotionMotionAt(action, 1260), emotionMotionAt(action, 1260));
  }
});

test('each emotion is a distinct deterministic whole-body gesture across the twelve non-blob legacy fixtures', async () => {
  for (const kind of LEGACY_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const a = await create(kind), b = await create(kind, 'late-join-different-id');
    const signatures = new Set();
    for (const action of ACTIONS) {
      a.update(2.14, action, false, 1); const expected = pose(a.root);
      b.update(93, 'spin', false, .2); b.update(2.14, action, false, 1);
      assert.deepEqual(pose(b.root), expected, `${kind}/${action} seeks directly without phase or frame history`);
      signatures.add(JSON.stringify(expected));
      a.update(0, action, false, 1); const start = pose(a.root);
      a.update(12, action, false, 1); assert.deepEqual(pose(a.root), start, `${kind}/${action} returns to its authored rest`);
    }
    assert.equal(signatures.size, 4, `${kind} has four distinct body gestures`);
    a.dispose(); b.dispose();
  }
});

test('punch drives alternate fists forward with a straightened elbow and torso torque, never a cheer', async () => {
  const avatar = await create('human-subeike');
  // The first left jab lands at 920 ms; the right cross follows at 1620 ms.
  avatar.update(920 / 500, 'punch', false, 1);
  const left = position(avatar.root, 'hand_L'), right = position(avatar.root, 'hand_R');
  const shoulder = position(avatar.root, 'upperArm_L');
  assert.ok(left.z > right.z + .10, `left fist attacks forward: ${left.z} vs ${right.z}`);
  assert.ok(left.z > shoulder.z + .25, 'extended fist points toward local +Z');
  assert.ok(left.y < shoulder.y + .10, 'fist stays around shoulder level rather than raised overhead');
  const leftTorso = avatar.root.getObjectByName('chest')!.quaternion.clone();
  avatar.update(1620 / 500, 'punch', false, 1);
  const otherLeft = position(avatar.root, 'hand_L'), otherRight = position(avatar.root, 'hand_R');
  assert.ok(otherRight.z > otherLeft.z + .10, 'right cross alternates the attack');
  assert.ok(avatar.root.getObjectByName('chest')!.quaternion.angleTo(leftTorso) > .10, 'body torque follows the striking shoulder');
  avatar.dispose();
});

test('capybara keeps hind paws grounded and translates emotion arms into distinct front-paw gestures', async () => {
  const avatar = await create('capybara');
  const signatures = new Set();
  for (const action of ACTIONS) {
    avatar.update(2.14, action, false, 1);
    signatures.add(JSON.stringify(['hand_L', 'hand_R', 'head'].map(name => position(avatar.root, name).toArray())));
    for (const time of [200, 920, 1620, 2600, 4300, 5750]) {
      avatar.update(time / 500, action, false, 1);
      for (const name of ['foot_L', 'foot_R']) assert.ok(Math.abs(position(avatar.root, name).y - .085) < .003, `${action}/${name} remains a quadruped contact`);
      for (const name of ['hand_L', 'hand_R']) assert.ok(position(avatar.root, name).y >= .083 && position(avatar.root, name).y < .30, `${action}/${name} is a bounded front-paw gesture`);
    }
  }
  assert.equal(signatures.size, 4);
  avatar.dispose();
});

test('legacy fixture emotion skin stays above the floor and within full 1m and core 0.65m envelopes', async (t) => {
  const point = new THREE.Vector3();
  const core = new Set(['hips', 'spine', 'chest', 'neck', 'head']);
  for (const kind of LEGACY_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const avatar = await create(kind);
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
    let minY = Infinity, maxRadius = 0, coreRadius = 0;
    for (const action of ACTIONS) for (let time = 0; time <= 6000; time += action === 'punch' ? 20 : 100) {
      avatar.update(time / 500, action, false, 1);
      avatar.root.traverseVisible(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
          node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
          const radius = Math.hypot(point.x, point.z);
          minY = Math.min(minY, point.y); maxRadius = Math.max(maxRadius, radius);
          if (masks.get(node)?.[vertex]) coreRadius = Math.max(coreRadius, radius);
          assert.ok(Number.isFinite(point.x + point.y + point.z), `${kind}/${action}/${time} finite skin`);
          assert.ok(point.y >= -.025, `${kind}/${action}/${time} floor ${point.y}`);
          assert.ok(radius <= 1, `${kind}/${action}/${time} full radius ${radius}`);
          if (masks.get(node)?.[vertex]) assert.ok(radius <= .65, `${kind}/${action}/${time} core radius ${radius}`);
        }
      });
    }
    t.diagnostic(JSON.stringify({ kind, minY, maxRadius, coreRadius }));
    avatar.dispose();
  }
});

test('armed dog retains every rigid grip-to-prop distance through all four emotions', async () => {
  const avatar = await create('sword-shield-dog');
  const point = new THREE.Vector3(), grip = new THREE.Vector3();
  const samples: { mesh: THREE.SkinnedMesh; vertex: number; hand: THREE.Bone; radius: number }[] = [];
  avatar.root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      const hand = node.skeleton.bones[indices.getX(vertex)];
      if (!hand?.name.startsWith('hand_') || weights.getX(vertex) < .99999) continue;
      node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
      samples.push({ mesh: node, vertex, hand, radius: point.distanceTo(hand.getWorldPosition(grip)) });
    }
  });
  assert.ok(samples.length > 100);
  for (const action of ACTIONS) for (let time = 0; time <= 6000; time += 100) {
    avatar.update(time / 500, action, false, 1);
    for (const sample of samples) {
      sample.mesh.getVertexPosition(sample.vertex, point).applyMatrix4(sample.mesh.matrixWorld);
      assert.ok(Math.abs(point.distanceTo(sample.hand.getWorldPosition(grip)) - sample.radius) < 1e-7, `${action}/${time} prop is rigid`);
    }
  }
  avatar.dispose();
});

test('emotions preserve room placement, yield to walking and groups, reset cleanly and are static under reduced motion', async () => {
  const a = await create('capybara'), b = await create('capybara');
  const motion = { slot: 0, x: 0, z: 0, heading: 0, distance: .4, speed: .6, walkBlend: 1, action: 'dance' as const, sampleAtDistance: () => ({ x: 0, z: 0, heading: 0 }) };
  const group = { kind: 'unison' as const, version: 2 as const, phase: 'perform' as const, beat: 1.4, weight: 1, wave: 0 };
  for (const action of ACTIONS) {
    a.update(2.14, action, false, 1);
    a.update(.4, 'dance', false, .8); b.update(.4, 'dance', false, .8); assert.deepEqual(pose(a.root), pose(b.root));
    a.update(2.14, action, true, 1); b.update(0, 'dance', true, .1); assert.deepEqual(pose(a.root), pose(b.root));
    a.update(2.14, action, false, 1, motion); b.update(2.14, 'dance', false, 1, motion); assert.deepEqual(pose(a.root), pose(b.root));
    a.update(2.14, action, false, 1, undefined, group); b.update(2.14, 'dance', false, 1, undefined, group); assert.deepEqual(pose(a.root), pose(b.root));
  }
  a.root.position.set(4, 0, 7); a.root.rotation.y = .8; a.root.scale.setScalar(.7);
  a.update(2.14, 'punch', false, 1);
  assert.deepEqual(a.root.position.toArray(), [4, 0, 7]); assert.equal(a.root.rotation.y, .8); assert.deepEqual(a.root.scale.toArray(), [.7, .7, .7]);
  a.dispose(); b.dispose();
});

test('emotion arm anticipation blends from authored rest and tiny limbs keep bounded joint excursions', async () => {
  for (const kind of ['human-subeike', 'banana-cat', 'sword-shield-dog'] as const) {
    const avatar = await create(kind);
    for (const action of ACTIONS) {
      avatar.update(0, action, false, 1);
      for (const side of ['L', 'R']) for (const segment of ['upperArm', 'forearm', 'hand']) {
        assert.ok(avatar.root.getObjectByName(`${segment}_${side}`)!.quaternion.angleTo(new THREE.Quaternion()) < 1e-7, `${kind}/${action} starts at authored arm rest`);
      }
      avatar.update(.002, action, false, 1);
      for (const side of ['L', 'R']) for (const segment of ['upperArm', 'forearm', 'hand']) {
        assert.ok(avatar.root.getObjectByName(`${segment}_${side}`)!.quaternion.angleTo(new THREE.Quaternion()) < .001, `${kind}/${action} has no IK branch snap at the start`);
      }
      if (kind === 'human-subeike') continue;
      for (let time = 0; time <= 6000; time += 100) {
        avatar.update(time / 500, action, false, 1);
        for (const side of ['L', 'R']) for (const segment of ['upperArm', 'forearm', 'hand']) {
          const angle = avatar.root.getObjectByName(`${segment}_${side}`)!.quaternion.angleTo(new THREE.Quaternion());
          assert.ok(angle <= (kind === 'sword-shield-dog' ? .65 : action === 'punch' ? 1.4 : 1.1), `${kind}/${action}/${time}/${segment} compact joint ${angle}`);
        }
      }
    }
    avatar.dispose();
  }
});

test('punch transfers body weight forward at impact and recoils into guard', async () => {
  const avatar = await create('human-subeike');
  avatar.update(600 / 500, 'punch', false, 1);
  const guard = position(avatar.root, 'head');
  avatar.update(920 / 500, 'punch', false, 1);
  assert.ok(position(avatar.root, 'head').z > guard.z + .07, 'head and torso follow the attacking fist');
  avatar.update(1300 / 500, 'punch', false, 1);
  assert.ok(position(avatar.root, 'head').z < guard.z + .025, 'weight recoils after the jab');
  assert.deepEqual(avatar.root.position.toArray(), [0, 0, 0], 'the lunge stays inside the fixed navigation root');
  avatar.dispose();
});

test('punch combinations snap to impact and recoil promptly instead of slowly waving', async () => {
  const { emotionMotionAt } = await import('../lib/club-emotion-motion.ts');
  for (const [peak, side] of [[920, 'leftPunch'], [1620, 'rightPunch'], [2320, 'leftPunch'], [3020, 'rightPunch'], [3720, 'leftPunch'], [4420, 'rightPunch']] as const) {
    assert.equal(emotionMotionAt('punch', peak)[side], 1);
    assert.ok(emotionMotionAt('punch', peak - 120)[side] < .01, `strike at ${peak} has a short explosive extension`);
    assert.ok(emotionMotionAt('punch', peak + 210)[side] < .01, `strike at ${peak} is back in guard rather than held forward`);
  }
});

test('every legacy fixture throws forceful punches with visible whole-body drive and recoil', async () => {
  for (const kind of LEGACY_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const avatar = await create(kind);
    avatar.update(600 / 500, 'punch', false, 1);
    const guardHead = position(avatar.root, 'head');
    const guardHand = position(avatar.root, 'hand_L');
    const guardChest = avatar.root.getObjectByName('chest')!.quaternion.clone();
    avatar.update(920 / 500, 'punch', false, 1);
    const attackHead = position(avatar.root, 'head');
    const attackHand = position(avatar.root, 'hand_L');
    const tiny = kind === 'banana-cat' || kind === 'sword-shield-dog';
    assert.ok(attackHead.z > guardHead.z + (tiny ? .045 : kind === 'capybara' ? .015 : .14), `${kind} has visible weight transfer: ${attackHead.z - guardHead.z}`);
    assert.ok(attackHand.z > guardHand.z + (tiny ? .055 : kind === 'capybara' ? .16 : .22), `${kind} drives its fist/paw forward: ${attackHand.z - guardHand.z}`);
    assert.ok(avatar.root.getObjectByName('chest')!.quaternion.angleTo(guardChest) > (tiny ? .10 : .18), `${kind} snaps the striking shoulder`);
    avatar.update(1200 / 500, 'punch', false, 1);
    assert.ok(position(avatar.root, 'head').z < attackHead.z - (tiny ? .04 : kind === 'capybara' ? .012 : .11), `${kind} visibly recoils after impact`);
    assert.deepEqual(avatar.root.position.toArray(), [0, 0, 0]);
    avatar.dispose();
  }
});
