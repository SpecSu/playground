import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import { clubGroupMotionAt } from '../lib/club-group-motion.ts';
import { ClubManualWorld } from '../lib/club-manual-world.ts';
import { clubMotionAt } from '../lib/club-scene-motion.ts';
import { makeClubWorld } from '../lib/club-scene-world.ts';
import { trainReleaseMotion, trainSlotPlacement, sampleTrainFrame } from '../lib/club-train-motion.ts';
import { UPLOADED_CAST, uploadedTemplate } from './helpers/uploaded-avatar.ts';

const start = 1791806400000;
const event = { id: 'heading-train', kind: 'train' as const, version: 3 as const, startsAt: start, endsAt: start + 16000, beatMs: 500, sourceClockBySlot: Array(10).fill(start) };
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
function velocity(now: number, slot: number) {
  const before = trainReleaseMotion(now - 1, slot, event)!, after = trainReleaseMotion(now + 1, slot, event)!;
  return { x: (after.x - before.x) * 500, z: (after.z - before.z) * 500 };
}

test('every uploaded train rider faces the track tangent across laps and resets earlier dance spins', async () => {
  for (const kind of UPLOADED_CAST) {
    const avatar = createClubAvatar(kind, kind, { template: await uploadedTemplate(kind) });
    const root = new THREE.Group(); root.scale.setScalar(CLUB_AVATAR_SCALE); root.add(avatar.root);
    for (const slot of [0, 3, 9]) for (const elapsed of [700, 961, 2307, 4189, 6500, 7111, 8777, 10913, 12851, 14333, 15501]) {
      avatar.update(1.31, 'spin', false, 1);
      const now = start + elapsed, sample = clubGroupMotionAt(now, slot, event, clubMotionAt(now, slot))!;
      const frame = sampleTrainFrame(now, event)!;
      const before = trainSlotPlacement(slot, frame.distance - .001, frame.formation), after = trainSlotPlacement(slot, frame.distance + .001, frame.formation);
      const tangent = Math.atan2(after.x - before.x, after.z - before.z);
      root.position.set(sample.motion.x, 0, sample.motion.z); root.rotation.y = sample.motion.heading;
      avatar.update(400.71, sample.motion.action, false, 1, sample.motion, sample.pose);
      const forward = new THREE.Vector3(0, 0, 1).transformDirection(avatar.root.getObjectByName('head')!.matrixWorld);
      assert.ok(Math.abs(angle(Math.atan2(forward.x, forward.z) - tangent)) < 1e-6, `${kind}/${slot}/${elapsed} head faces carriage travel`);
      assert.equal(avatar.root.getObjectByName('avatar-animation-pivot')!.rotation.y, 0, 'navigation owns train yaw');
    }
    avatar.dispose();
  }
});

test('the rendered world keeps train navigation authoritative over old manual headings', async () => {
  const template = await uploadedTemplate('sword-shield-dog');
  const world = makeClubWorld({ createAvatar: (_kind, id, options) => createClubAvatar('sword-shield-dog', id, { ...options, template }) });
  const person = { id: 'self', name: 'Self', preset: 'sword-shield-dog' as const, slot: 0, joinedAt: start - 1000, lastSeenAt: start, action: 'spin' as const, actionAt: 0 };
  world.syncParticipants([person], person.id);
  world.syncMovements([{ actorId: person.id, moveSequence: 1, joinedAt: person.joinedAt, groupId: null, mode: 'manual', ...clubMotionAt(start, 0), heading: -2.3, vx: 0, vz: 0, acceptedAt: start - 25 }]);
  for (const elapsed of [-25, 0, 350, 700, 1325, 4700, 6500, 8173, 10123, 12473, 14300, 15999]) {
    world.update(elapsed / 500, 'neon', false, 1, start + elapsed, undefined, { groupAction: event, manualIntent: { active: false, vx: 0, vz: 0, reconcileRequest: 1, reconcileStop: false } });
    if (elapsed < 700) continue;
    for (const rig of [...world.players.values(), ...world.ambient]) {
      if (!rig.root.visible) continue;
      const expected = clubGroupMotionAt(start + elapsed, rig.slot, event, clubMotionAt(start + elapsed, rig.slot))!.motion;
      const forward = new THREE.Vector3(0, 0, 1).transformDirection(rig.model.root.getObjectByName('head')!.matrixWorld);
      assert.ok(Math.abs(angle(Math.atan2(forward.x, forward.z) - expected.heading)) < 1e-6, `${rig.id}/${elapsed} has only the shared train yaw`);
      assert.equal(rig.root.rotation.y, expected.heading);
    }
  }
  world.dispose();
});

test('release heading follows the actual moving path instead of turning backward toward the next pose', () => {
  for (let slot = 0; slot < 10; slot++) for (let elapsed = 41; elapsed < 5000; elapsed += 41) {
    const now = event.endsAt + elapsed, motion = trainReleaseMotion(now, slot, event)!, v = velocity(now, slot);
    if (Math.hypot(v.x, v.z) < .1) continue;
    const error = Math.abs(angle(motion.heading - Math.atan2(v.x, v.z)));
    assert.ok(error < .002, `${slot}/${elapsed} moving heading error ${error}`);
    assert.ok(Math.abs(motion.speed - Math.hypot(v.x, v.z)) < .001, 'gait speed follows the combined transition velocity');
    const contact = motion.sampleAtDistance!(motion.distance);
    assert.ok(Math.abs(angle(contact.heading - motion.heading)) < 1e-8, 'contact path and body use the same facing');
  }
});

test('uploaded riders resume forward walking after the train without leftover local yaw', async () => {
  for (const [index, kind] of UPLOADED_CAST.entries()) {
    const avatar = createClubAvatar(kind, kind, { template: await uploadedTemplate(kind) });
    const root = new THREE.Group(); root.scale.setScalar(CLUB_AVATAR_SCALE); root.add(avatar.root);
    const slot = index % 10;
    for (const elapsed of [410, 943, 1435, 3257, 3671, 4173, 4613, 7000, 11000]) {
      const now = event.endsAt + elapsed, motion = trainReleaseMotion(now, slot, event)!, v = velocity(now, slot);
      if (Math.hypot(v.x, v.z) < .2 || motion.walkBlend < .99) continue;
      root.position.set(motion.x, 0, motion.z); root.rotation.y = motion.heading;
      avatar.update(elapsed / 500, 'dance', false, 1, motion);
      const forward = new THREE.Vector3(0, 0, 1).transformDirection(avatar.root.getObjectByName('head')!.matrixWorld);
      assert.ok(Math.abs(angle(Math.atan2(forward.x, forward.z) - Math.atan2(v.x, v.z))) < .15, `${kind}/${elapsed} walks face-first`);
      assert.ok(Math.abs(avatar.root.getObjectByName('avatar-animation-pivot')!.rotation.y) < 1e-8);
    }
    avatar.dispose();
  }
});

test('a late viewer releases an old manual row even when it already carries the finished train ID', () => {
  const control = new ClubManualWorld();
  const person = { id: 'self', name: 'Self', preset: 'milk-frog' as const, slot: 0, joinedAt: start - 1000, lastSeenAt: start, action: 'dance' as const, actionAt: 0 };
  const stale = { actorId: person.id, moveSequence: 1, joinedAt: person.joinedAt, groupId: event.id, mode: 'manual' as const, ...clubMotionAt(start, 0), heading: -2, vx: 0, vz: 0, acceptedAt: start };
  control.sync([person], person.id, [stale]);
  const now = event.endsAt + 7000;
  const canonicalAt = (slot: number, at: number) => trainReleaseMotion(at, slot, event)!;
  const args = { now, deltaSeconds: .025, group: event, canonicalAt, canonical: new Map(Array.from({ length: 10 }, (_, slot) => [slot, canonicalAt(slot, now)])) };
  assert.equal(control.update(args).motions.has(0), false, 'stale same-epoch row cannot override released roaming');
  control.sync([person], person.id, [{ ...stale, moveSequence: 2, acceptedAt: now }]);
  assert.equal(control.update({ ...args, now: now + 25 }).motions.has(0), true, 'a genuinely new manual command still wins');
});
