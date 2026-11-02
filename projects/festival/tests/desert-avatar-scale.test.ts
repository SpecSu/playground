import { uploadedTemplate } from './helpers/uploaded-avatar.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar, CLUB_AVATAR_KINDS } from '../lib/club-avatar-rig.ts';
import { createFestivalBuilderAvatar } from '../lib/festival-builder-avatar.ts';
import { createFestivalCelebrationAvatar } from '../src/desert/celebration-avatar.ts';

const active = CLUB_AVATAR_KINDS;
async function pair(kind: typeof active[number]) {
 const source = await uploadedTemplate(kind);
 return [2, 4].map(scale => { const avatar = createClubAvatar(kind, `scale:${kind}`, { mode: 'desert', template: source }); avatar.root.scale.setScalar(scale); avatar.update(0, 'dance', false, 0); return avatar; });
}
const world = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

test('current 2→4× walking keeps proportional foot contacts and strides across every real avatar', async () => {
 for (const kind of active) {
  const avatars = await pair(kind);
  try {
   for (const distance of [.13, .37, .71, 1.1, 1.8]) {
    avatars.forEach((avatar, i) => {
     const scale = (i + 1) * 2, heading = .8, x = 12 * scale, z = -16 * scale;
     avatar.root.position.set(x, 0, z); avatar.root.rotation.y = heading;
     avatar.update(distance, 'dance', false, 0, {slot:0,x,z,heading,speed:2.7*scale,distance:distance*scale,walkBlend:1,action:'dance',sampleAtDistance:sample=>({x:x+Math.sin(heading)*(sample-distance*scale),z:z+Math.cos(heading)*(sample-distance*scale),heading})});
    });
    for (const name of ['foot_L', 'foot_R']) {
     const unit = world(avatars[0].root, name), doubled = world(avatars[1].root, name).multiplyScalar(.5);
     assert.ok(unit.distanceTo(doubled) < .002, `${kind} ${name} world contact scales proportionally: ${unit.distanceTo(doubled)}`);
    }
   }
  } finally { avatars.forEach(avatar => avatar.dispose()); }
 }
});

test('current 2→4× builder keeps the hammer attached and proportionally sized with planted support feet', async () => {
 for (const kind of active) {
  const avatars = await pair(kind), builders = avatars.map(createFestivalBuilderAvatar);
  const supports = avatars.map(avatar => ['foot_L', 'foot_R'].map(name => world(avatar.root, name)));
  try {
   for (const elapsed of [.7, 1, 1.6, 4.4]) {
    avatars.forEach((avatar, i) => { avatar.update(elapsed, 'dance', false, 0); builders[i].update(elapsed); });
    for (let i=0;i<2;i++) {
     const hammer = avatars[i].root.getObjectByName('festival-builder-hammer')!;
     assert.equal(hammer.parent!.name, 'hand_R');
     ['foot_L','foot_R'].forEach((name, foot) => assert.ok(world(avatars[i].root, name).distanceTo(supports[i][foot]) < .008));
    }
    const unit = world(avatars[0].root, 'festival-builder-hammer-head'), doubled = world(avatars[1].root, 'festival-builder-hammer-head').multiplyScalar(.5);
    assert.ok(unit.distanceTo(doubled) < .002, `${kind} tool scales with its hand`);
   }
  } finally { builders.forEach(builder => builder.dispose()); avatars.forEach(avatar => avatar.dispose()); }
 }
});

test('current 2→4× ceremony keeps the same local hop and doubles the visible hand and body motion', async () => {
 for (const kind of active) {
  const avatars = await pair(kind), layers = avatars.map(avatar => createFestivalCelebrationAvatar(avatar, 'scale'));
  try {
   for (const elapsed of [2, 2.2, 2.4, 2.6]) {
    avatars.forEach((avatar, i) => { avatar.update(elapsed, 'dance', false, 0); layers[i].update(elapsed); });
    assert.equal(layers[0].lift, layers[1].lift, 'local hop must not be doubled twice');
    for (const name of ['head','hand_L','hand_R']) assert.ok(world(avatars[0].root,name).distanceTo(world(avatars[1].root,name).multiplyScalar(.5)) < .002, `${kind} ${name} celebration scales proportionally`);
   }
  } finally { layers.forEach(layer => layer.dispose()); avatars.forEach(avatar => avatar.dispose()); }
 }
});
