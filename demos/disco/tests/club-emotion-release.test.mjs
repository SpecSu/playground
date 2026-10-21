import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { RoomClient } from '../lib/room-client.ts';
import { makeClubWorld } from '../lib/club-scene-world.ts';
import { emotionBubbleAt } from '../lib/club-emotion-bubble.ts';
import { createOwnActionPreview, projectOwnAction, settleOwnActionPreview } from '../lib/club-action-preview.ts';

const { createRoomService } = await import('../lib/room-server.ts');

const ACTIONS = ['love', 'laugh', 'punch', 'ghost'];
class MemoryStore {
  rooms = new Map(); visits = new Map();
  async ensureRoom(id, value) { if (!this.rooms.has(id)) this.rooms.set(id, structuredClone(value)); }
  async readRoom(id) { return structuredClone(this.rooms.get(id)); }
  async ensureVisit(room, actor, value) { const key = `${room}:${actor}`; if (!this.visits.has(key)) this.visits.set(key, structuredClone(value)); }
  async readVisit(room, actor) { return structuredClone(this.visits.get(`${room}:${actor}`)); }
  async commit(room, revision, value, actor, sequence, visit) {
    if (this.rooms.get(room).revision !== revision || visit && this.visits.get(`${room}:${actor}`).lastSequence !== sequence) return false;
    this.rooms.set(room, structuredClone(value));
    if (visit) this.visits.set(`${room}:${actor}`, structuredClone(visit));
    return true;
  }
}
function fixtureWorld() {
  const calls = new Map();
  const world = makeClubWorld({ createAvatar: (_preset, id) => ({
    root: new THREE.Group(), height: 1.8, labelHeight: 2.1, footprintRadius: .65,
    loaded: true, ready: Promise.resolve(), dispose() {},
    update(beat, action, reduced, energy, motion, group) { calls.set(id, { beat, action, reduced, energy, motion, group }); },
  }) });
  return { world, calls };
}
function fixtureService() {
  let now = 1_800_000_000_000;
  const service = createRoomService(new MemoryStore(), { now: () => now });
  const client = actor => new RoomClient('soundcheck', { now: () => now, fetcher: async (_url, init) => {
    try {
      const data = init?.method === 'POST' ? await service.command(actor, JSON.parse(init.body)) : await service.snapshot('soundcheck', actor);
      return new Response(JSON.stringify(data));
    } catch (error) {
      return new Response(JSON.stringify({ error: { code: error.code, message: error.message, retryAfterMs: error.retryAfterMs }, snapshot: await service.snapshot('soundcheck', actor) }), { status: error.status ?? 500 });
    }
  } });
  return { service, client, now: () => now, advance: ms => { now += ms; } };
}

// This fails if the scene replays a stored emotion after the six-second window,
// if a late reader starts its own clock, or if RoomClient drops an accepted ID.
test('all four server actions survive client transport and seek the same scene phase for late observers', async () => {
  for (const action of ACTIONS) {
    const f = fixtureService(), owner = f.client('owner'), observer = f.client('observer');
    const early = fixtureWorld(), late = fixtureWorld();
    try {
      await owner.command({ type: 'join', name: 'Release QA', preset: 'human-subeike' });
      f.advance(400);
      await owner.command({ type: 'action', action });
      const accepted = owner.getState().snapshot, person = accepted.participants[0];
      assert.equal(person.actionUntil - person.actionAt, 6000);
      early.world.syncParticipants(accepted.participants, accepted.self.id);
      f.advance(1750);
      await observer.refresh();
      late.world.syncParticipants(observer.getState().snapshot.participants, null);
      early.world.update(93, 'neon', false, 1, f.now());
      late.world.update(.2, 'neon', false, 1, f.now());
      assert.equal(early.calls.get('owner').action, action);
      assert.equal(early.calls.get('owner').beat, 3.5);
      assert.equal(late.calls.get('owner').beat, early.calls.get('owner').beat);
      assert.deepEqual(late.world.players.get('owner').root.position, early.world.players.get('owner').root.position);
      assert.deepEqual(emotionBubbleAt(observer.getState().snapshot.participants[0], f.now()), emotionBubbleAt(person, f.now()));
      f.advance(4250);
      early.world.update(0, 'ice', false, 1, f.now());
      assert.equal(early.calls.get('owner').action, 'dance', 'retained history cannot restart an expired emotion');
      assert.equal(emotionBubbleAt(person, f.now()), null);
      await owner.command({ type: 'action', action });
      const repeated = owner.getState().snapshot.participants[0];
      assert.equal(repeated.actionAt, f.now());
      assert.equal(repeated.actionUntil, f.now() + 6000);
      early.world.syncParticipants(owner.getState().snapshot.participants, 'owner');
      early.world.update(999, 'neon', false, 1, f.now());
      assert.equal(early.calls.get('owner').beat, 0, 'same-action repeat restarts the personal clock');
      assert.equal(early.calls.get('owner').action, action);
    } finally { owner.stop(); observer.stop(); early.world.dispose(); late.world.dispose(); }
  }
});

test('rejected optimistic emotion restores the accepted bubble and group priority without corrupting the action clock', async () => {
  const f = fixtureService(), owner = f.client('owner'), observer = f.client('observer');
  const { world, calls } = fixtureWorld();
  try {
    await owner.command({ type: 'join', name: 'Release QA', preset: 'cat' });
    f.advance(400); await owner.command({ type: 'action', action: 'love' });
    const accepted = owner.getState().snapshot;
    f.advance(100);
    let preview = createOwnActionPreview(accepted, 'punch', f.now(), 1);
    assert.equal(emotionBubbleAt(projectOwnAction(accepted.participants, 'owner', preview)[0], f.now()).action, 'punch');
    await assert.rejects(owner.command({ type: 'action', action: 'punch' }), { code: 'RATE_LIMITED' });
    preview = settleOwnActionPreview(preview, 1);
    const restored = projectOwnAction(owner.getState().snapshot.participants, 'owner', preview)[0];
    assert.equal(restored.actionAt, accepted.participants[0].actionAt);
    assert.equal(emotionBubbleAt(restored, f.now()).action, 'love');
    await observer.command({ type: 'join', name: 'Group QA', preset: 'dog' });
    await observer.command({ type: 'group-action', kind: 'unison' });
    await owner.refresh();
    const grouped = owner.getState().snapshot;
    world.syncParticipants(grouped.participants, 'owner');
    world.update(99, grouped.lightMode, false, 1, f.now(), undefined, { groupAction: grouped.groupAction });
    assert.ok(calls.get('owner').group, 'authoritative group count-in has body priority');
    assert.notEqual(calls.get('owner').action, 'love');
    assert.equal(emotionBubbleAt(restored, f.now()).action, 'love', 'accepted bubble remains social feedback under the group overlay');
  } finally { owner.stop(); observer.stop(); world.dispose(); }
});

test('a parked manual dancer receives an emotion immediately and a fresh joystick gesture keeps the bubble', async () => {
  const f = fixtureService(), owner = f.client('owner');
  const { world, calls } = fixtureWorld();
  try {
    await owner.command({ type: 'join', name: 'Release QA', preset: 'frog' });
    world.syncParticipants(owner.getState().snapshot.participants, 'owner');
    world.update(0, 'neon', false, 1, f.now(), undefined, { manualIntent: { active: true, enabled: true, vx: 0, vz: 1.8 }, deltaSeconds: .025 });
    f.advance(25);
    world.update(0, 'neon', false, 1, f.now(), undefined, { manualIntent: { active: false, vx: 0, vz: 0 }, deltaSeconds: .025 });
    const parked = world.players.get('owner').root.position.clone();
    f.advance(400); await owner.command({ type: 'action', action: 'laugh' });
    const person = owner.getState().snapshot.participants[0];
    world.syncParticipants(owner.getState().snapshot.participants, 'owner');
    f.advance(100);
    world.update(123, 'neon', false, 1, f.now(), undefined, { manualIntent: { active: false, vx: 0, vz: 0 } });
    assert.equal(calls.get('owner').action, 'laugh');
    assert.equal(calls.get('owner').beat, .2);
    assert.equal(calls.get('owner').motion.walkBlend, 0);
    assert.deepEqual(world.players.get('owner').root.position, parked);
    f.advance(25);
    world.update(123, 'neon', false, 1, f.now(), undefined, { manualIntent: { active: true, enabled: true, vx: 0, vz: 1.8 }, deltaSeconds: .025 });
    assert.ok(calls.get('owner').motion.walkBlend > 0, 'fresh movement reaches the rig for locomotion priority');
    assert.equal(emotionBubbleAt(person, f.now()).action, 'laugh');
    f.advance(25);
    world.update(123, 'neon', false, 1, f.now(), undefined, { manualIntent: { active: false, vx: 0, vz: 0 }, deltaSeconds: .025 });
    assert.equal(calls.get('owner').motion.walkBlend, 0);
    assert.equal(calls.get('owner').action, 'laugh');
    assert.equal(calls.get('owner').beat, .3, 'stopping resumes the current phase, never a new six-second action');
  } finally { owner.stop(); world.dispose(); }
});
