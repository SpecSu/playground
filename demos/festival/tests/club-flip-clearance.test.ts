import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar, type ClubAvatarKind } from '../lib/club-avatar-rig.ts';
import { ClubManualWorld } from '../lib/club-manual-world.ts';
import { clubMotionAt } from '../lib/club-scene-motion.ts';

const epoch = 1791806400000;
async function avatar(kind: ClubAvatarKind, id: string) {
 const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
 const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
 return createClubAvatar(kind, id, { template: scene });
}

test('opposing full-size dog and tower flips have disjoint actual skins after opening close manual spacing', async () => {
 for (const [kind, elapsed] of [['dog', 760], ['monster-tower', 820]] as const) {
  const controls = new ClubManualWorld();
  const people = [0, 1].map(slot => ({ id: `pair-${slot}`, name: `Pair ${slot}`, preset: kind, slot, joinedAt: epoch - 1000, lastSeenAt: epoch, action: 'wave' as const, actionAt: epoch, actionUntil: epoch + 6000 }));
  const origins = [{ x: -.6625, z: 4 }, { x: .6625, z: 4 }];
  const canonical = new Map(origins.map((point, slot) => [slot, { ...clubMotionAt(epoch, slot), ...point, speed: 0, walkBlend: 0, action: 'wave' as const }]));
  controls.sync(people, people[0].id, people.map((person, slot) => ({ actorId: person.id, moveSequence: 1, joinedAt: person.joinedAt, groupId: null, mode: 'manual' as const, ...origins[slot], heading: 0, vx: 0, vz: 0, acceptedAt: epoch })));
  const update = (at: number) => controls.update({ now: epoch + at, deltaSeconds: .025, canonical, canonicalAt: slot => canonical.get(slot)! });
  for (let time = 0; time < elapsed; time += 25) update(time);
  const poses = update(elapsed).motions;
  const left = await avatar(kind, 'left'), right = await avatar(kind, 'right');
  try {
   for (const [slot, model] of [left, right].entries()) {
    const pose = poses.get(slot)!;
    model.root.position.set(pose.x, 0, pose.z);
    model.root.rotation.y = -Math.PI / 2 + slot * Math.PI;
    model.update(elapsed / 500, 'wave', false, 1);
   }
   const a = new THREE.Box3().setFromObject(left.root, true);
   const b = new THREE.Box3().setFromObject(right.root, true);
   assert.ok(b.min.x - a.max.x > .05, `${kind} full actual skin volumes remain separated at the previously intersecting phase`);
   assert.ok(a.min.y >= -.025 && b.min.y >= -.025);
  } finally { left.dispose(); right.dispose(); }
 }
});
