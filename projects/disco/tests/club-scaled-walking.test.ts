import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { UPLOADED_CAST, uploadedTemplate, actualBounds } from './helpers/uploaded-avatar.ts';
import { TRAIN_DECK_HEIGHT } from '../lib/club-train-motion.ts';

for (const kind of UPLOADED_CAST) test(`${kind}: doubled navigation roots preserve planted feet and native gait proportions`, async () => {
  const template = await uploadedTemplate(kind);
  const native = createClubAvatar(kind, 'scaled-walk', { template });
  const doubled = createClubAvatar(kind, 'scaled-walk', { template });
  const parent = new THREE.Group(); parent.scale.setScalar(2); parent.add(doubled.root);
  try {
    for (let frame = 0; frame < 24; frame++) {
      const distance = frame * .037, heading = .62;
      const at = (d: number) => ({ x: Math.sin(heading) * d, z: Math.cos(heading) * d, heading });
      for (const [avatar, scale] of [[native, 1], [doubled, 2]] as const) {
        const point = at(distance);
        avatar.root.position.set(point.x, 0, point.z); avatar.root.rotation.y = heading;
        avatar.update(frame / 24, 'dance', false, 1, {
          slot: 0, x: point.x * scale, z: point.z * scale, heading, speed: scale,
          distance: distance * scale, walkBlend: 1, action: 'dance',
          sampleAtDistance: d => { const p = at(d / scale); return { x: p.x * scale, z: p.z * scale, heading }; },
        });
      }
      const a = actualBounds(native.root), b = actualBounds(doubled.root);
      assert.ok(b.min.y >= -.06, `${kind} enlarged feet clear the floor: ${b.min.y}`);
      assert.ok(a.min.distanceTo(b.min.clone().multiplyScalar(.5)) < .001, `${kind} world-scaled minimum keeps the same planted gait`);
      assert.ok(a.max.distanceTo(b.max.clone().multiplyScalar(.5)) < .001, `${kind} world-scaled maximum keeps the same planted gait`);
    }
  } finally { native.dispose(); doubled.dispose(); }
});

test('all doubled uploaded models stand on the unchanged world-space train deck', async () => {
  for (const kind of UPLOADED_CAST) {
    const avatar = createClubAvatar(kind, 'scaled-train', { template: await uploadedTemplate(kind) });
    const parent = new THREE.Group(); parent.scale.setScalar(2); parent.add(avatar.root);
    const pose = { kind: 'train' as const, version: 3 as const, phase: 'perform' as const, beat: 4.3, weight: 1, wave: 0, trainPhase: 'ride' as const, trainHop: 0 };
    avatar.update(0, 'dance', false, 1, undefined, { ...pose, trainLift: 0 });
    const grounded = actualBounds(avatar.root);
    avatar.update(0, 'dance', false, 1, undefined, { ...pose, trainLift: TRAIN_DECK_HEIGHT });
    const riding = actualBounds(avatar.root);
    assert.ok(Math.abs(riding.min.y - grounded.min.y - TRAIN_DECK_HEIGHT) < 1e-6, `${kind} receives exactly one world-space deck lift`);
    assert.ok(riding.min.y >= TRAIN_DECK_HEIGHT - .06 && riding.min.y < TRAIN_DECK_HEIGHT + .08, `${kind} feet rest on the deck, not above it`);
    avatar.dispose();
  }
});
