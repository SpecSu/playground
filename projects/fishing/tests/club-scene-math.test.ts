import assert from 'node:assert/strict';
import test from 'node:test';
import { beatAt, choreographyAt, dancerSlot, stablePhase, pixelRatio, createDisposalScope, stagePosition, clubCameraFrustum } from '../lib/club-scene-math.ts';

test('beat time is shared-clock based, deterministic, and never negative before scheduled start', () => {
  assert.equal(beatAt(12_000, 10_000, 120), 4);
  assert.equal(beatAt(9_000, 10_000, 120), 0);
  assert.equal(beatAt(12_000, 10_000, 120), beatAt(11_700 + 300, 10_000, 120));
});

test('dance movements are deterministic and distinguish each selected move', () => {
  const sample = (action: 'dance' | 'bounce' | 'spin' | 'wave') => choreographyAt(2.3, action, 0.4, false);
  assert.deepEqual(sample('dance'), sample('dance'));
  assert.notDeepEqual(sample('dance'), sample('bounce'));
  assert.notDeepEqual(sample('dance'), sample('spin'));
  assert.notDeepEqual(sample('dance'), sample('wave'));
  for (let beat = 0; beat < 64; beat += 0.13) {
    for (const action of ['dance', 'bounce', 'spin', 'wave'] as const) {
      const pose = choreographyAt(beat, action, 0.2, false);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.lift >= 0 && pose.lift <= 0.6);
      assert.ok(Math.abs(pose.sway) <= 0.3);
    }
  }
});

test('reduced motion disables translation and spinning while keeping a quiet arm pose', () => {
  for (const action of ['dance', 'bounce', 'spin', 'wave'] as const) {
    const pose = choreographyAt(3.2, action, 0.8, true);
    assert.equal(pose.lift, 0);
    assert.equal(pose.sway, 0);
    assert.equal(pose.turn, 0);
    assert.equal(pose.lean, 0);
  }
});

test('all ten reserved dancer positions are distinct, bounded, and independent of array order', () => {
  const slots = Array.from({ length: 10 }, (_, i) => dancerSlot(i));
  assert.equal(new Set(slots.map(({ x, z }) => `${x},${z}`)).size, 10);
  assert.ok(slots.every(({ x, z }) => Math.abs(x) <= 5 && Math.abs(z) <= 5));
  assert.deepEqual(dancerSlot(13), dancerSlot(3));
  assert.deepEqual(dancerSlot(-1), dancerSlot(9));
});

test('stable participant phase has no random input and stays in one beat', () => {
  assert.equal(stablePhase('person-a'), stablePhase('person-a'));
  assert.notEqual(stablePhase('person-a'), stablePhase('person-b'));
  assert.ok(stablePhase('person-a') >= 0 && stablePhase('person-a') < 1);
});

test('mobile rendering density caps at 1.5 and tolerates invalid values', () => {
  assert.equal(pixelRatio(3), 1.5);
  assert.equal(pixelRatio(1), 1);
  assert.equal(pixelRatio(Number.NaN), 1);
  assert.equal(pixelRatio(0), 1);
});

test('resource lifecycle releases shared resources exactly once and immediately releases late resources', () => {
  const scope = createDisposalScope();
  let count = 0;
  const resource = { dispose: () => { count += 1; } };
  scope.track(resource);
  scope.track(resource);
  scope.dispose();
  scope.dispose();
  assert.equal(count, 1);
  scope.track({ dispose: () => { count += 10; } });
  assert.equal(count, 11);
});

test('isometric positions reserve a central DJ footprint with separated dancer envelopes', () => {
  const slots = Array.from({ length: 10 }, (_, i) => dancerSlot(i));
  for (const slot of slots) assert.ok(Math.hypot(slot.x, slot.z) >= 2.7, 'a dancer enters the central booth footprint');
  for (let i = 0; i < slots.length; i += 1) for (let j = i + 1; j < slots.length; j += 1) {
    assert.ok(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z) >= 2.2, `slots ${i} and ${j} overlap their movement envelopes`);
  }
});


test('stage coordinates preserve the forty-five-degree ground grid without stretching', () => {
  const origin = stagePosition(0, 0);
  const right = stagePosition(1, 0);
  const forward = stagePosition(0, 1);
  assert.deepEqual(origin, { x: 0, z: 0 });
  assert.ok(Math.abs(Math.hypot(right.x, right.z) - 1) < 1e-12);
  assert.ok(Math.abs(right.x * forward.x + right.z * forward.z) < 1e-12);
});

test('camera fitting uses the stage aspect and keeps the crowd envelope visible', () => {
  for (const [width, height] of [[402, 400], [402, 450], [600, 300], [201, 220]]) {
    const frustum = clubCameraFrustum(width, height);
    assert.ok(frustum.right - frustum.left >= 10.8);
    assert.ok(frustum.top - frustum.bottom >= 10.2);
    assert.ok(Math.abs((frustum.right - frustum.left) / (frustum.top - frustum.bottom) - width / height) < 1e-12);
  }
});
