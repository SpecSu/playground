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

const { FESTIVAL_MONUMENT_ID } = await import('../lib/festival-types.ts');
const lighting = (sequence = 2, fields = {}) => command('lighting', sequence, { targetId: 'completed-art', roundIndex: 1, mode: 'pulse', ...fields });
async function withArt(kind = 0) {
  const context = await setup();
  await context.service.command('one', join());
  context.store.room.ambientBuildAttempts = [0, 1];
  const art = { id: 'completed-art', actorId: 'builder', kind, x: -38, z: 39, createdAt: context.now() - 20_000, roundIndex: 1 };
  context.store.room.installations.push(art);
  return { ...context, art };
}

test('creator name is captured at build time and remains visible after profile changes and departure', async () => {
  const { service, advance, now } = await setup();
  await service.command('one', join(1, { name: '旧名字' }));
  const built = await service.command('one', command('build', 2, { kind: 0, x: -41.137, z: -35.271, roundIndex: 1 }));
  assert.equal(built.installations[0].creatorName, '旧名字');
  await service.command('one', command('profile', 3, { name: '新名字', preset: 'human-subeike' }));
  advance(built.participants[0].buildTask.finishAt - now());
  await service.command('one', command('leave', 4));
  const result = await service.snapshot('viewer'); assert.equal(result.installations[0].creatorName, '旧名字');
});

test('legacy active creator names are captured before departure; absent legacy names remain an honest UI fallback', async () => {
  const { service, store } = await withArt(); store.room.installations[0].actorId = 'one';
  const leaving = await service.command('one', command('leave', 2));
  assert.equal(leaving.installations[0].creatorName, '沙丘旅人');
  delete store.room.installations[0].creatorName; store.room.installations[0].actorId = 'unknown';
  assert.equal((await service.snapshot('viewer')).installations[0].creatorName, undefined);
});


test('every legacy mode, palette, off, and monument command is retired before execution', async () => {
  const { service, store } = await withArt();
  for (const fields of [{}, { mode: 'chase', palette: 'solar' }, { mode: 'sweep', palette: 'candy' }, { targetId: FESTIVAL_MONUMENT_ID }, { reset: true }, { targetId: 'missing' }]) {
    const cmd = lighting(2, fields);
    await assert.rejects(() => service.command('one', cmd), { code: 'LIGHTING_CLOSED' });
  }
  assert.equal(store.visits.get('one').lastSequence, 1);
  assert.equal(store.room.installations[0].lighting, undefined);
});

test('retirement applies to all human roles without affecting ambient identity rejection or command envelopes', async () => {
  const { service, server } = await withArt();
  await assert.rejects(() => service.command('visitor', lighting(1)), { code: 'LIGHTING_CLOSED' });
  for (let i = 0; i < 9; i++) await service.command(`person-${i}`, join());
  assert.equal((await service.command('spectator', join())).self.role, 'spectator');
  await assert.rejects(() => service.command('spectator', lighting()), { code: 'LIGHTING_CLOSED' });
  await assert.rejects(() => service.command('ambient:festival:0', lighting(1)), { code: 'FORBIDDEN' });
  for (const input of [null, [], {}, lighting(0), lighting(2, { requestId: '' }), lighting(2, { roomId: 'other' })]) {
    assert.throws(() => server.validateFestivalCommand(input), { code: 'INVALID_COMMAND' });
  }
});

test('an accepted receipt from an older release cannot replay a lighting write or reset', async () => {
  const { service, store } = await withArt();
  for (const fields of [{ mode: 'spark' }, { reset: true }]) {
    const cmd = lighting(2, fields); if (fields.reset) delete cmd.mode;
    const canonical = { ...cmd, roomId: 'main' };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(canonical).sort(([a], [b]) => a.localeCompare(b))))));
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    store.visits.get('one').receipts.push({ requestId: cmd.requestId, sequence: 2, fingerprint });
    store.visits.get('one').lastSequence = 2;
    await assert.rejects(() => service.command('one', cmd), { code: 'LIGHTING_CLOSED' });
  }
});

test('maintenance removes human, ambient and central overrides once, preserving artwork and creation epochs', async () => {
  const { service, store, now } = await withArt();
  const selection = { mode: 'sweep', palette: 'candy', startedAt: now() };
  store.room.installations[0].lighting = selection;
  store.room.installations[0].creatorName = '已离开的创作者';
  store.room.ambientInstallations = [{ ...store.room.installations[0], id: 'ambient:art:1:0', actorId: 'ambient:festival:0', ambient: true }];
  store.room.monumentLighting = selection;
  const createdAt = store.room.installations[0].createdAt, prior = store.room.revision;
  const snapshot = await service.snapshot('viewer');
  assert.equal(snapshot.installations[0].lighting, undefined); assert.equal(snapshot.ambientInstallations[0].lighting, undefined); assert.equal(snapshot.monumentLighting, undefined);
  assert.equal(store.room.installations[0].lighting, undefined); assert.equal(store.room.monumentLighting, undefined);
  assert.equal(snapshot.installations[0].createdAt, createdAt); assert.equal(snapshot.installations[0].creatorName, '已离开的创作者');
  assert.equal(store.room.revision, prior + 1);
  await service.snapshot('another-viewer'); assert.equal(store.room.revision, prior + 1);
});

test('concurrent cleanup readers use CAS without losing artworks or advancing actor sequences', async () => {
  const { service, store, now } = await withArt();
  store.room.installations[0].lighting = { mode: 'pulse', palette: 'solar', startedAt: now() };
  store.collideNextCommits(2);
  const results = await Promise.all([service.snapshot('one'), service.snapshot('viewer')]);
  assert.ok(store.conflicts > 0); assert.ok(results.every(s => s.installations.length === 1 && !s.installations[0].lighting));
  assert.equal(store.visits.get('one').lastSequence, 1);
});

test('override cleanup and rejected old controls do not disturb construction, movement, creator or speech', async () => {
  const { service, store, now } = await withArt();
  const person = store.room.participants[0];
  person.buildTask = { installationId: 'working', arrivalAt: now(), finishAt: now() + 20_000, facing: 0 };
  store.room.installations[0].lighting = { mode: 'spark', palette: 'ice', startedAt: now() };
  const before = structuredClone(person);
  const snapshot = await service.snapshot('one');
  assert.deepEqual(snapshot.participants[0].buildTask, before.buildTask);
  for (const key of ['x', 'z', 'targetX', 'targetZ', 'moveAt']) assert.equal(snapshot.participants[0][key], before[key]);
  await assert.rejects(() => service.command('one', lighting(2)), { code: 'LIGHTING_CLOSED' });
  await assert.rejects(() => service.command('one', command('move', 2, { x: 30, z: 30 })), { code: 'BUILD_IN_PROGRESS' });
  const said = await service.command('one', command('say', 2, { text: '追光会自己亮起来' }));
  assert.equal(said.participants[0].message.text, '追光会自己亮起来');
});
