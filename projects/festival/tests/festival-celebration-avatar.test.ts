import { uploadedTemplate } from './helpers/uploaded-avatar.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { CANONICAL_AVATAR_PRESETS } from '../lib/room-types.ts';

async function adapter() {
 const result = await import('../src/desert/celebration-avatar.ts').catch(() => null);
 assert.ok(result, 'festival celebration adapter exists'); return result;
}
async function make(kind: typeof CANONICAL_AVATAR_PRESETS[number] = 'human-subeike') {
 const source = await uploadedTemplate(kind);
 const avatar = createClubAvatar(kind, 'ceremony-test', { mode: 'desert', template: source });
 avatar.update(0, 'dance', false, 0); return avatar;
}
const world = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
const pose = (root: THREE.Object3D) => {
 const result: number[] = [];
 root.traverse(node => { if (node instanceof THREE.Bone || node.name === 'avatar-animation-pivot') result.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()); });
 return result;
};

test('every active avatar cheers with species-appropriate real paws or raised hands and hops without changing placement or scale', async () => {
 const { createFestivalCelebrationAvatar } = await adapter();
 for (const kind of CANONICAL_AVATAR_PRESETS) {
  const avatar = await make(kind); const celebration = createFestivalCelebrationAvatar(avatar, kind);
  avatar.root.position.set(12, 0, -16); avatar.root.rotation.y = .8;
  const original = avatar.root.position.toArray(), scale = avatar.root.scale.toArray();
  const hops = new Set<number>();
  for (const elapsed of [2, 2.2, 2.4, 2.6, 12, 22]) {
   avatar.update(elapsed, 'dance', false, 0);
   const restingHands = ['L', 'R'].map(side => world(avatar.root, `hand_${side}`).y);
   celebration.update(elapsed, false, 1);
   for (const [index, side] of ['L', 'R'].entries()) {
    const handY = world(avatar.root, `hand_${side}`).y;
    if (kind === 'miaocuijiao') assert.ok(handY - celebration.lift > restingHands[index] + .02, `${kind} ${side} short forepaw lifts independently of the hop`);
    else assert.ok(handY > world(avatar.root, `upperArm_${side}`).y + .035, `${kind} ${side} hand is raised`);
   }
   assert.deepEqual(avatar.root.position.toArray(), original); assert.deepEqual(avatar.root.scale.toArray(), scale);
   assert.ok(pose(avatar.root).every(Number.isFinite)); hops.add(celebration.lift);
  }
  assert.ok(hops.size > 2, `${kind} has a real hopping cycle`);
  celebration.dispose(); avatar.dispose();
 }
});

test('celebration is seekable, reduced-motion still, and releases cleanly to the next normal pose', async () => {
 const { createFestivalCelebrationAvatar } = await adapter();
 const avatar = await make(); const celebration = createFestivalCelebrationAvatar(avatar, 'id');
 const idle = pose(avatar.root);
 celebration.update(2); const first = pose(avatar.root);
 celebration.update(12); celebration.update(2); assert.deepEqual(pose(avatar.root), first);
 celebration.update(12, true); const quiet = pose(avatar.root);
 celebration.update(24, true); assert.deepEqual(pose(avatar.root), quiet); assert.equal(celebration.lift, 0);
 celebration.update(null); assert.deepEqual(pose(avatar.root), idle);
 celebration.update(2); avatar.update(1.7, 'wave', false, .5); const normal = pose(avatar.root);
 celebration.update(null); assert.deepEqual(pose(avatar.root), normal);
 for (const elapsed of [-1, 35, NaN, Infinity]) { celebration.update(elapsed); assert.deepEqual(pose(avatar.root), normal); }
 celebration.dispose(); celebration.dispose(); celebration.update(2); assert.deepEqual(pose(avatar.root), normal); avatar.dispose();
});

test('inactive celebration adds no matrix or skeleton work to ordinary building frames', async () => {
 const { createFestivalCelebrationAvatar } = await adapter();
 const avatar = await make(); const celebration = createFestivalCelebrationAvatar(avatar, 'idle');
 let matrices = 0; const update = avatar.root.updateMatrixWorld.bind(avatar.root);
 avatar.root.updateMatrixWorld = (...args) => { matrices++; update(...args); };
 celebration.update(null); celebration.update(null);
 assert.equal(matrices, 0); celebration.dispose(); avatar.dispose();
});
