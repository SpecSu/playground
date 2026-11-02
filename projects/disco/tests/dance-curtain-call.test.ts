import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DANCE_CURTAIN_CALL_MS, danceCurtainCallPose, danceCurtainCallActive, dancePresentationActive } from '../lib/dance-curtain-call.ts';
import { ClubDanceStaging, danceStageActive, DANCE_STAGE_HEADING } from '../lib/club-dance-staging.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { LEGACY_AVATAR_KINDS } from './helpers/legacy-avatar.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';
const round = { id: 'r', seed: 's', version: 2 as const, startsAt: 1000, endsAt: 52120 };

test('curtain call extends presentation only, with exact deterministic spin then bow boundaries', () => {
  assert.equal(DANCE_CURTAIN_CALL_MS, 2400);
  assert.equal(danceStageActive(round, round.endsAt), false);
  assert.equal(danceCurtainCallActive(round, round.endsAt - 1), false);
  assert.equal(danceCurtainCallActive(round, round.endsAt), true);
  assert.equal(dancePresentationActive(round, round.endsAt + 2399), true);
  assert.equal(dancePresentationActive(round, round.endsAt + 2400), false);
  assert.equal(danceCurtainCallPose(round, round.endsAt + 500)?.turn, Math.PI);
  assert.equal(danceCurtainCallPose(round, round.endsAt + 1000)?.turn, Math.PI * 2);
  assert.equal(danceCurtainCallPose(round, round.endsAt + 1500)?.bow, 1);
  assert.ok(danceCurtainCallPose(round, round.endsAt + 2399)!.bow < 0.0001);
  assert.equal(danceCurtainCallPose(round, round.endsAt + 2400), null);
  assert.deepEqual(danceCurtainCallPose(round, round.endsAt + 1700), danceCurtainCallPose(round, round.endsAt + 1700));
  assert.equal(danceCurtainCallPose(round, round.endsAt + 500, true)?.turn, 0);
  assert.equal(danceCurtainCallPose(round, round.endsAt + 1500, true)?.bow, 0.16);
});

test('all legacy fixture skeletons keep feet planted, scale intact and restore bone/navigation transforms', async () => {
  for (const kind of [...LEGACY_AVATAR_KINDS, 'dj-cockatoo'] as const) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene: template } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = createClubAvatar(kind, kind, { template, mode: kind === 'dj-cockatoo' ? 'dj' : 'dance' });
    await model.ready;
    const root = new THREE.Group(); root.add(model.root); root.position.set(2, 0, 3); root.rotation.y = 0.3;
    const rig = { id: 'self', preset: kind, slot: 0, root, model, motion: {slot: 0,x:2,z:3,heading:0.3,speed:0,distance:0,walkBlend:0,action:'dance'} } as unknown as AvatarRig;
    const staging = new ClubDanceStaging();
    const bones: THREE.Bone[] = [];
    model.root.traverse(node => { if ((node as THREE.Bone).isBone) bones.push(node as THREE.Bone); });
    for (const elapsed of [0, 250, 500, 999, 1000, 1500, 1800, 2300, 2399]) {
      model.update(0, 'dance', true, 0.9, rig.motion); root.updateMatrixWorld(true);
      const boneRotations = bones.map(bone => bone.quaternion.clone());
      let quadruped = false;
      model.root.traverse(node => { if (node.userData.speciesRig === 'quadruped') quadruped = true; });
      const contacts = bones.filter(bone => /^foot_[LR]$/.test(bone.name) || quadruped && /^hand_[LR]$/.test(bone.name));
      const feetY = contacts.map(bone => bone.getWorldPosition(new THREE.Vector3()).y);
      if (kind === 'dj-cockatoo') staging.apply([], null, 0, false, 0.9, round.endsAt + elapsed, null, round, rig);
      else staging.apply([rig], 'self', 0, false, 0.9, round.endsAt + elapsed, null, round);
      root.updateMatrixWorld(true);
      assert.deepEqual(root.scale.toArray(), [1,1,1], `${kind} never squashes during ceremony`);
      contacts.forEach((bone, i) => assert.ok(Math.abs(bone.getWorldPosition(new THREE.Vector3()).y - feetY[i]) < 1e-6, `${kind} feet remain grounded at ${elapsed}`));
      if (kind === 'dj-cockatoo') { assert.equal(root.rotation.y, 0.3); assert.deepEqual(root.position.toArray(), [2,0,3]); }
      else assert.ok(Math.abs(root.rotation.y - DANCE_STAGE_HEADING - danceCurtainCallPose(round, round.endsAt + elapsed)!.turn) < 1e-8);
      staging.restore();
      assert.deepEqual(root.position.toArray(), [2,0,3]);
      assert.ok(Math.abs(root.rotation.y - 0.3) < 1e-8);
      bones.forEach((bone, i) => assert.ok(bone.quaternion.angleTo(boneRotations[i]) < 1e-7, `${kind} bone ${bone.name} restored`));
    }
    model.dispose();
  }
});


test('scene retains fixed front camera and input locks through ceremony but capture/scoring clock stays separate', () => {
  const source = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
  assert.match(source, /const danceActive = dancePresentationActive\(snapshot\.danceRound, nowServer\)/);
  assert.match(source, /const isDanceActive = \(\) => dancePresentationActive/);
  assert.match(source, /position: \{ \.\.\.danceStagePosition\(0, true\), y: 0 \}/);
  assert.match(source, /snapshot\.danceFeedback, snapshot\.danceRound, world\.dj\)/);
  assert.match(source, /if \(danceStageActive\(snapshot\.danceRound, nowServer\) && snapshot\.danceRound && snapshot\.onDanceSnapshot/);
  assert.ok(source.indexOf('danceStage.restore()') < source.indexOf('world.update(beat'));
});
