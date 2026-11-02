import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

// Executes the production migration and adapter SQL, not a parsed-SQL mock.
class SQLiteD1 {
  sql = new DatabaseSync(':memory:');
  statements = [];
  queue = Promise.resolve();
  constructor(migration) { this.sql.exec(migration); }
  prepare(sql) {
    const { sql: database, statements } = this; let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { statements.push(sql); return database.prepare(sql).get(...values) ?? null; },
      async run() { statements.push(sql); const result = database.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  }
  batch(statements) {
    const operation = this.queue.then(async () => {
      this.sql.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sql.exec('COMMIT'); return results; }
      catch (error) { this.sql.exec('ROLLBACK'); throw error; }
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
}
async function setup(t) {
  const path = new URL('../lib/festival-d1.ts', import.meta.url);
  assert.ok(await readFile(path, 'utf8').then(() => true, () => false), 'Festival D1 persistence and session capabilities must exist');
  const adapter = await import(path.href);
  const { createFestivalService } = await import('../lib/festival-server.ts');
  const migration = await readFile(new URL('../drizzle/0003_desert_festival.sql', import.meta.url), 'utf8');
  const db = new SQLiteD1(migration); t.after(() => db.sql.close());
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new adapter.D1FestivalStore(db);
  const service = createFestivalService(store);
  return { adapter, db, store, service, advance: milliseconds => { now += milliseconds; }, now: () => now };
}
const join = (sequence = 1) => ({ type: 'join', requestId: `join-festival-${sequence}`, sequence, name: 'Burner', preset: 'human-subeike' });
const origin = 'https://festival.example';
const url = `${origin}/api/festival`;

test('real D1 SQL enforces ten concurrent seats and survives a new server instance', async t => {
  const { db, store, service } = await setup(t);
  const results = await Promise.all(Array.from({ length: 11 }, (_, i) => service.command(`actor-${i}`, join())));
  assert.equal(results.filter(r => r.self.role === 'participant').length, 10);
  assert.equal(results.filter(r => r.self.role === 'spectator').length, 1);
  const { createFestivalService } = await import('../lib/festival-server.ts');
  // Concurrent crypto/CAS admission has no ordering guarantee; recover a winner.
  const admittedActor = results.find(result => result.self.role === 'participant').self.id;
  const recovered = await createFestivalService(store).snapshot(admittedActor);
  assert.equal(recovered.participants.length, 10);
  assert.equal(recovered.self.role, 'participant');
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM festival_rooms').get().n, 1);
});

test('D1 CAS cannot advance an actor receipt when room revision or sequence loses', async t => {
  const { store, service } = await setup(t);
  await service.command('one', join());
  const { room, visit } = await store.readState('one');
  const next = { ...room, revision: room.revision + 1, installations: [] };
  assert.equal(await store.commit(room.revision, next, 'one', visit.lastSequence, { ...visit, lastSequence: 2 }), true);
  assert.equal(await store.commit(room.revision, next, 'one', 2, { ...visit, lastSequence: 99 }), false);
  assert.equal(await store.commit(next.revision, { ...next, revision: next.revision + 1 }, 'one', 1, { ...visit, lastSequence: 99 }), false);
  const final = await store.readState('one');
  assert.equal(final.visit.lastSequence, 2);
  assert.equal(final.room.revision, next.revision);
});

test('D1 simultaneous free-placement reservations cannot overwrite each other', async t => {
  const { service } = await setup(t);
  await Promise.all(['one', 'two'].map(actor => service.command(actor, join())));
  const build = { type: 'build', requestId: 'same-plot-request', sequence: 2, kind: 7, x: -41.137, z: -35.271, roundIndex: 1 };
  const results = await Promise.allSettled(['one', 'two'].map(actor => service.command(actor, build)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PLACEMENT_BLOCKED');
  assert.equal((await service.snapshot('one')).installations.length, 1);
});

test('server capabilities are independent, unguessable, HttpOnly, and hashed at rest', async t => {
  const { adapter, db } = await setup(t);
  const issued = await adapter.resolveFestivalSession(db, new Request(url), true);
  assert.match(issued.setCookie, /^festival_device=[a-f0-9]{64};/);
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/']) assert.ok(issued.setCookie.includes(flag));
  const cookie = issued.setCookie.split(';')[0];
  const reused = await adapter.resolveFestivalSession(db, new Request(url, { headers: { cookie } }), false);
  assert.equal(reused.actorId, issued.actorId);
  assert.equal(reused.setCookie, undefined);
  const row = db.sql.prepare('SELECT * FROM festival_sessions').get();
  assert.equal(row.token_hash.length, 64);
  assert.notEqual(row.token_hash, cookie.split('=')[1]);
  for (const badCookie of ['festival_device=forged', cookie.replace('festival_device', 'club_device'), `festival_device=${'0'.repeat(64)}`]) {
    await assert.rejects(() => adapter.resolveFestivalSession(db, new Request(url, { headers: { cookie: badCookie } }), false), { code: 'FORBIDDEN' });
  }
});

test('expired sessions are rejected and bootstrap issues a fresh identity', async t => {
  const { adapter, db, advance } = await setup(t);
  const first = await adapter.resolveFestivalSession(db, new Request(url), true);
  const request = new Request(url, { headers: { cookie: first.setCookie.split(';')[0] } });
  advance(31 * 24 * 60 * 60 * 1000);
  await assert.rejects(() => adapter.resolveFestivalSession(db, request, false), { code: 'FORBIDDEN' });
  const second = await adapter.resolveFestivalSession(db, request, true);
  assert.notEqual(second.actorId, first.actorId);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM festival_sessions').get().n, 1, 'Bootstrap cleans expired capabilities');
});

test('atomic network admission allows sixty new capabilities but existing sessions keep working', async t => {
  const { adapter, db, advance } = await setup(t);
  const request = () => new Request(url, { headers: { 'cf-connecting-ip': '192.0.2.40' } });
  const results = await Promise.allSettled(Array.from({ length: 65 }, () => adapter.resolveFestivalSession(db, request(), true)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 60);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'RATE_LIMITED'));
  const first = results.find(r => r.status === 'fulfilled').value;
  const recovered = await adapter.resolveFestivalSession(db, new Request(url, { headers: { cookie: first.setCookie.split(';')[0] } }), true);
  assert.equal(recovered.actorId, first.actorId);
  const bucket = db.sql.prepare('SELECT * FROM festival_admission_buckets').get();
  assert.equal(bucket.admissions, 60);
  assert.equal(JSON.stringify(bucket).includes('192.0.2.40'), false);
  advance(60_000);
  await adapter.resolveFestivalSession(db, request(), true);
  assert.equal(db.sql.prepare('SELECT admissions FROM festival_admission_buckets').get().admissions, 1);
});

test('warm HTTP polls are read-only and carry the same durable clock to every viewer', async t => {
  const { db } = await setup(t);
  const { handleFestivalRequest } = await import('../lib/festival-http.ts');
  const firstResponse = await handleFestivalRequest(new Request(url), db);
  assert.equal(firstResponse.status, 200);
  const cookie = firstResponse.headers.get('set-cookie').split(';')[0];
  const first = await firstResponse.json();
  db.statements.length = 0;
  const repeatedResponse = await handleFestivalRequest(new Request(url, { headers: { cookie } }), db);
  const repeated = await repeatedResponse.json();
  assert.deepEqual(repeated.round, first.round);
  assert.equal(repeated.self.id, first.self.id);
  assert.equal(repeated.participants.length, 0);
  assert.deepEqual(db.statements.filter(sql => /^(INSERT|UPDATE|DELETE)/.test(sql)), []);
  assert.equal(db.statements.filter(sql => /^SELECT/.test(sql)).length, 2);
  const otherResponse = await handleFestivalRequest(new Request(url), db);
  const other = await otherResponse.json();
  assert.notEqual(other.self.id, first.self.id);
  assert.deepEqual(other.round, first.round);
});

test('HTTP replay after response loss preserves one installation and shares it with another real session', async t => {
  const { db, advance } = await setup(t);
  const { handleFestivalRequest } = await import('../lib/festival-http.ts');
  const first = await handleFestivalRequest(new Request(url), db);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const observer = await handleFestivalRequest(new Request(url), db);
  const observerCookie = observer.headers.get('set-cookie').split(';')[0];
  const post = body => handleFestivalRequest(new Request(url, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), db);
  assert.equal((await post(join())).status, 200);
  const build = { type: 'build', requestId: 'network-recovery-build', sequence: 2, kind: 5, x: -41.137, z: -35.271, roundIndex: 1 };
  await post(build); // Deliberately discard the first response like a lost network reply.
  const recovered = await (await post(build)).json();
  assert.equal(recovered.installations.length, 1);
  assert.equal(recovered.self.lastSequence, 2);
  const seen = await (await handleFestivalRequest(new Request(url, { headers: { cookie: observerCookie } }), db)).json();
  assert.deepEqual(seen.installations, recovered.installations);
  assert.equal(seen.self.role, 'visitor');
  assert.equal(seen.participants.length, 1);
  const staleResponse = await post({ ...build, requestId: 'stale-network-build', sequence: 1 });
  assert.equal(staleResponse.status, 409);
  const stale = await staleResponse.json();
  assert.equal(stale.error.code, 'STALE_SEQUENCE');
  assert.equal(stale.snapshot.self.lastSequence, 2);
  advance(60_000);
  const expired = await (await handleFestivalRequest(new Request(url, { headers: { cookie } }), db)).json();
  assert.equal(expired.participants.length, 0);
  assert.equal(expired.installations.length, 1);
  assert.equal((await post(join(3))).status, 200, 'A returning owner may rejoin with the same durable identity');
});


test('HTTP rejects retired lighting controls, D1 strips all saved overrides, and fresh services share unchanged artwork identity', async t => {
  const { db, store, advance, now } = await setup(t);
  const { handleFestivalRequest } = await import('../lib/festival-http.ts');
  const { createFestivalService } = await import('../lib/festival-server.ts');
  const { FESTIVAL_MONUMENT_ID } = await import('../lib/festival-types.ts');
  const bootstrap = await handleFestivalRequest(new Request(url), db);
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0], actorId = (await bootstrap.json()).self.id;
  const observerBootstrap = await handleFestivalRequest(new Request(url), db);
  const observerCookie = observerBootstrap.headers.get('set-cookie').split(';')[0];
  const post = body => handleFestivalRequest(new Request(url, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }), db);
  assert.equal((await post(join())).status, 200);
  const build = { type: 'build', requestId: 'build-autonomous-art', sequence: 2, kind: 0, x: -41.137, z: -35.271, roundIndex: 1 };
  const builtResponse = await post(build); assert.equal(builtResponse.status, 200);
  const built = await builtResponse.json(), task = built.participants.find(p => p.id === actorId).buildTask;
  advance(task.finishAt - now());
  const state = await store.readState(actorId), selection = { mode: 'sweep', palette: 'candy', startedAt: now() };
  state.room.installations[0].lighting = selection; state.room.monumentLighting = selection;
  state.room.revision++; assert.equal(await store.commit(state.room.revision - 1, state.room), true);
  for (const targetId of [task.installationId, FESTIVAL_MONUMENT_ID]) for (const settings of [{ mode: 'chase', palette: 'solar' }, { reset: true }]) {
    const response = await post({ type: 'lighting', requestId: 'retired-light-control', sequence: 3, targetId, roundIndex: 1, ...settings });
    assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'LIGHTING_CLOSED');
  }
  const observerResponse = await handleFestivalRequest(new Request(url, { headers: { cookie: observerCookie } }), db);
  const observed = await observerResponse.json();
  assert.equal(observed.installations[0].lighting, undefined); assert.equal(observed.monumentLighting, undefined);
  assert.equal(observed.installations[0].id, task.installationId); assert.equal(observed.installations[0].createdAt, built.installations[0].createdAt);
  assert.equal(observed.installations[0].creatorName, 'Burner');
  const durable = await store.readState(actorId); assert.equal(durable.visit.lastSequence, 2);
  assert.equal(durable.room.installations[0].lighting, undefined); assert.equal(durable.room.monumentLighting, undefined);
  assert.deepEqual((await createFestivalService(store).snapshot(actorId)).installations, observed.installations);
  const speech = await post({ type: 'say', requestId: 'still-working-speech', sequence: 3, text: '灯光自动追逐' }); assert.equal(speech.status, 200);
  const replayBuild = await (await post(build)).json(); assert.equal(replayBuild.installations.filter(a => a.actorId === actorId).length, 1);
});
