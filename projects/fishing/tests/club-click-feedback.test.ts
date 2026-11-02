import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ClubManualWorld } from '../lib/club-manual-world.ts';
import { clubMotionAt, type ClubMotionState } from '../lib/club-scene-motion.ts';
import { makeClubWorld, type SceneAvatarFactory } from '../lib/club-scene-world.ts';
import { ClickNavigation } from '../lib/club-click-navigation.ts';
import type { ManualIntent, ManualPoint } from '../lib/club-manual-motion.ts';

const epoch = 1791806400000;
const actor = { id: 'self', name: 'Self', preset: 'frog' as const, slot: 0, joinedAt: epoch - 10000, lastSeenAt: epoch, action: 'dance' as const, actionAt: 0 };
const uv = (u: number, v: number): ManualPoint => ({ x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 });
const origin = uv(-3, 4), target = uv(3, 4);
const gap = (a: ManualPoint, b: ManualPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const request = (point = target, sequence = 1): ManualIntent => ({ vx: 0, vz: 0, active: false, enabled: true, targetRequest: { ...point, sequence } });
function harness(tokens?: ConstructorParameters<typeof ClubManualWorld>[0]) {
  const world = new ClubManualWorld(tokens);
  world.sync([actor], actor.id);
  const base = { ...clubMotionAt(epoch, 0), ...origin };
  const canonical = new Map<number, ClubMotionState>([[0, base]]);
  let now = epoch;
  return { world, canonical, update: (intent = request(), elapsed = 25, group?: { id: string; startsAt: number; endsAt: number }) => world.update({ now: now += elapsed, deltaSeconds: elapsed / 1000, canonical, canonicalAt: () => base, intent, group }) };
}

test('an already-reached click shows its endpoint for 650 ms without replaying travel', () => {
  const h = harness(), intent = request(origin);
  const first = h.update(intent);
  assert.equal(h.world.destination, null);
  assert.deepEqual(h.world.markerDestination, origin);
  assert.ok(first.samples.every(sample => sample.vx === 0 && sample.vz === 0));
  h.update(intent, 649);
  assert.deepEqual(h.world.markerDestination, origin);
  h.update(intent, 1);
  assert.equal(h.world.markerDestination, null);
  assert.equal(h.update(intent, 1000).samples.length, 0);
  assert.equal(h.world.markerDestination, null);
  h.update(request(origin, 2));
  assert.deepEqual(h.world.markerDestination, origin, 'a genuinely new click refreshes acknowledgement');
});

test('arrival briefly retains the crowd-resolved endpoint rather than the occupied requested point', () => {
  const h = harness();
  h.canonical.set(1, { ...clubMotionAt(epoch, 1), ...target });
  const intent = request();
  h.update(intent);
  const resolved = h.world.destination!;
  assert.ok(gap(resolved, target) > 1.3);
  let arrived = false;
  for (let frame = 0; frame < 900; frame++) {
    h.update(intent);
    if (!h.world.destination) { arrived = true; break; }
  }
  assert.ok(arrived);
  assert.deepEqual(h.world.markerDestination, { x: resolved.x, z: resolved.z });
  h.update(intent, 649);
  assert.ok(h.world.markerDestination);
  h.update(intent, 1);
  assert.equal(h.world.markerDestination, null);
});

for (const [name, patch] of Object.entries({ disabled: { enabled: false }, cancel: { cancelRequest: 1 }, joystick: { active: true }, auto: { autoRequest: 1 }, reconcile: { reconcileRequest: 1 } })) {
  test(`${name} clears a finished click marker without reviving its stale request`, () => {
    const h = harness(), intent = request(origin);
    h.update(intent);
    assert.ok(h.world.markerDestination);
    h.update({ ...intent, ...patch });
    assert.equal(h.world.markerDestination, null);
    h.update({ ...intent, ...patch, active: false, enabled: true });
    assert.equal(h.world.markerDestination, null);
  });
}

test('group and membership changes clear click feedback, including an owner switch', () => {
  for (const change of ['group', 'membership', 'owner']) {
    const h = harness(), intent = request(origin);
    h.update(intent);
    assert.ok(h.world.markerDestination);
    if (change === 'group') h.update(intent, 25, { id: 'group', startsAt: epoch, endsAt: epoch + 1000 });
    else h.world.sync([{ ...actor, joinedAt: change === 'membership' ? epoch + 1 : actor.joinedAt }], change === 'owner' ? null : actor.id);
    assert.equal(h.world.markerDestination, null, change);
  }
});

test('a reconstructed world never displays an old target as fresh feedback', () => {
  const intent = request(origin), h = harness({ targetRequest: intent.targetRequest });
  h.update(intent);
  assert.equal(h.world.markerDestination, null);
});

test('arrival feedback is erased by explicit navigation cancellation and never shown after a stall', () => {
  const navigation = new ClickNavigation(origin);
  navigation.step(origin, .025, []);
  assert.deepEqual(navigation.arrivalDestination, origin);
  navigation.cancel();
  assert.equal(navigation.arrivalDestination, null);
  const h = harness();
  for (let index = 0; index < 9; index++) {
    const angle = index / 9 * Math.PI * 2;
    h.canonical.set(index + 1, { ...clubMotionAt(epoch, index + 1), x: origin.x + Math.sin(angle) * 1.325, z: origin.z + Math.cos(angle) * 1.325 });
  }
  h.update();
  for (let frame = 0; frame < 70; frame++) h.update();
  assert.equal(h.world.destination, null);
  assert.equal(h.world.markerDestination, null, 'a blocked route has no successful-arrival marker');
});

test('the existing scene ring renders a no-op acknowledgement then hides at expiry', () => {
  const createAvatar: SceneAvatarFactory = () => ({ root: new THREE.Group(), height: 2, labelHeight: 2.25, footprintRadius: .65, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} });
  const club = makeClubWorld({ createAvatar });
  club.syncParticipants([actor], actor.id);
  // Seed a parked local position safely away from the ambient routes.
  club.syncMovements([{ actorId: actor.id, moveSequence: 1, joinedAt: actor.joinedAt, groupId: null, mode: 'manual', ...origin, heading: 0, vx: 0, vz: 0, acceptedAt: epoch }]);
  const update = (now: number, intent = request(origin)) => club.update(0, 'neon', false, .65, now, undefined, { deltaSeconds: .025, manualIntent: intent });
  const ring = club.scene.getObjectByName('click-walk-target') as THREE.Mesh;
  update(epoch);
  assert.equal(ring.visible, true);
  assert.ok(gap(ring.position, origin) < 1e-8);
  assert.ok(ring.scale.x * .2 > .65, 'the brief acknowledgement extends beyond the body footprint');
  assert.equal((ring.material as THREE.MeshBasicMaterial).depthTest, false, 'an acknowledgement cannot be buried under the avatar feet');
  update(epoch + 650);
  assert.equal(ring.visible, false);
  club.dispose();
});
