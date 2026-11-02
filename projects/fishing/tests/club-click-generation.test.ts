import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubManualWorld } from '../lib/club-manual-world.ts';
import { cancelClickMovement, type ClubManualControl, type ManualIntent } from '../lib/club-manual-motion.ts';
import { clubMotionAt } from '../lib/club-scene-motion.ts';

const epoch = 1791806400000;
const actor = { id: 'self', name: 'Self', preset: 'frog' as const, slot: 0, joinedAt: epoch - 10000, lastSeenAt: epoch, action: 'dance' as const, actionAt: 0 };
const uv = (u: number, v: number) => ({ x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 });
const target = uv(3, 4);
function harness() {
  const world = new ClubManualWorld();
  const control: ClubManualControl = { x: 0, y: 0, active: false, enabled: true, autoRequest: 0, cancelRequest: 0 };
  world.sync([actor], actor.id);
  const base = { ...clubMotionAt(epoch, 0), ...uv(-3, 4) };
  let now = epoch;
  const update = (patch: Partial<ManualIntent> = {}, group?: { id: string; startsAt: number; endsAt: number }) => world.update({ now: now += 25, deltaSeconds: .025, canonical: new Map([[0, base]]), canonicalAt: () => base, group, intent: { ...control, vx: 0, vz: 0, ...patch } });
  const click = () => {
    control.targetSequence = (control.targetSequence ?? 0) + 1;
    control.targetRequest = { ...target, sequence: control.targetSequence, cancelGeneration: control.cancelRequest ?? 0 };
  };
  update();
  return { world, control, update, click };
}

test('a fresh tap after cancellation starts even before the world consumes that reset', () => {
  for (const flushReset of [false, true]) {
    const h = harness();
    cancelClickMovement(h.control);
    if (flushReset) h.update();
    h.click();
    const first = h.update();
    assert.equal(first.samples[0]?.reason, 'start', `reset flushed: ${flushReset}`);
    assert.ok(h.world.destination);
    assert.equal(h.update().samples[0]?.reason, 'move');
  }
});

test('post-reset replacement cancels the old route and immediately follows only the fresh target', () => {
  const h = harness();
  h.click(); h.update();
  cancelClickMovement(h.control);
  h.click();
  h.control.targetRequest = { ...h.control.targetRequest!, ...uv(-3, 5) };
  const next = h.update();
  assert.ok(h.world.destination);
  assert.equal(h.world.destination!.x, uv(-3, 5).x);
  assert.equal(h.world.destination!.z, uv(-3, 5).z);
  assert.ok(next.samples.some(sample => sample.reason === 'move' || sample.reason === 'start'));
});

test('cancellation after a tap wins and the old generation cannot replay afterward', () => {
  const h = harness();
  h.click();
  const oldRequest = h.control.targetRequest!;
  cancelClickMovement(h.control);
  h.update();
  h.control.targetRequest = oldRequest;
  h.update();
  assert.equal(h.world.destination, null);
  assert.equal(h.world.markerDestination, null);
  h.click();
  assert.equal(h.update().samples[0]?.reason, 'start', 'a genuinely fresh tap is still accepted');
});

test('unstamped and wrong-generation targets are rejected before and after reset consumption', () => {
  for (const stamp of [undefined, 0, 2]) for (const flushReset of [false, true]) {
    const h = harness();
    cancelClickMovement(h.control);
    if (flushReset) h.update();
    h.control.targetRequest = { ...target, sequence: 1, ...(stamp === undefined ? {} : { cancelGeneration: stamp }) };
    h.update();
    assert.equal(h.world.destination, null, `stamp ${stamp}; reset flushed ${flushReset}`);
    assert.equal(h.world.markerDestination, null);
    assert.equal(h.update().samples.length, 0);
  }
});

for (const [name, patch] of Object.entries({ menu: { enabled: false }, joystick: { active: true }, reconcile: { reconcileRequest: 1 }, auto: { autoRequest: 1 } })) {
  test(`a current-generation target cannot bypass ${name} priority`, () => {
    const h = harness();
    cancelClickMovement(h.control); h.click();
    h.update(patch);
    assert.equal(h.world.destination, null);
    assert.equal(h.world.markerDestination, null);
    h.update({ ...patch, enabled: true, active: false });
    assert.equal(h.world.destination, null, 'the rejected request is consumed permanently');
  });
}

test('a current-generation target cannot bypass an active group or missing membership', () => {
  for (const blockedBy of ['group', 'membership']) {
    const h = harness();
    cancelClickMovement(h.control); h.click();
    if (blockedBy === 'membership') h.world.sync([], null);
    h.update({}, blockedBy === 'group' ? { id: 'g1', startsAt: epoch, endsAt: epoch + 1000 } : undefined);
    assert.equal(h.world.destination, null, blockedBy);
    assert.equal(h.world.markerDestination, null);
  }
});
