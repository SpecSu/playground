import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { Participant } from '../lib/room-types.ts';
import { ClubCameraController, avatarLabelAnchor, projectCameraLabel } from '../lib/club-camera.ts';
import { emotionBubbleAt, emotionBubbleAnchor } from '../lib/club-emotion-bubble.ts';

const participant = (action: Participant['action'] = 'love', actionAt = 1000): Participant => ({
  id: 'self', name: 'Self', preset: 'frog', slot: 0, joinedAt: 100, lastSeenAt: actionAt,
  action, actionAt, actionUntil: actionAt + 6000,
});

test('only explicit current emotion actions yield the exact requested emoji and readable label', () => {
  for (const [action, emoji, label] of [
    ['love', '❤️', '喜欢'], ['laugh', '🤣', '大笑'], ['punch', '🥊', '挥拳攻击'], ['ghost', '👻', '搞怪'],
  ] as const) {
    const bubble = emotionBubbleAt(participant(action), 2000);
    assert.equal(bubble?.action, action);
    assert.equal(bubble?.emoji, emoji);
    assert.equal(bubble?.label, label);
  }
  for (const action of ['dance', 'bounce', 'spin', 'wave'] as const) assert.equal(emotionBubbleAt(participant(action), 2000), null);
  assert.equal(emotionBubbleAt(undefined, 2000), null, 'ambient actors have no accepted action');
});

test('bubbles obey the accepted finite interval and reject stale membership/history', () => {
  const person = participant();
  assert.equal(emotionBubbleAt(person, 999), null);
  assert.ok(emotionBubbleAt(person, 1000), 'immediate preview is visible from its first frame');
  assert.ok(emotionBubbleAt(person, 6999));
  assert.equal(emotionBubbleAt(person, 7000), null);
  assert.equal(emotionBubbleAt(person, 999999), null);
  assert.equal(emotionBubbleAt({ ...person, actionUntil: undefined }, 2000), null);
  assert.equal(emotionBubbleAt({ ...person, actionUntil: Infinity }, 2000), null);
  assert.equal(emotionBubbleAt({ ...person, joinedAt: 1500 }, 2000), null, 'old membership action cannot be shown on a new arrival');
  for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(emotionBubbleAt(person, invalid), null);
});

test('the accepted action clock drives one pop, a stable hold and a bounded fade', () => {
  const person = participant();
  const start = emotionBubbleAt(person, 1000)!;
  const peak = emotionBubbleAt(person, 1160)!;
  const hold = emotionBubbleAt(person, 2000)!;
  const fading = emotionBubbleAt(person, 6750)!;
  assert.ok(start.scale < 1 && start.opacity > 0, 'start is immediately visible and ready to pop');
  assert.ok(peak.scale > 1 && peak.scale < 1.2);
  assert.equal(hold.scale, 1);
  assert.equal(hold.opacity, 1);
  assert.equal(fading.scale, 1, 'fade does not sway the fixed anchor');
  assert.ok(fading.opacity > 0 && fading.opacity < 1);
  const repeat = emotionBubbleAt(participant('love', 6750), 6750)!;
  assert.equal(repeat.scale, start.scale, 'repeated tap starts a new pop');
  assert.equal(repeat.opacity, start.opacity);
  for (let now = 1000; now < 7000; now += 33) {
    const frame = emotionBubbleAt(person, now)!;
    assert.ok(Number.isFinite(frame.scale) && frame.scale > 0 && frame.scale < 1.2);
    assert.ok(frame.opacity >= 0 && frame.opacity <= 1);
    assert.equal(emotionBubbleAt(person, now, true)?.scale, 1, 'reduced motion removes the pop');
  }
});

test('a peer arriving mid-action shows the current hold/fade without restarting the pop', () => {
  assert.deepEqual(emotionBubbleAt(participant('punch'), 4500), emotionBubbleAt(structuredClone(participant('punch')), 4500));
  assert.equal(emotionBubbleAt(participant('punch'), 4500)?.scale, 1);
  assert.ok(emotionBubbleAt({ ...participant('punch'), actionUntil: 4800 }, 4700)!.opacity < 1, 'authoritative shortened expiry is honored');
});

test('bubble anchors stay above names and ignore animated body/head transforms', () => {
  const navigation = new THREE.Group();
  const body = new THREE.Group(); navigation.add(body);
  const target = new THREE.Vector3();
  const name = avatarLabelAnchor(navigation, 2, new THREE.Vector3(), 'frog');
  const fixedY = emotionBubbleAnchor(navigation, 2, target, 'frog').y;
  assert.ok(fixedY > name.y + 0.3);
  for (let frame = 0; frame < 100; frame++) {
    navigation.position.set(frame / 20, 0, -frame / 30);
    navigation.rotation.y = frame;
    navigation.scale.setScalar(0.3 + frame / 100);
    body.position.y = Math.sin(frame);
    body.rotation.z = frame;
    body.scale.y = 1 + Math.sin(frame) * 0.3;
    assert.equal(emotionBubbleAnchor(navigation, 2, target, 'frog'), target, 'reuses the render-loop vector');
    assert.deepEqual(target.toArray(), [navigation.position.x, fixedY, navigation.position.z]);
  }
});

test('fixed bubbles project in overview and third-person cameras with no billboard rotation dependency', () => {
  const navigation = new THREE.Group();
  for (const mode of ['overview', 'third-person'] as const) for (const width of [320, 402, 1200]) {
    const height = 640;
    const camera = new ClubCameraController().update({
      mode, width, height, orbit: { yaw: 0, pitch: 0 }, deltaSeconds: 0, reducedMotion: false,
      subject: { id: 'self', position: navigation.position, heading: 0, height: 2, radius: 0.65 },
    });
    const point = emotionBubbleAnchor(navigation, 2, new THREE.Vector3(), 'frog');
    assert.ok(projectCameraLabel(point, camera, width, height), `${mode}/${width} bubble anchor is on screen`);
  }
});

test('bubble projection clamps its full speech panel inside a narrow viewport and rejects points behind camera', async () => {
  const { projectEmotionBubble } = await import('../lib/club-emotion-bubble.ts');
  const camera = new THREE.PerspectiveCamera(52, 320 / 640, 0.08, 80);
  camera.position.set(0, 2, -5); camera.lookAt(0, 2, 0); camera.updateMatrixWorld();
  const scratch = new THREE.Vector3();
  const tooHigh = projectEmotionBubble(new THREE.Vector3(0, 10, 0), camera, 320, 640, scratch);
  assert.ok(tooHigh);
  assert.ok(tooHigh.y >= 52, 'the full 46px panel at its maximum 1.12 scale stays below the viewport top');
  const atEdge = projectEmotionBubble(new THREE.Vector3(10, 2, 0), camera, 320, 640, scratch);
  assert.ok(atEdge && atEdge.x >= 34 && atEdge.x <= 286);
  const aboveName = projectEmotionBubble(new THREE.Vector3(0, 2, 0), camera, 320, 640, scratch, 300);
  assert.ok(aboveName && aboveName.y <= 272, 'speech tail clears the nickname');
  assert.equal(projectEmotionBubble(new THREE.Vector3(0, 2, -8), camera, 320, 640, scratch), null);
});
