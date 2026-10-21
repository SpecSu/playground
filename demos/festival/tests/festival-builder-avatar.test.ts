import { uploadedTemplate } from './helpers/uploaded-avatar.ts';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { CANONICAL_AVATAR_PRESETS } from '../lib/room-types.ts';

async function adapter() {
  assert.ok(existsSync(new URL('../lib/festival-builder-avatar.ts', import.meta.url)), 'festival builder adapter exists');
  return import('../lib/festival-builder-avatar.ts');
}
async function make(kind: typeof CANONICAL_AVATAR_PRESETS[number] = 'human-subeike') {
  const source = await uploadedTemplate(kind);
  const avatar = createClubAvatar(kind, 'builder-test', { mode: 'desert', template: source });
  avatar.update(0, 'dance', false, 0);
  return avatar;
}
const world = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
const state = (root: THREE.Object3D) => {
  const result: number[] = [];
  root.traverse(node => { if (node instanceof THREE.Bone) result.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()); });
  return result;
};

test('every active preset holds a visible hammer, cycles real joints and leaves support feet and body scale grounded', async () => {
  const { createFestivalBuilderAvatar } = await adapter();
  for (const kind of CANONICAL_AVATAR_PRESETS) {
    const avatar = await make(kind);
    const builder = createFestivalBuilderAvatar(avatar);
    const support = ['foot_L', 'foot_R'];
    const feet = support.map(name => world(avatar.root, name));
    const scale = avatar.root.scale.toArray();
    let high: THREE.Vector3 | undefined;
    let low: THREE.Vector3 | undefined;
    const signatures = new Set<string>();
    for (const elapsed of [0, .7, 1, 1.3, 1.6, 4.4, 11.9]) {
      avatar.update(elapsed, 'dance', false, 0);
      builder.update(elapsed);
      const hammer = avatar.root.getObjectByName('festival-builder-hammer');
      assert.ok(hammer?.visible, `${kind} holds hammer`);
      assert.equal(hammer.parent?.name, 'hand_R');
      const head = world(avatar.root, 'festival-builder-hammer-head');
      if (elapsed === 1) high = head;
      if (elapsed === 1.6) low = head;
      support.forEach((name, i) => assert.ok(world(avatar.root, name).distanceTo(feet[i]) < .008, `${kind} ${name} stays planted`));
      assert.deepEqual(avatar.root.scale.toArray(), scale);
      assert.deepEqual(avatar.root.getObjectByName('avatar-animation-pivot')!.scale.toArray(), [1, 1, 1]);
      const pose = state(avatar.root);
      assert.ok(pose.every(Number.isFinite));
      signatures.add(JSON.stringify(pose));
    }
    assert.ok(signatures.size >= 4, `${kind} cycles articulated strike`);
    assert.ok(high!.distanceTo(low!) > .07, `${kind} hammer visibly travels`);
    builder.dispose(); avatar.dispose();
  }
});

test('absolute job time is deterministic and reduced motion holds a steady working pose', async () => {
  const { createFestivalBuilderAvatar } = await adapter();
  const avatar = await make(); const builder = createFestivalBuilderAvatar(avatar);
  builder.update(2); const first = state(avatar.root);
  builder.update(9); builder.update(2); assert.deepEqual(state(avatar.root), first);
  builder.update(2, true); const quiet = state(avatar.root);
  builder.update(10, true); assert.deepEqual(state(avatar.root), quiet);
  builder.dispose(); avatar.dispose();
});

test('completion, cancellation, invalid time and disposal remove the tool and preserve the next normal avatar pose', async () => {
  const { createFestivalBuilderAvatar } = await adapter();
  const avatar = await make(); const builder = createFestivalBuilderAvatar(avatar);
  const idle = state(avatar.root);
  builder.update(2); builder.update(null); assert.deepEqual(state(avatar.root), idle);
  assert.equal(avatar.root.getObjectByName('festival-builder-hammer'), undefined);
  for (const elapsed of [-1, 12, NaN, Infinity]) { builder.update(elapsed); assert.equal(avatar.root.getObjectByName('festival-builder-hammer'), undefined); }
  builder.update(2); avatar.update(1.7, 'wave', false, 0.5); const normal = state(avatar.root);
  builder.update(null); assert.deepEqual(state(avatar.root), normal);
  builder.update(3);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const name of ['festival-builder-hammer', 'festival-builder-impact']) avatar.root.getObjectByName(name)!.traverse(node => { if (node instanceof THREE.Mesh) { resources.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) resources.add(m); } });
  let released = 0; for (const resource of resources) resource.addEventListener('dispose', () => released++);
  builder.dispose(); builder.dispose(); assert.equal(released, resources.size);
  assert.equal(avatar.root.getObjectByName('festival-builder-hammer'), undefined);
  builder.update(1); assert.equal(avatar.root.getObjectByName('festival-builder-hammer'), undefined);
  avatar.dispose();
});

test('a small impact puff appears only on downstroke and disappears on release or reduced motion', async () => {
  const { createFestivalBuilderAvatar } = await adapter();
  const avatar = await make(); const builder = createFestivalBuilderAvatar(avatar);
  builder.update(1.26);
  let puff = avatar.root.getObjectByName('festival-builder-impact');
  assert.ok(puff, 'owned impact cue exists'); assert.equal(puff.visible, false);
  builder.update(1.6); puff = avatar.root.getObjectByName('festival-builder-impact')!;
  assert.equal(puff.visible, true);
  assert.ok(puff.getWorldPosition(new THREE.Vector3()).distanceTo(world(avatar.root, 'festival-builder-hammer-head')) < .15);
  builder.update(1.6, true); assert.equal(puff.visible, false);
  builder.update(null); assert.equal(avatar.root.getObjectByName('festival-builder-impact'), undefined);
  builder.dispose(); avatar.dispose();
});
