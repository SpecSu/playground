import assert from 'node:assert/strict';
import test from 'node:test';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import * as THREE from 'three';
import { avatarLabelAnchor } from '../lib/club-camera.ts';
import { emotionBubbleAnchor } from '../lib/club-emotion-bubble.ts';

test('v0.5.2 uses 1.5x authored scene size, exactly 75 percent of v0.5.1', () => {
  assert.equal(CLUB_AVATAR_SCALE, 1.5);
  assert.equal(CLUB_AVATAR_SCALE / 2, .75);
});

test('normal scene nickname and bubble sit close to rest height, with only live jump lift added', () => {
  const root = new THREE.Group(); root.scale.setScalar(CLUB_AVATAR_SCALE); root.userData.avatarDisplayScale = CLUB_AVATAR_SCALE;
  const rest = avatarLabelAnchor(root, 1.8, new THREE.Vector3(), 'human-lx');
  assert.ok(rest.y > 1.8 * CLUB_AVATAR_SCALE && rest.y < 1.8 * CLUB_AVATAR_SCALE + .35, 'no permanent maximum-action headroom');
  const jump = avatarLabelAnchor(root, 1.8, new THREE.Vector3(), 'human-lx', .4);
  assert.ok(Math.abs(jump.y - rest.y - .4 * CLUB_AVATAR_SCALE) < 1e-9);
  const bubble = emotionBubbleAnchor(root, 1.8, new THREE.Vector3(), 'human-lx');
  assert.ok(bubble.y > rest.y && bubble.y - rest.y <= .25);
});
