import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Real state-machine tests. The store deliberately yields before atomic CAS so
// concurrency tests exercise the production conflict/retry path.
class MemoryStore {
  room = null;
  visits = new Map();
  conflicts = 0;
  gate = null;
  collideNextCommits(count) {
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    this.gate = { remaining: count, ready, release };
  }
  async readState(actorId) { return structuredClone({ room: this.room, visit: this.visits.get(actorId) ?? null }); }
  async ensureRoom(initial) { this.room ??= structuredClone(initial); }
  async ensureVisit(actorId, initial) { if (!this.visits.has(actorId)) this.visits.set(actorId, structuredClone(initial)); }
  async commit(expectedRevision, next, actorId, expectedSequence, visit) {
    await Promise.resolve();
    const gate = this.gate;
    if (gate) {
      if (--gate.remaining === 0) { this.gate = null; gate.release(); }
      await gate.ready;
    }
    if (this.room.revision !== expectedRevision || (visit && this.visits.get(actorId).lastSequence !== expectedSequence)) {
      this.conflicts++; return false;
    }
    this.room = structuredClone(next);
    if (visit) this.visits.set(actorId, structuredClone(visit));
    return true;
  }
}
async function setup() {
  const url = new URL('../lib/festival-server.ts', import.meta.url);
  assert.ok(await readFile(url, 'utf8').then(() => true, () => false), 'The persistent festival service must exist');
  const server = await import(url.href);
  const types = await import('../lib/festival-types.ts');
  const store = new MemoryStore(); let now = 1_800_000_000_000;
  const service = server.createFestivalService(store, { now: () => now });
  return { server, types, store, service, now: () => now, advance: ms => { now += ms; } };
}
const command = (type, sequence = 1, fields = {}) => ({ type, requestId: `${type}-request-${sequence}`, sequence, ...fields });
const join = (sequence = 1, fields = {}) => command('join', sequence, { name: '沙丘旅人', preset: 'human-subeike', ...fields });

test('eleven concurrent joins allocate ten real participants and one spectator', async () => {
  const { service, store } = await setup();
  store.collideNextCommits(11);
  const results = await Promise.all(Array.from({ length: 11 }, (_, i) => service.command(`actor-${i}`, join())));
  assert.equal(results.filter(r => r.self.role === 'participant').length, 10);
  assert.equal(results.filter(r => r.self.role === 'spectator').length, 1);
  const snapshot = await service.snapshot('observer');
  assert.equal(snapshot.participants.length, 10);
  assert.equal(new Set(snapshot.participants.map(p => p.slot)).size, 10);
  assert.equal(snapshot.installations.length, 0, 'No synthetic art or fake guests are inserted');
  assert.equal(snapshot.capacity, 10);
  assert.equal(snapshot.self.role, 'visitor');
  assert.ok(store.conflicts > 0);
});

test('only the main room is accepted and all profile fields are strictly validated', async () => {
  const { service } = await setup();
  for (const invalid of [
    { name: '' }, { name: '  ' }, { name: '人'.repeat(25) }, { name: 'a\u0000b' },
    { name: '<img>' }, { name: 'a\u202eb' }, { preset: 'forged' }, { actorId: 'other' },
    { roomId: 'second' }, { sequence: 1.1 }, { requestId: '' }, { startsAt: 0 },
  ]) await assert.rejects(() => service.command('actor', join(1, invalid)), { code: 'INVALID_COMMAND' });
  const valid = await service.command('actor', join(1, { name: `  ${'😀'.repeat(24)}  `, roomId: 'main' }));
  assert.equal([...valid.participants[0].name].length, 24);
  await assert.rejects(() => service.command('observer', command('profile', 1, { name: 'one', preset: 'cat' })), { code: 'NOT_PARTICIPANT' });
});

test('heartbeats preserve seats; leaving or sixty seconds of absence frees capacity', async () => {
  const { service, advance } = await setup();
  await service.command('one', join());
  advance(59_000);
  await service.command('one', command('heartbeat', 2));
  advance(59_999);
  assert.equal((await service.snapshot('one')).participants.length, 1);
  advance(1);
  assert.equal((await service.snapshot('one')).participants.length, 0);
  await assert.rejects(() => service.command('one', command('emote', 3, { emote: 'wave' })), { code: 'NOT_PARTICIPANT' });
  await service.command('one', join(3));
  assert.equal((await service.command('one', command('leave', 4))).self.role, 'visitor');
  assert.equal((await service.snapshot('one')).participants.length, 0);
});

test('competing free-placement claims have exactly one winner and rejected actions do not consume sequence', async () => {
  const { service, store } = await setup();
  await Promise.all(['one', 'two'].map(id => service.command(id, join())));
  store.collideNextCommits(2);
  const result = await Promise.allSettled(['one', 'two'].map(id => service.command(id, command('build', 2, { kind: 0, x: -41.137, z: -35.271, roundIndex: 1 }))));
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  const denied = result.find(r => r.status === 'rejected');
  assert.equal(denied.reason.code, 'PLACEMENT_BLOCKED');
  const snapshot = await service.snapshot('one');
  assert.equal(snapshot.installations.length, 1);
  const losingId = snapshot.installations[0].actorId === 'one' ? 'two' : 'one';
  assert.equal((await service.snapshot(losingId)).self.lastSequence, 1);
  const retried = await service.command(losingId, command('build', 2, { kind: 1, x: 44.17, z: -43.02, roundIndex: 1 }));
  assert.equal(retried.installations.length, 2);
});

test('each actor gets at most three installations per round and total active art is capped at thirty', async () => {
  const { service, types, now, advance } = await setup();
  for (let a = 0; a < 10; a++) await service.command(`actor-${a}`, join());
  let current = await service.snapshot('actor-0');
  for (let i = 0; i < 3; i++) {
    for (let a = 0; a < 10; a++) {
      let point;
      for (let z = -72; z <= 72 && !point; z += 1.1) for (let x = -72; x <= 72; x += 1.1) {
        if (!types.getFestivalPlacementIssue(0, x, z, [...current.installations, ...current.ambientInstallations], [...current.participants, ...current.ambientParticipants], now())) { point = { x, z }; break; }
      }
      assert.ok(point, 'Thirty appropriately spaced smaller artworks physically fit inside the playable ground');
      current = await service.command(`actor-${a}`, command('build', i * 2 + 2, { kind: 0, ...point, roundIndex: 1 }));
    }
    advance(Math.max(...current.participants.map(p => p.buildTask?.finishAt ?? now())) - now() + 1);
    for (let a = 0; a < 10; a++) current = await service.command(`actor-${a}`, command('heartbeat', i * 2 + 3));
  }
  assert.equal(current.installations.length, 30);
  await assert.rejects(() => service.command('actor-0', command('build', 8, { kind: 0, x: 42, z: -42, roundIndex: 1 })), { code: 'BUILD_LIMIT' });
  await service.command('actor-0', command('leave', 8));
  assert.equal((await service.snapshot('actor-0')).installations.length, 30, 'Art survives the builder leaving');
  await service.command('actor-0', join(9));
  await assert.rejects(() => service.command('actor-0', command('build', 10, { kind: 0, x: 42, z: -42, roundIndex: 1 })), { code: 'BUILD_LIMIT' });
});

test('round phase uses the persistent server clock and new rounds clear only user art', async () => {
  const { service, advance, now } = await setup();
  const initial = await service.command('one', join());
  await service.command('one', command('build', 2, { kind: 4, x: -41.137, z: -35.271, roundIndex: 1 }));
  assert.equal(initial.round.phase, 'building');
  assert.equal(initial.round.burnAt - initial.round.startsAt, 300_000);
  assert.equal(initial.round.ashesAt - initial.round.burnAt, 35_000);
  assert.equal(initial.round.endsAt - initial.round.ashesAt, 10_000);
  advance(300_000);
  await service.command('one', join(3));
  const burning = await service.snapshot('one');
  assert.equal(burning.round.phase, 'burning');
  assert.equal(burning.installations.length, 1);
  await assert.rejects(() => service.command('one', command('build', 4, { kind: 0, x: 44.17, z: -43.02, roundIndex: 1 })), { code: 'ROUND_CLOSED' });
  advance(35_000);
  assert.equal((await service.snapshot('one')).round.phase, 'ashes');
  advance(10_000);
  const next = await service.snapshot('one');
  assert.equal(next.round.index, initial.round.index + 1);
  assert.equal(next.round.startsAt, initial.round.endsAt);
  assert.equal(next.round.phase, 'building');
  assert.equal(next.installations.length, 0);
  assert.equal(next.participants.length, 1, 'Active people survive the reset');
  assert.equal(next.serverNow, now());
  await service.command('one', command('build', 4, { kind: 0, x: -41.137, z: -35.271, roundIndex: 2 }));
  advance(345_000 * 10 + 1234);
  const muchLater = await service.snapshot('observer');
  assert.equal(muchLater.round.index, initial.round.index + 11);
  assert.equal(muchLater.round.startsAt, initial.round.startsAt + 345_000 * 11);
  assert.equal(muchLater.installations.length, 0);
});

test('concurrent rollover readers persist exactly one round advance', async () => {
  const { service, advance } = await setup();
  const first = await service.snapshot('one');
  advance(345_000);
  const reads = await Promise.all(Array.from({ length: 20 }, (_, i) => service.snapshot(`reader-${i}`)));
  assert.ok(reads.every(r => r.round.index === first.round.index + 1));
  assert.ok(reads.every(r => r.round.startsAt === first.round.endsAt));
  assert.ok(reads.every(r => r.revision === first.revision + 1));
});

test('overhead messages are normalized plain text, eighty code points, rate limited, and ephemeral', async () => {
  const { service, store, advance, now } = await setup();
  await service.command('one', join());
  const sent = await service.command('one', command('say', 2, { text: '  Hello\n\u0000\u202e<script>alert(1)</script> 😀  ' }));
  assert.equal(sent.participants[0].message.text, 'Hello <script>alert(1)</script> 😀');
  assert.equal(sent.participants[0].message.expiresAt, now() + 8000);
  await assert.rejects(() => service.command('one', command('say', 3, { text: 'again' })), { code: 'RATE_LIMITED', retryAfterMs: 3000 });
  advance(3000);
  const max = await service.command('one', command('say', 3, { text: '😀'.repeat(80) }));
  assert.equal([...max.participants[0].message.text].length, 80);
  for (const text of ['😀'.repeat(81), '\u0000\n\t  ']) await assert.rejects(() => service.command('one', command('say', 4, { text })), { code: 'INVALID_COMMAND' });
  advance(7999);
  assert.ok((await service.snapshot('observer')).participants[0].message);
  advance(1);
  assert.equal((await service.snapshot('observer')).participants[0].message, undefined);
  assert.equal(JSON.stringify(store.visits.get('one')).includes('Hello'), false, 'Idempotency receipts must hash commands rather than retain expired speech');
  assert.equal(JSON.stringify(store.room).includes('Hello'), false);
});

test('invalid movement destinations and forged movement clocks are rejected', async () => {
  const { service } = await setup();
  await service.command('one', join());
  for (const fields of [{ x: 0, z: 0 }, { x: 11.49, z: 0 }, { x: 81, z: 0 }, { x: NaN, z: 20 }, { x: 20, z: Infinity }, { x: '20', z: 20 }, { x: 20, z: 20, moveAt: 0 }]) {
    await assert.rejects(() => service.command('one', command('move', 2, fields)), { code: 'INVALID_COMMAND' });
  }
  await assert.rejects(() => service.command('viewer', command('move', 1, { x: 20, z: 20 })), { code: 'NOT_PARTICIPANT' });
});

test('movement begins at the server-projected position, cannot teleport, and uses twenty-one meters per second', async () => {
  const { service, types, advance, now } = await setup();
  const joined = await service.command('one', join());
  const before = joined.participants[0];
  const moved = await service.command('one', command('move', 2, { x: before.x + 30, z: before.z }));
  assert.equal(moved.participants[0].x, before.x);
  advance(1000);
  const projected = types.projectParticipant(moved.participants[0], now());
  assert.ok(Math.abs(projected.x - before.x - 21) < 1e-8);
  assert.equal(projected.speed, 21);
  const redirected = await service.command('one', command('move', 3, { x: before.x + 12, z: before.z + 12 }));
  assert.ok(Math.abs(redirected.participants[0].x - projected.x) < 1e-8);
  assert.equal(redirected.participants[0].moveAt, now());
});

test('movement projection routes around the monument and stays inside the world', async () => {
  const { types } = await setup();
  const p = { x: 35, z: 0, targetX: -35, targetZ: 0, moveAt: 1000, heading: 0 };
  const duration = types.movementDurationMs(p);
  let previous = types.projectParticipant(p, 1000);
  assert.ok(duration > 70 / 21 * 1000);
  for (let time = 1050; time <= 1000 + duration + 50; time += 50) {
    const current = types.projectParticipant(p, time);
    assert.ok(Math.hypot(current.x, current.z) >= types.FESTIVAL_MONUMENT_RADIUS - 1e-7);
    assert.ok(Math.hypot(current.x, current.z) <= types.FESTIVAL_WORLD_RADIUS);
    assert.ok(Math.hypot(current.x - previous.x, current.z - previous.z) <= 1.050001);
    previous = current;
  }
  const final = types.projectParticipant(p, 1000 + duration + 1);
  assert.equal(final.x, -35); assert.equal(final.z, 0); assert.equal(final.speed, 0);
  assert.deepEqual(types.projectParticipant(p, 0), { x: 35, z: 0, heading: types.projectParticipant(p, 1000).heading, speed: 21, distance: 0 });
});

test('a projected tangent-circle point is valid as a stop destination despite floating point rounding', async () => {
  const { types, server } = await setup();
  const p = { x: 35, z: 0, targetX: -35, targetZ: 0, moveAt: 0, heading: 0 };
  const projected = types.projectParticipant(p, 3500);
  assert.equal(types.isFestivalDestination(projected.x, projected.z), true);
  assert.doesNotThrow(() => server.validateFestivalCommand(command('move', 2, { x: projected.x, z: projected.z })));
  assert.equal(types.isFestivalDestination(types.FESTIVAL_MONUMENT_RADIUS - 0.001, 0), false, 'Meaningful monument penetration is still refused');
  assert.equal(types.isFestivalDestination(types.FESTIVAL_WORLD_RADIUS + 0.001, 0), false, 'The world edge remains enforced');
});

test('newly joined avatars remain quiet until an explicit emote command', async () => {
  const { service, now } = await setup();
  const joined = await service.command('one', join());
  assert.ok(joined.participants[0].emoteAt <= now() - 6000);
  const waved = await service.command('one', command('emote', 2, { emote: 'wave' }));
  assert.equal(waved.participants[0].emote, 'wave');
  assert.equal(waved.participants[0].emoteAt, now());
});

test('stop freezes only the authenticated actor at the current server projection without the move interval delay', async () => {
  const { service, types, advance, now } = await setup();
  await service.command('one', join());
  await service.command('two', join());
  const initial = await service.snapshot('one');
  const self = initial.participants.find(p => p.id === 'one');
  const other = initial.participants.find(p => p.id === 'two');
  const moved = await service.command('one', command('move', 2, { x: self.x + 12, z: self.z }));
  advance(40); // stop must bypass the 80 ms target-update interval.
  const expected = types.projectParticipant(moved.participants.find(p => p.id === 'one'), now());
  const stopped = await service.command('one', command('stop', 3));
  const person = stopped.participants.find(p => p.id === 'one');
  assert.equal(person.x, expected.x); assert.equal(person.z, expected.z);
  assert.equal(person.targetX, expected.x); assert.equal(person.targetZ, expected.z);
  assert.equal(person.moveAt, now()); assert.equal(person.heading, expected.heading);
  assert.deepEqual(stopped.participants.find(p => p.id === 'two'), other);
  advance(10_000);
  assert.equal(types.projectParticipant(person, now()).x, expected.x);
  assert.equal(types.projectParticipant(person, now()).speed, 0);
  await assert.rejects(() => service.command('viewer', command('stop')), { code: 'NOT_PARTICIPANT' });
  await assert.rejects(() => service.command('one', command('stop', 4, { x: 30, z: 30 })), { code: 'INVALID_COMMAND' });
});

test('request replay after a lost response is idempotent; stale and changed requests are refused', async () => {
  const { service } = await setup();
  await service.command('one', join());
  const build = command('build', 2, { kind: 0, x: -41.137, z: -35.271, roundIndex: 1 });
  const first = await service.command('one', build);
  const replay = await service.command('one', build);
  assert.equal(replay.revision, first.revision);
  assert.deepEqual(replay.installations, first.installations);
  await assert.rejects(() => service.command('one', { ...build, kind: 1 }), { code: 'REQUEST_CONFLICT' });
  await assert.rejects(() => service.command('one', { ...build, requestId: 'older-request', sequence: 1 }), { code: 'STALE_SEQUENCE' });
  const concurrent = await Promise.all([service.command('one', command('emote', 3, { emote: 'wave' })), service.command('one', command('emote', 3, { emote: 'wave' }))]);
  assert.equal(concurrent[0].revision, concurrent[1].revision);
});

test('state and receipts remain bounded under long-lived clients', async () => {
  const { service, store, advance } = await setup();
  await service.command('one', join());
  for (let n = 2; n < 120; n++) { advance(4000); await service.command('one', command('heartbeat', n)); }
  assert.equal(store.visits.get('one').receipts.length, 32);
  assert.equal(store.room.participants.length, 1);
  assert.equal(store.room.installations.length, 0);
  assert.ok((store.room.ambientInstallations ?? []).length <= 2);
  assert.ok((store.room.ambientBuildAttempts ?? []).length <= 2);
  assert.ok((store.room.ambientInstallations ?? []).every(art => art.roundIndex === store.room.roundIndex));
  const { ambientInstallations, ...baseRoom } = store.room;
  assert.ok(JSON.stringify(baseRoom).length < 1000, 'ordinary state cannot accumulate prior heartbeats');
  assert.ok((ambientInstallations ?? []).every(art => JSON.stringify(art).length < 1000), 'each current-round ambient route remains bounded');
  const replay = join();
  await assert.rejects(() => service.command('one', replay), { code: 'STALE_SEQUENCE' });
});

test('free placement preserves arbitrary ground coordinates without plot snapping', async () => {
  const { service } = await setup();
  await service.command('one', join());
  const placed = await service.command('one', command('build', 2, { kind: 0, x: -41.137, z: -35.271, roundIndex: 1 }));
  assert.equal(placed.installations[0].x, -41.137);
  assert.equal(placed.installations[0].z, -35.271);
  assert.equal(placed.installations[0].plotId, undefined);
  assert.equal(placed.installations[0].actorId, 'one');
});

test('free placement rejects non-finite coordinates, forged fields, and missing round identity', async () => {
  const { service } = await setup();
  await service.command('one', join());
  for (const fields of [{ x: NaN }, { z: Infinity }, { x: '42' }, { x: null }, { kind: 12 }, { roundIndex: 0 }, { roundIndex: 1.1 }, { roundIndex: undefined }, { plotId: 'ring-1-0' }, { actorId: 'two' }]) {
    await assert.rejects(() => service.command('one', command('build', 2, { kind: 0, x: -41.137, z: -35.271, roundIndex: 1, ...fields })), { code: 'INVALID_COMMAND' });
  }
  assert.equal((await service.snapshot('one')).self.lastSequence, 1);
});

test('placement protects monument, artwork footprints and projected avatars while allowing campfires', async () => {
  const { service, store, types, now } = await setup();
  await service.command('one', join());
  const denied = [{ x: types.FESTIVAL_MONUMENT_RADIUS + types.FESTIVAL_INSTALLATION_RADII[0] - 1, z: 0 }, { x: 78, z: 0 }, { x: -13.5, z: 44 }];
  for (const point of denied) await assert.rejects(() => service.command('one', command('build', 2, { kind: 0, ...point, roundIndex: 1 })), { code: 'PLACEMENT_BLOCKED' });
  const built = await service.command('one', command('build', 2, { kind: 0, x: -41, z: -35, roundIndex: 1 }));
  await assert.rejects(() => service.command('one', command('build', 3, { kind: 2, x: -28, z: -35, roundIndex: 1 })), { code: 'PLACEMENT_BLOCKED' });
  assert.equal(built.installations.length, 1);
  store.room.participants[0] = { ...store.room.participants[0], x: -45, z: -35, targetX: -45, targetZ: 35, moveAt: now() - 35000 / 21 };
  assert.equal(types.getFestivalPlacementIssue(0, -45, 0, [], store.room.participants, now()), 'participant');
  await assert.rejects(() => service.command('one', command('build', 3, { kind: 0, x: -45, z: 0, roundIndex: 1 })), { code: 'PLACEMENT_BLOCKED' });
});

test('concurrent nearby free placements revalidate footprints after a losing CAS', async () => {
  const { service, store } = await setup();
  await Promise.all(['one', 'two'].map(id => service.command(id, join())));
  store.collideNextCommits(2);
  const outcomes = await Promise.allSettled(['one', 'two'].map((id, i) => service.command(id, command('build', 2, { kind: 0, x: -41 + i * 2, z: -35, roundIndex: 1 }))));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'PLACEMENT_BLOCKED');
  assert.equal(store.room.installations.length, 1);
  const loser = store.room.installations[0].actorId === 'one' ? 'two' : 'one';
  assert.equal((await service.snapshot(loser)).self.lastSequence, 1);
});

test('late placement cannot silently build into a new round', async () => {
  const { service, advance } = await setup();
  await service.command('one', join());
  advance(345_000);
  await service.command('one', join(2));
  await assert.rejects(() => service.command('one', command('build', 3, { kind: 0, x: -41, z: -35, roundIndex: 1 })), { code: 'ROUND_CLOSED' });
  const next = await service.command('one', command('build', 3, { kind: 0, x: -41, z: -35, roundIndex: 2 }));
  assert.equal(next.installations[0].roundIndex, 2);
});

test('persisted v0.1.0 plot artworks remain visible and protect their footprint until round reset', async () => {
  const { service, store, now, advance } = await setup();
  await service.command('one', join());
  const legacy = { id: 'legacy-art', actorId: 'old-builder', kind: 1, plotId: 'ring-1-0', x: 40, z: 0, createdAt: now(), roundIndex: 1 };
  store.room.installations.push(legacy);
  assert.deepEqual((await service.snapshot('one')).installations, [legacy]);
  await assert.rejects(() => service.command('one', command('build', 2, { kind: 0, x: 40, z: 2, roundIndex: 1 })), { code: 'PLACEMENT_BLOCKED' });
  advance(345_000);
  assert.equal((await service.snapshot('one')).installations.length, 0);
});

test('v0.1.0 moving and stopped avatars migrate once to the enlarged monument without resetting valid progress', async () => {
  const { service, store, now, types, advance } = await setup();
  for (const actor of ['inside', 'outward', 'inward']) await service.command(actor, join());
  delete store.room.geometryVersion;
  const [inside, outward, inward] = store.room.participants;
  Object.assign(inside, { x: 20, z: 0, targetX: 20, targetZ: 0, moveAt: now() - 14000 / types.FESTIVAL_MOVE_SPEED });
  Object.assign(outward, { x: 20, z: 0, targetX: 60, targetZ: 0, moveAt: now() - 14000 / types.FESTIVAL_MOVE_SPEED });
  Object.assign(inward, { x: 50, z: 0, targetX: 25, targetZ: 0, moveAt: now() - 7000 / types.FESTIVAL_MOVE_SPEED });
  const previousRevision = store.room.revision;
  const migrated = await service.snapshot('inside');
  assert.ok(migrated.participants[0].x >= types.FESTIVAL_MONUMENT_RADIUS, 'Only the position covered by the new sculpture is pushed outward');
  assert.ok(migrated.participants[0].targetX >= types.FESTIVAL_MONUMENT_RADIUS);
  assert.ok(Math.abs(migrated.participants[1].x - 34) < 1e-5, 'An old outward path already outside the new monument keeps its exact current progress');
  assert.equal(migrated.participants[1].targetX, 60);
  assert.ok(Math.abs(migrated.participants[2].x - 43) < 1e-5);
  assert.ok(migrated.participants[2].targetX >= types.FESTIVAL_MONUMENT_RADIUS);
  assert.equal(migrated.participants[1].moveAt, now());
  assert.equal(migrated.revision, previousRevision + 1);
  assert.equal(store.room.geometryVersion, 2);
  advance(7000 / types.FESTIVAL_MOVE_SPEED);
  const again = await service.snapshot('inside');
  assert.equal(again.revision, migrated.revision, 'The migration must not rebase moving paths on every poll');
  assert.deepEqual(again.participants, migrated.participants);
  assert.ok(Math.abs(types.projectParticipant(again.participants[1], now()).x - 41) < 1e-5);
});

test('building reserves a footprint and walks the authenticated builder there before the twelve-second clock starts', async () => {
  const { service, types, now, advance } = await setup();
  const joined = await service.command('one', join());
  const request = command('build', 2, { kind: 0, x: -35, z: 50, roundIndex: 1 });
  const built = await service.command('one', request);
  const person = built.participants[0], art = built.installations[0];
  assert.ok(person.buildTask, 'The server must schedule the walk/build job');
  assert.equal(person.x, joined.participants[0].x);
  assert.equal(person.z, joined.participants[0].z);
  assert.ok(person.buildTask.arrivalAt > now());
  assert.equal(art.createdAt, person.buildTask.arrivalAt);
  assert.equal(person.buildTask.finishAt - art.createdAt, 12_000);
  assert.equal(person.buildTask.installationId, art.id);
  assert.ok(Math.hypot(person.targetX - art.x, person.targetZ - art.z) >= types.FESTIVAL_INSTALLATION_RADII[0] + types.FESTIVAL_AVATAR_RADIUS);
  assert.ok(types.projectParticipant(person, art.createdAt - 1).speed > 0);
  assert.equal(types.projectParticipant(person, art.createdAt + 1).speed, 0);
  advance(1000);
  assert.deepEqual((await service.command('one', request)).participants[0].buildTask, person.buildTask, 'Retry must not restart the route or build clock');
});

test('stop cancels approaching reservations and refunds quota; active construction rejects movement', async () => {
  const { service, now, advance } = await setup();
  await service.command('one', join());
  await service.command('one', command('build', 2, { kind: 0, x: -35, z: 50, roundIndex: 1 }));
  const cancelled = await service.command('one', command('stop', 3));
  assert.equal(cancelled.installations.length, 0);
  assert.equal(cancelled.participants[0].buildTask, undefined);
  const next = await service.command('one', command('build', 4, { kind: 0, x: -35, z: 50, roundIndex: 1 }));
  advance(next.participants[0].buildTask.arrivalAt - now() + 5000);
  for (const request of [command('move', 5, { x: -30, z: -30 }), command('stop', 5), command('build', 5, {kind: 1, x:35,z:45,roundIndex:1})]) {
    await assert.rejects(service.command('one', request), {code:'BUILD_IN_PROGRESS'});
    const unchanged = await service.snapshot('one');
    assert.deepEqual(unchanged.installations, next.installations);
    assert.deepEqual(unchanged.participants[0].buildTask, next.participants[0].buildTask);
    assert.equal(unchanged.self.lastSequence, 4);
  }
});

test('new build replaces an approaching reservation atomically and rejects an arrival at or after ignition', async () => {
  const { service, advance } = await setup();
  await service.command('one', join());
  await service.command('one', command('build', 2, { kind: 0, x: -35, z: 50, roundIndex: 1 }));
  const replaced = await service.command('one', command('build', 3, { kind: 0, x: 35, z: 45, roundIndex: 1 }));
  assert.equal(replaced.installations.length, 1);
  assert.equal(replaced.installations[0].x, 35);
  advance(299999);
  await service.command('one', join(4));
  await assert.rejects(() => service.command('one', command('build', 5, { kind: 0, x: -35, z: 50, roundIndex: 1 })), { code: 'ROUND_CLOSED' });
});

test('completed build jobs release the hammer task while keeping the completed artwork and facing', async () => {
  const { service, types, advance, now } = await setup();
  await service.command('one', join());
  const started = await service.command('one', command('build', 2, { kind: 0, x: -35, z: 50, roundIndex: 1 }));
  const task = started.participants[0].buildTask;
  advance(task.finishAt - now());
  const done = await service.snapshot('one');
  assert.equal(done.participants[0].buildTask, undefined);
  assert.equal(done.installations.length, 1);
  assert.equal(done.installations[0].constructionStoppedAt, undefined);
  assert.equal(types.projectParticipant(done.participants[0], now()).heading, task.facing);
});

 test('construction locks at exact arrival and releases at exact finish',async()=>{
 const {service,now,advance}=await setup();await service.command('one',join());
 const started=await service.command('one',command('build',2,{kind:0,x:-35,z:50,roundIndex:1}));const task=started.participants[0].buildTask;
 advance(task.arrivalAt-now());await assert.rejects(service.command('one',command('stop',3)),{code:'BUILD_IN_PROGRESS'});
 advance(task.finishAt-now());const moved=await service.command('one',command('move',3,{x:-30,z:-30}));assert.equal(moved.participants[0].buildTask,undefined);assert.equal(moved.participants[0].targetX,-30);assert.equal(moved.installations[0].constructionStoppedAt,undefined);
 });
 test('expired presence never freezes committed construction',async()=>{
 const {service,store,now,advance}=await setup();await service.command('one',join());const started=await service.command('one',command('build',2,{kind:0,x:-35,z:50,roundIndex:1}));const task=started.participants[0].buildTask;
 advance(task.arrivalAt-now()+5000);store.room.participants[0].lastSeenAt=now()-60000;
 const gone=await service.snapshot('observer');assert.equal(gone.participants.length,0);assert.equal(gone.installations[0].constructionStoppedAt,undefined);
 });

test('fire remains the construction cutoff for present and departed builders',async()=>{
 for(const depart of [false,true]){
  const {service,now,advance}=await setup();await service.command('one',join());advance(291000);await service.command('one',join(2));
  const started=await service.command('one',command('build',3,{kind:0,x:-35,z:50,roundIndex:1}));const task=started.participants[0].buildTask;
  assert.ok(task.arrivalAt<started.round.burnAt&&task.finishAt>started.round.burnAt);
  advance(task.arrivalAt-now());if(depart)await service.command('one',command('leave',4));
  advance(started.round.burnAt-now());const burned=await service.snapshot('one');
  assert.equal(burned.round.phase,'burning');assert.equal(burned.participants[0]?.buildTask,undefined);
  if(!depart){assert.equal(burned.installations[0].constructionStoppedAt,burned.round.burnAt);await service.command('one',command('move',4,{x:-30,z:-30}));}
  const {installationConstruction}=await import('../src/desert/visual-math.ts');
  const atFire=installationConstruction(burned.round.burnAt,burned.installations[0].createdAt,burned.round.burnAt);
  assert.deepEqual(installationConstruction(task.finishAt+1,burned.installations[0].createdAt,burned.round.burnAt),atFire);
 }
});

test('inline speech preserves joined emoji and single-line whitespace through actual owner-bound room snapshots',async()=>{
 const {service,store,now,advance}=await setup();await service.command('one',join());await service.command('two',join());
 const sent=await service.command('one',command('say',2,{text:'  一起\n看 👨‍👩‍👧‍👦\u202e\u0000  '}));
 assert.equal(sent.participants.find(p=>p.id==='one').message.text,'一起 看 👨‍👩‍👧‍👦');
 assert.equal(sent.participants.find(p=>p.id==='two').message,undefined);
 const remote=await service.snapshot('two');assert.deepEqual(remote.participants.find(p=>p.id==='one').message,sent.participants.find(p=>p.id==='one').message);
 const receipt=store.visits.get('one').receipts.at(-1);assert.match(receipt.fingerprint,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(receipt).includes('一起'));
 assert.equal((await service.command('one',command('say',2,{text:'  一起\n看 👨‍👩‍👧‍👦\u202e\u0000  '}))).participants[0].message.at,now(),'retry does not extend lifetime');
 for(const actor of ['visitor','ambient:guide'])await assert.rejects(service.command(actor,command('say',1,{text:'not mine'})));
 await assert.rejects(service.command('two',command('say',2,{text:'forged',actorId:'one'})),{code:'INVALID_COMMAND'});
 await service.command('one',command('leave',3));await assert.rejects(service.command('one',command('say',4,{text:'after leave'})),{code:'NOT_PARTICIPANT'});
 assert.equal((await service.snapshot('two')).participants.some(p=>p.id==='one'),false);
 advance(60000);await assert.rejects(service.command('two',command('say',2,{text:'expired seat'})),{code:'NOT_PARTICIPANT'});
});

test('server speech rejects joiner-only and malformed-surrogate text',async()=>{
 const {service}=await setup();await service.command('one',join());
 for(const text of ['\u200d',' \u200c\u200d ','\ufe0f','\ud800','hello\udfff'])await assert.rejects(service.command('one',command('say',2,{text})),{code:'INVALID_COMMAND'});
});
