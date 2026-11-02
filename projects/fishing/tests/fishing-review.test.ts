import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import type { RoomDatabase } from '../lib/fishing-d1.ts';
const { D1FishingStore, resolveFishingSession } = await import('../lib/fishing-d1.ts');
const { handleFishingRequest } = await import('../lib/fishing-http.ts');
import type { FishingStore, StoredFishingRoom, StoredFishingVisit } from '../lib/fishing-server.ts';
const { createFishingService } = await import('../lib/fishing-server.ts');
const { MARINE_SPECIES } = await import('../lib/fishing-catalog.ts');
import type { FishingInput, FishingSnapshot } from '../lib/fishing-types.ts';

// Offline review: execute the shipped migration and adapter SQL on real SQLite.
// Transactions are synchronous here so concurrent JS calls cannot interleave
// between statements in a D1 batch, matching the adapter's atomicity contract.
class SQLiteD1 {
  sql = new DatabaseSync(':memory:');
  statements: string[] = [];
  constructor() { this.sql.exec(readFileSync(new URL('../drizzle/0003_windy_supernaut.sql', import.meta.url), 'utf8')); }
  prepare(sql: string) {
    const db = this.sql, statements = this.statements;
    let params: SQLInputValue[] = [];
    const runSync = () => { statements.push(sql); const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; };
    return {
      bind(...values: SQLInputValue[]) { params = values; return this; },
      async first() { statements.push(sql); return db.prepare(sql).get(...params) ?? null; },
      async all() { statements.push(sql); return { results: db.prepare(sql).all(...params) }; },
      async run() { return runSync(); },
      runSync,
    };
  }
  async batch(stmts: ReturnType<SQLiteD1['prepare']>[]) {
    this.sql.exec('BEGIN IMMEDIATE');
    try { const result = stmts.map(stmt => stmt.runSync()); this.sql.exec('COMMIT'); return result; }
    catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
  get binding() { return this as unknown as RoomDatabase; }
}
function fixture(random: () => number = () => 0) {
  const db = new SQLiteD1(), store = new D1FishingStore(db.binding);
  let now = 1_800_000_000_000, sequence = 0;
  const service = createFishingService(store, { now: () => now, random });
  return { db, store, service, advance: (ms: number) => { now += ms; }, now: () => now,
    command: (input: FishingInput, actor = 'alice') => service.command(actor, { ...input, roomId: 'ocean', requestId: `review-request-${++sequence}`, sequence }),
  };
}
const JOIN = { type: 'join', name: '小浪', preset: 'cat' } as const;

test('review: real migration/CAS never advances room or inventory on a stale sequence', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN);
  const state = await x.store.readState('ocean', 'alice');
  const room = state.room!, visit = state.visit!;
  const poisoned = { ...visit, lastSequence: 999, inventory: { ...visit.inventory, total: 999 } };
  assert.equal(await x.store.commit('ocean', room.revision, { ...room, revision: room.revision + 1 }, 'alice', 0, poisoned), false);
  assert.deepEqual(await x.store.readState('ocean', 'alice'), state);
  assert.equal(await x.store.commit('ocean', room.revision - 1, { ...room, revision: room.revision + 1 }, 'alice', visit.lastSequence, poisoned), false);
  assert.deepEqual(await x.store.readState('ocean', 'alice'), state);
});

test('review: failure in the inventory statement rolls the entire D1 batch back', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(5000);
  const caught = (await x.command({ type: 'reel' })).self.fishing.catch!;
  const before = await x.store.readState('ocean', 'alice');
  x.db.sql.exec("CREATE TRIGGER fail_visit BEFORE UPDATE ON fishing_visits BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
  await assert.rejects(x.command({ type: 'collect', catchId: caught.id }), /simulated write failure/);
  assert.deepEqual(await x.store.readState('ocean', 'alice'), before);
  x.db.sql.exec('DROP TRIGGER fail_visit');
  const after = await x.command({ type: 'collect', catchId: caught.id });
  assert.equal(after.self.inventory.total, 1);
  assert.equal(after.self.fishing.phase, 'idle');
});

test('review: real SQLite concurrent joins grant ten unique slots and leave additional visitors as spectators', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  const results = await Promise.all(Array.from({ length: 11 }, (_, i) => x.service.command(`person-${i}`, { ...JOIN, roomId: 'ocean', requestId: `review-join-${i}`, sequence: 1 })));
  assert.equal(results.filter(s => s.self.role === 'participant').length, 10);
  assert.equal(results.filter(s => s.self.role === 'spectator').length, 1);
  const snapshot = await x.service.snapshot('ocean', 'viewer');
  assert.equal(snapshot.participants.length, 10);
  assert.equal(new Set(snapshot.participants.map(p => p.slot)).size, 10);
  assert.equal(snapshot.self.role, 'visitor');
  assert.equal(snapshot.participants.some(p => p.id === 'viewer'), false);
});

test('review: real SQLite seat claims atomically preserve the losing participant and visit', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); const joined = await x.command(JOIN, 'bob');
  const occupied = [...joined.participants, ...joined.ambientParticipants].map(person => person.slot);
  const slot = Array.from({ length: 12 }, (_, i) => i).find(i => !occupied.includes(i))!;
  const before = new Map(await Promise.all(['alice', 'bob'].map(async actor => [actor, await x.store.readState('ocean', actor)] as const)));
  const results = await Promise.allSettled(['alice', 'bob'].map(actor => x.service.command(actor, { type: 'move-seat', slot, roomId: 'ocean', sequence: 10, requestId: `sqlite-seat-${actor}` })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const winner = results.find(result => result.status === 'fulfilled')!.value.self.id;
  const loser = winner === 'alice' ? 'bob' : 'alice';
  const final = await x.store.readState('ocean', loser);
  assert.deepEqual(final.visit, before.get(loser)!.visit);
  assert.deepEqual(final.room!.participants.find(person => person.id === loser), before.get(loser)!.room!.participants.find(person => person.id === loser));
  assert.equal(final.room!.participants.find(person => person.id === winner)!.slot, slot);
  const snapshot = await x.service.snapshot('ocean', winner);
  assert.equal(new Set([...snapshot.participants, ...snapshot.ambientParticipants].map(person => person.slot)).size, 4);
});

test('review: a failed seat transaction rolls back the claim and the same request can safely retry', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  const joined = await x.command(JOIN);
  const occupied = [...joined.participants, ...joined.ambientParticipants].map(person => person.slot);
  const slot = Array.from({ length: 12 }, (_, i) => i).find(i => !occupied.includes(i))!;
  const before = await x.store.readState('ocean', 'alice');
  const command = { type: 'move-seat', slot, roomId: 'ocean', sequence: 2, requestId: 'sqlite-seat-retry' };
  x.db.sql.exec("CREATE TRIGGER fail_move BEFORE UPDATE ON fishing_visits BEGIN SELECT RAISE(ABORT, 'simulated seat failure'); END");
  await assert.rejects(x.service.command('alice', command), /simulated seat failure/);
  assert.deepEqual(await x.store.readState('ocean', 'alice'), before);
  x.db.sql.exec('DROP TRIGGER fail_move');
  const moved = await x.service.command('alice', command);
  assert.equal(moved.participants[0].slot, slot);
  assert.deepEqual(moved.participants[0].movement, { fromSlot: joined.participants[0].slot, startedAt: x.now(), endsAt: x.now() + 700 });
  assert.deepEqual(moved.self.inventory, before.visit!.inventory);
  assert.equal((await x.service.command('alice', command)).revision, moved.revision);
});

test('review: simultaneous distinct collect requests cannot award the same catch twice', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(5000);
  const caught = (await x.command({ type: 'reel' })).self.fishing.catch!;
  const results = await Promise.allSettled([4, 5].map(sequence => x.service.command('alice', { type: 'collect', catchId: caught.id, roomId: 'ocean', requestId: `distinct-collect-${sequence}`, sequence })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const snapshot = await x.service.snapshot('ocean', 'alice');
  assert.equal(snapshot.self.inventory.total, 1);
  assert.equal(snapshot.self.inventory.species[caught.speciesId].count, 1);
  assert.deepEqual(snapshot.self.inventory.recent.map(c => c.id), [caught.id]);
  assert.equal(snapshot.events.filter(e => e.type === 'collect').length, 1);
});

test('review: two reel commands can create only one catch and no inventory without collection', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(5000);
  const results = await Promise.allSettled([3, 4].map(sequence => x.service.command('alice', { type: 'reel', roomId: 'ocean', requestId: `review-reel-${sequence}`, sequence })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const snapshot = await x.service.snapshot('ocean', 'alice');
  assert.equal(snapshot.self.inventory.total, 0);
  assert.equal(snapshot.self.fishing.phase, 'holding');
  assert.equal(snapshot.events.filter(e => e.type === 'catch').length, 1);
});

test('review: window accepts its first and last millisecond, rejects both adjacent milliseconds', async t => {
  for (const [offset, phase] of [[4999, 'waiting'], [5000, 'holding'], [9999, 'holding'], [10000, 'escaped']] as const) {
    const x = fixture(); t.after(() => x.db.sql.close());
    await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(offset);
    if (phase === 'waiting') await assert.rejects(x.command({ type: 'reel' }), { code: 'INVALID_COMMAND' });
    else assert.equal((await x.command({ type: 'reel' })).self.fishing.phase, phase);
    assert.equal((await x.service.snapshot('ocean', 'alice')).self.inventory.total, 0);
  }
});

test('review: CAS contention rechecks the deadline before retrying a reel', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(9999);
  let failed = false;
  const store: FishingStore = {
    ensureRoom: (id: string, state: StoredFishingRoom) => x.store.ensureRoom(id, state),
    ensureVisit: (room: string, actor: string, state: StoredFishingVisit) => x.store.ensureVisit(room, actor, state),
    readState: (room: string, actor: string) => x.store.readState(room, actor),
    commit: async (...args) => { if (!failed) { failed = true; x.advance(1); return false; } return x.store.commit(...args); },
  };
  const service = createFishingService(store, { now: x.now, random: () => 0 });
  const snapshot = await service.command('alice', { type: 'reel', roomId: 'ocean', requestId: 'review-contention-reel', sequence: 3 });
  assert.equal(snapshot.self.fishing.phase, 'escaped');
  assert.equal(snapshot.events.some(e => e.type === 'catch'), false);
  assert.equal(snapshot.self.inventory.total, 0);
});

test('review: all twenty weighted intervals select the intended real species and valid size', async t => {
  const total = MARINE_SPECIES.reduce((sum, s) => sum + s.selectionWeight, 0);
  let lower = 0;
  for (const species of MARINE_SPECIES) {
    // First three draws allocate two NPC stations and the joining human.
    const choices = [0, 0, 0, 0, (lower + species.selectionWeight / 2) / total, 0.5];
    const x = fixture(() => choices.shift() ?? 0); t.after(() => x.db.sql.close());
    await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(5000);
    const catchRecord = (await x.command({ type: 'reel' })).self.fishing.catch!;
    assert.equal(catchRecord.speciesId, species.id);
    assert.ok(catchRecord.lengthCm >= species.minCm && catchRecord.lengthCm <= species.maxCm);
    assert.ok(Number.isFinite(catchRecord.weightKg) && catchRecord.weightKg > 0);
    lower += species.selectionWeight;
  }
});

test('review: holding catch and collected backpack survive a fresh service and seat eviction', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(5000);
  const caught = (await x.command({ type: 'reel' })).self.fishing.catch!;
  x.advance(60000);
  const service = createFishingService(new D1FishingStore(x.db.binding), { now: x.now });
  const expired = await service.snapshot('ocean', 'alice');
  assert.equal(expired.self.role, 'spectator'); assert.equal(expired.participants.length, 0);
  assert.deepEqual(expired.self.fishing.catch, caught);
  await service.command('alice', { ...JOIN, roomId: 'ocean', requestId: 'review-rejoin-request', sequence: 4 });
  await service.command('alice', { type: 'collect', catchId: caught.id, roomId: 'ocean', requestId: 'review-collect-request', sequence: 5 });
  const restart = await createFishingService(new D1FishingStore(x.db.binding), { now: x.now }).snapshot('ocean', 'alice');
  assert.equal(restart.self.inventory.total, 1); assert.deepEqual(restart.self.inventory.recent, [caught]);
  const observer = await service.snapshot('ocean', 'observer');
  assert.equal(observer.self.inventory.total, 0);
  assert.ok(observer.participants.every(p => !('inventory' in p)));
});

test('review: replay beyond the eighty-receipt retention horizon cannot recollect an old catch', async t => {
  const x = fixture(); t.after(() => x.db.sql.close());
  await x.command(JOIN); await x.command({ type: 'cast' }); x.advance(5000);
  const caught = (await x.command({ type: 'reel' })).self.fishing.catch!;
  const collect = { type: 'collect', catchId: caught.id, roomId: 'ocean', requestId: 'review-old-collection', sequence: 4 };
  await x.service.command('alice', collect);
  for (let sequence = 5; sequence < 90; sequence++) {
    x.advance(400);
    await x.service.command('alice', { type: 'heartbeat', roomId: 'ocean', requestId: `review-heartbeat-${sequence}`, sequence });
  }
  await assert.rejects(x.service.command('alice', collect), { code: 'STALE_SEQUENCE' });
  assert.equal((await x.service.snapshot('ocean', 'alice')).self.inventory.total, 1);
});

test('review: HTTP boundary rejects forged identity, foreign origins and invalid room without external I/O', async t => {
  const db = new SQLiteD1(); t.after(() => db.sql.close());
  const url = 'https://fishing.example/api/fishing?room=ocean';
  for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { origin: 'https://evil.example' }] as Record<string, string>[]) {
    assert.equal((await handleFishingRequest(new Request(url, { headers }), db.binding)).status, 403);
  }
  assert.equal((await handleFishingRequest(new Request('https://fishing.example/api/fishing?room=missing'), db.binding)).status, 400);
  assert.equal(db.statements.length, 0);
  const initialResponse = await handleFishingRequest(new Request(url), db.binding);
  assert.equal(initialResponse.status, 200);
  const cookie = initialResponse.headers.get('set-cookie')!.split(';')[0];
  assert.match(initialResponse.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax; Max-Age=31536000; Secure/);
  const initial = await initialResponse.json() as FishingSnapshot;
  const post = (body: object, auth = cookie, origin = 'https://fishing.example') => handleFishingRequest(new Request(url, { method: 'POST', headers: { cookie: auth, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), db.binding);
  const command = { ...JOIN, roomId: 'ocean', requestId: 'review-http-join', sequence: 1 };
  assert.equal((await post(command, 'fishing_device=forged')).status, 403);
  assert.equal((await post(command, cookie, 'https://evil.example')).status, 403);
  assert.equal((await post({ ...command, actorId: 'victim' })).status, 400);
  assert.equal((await post({ ...command, expiresAt: 0 })).status, 400);
  const joined = await post(command); assert.equal(joined.status, 200);
  assert.equal((await joined.json() as FishingSnapshot).self.id, initial.self.id);
  db.statements.length = 0;
  const refresh = await handleFishingRequest(new Request(url, { headers: { cookie } }), db.binding);
  assert.equal(refresh.status, 200); assert.match(refresh.headers.get('cache-control')!, /no-store/);
  assert.equal((await refresh.json() as FishingSnapshot).self.id, initial.self.id);
  assert.equal(db.statements.filter(sql => /^(INSERT|UPDATE)/.test(sql)).length, 0);
  assert.equal(db.statements.filter(sql => /^SELECT/.test(sql)).length, 2);
});

test('review: session capability is server-issued, hashed at rest and reusable', async t => {
  const db = new SQLiteD1(); t.after(() => db.sql.close());
  const first = await resolveFishingSession(db.binding, new Request('https://fishing.example/api/fishing'), true);
  const cookie = first.setCookie!.split(';')[0];
  const next = await resolveFishingSession(db.binding, new Request('https://fishing.example/api/fishing', { headers: { cookie } }), false);
  assert.equal(next.actorId, first.actorId); assert.equal(next.setCookie, undefined);
  const row = db.sql.prepare('SELECT * FROM fishing_sessions').get()!;
  assert.equal(String(row.token_hash).length, 64); assert.notEqual(row.token_hash, cookie.split('=')[1]);
  assert.equal(row.actor_id, first.actorId);
});

test('review: default browser fetch retains its global receiver for reads and writes', async t => {
  const { FishingTransport } = await import('../lib/fishing-client.ts');
  const x = fixture(); t.after(() => x.db.sql.close());
  const snapshot = await x.service.snapshot('ocean', 'alice');
  const receivers: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async function (this: unknown) {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Response.json(snapshot);
  });
  const client = new FishingTransport();
  await client.refresh();
  await client.send(JOIN);
  assert.equal(receivers.length, 2);
  assert.ok(receivers.every(receiver => receiver === globalThis));
});

// Execute the real hook with deterministic React state/effect and network
// scheduling. No browser, DOM renderer, live request, or audio is involved.
async function hookHarness() {
  const ts = await import('typescript');
  const vm = await import('node:vm');
  const fishing = await import('../lib/fishing-client.ts');
  const room = await import('../lib/room-client.ts');
  type Value = ReturnType<typeof import('../hooks/useFishingRoom.ts').useFishingRoom>;
  const slots: unknown[] = [], effects: (() => (() => void) | void)[] = [];
  const timers = new Map<number, () => unknown>();
  let cursor = 0, timerId = 0;
  const react = {
    useRef(value: unknown) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], (next: unknown) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = cursor++;
      const old = slots[index] as { callback: unknown; deps: unknown[] } | undefined;
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) slots[index] = { callback, deps };
      return (slots[index] as { callback: unknown }).callback;
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++;
      if (!(index in slots)) { slots[index] = deps; effects.push(effect); }
    },
  };
  const exports: { useFishingRoom?: () => Value } = {};
  const context = vm.createContext({ exports, Date, Promise, console, AbortController,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === '@/lib/fishing-client') return fishing;
      if (name === '@/lib/room-client') return room;
      throw Error(`Unexpected hook dependency: ${name}`);
    },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeout: (callback: () => unknown) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const source = readFileSync(new URL('../hooks/useFishingRoom.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { render: () => { cursor = 0; return exports.useFishingRoom!(); }, effects, timers };
}
const reviewSnapshot = (revision: number, serverNow: number, id = 'alice'): FishingSnapshot => ({
  roomId: 'ocean', revision, serverNow, capacity: 10, participants: [], ambientParticipants: [], events: [],
  self: { id, role: 'visitor', lastSequence: 0, fishing: { phase: 'idle' }, inventory: { total: 0, species: {}, recent: [] } },
});
const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve));

test('review: a rejected delayed poll must not recalibrate the hook clock backward', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const replies: ((response: Response) => void)[] = [];
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => replies.push(resolve)));
  const hook = await hookHarness();
  hook.render();
  const cleanup = hook.effects[0]()!;
  t.after(cleanup);
  replies.shift()!(Response.json(reviewSnapshot(1, 1000)));
  await flushMicrotasks();
  const before = hook.render();
  assert.equal(before.offset, 0);
  const stale = before.refresh();
  const newer = before.refresh();
  now = 2000;
  assert.equal(replies.length, 2);
  replies[1](Response.json(reviewSnapshot(2, 2000)));
  await newer;
  const newestOffset = hook.render().offset;
  now = 4000;
  replies[0](Response.json(reviewSnapshot(1, 1000)));
  await stale;
  const result = hook.render();
  assert.equal(result.snapshot!.revision, 2);
  assert.equal(result.offset, newestOffset, 'rejected responses must not move the accepted clock sample');
});

test('review: effect cleanup/setup isolates old in-flight polls and leaves only one polling loop', async t => {
  t.mock.method(Date, 'now', () => 1000);
  const replies: ((response: Response) => void)[] = [];
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => replies.push(resolve)));
  const hook = await hookHarness();
  hook.render();
  const stopOld = hook.effects[0]()!;
  stopOld();
  const stopNew = hook.effects[0]()!;
  t.after(stopNew);
  assert.equal(replies.length, 2);
  replies[1](Response.json(reviewSnapshot(2, 1000, 'new-session')));
  await flushMicrotasks();
  assert.equal(hook.render().snapshot!.self.id, 'new-session');
  replies[0](Response.json(reviewSnapshot(1, 1000, 'old-session')));
  await flushMicrotasks();
  assert.equal(hook.render().snapshot!.self.id, 'new-session', 'an old lifecycle must not replace the current session');
  assert.equal(hook.timers.size, 1, 'the old lifecycle must not schedule an extra polling loop');
});

type ReviewElement = { type: string | ((props: object) => unknown); props: Record<string, unknown> & { children?: unknown } };
async function feedHarness(perform: (input: FishingInput) => Promise<FishingSnapshot | null>, uncertain = false) {
  const ts = await import('typescript'), vm = await import('node:vm');
  const catalog = await import('../lib/fishing-catalog.ts');
  const types = await import('../lib/fishing-types.ts');
  const avatars = await import('../lib/fishing-avatar-catalog.ts');
  const roomTypes = await import('../lib/room-types.ts');
  const profile = await import('../lib/fishing-profile.ts');
  const avatarLoading = await import('../lib/fishing-avatar-loading.ts');
  const slots: unknown[] = [];
  let cursor = 0;
  const react = {
    useRef(value: unknown) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], (next: unknown) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useCallback(callback: unknown) { return callback; },
    useEffect() {},
  };
  const jsx = (type: ReviewElement['type'], props: ReviewElement['props']) => ({ type, props });
  const room = { snapshot: reviewSnapshot(1, 1000), perform, uncertain, pending: false, connected: true, offset: 0, error: '', refresh: async () => undefined };
  const exports: { default?: () => ReviewElement } = {};
  const context = vm.createContext({ exports, Date, console, AbortController,
    localStorage: { setItem() {} }, setTimeout: () => 1, clearTimeout() {},
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => String(key) });
      if (name === '@/hooks/useFishingRoom') return { useFishingRoom: () => room };
      if (name === '@/hooks/useFishingOceanAudio') return { useFishingOceanAudio: () => ({muted: false, playing: false, needsGesture: false, unavailable: false, requestFromGesture() {}, toggleFromGesture() {}}) };
      if (name === '@/lib/fishing-avatar-catalog') return avatars;
      if (name === '@/lib/fishing-catalog') return catalog;
      if (name === '@/lib/fishing-types') return types;
      if (name === '@/lib/room-types') return roomTypes;
      if (name === '@/lib/fishing-profile') return profile;
      if (name === '@/lib/fishing-avatar-loading') return {...avatarLoading,preloadFishingAvatar:async()=>{}};
      if (name === './FishingProfilePage') return { default: 'Profile', getProfileMedia: () => [] };
      return { default: name };
    },
  });
  const source = readFileSync(new URL('../components/fishing/FishingFeed.tsx', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function elements(value: unknown): ReviewElement[] {
    if (Array.isArray(value)) return value.flatMap(elements);
    if (!value || typeof value !== 'object' || !('type' in value) || !('props' in value)) return [];
    const element = value as ReviewElement;
    return [element, ...elements(element.props.children)];
  }
  return { room, render: () => { cursor = 0; return elements(exports.default!()); } };
}
function clickReview(element: ReviewElement) { return (element.props.onClick as () => unknown)(); }

test('review: uncertain prior command blocks join/profile submission and leave intents', async () => {
  const calls: FishingInput[] = [];
  const ui = await feedHarness(async input => { calls.push(input); return reviewSnapshot(2, 1000); }, true);
  (ui.render().find(e => e.type === 'Profile')!.props.onManageAvatar as () => void)();
  (ui.render().find(e => e.props.id === 'angler-name')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '小浪' } });
  const controls = ui.render();
  const submit = controls.find(e => e.type === 'button' && e.props.type === 'submit')!;
  assert.equal(submit.props.disabled, true, 'only explicitly labelled retry should send while the old command is unresolved');
  assert.equal(calls.length, 0);
  ui.room.snapshot.self.role = 'participant';
  ui.room.snapshot.participants = [{ id: 'alice', name: '小浪', preset: 'cat', slot: 0, joinedAt: 1000, lastSeenAt: 1000, fishing: { phase: 'idle' } }];
  const participant = ui.render();
  assert.equal(participant.find(e => e.type === 'button' && e.props.type === 'submit')!.props.disabled, true);
  assert.equal(participant.find(e => e.props.className === 'leave-button')!.props.disabled, true);
  ui.room.snapshot.self.fishing = { phase: 'bite', castId: 'review-bite', biteAt: Date.now() - 1000, expiresAt: Date.now() + 2000 };
  assert.equal(ui.render().some(e => e.props.className === 'bite-banner' && !e.props.disabled), false, 'the bite shortcut cannot silently replay an earlier command');
});

test('review: a slow join response does not close a newer backpack drawer', async () => {
  let finish!: (snapshot: FishingSnapshot) => void;
  let calls = 0;
  const pending = new Promise<FishingSnapshot>(resolve => { finish = resolve; });
  const ui = await feedHarness(async () => { calls++; return pending; });
  (ui.render().find(e => e.type === 'Profile')!.props.onManageAvatar as () => void)();
  (ui.render().find(e => e.props.id === 'angler-name')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '小浪' } });
  const form = ui.render().find(e => e.type === 'form')!;
  const submitted = (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
  await flushMicrotasks();
  assert.equal(calls, 1, 'a valid join must actually be in flight after preloading and before the drawer changes');
  const modal = ui.render().find(e => typeof e.type === 'function' && e.props.title === '选个分身，一起上船')!;
  (modal.props.onClose as () => void)();
  clickReview(ui.render().find(e => String(e.props['aria-label']).startsWith('打开背包'))!);
  assert.ok(ui.render().some(e => e.props.title === '我的海洋背包'));
  finish(reviewSnapshot(2, 1000));
  await submitted;
  assert.ok(ui.render().some(e => e.props.title === '我的海洋背包'), 'the new drawer must survive an older command completion');
});
