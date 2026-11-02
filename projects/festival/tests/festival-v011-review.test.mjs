import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
const { INSTALLATION_DESIGNS } = await import('../src/desert/installations.ts');

// Independent review: decode the shipped PNG bytes rather than trusting file
// names, export settings or CSS. Supports Blender's non-interlaced RGBA output.
function readPngRgba(path) {
  const png = fs.readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let width, height, channels, depth, interlace;
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0; interlace = data[12]; }
    if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
  }
  assert.equal(channels, 4, 'Thumbnail must ship a real RGBA channel');
  assert.equal(depth, 8); assert.equal(interlace, 0);
  const bytes = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  assert.equal(bytes.length, height * (stride + 1));
  const rgba = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = bytes[y * (stride + 1)]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? rgba[i - channels] : 0, b = y ? rgba[i - stride] : 0, c = y && x >= channels ? rgba[i - stride - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      rgba[i] = (bytes[y * (stride + 1) + 1 + x] + prediction) & 255;
    }
  }
  return { width, height, rgba };
}

for (const design of INSTALLATION_DESIGNS) {
  test(`v0.1.1 shipped ${design.id} thumbnail has genuine alpha, empty borders and visible artwork`, () => {
    const { width, height, rgba } = readPngRgba(new URL(`../public/installation-previews/${design.id}.png`, import.meta.url));
    let clear = 0, visible = 0, partial = 0;
    for (let i = 3; i < rgba.length; i += 4) { if (rgba[i] === 0) clear++; if (rgba[i] >= 128) visible++; if (rgba[i] > 0 && rgba[i] < 255) partial++; }
    assert.ok(clear > width * height * 0.15, 'Background must be transparent rather than baked into the picture');
    assert.ok(visible > width * height * 0.015, 'Artwork must remain visible');
    assert.ok(partial > 0, 'Antialiased or translucent artwork edges should survive export');
    const alpha = (x, y) => rgba[(y * width + x) * 4 + 3];
    for (let x = 0; x < width; x++) { assert.equal(alpha(x, 0), 0, 'top border'); assert.equal(alpha(x, height - 1), 0, 'bottom border'); }
    for (let y = 0; y < height; y++) { assert.equal(alpha(0, y), 0, 'left border'); assert.equal(alpha(width - 1, y), 0, 'right border'); }
  });
}

// Exercise production SQLite statements and JSON recovery. The in-memory
// adapter supplies D1's transactional batch semantics, not a fake room model.
import { DatabaseSync } from 'node:sqlite';
const { D1FestivalStore } = await import('../lib/festival-d1.ts');
const { createFestivalService } = await import('../lib/festival-server.ts');
const festival = await import('../lib/festival-types.ts');

class ReviewD1 {
  sql = new DatabaseSync(':memory:');
  queue = Promise.resolve();
  constructor() { this.sql.exec(fs.readFileSync(new URL('../drizzle/0003_desert_festival.sql', import.meta.url), 'utf8')); }
  prepare(statement) {
    const sql = this.sql; let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { return sql.prepare(statement).get(...values) ?? null; },
      async run() { return { success: true, meta: { changes: Number(sql.prepare(statement).run(...values).changes) } }; },
    };
  }
  batch(statements) {
    const pending = this.queue.then(async () => {
      this.sql.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sql.exec('COMMIT'); return results; }
      catch (error) { this.sql.exec('ROLLBACK'); throw error; }
    });
    this.queue = pending.catch(() => undefined); return pending;
  }
}
function serviceFixture(t) {
  const db = new ReviewD1(), store = new D1FestivalStore(db);
  let now = 1_800_000_000_000;
  const service = createFestivalService(store, { now: () => now });
  t.after(() => db.sql.close());
  return { db, store, service, now: () => now, advance: ms => { now += ms; } };
}
const cmd = (type, sequence, fields = {}, requestId = `${type}-review-${sequence}`) => ({ type, sequence, requestId, ...fields });
const joinReview = sequence => cmd('join', sequence, { name: 'Review Nomad', preset: 'cat' });
const buildReview = (sequence, fields = {}) => cmd('build', sequence, { kind: 0, x: -60.125, z: -3.875, roundIndex: 1, ...fields });

test('v0.1.1 exact free-placement decimals persist and replay through a new real D1 service', async t => {
  const { service, store, now } = serviceFixture(t);
  await service.command('one', joinReview(1));
  const request = buildReview(2), first = await service.command('one', request);
  const restored = await createFestivalService(store, { now }).snapshot('observer');
  assert.deepEqual(restored.installations, first.installations);
  assert.equal(restored.installations[0].x, request.x); assert.equal(restored.installations[0].z, request.z);
  assert.equal(restored.installations[0].plotId, undefined);
  const replay = await service.command('one', request);
  assert.equal(replay.revision, first.revision); assert.equal(replay.installations.length, 1);
  await assert.rejects(service.command('one', { ...request, x: request.x + 0.01 }), { code: 'REQUEST_CONFLICT' });
  assert.equal((await service.snapshot('one')).self.lastSequence, 2);
});

test('v0.1.1 invalid, nonfinite, forged, unsafe-boundary and stale-round placements cannot mutate room or sequence', async t => {
  const { service, store } = serviceFixture(t);
  await service.command('one', joinReview(1));
  const before = await store.readState('one');
  for (const fields of [
    { x: NaN }, { x: Infinity }, { z: -Infinity }, { x: '61' }, { z: null },
    { kind: -1 }, { kind: 12 }, { kind: 1.5 }, { roundIndex: 0 }, { roundIndex: 1.5 },
    { plotId: 'ring-2-6' }, { actorId: 'victim' }, { createdAt: 0 }, { radius: 0 },
  ]) await assert.rejects(service.command('one', buildReview(2, fields)), { code: 'INVALID_COMMAND' });
  for (const fields of [{ x: 0, z: 0 }, { x: 1e308 }, { x: -79, z: 0 }, { x: 81, z: 0 }]) {
    await assert.rejects(service.command('one', buildReview(2, fields)), { code: 'PLACEMENT_BLOCKED' });
  }
  await assert.rejects(service.command('one', buildReview(2, { roundIndex: 2 })), { code: 'ROUND_CLOSED' });
  assert.deepEqual(await store.readState('one'), before, 'Rejected actions must not consume a sequence, refresh presence, spend tokens or alter authoritative state');
});

test('v0.1.1 two D1 actors racing overlapping decimal footprints have one winner and a reusable loser sequence', async t => {
  const { service } = serviceFixture(t);
  await Promise.all(['one', 'two'].map(id => service.command(id, joinReview(1))));
  const positions = [{ x: -60.125, z: -3.875 }, { x: -59.001, z: -3.02 }];
  const results = await Promise.allSettled(['one', 'two'].map((id, i) => service.command(id, buildReview(2, positions[i]))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'PLACEMENT_BLOCKED');
  const winner = (await service.snapshot('observer')).installations[0].actorId;
  const loser = winner === 'one' ? 'two' : 'one';
  assert.equal((await service.snapshot(loser)).self.lastSequence, 1);
  const retried = await service.command(loser, buildReview(2, { x: 60.125, z: -3.875 }));
  assert.equal(retried.installations.length, 2);
  assert.equal(new Set(retried.installations.map(art => art.actorId)).size, 2);
});

test('v0.1.1 serialized legacy plot art survives reads, blocks its expanded footprint and expires normally', async t => {
  const { db, service, store, now, advance } = serviceFixture(t);
  await service.command('one', joinReview(1));
  const stored = await store.readState('one');
  const oldArt = { id: 'legacy-v010-art', actorId: 'departed-builder', kind: 2, plotId: 'ring-2-6', x: -58, z: 0, createdAt: now(), roundIndex: 1 };
  stored.room.installations.push(oldArt);
  db.sql.prepare("UPDATE festival_rooms SET state_json = ? WHERE room_id = 'main'").run(JSON.stringify(stored.room));
  const recovered = await createFestivalService(store, { now }).snapshot('one');
  assert.deepEqual(recovered.installations, [oldArt]);
  await assert.rejects(service.command('one', buildReview(2, { x: -58, z: 14 })), { code: 'PLACEMENT_BLOCKED' });
  assert.equal((await service.snapshot('one')).self.lastSequence, 1);
  advance(festival.FESTIVAL_ROUND_MS);
  assert.equal((await service.snapshot('one')).installations.length, 0);
});

test('v0.1.1 a committed build replay after rollover cannot build it again in the new round', async t => {
  const { service, advance } = serviceFixture(t);
  await service.command('one', joinReview(1));
  const request = buildReview(2); await service.command('one', request);
  advance(festival.FESTIVAL_ROUND_MS);
  await service.command('one', joinReview(3));
  const replay = await service.command('one', request);
  assert.equal(replay.round.index, 2); assert.equal(replay.installations.length, 0); assert.equal(replay.self.lastSequence, 3);
  await assert.rejects(service.command('one', buildReview(4)), { code: 'ROUND_CLOSED' });
  const fresh = await service.command('one', buildReview(4, { roundIndex: 2 }));
  assert.equal(fresh.installations.length, 1); assert.equal(fresh.installations[0].roundIndex, 2);
});

test('v0.1.1 a placement pending at burn deadline is refused without changing its sequence', async t => {
  const { service, advance } = serviceFixture(t);
  await service.command('one', joinReview(1));
  advance(festival.FESTIVAL_BUILD_MS - 30_000);
  await service.command('one', joinReview(2));
  assert.equal((await service.command('one', buildReview(3))).installations.length, 1);
  advance(30_000);
  await assert.rejects(service.command('one', buildReview(4, { x: 60.125 })), { code: 'ROUND_CLOSED' });
  assert.equal((await service.snapshot('one')).self.lastSequence, 3);
});

const motion = await import('../lib/festival-motion.ts');

for (const latency of [150, 300, 600, 1000]) {
  test(`v0.1.1 rendered walking stays bounded across ${latency} ms late acknowledgements, retargets and stops`, () => {
    let authority = { id: 'self', x: 0, z: 44, targetX: 0, targetZ: 44, moveAt: 0, heading: 0 };
    let shown = null, prediction = null, token = 0, lastDistance = 0;
    const acknowledgements = [], submissions = [];
    const inputs = new Map([[20, [45, 44]], [420, [-45, 44]], [820, null], [1220, [20, 67]], [1820, [50, 20]]]);
    const originalAuthorities = [];
    for (let now = 0; now <= 17_000; now += 20) {
      if (inputs.has(now)) {
        const target = inputs.get(now), at = shown ?? festival.projectParticipant(authority, now);
        prediction = { actorId: 'self', x: at.x, z: at.z, targetX: target?.[0] ?? at.x, targetZ: target?.[1] ?? at.z, moveAt: now, heading: at.heading, expiresAt: now + 30_000, token: ++token };
        submissions.push({ at: now + latency / 2, target, token });
      }
      while (submissions[0]?.at <= now) {
        const submission = submissions.shift(), at = festival.projectParticipant(authority, now);
        authority = { ...authority, x: at.x, z: at.z, targetX: submission.target?.[0] ?? at.x, targetZ: submission.target?.[1] ?? at.z, moveAt: now, heading: at.heading };
        acknowledgements.push({ at: now + latency / 2, token: submission.token, state: structuredClone(authority) });
      }
      for (const acknowledgement of acknowledgements.filter(item => item.at <= now)) {
        if (prediction?.token === acknowledgement.token) prediction = null;
      }
      // Late older acknowledgements never displace the latest predicted route.
      const accepted = acknowledgements.filter(item => item.at <= now).at(-1)?.state ?? { ...authority, targetX: 0, targetZ: 44, x: 0, z: 44 };
      originalAuthorities.push([accepted, structuredClone(accepted)]);
      const previous = shown;
      shown = motion.stepFestivalMotion(shown, motion.selectFestivalMovement(accepted, prediction, now), now, .02);
      assert.ok(Number.isFinite(shown.x + shown.z + shown.heading + shown.distance));
      if (previous) assert.ok(Math.hypot(shown.x - previous.x, shown.z - previous.z) <= festival.FESTIVAL_MOVE_SPEED * .02 * 1.5 + .001, `A network transition teleported at ${now} ms`);
      assert.ok(Math.hypot(shown.x, shown.z) >= festival.FESTIVAL_MONUMENT_RADIUS - 1e-7);
      assert.ok(Math.hypot(shown.x, shown.z) <= festival.FESTIVAL_WORLD_RADIUS + 1e-7);
      assert.ok(shown.distance >= lastDistance, 'Gait phase cannot reset on an acknowledgement');
      lastDistance = shown.distance;
    }
    assert.ok(Math.hypot(shown.x - 50, shown.z - 20) < .01, 'Final pose must converge to the last authoritative destination');
    for (const [actual, original] of originalAuthorities) assert.deepEqual(actual, original, 'Presentation must not rewrite server authority');
  });
}

test('v0.1.1 monotonic clock resists delayed/reordered samples and backward local clock readings', () => {
  let local = 0;
  const clock = new motion.FestivalClock(() => local, 1_000_000);
  clock.accept(1_000_000, 0, 0);
  let previous = clock.now();
  for (const [at, serverNow, start] of [[1000, 1_000_950, 850], [2000, 1_001_075, 1000], [2500, 1_002_490, 2350], [2400, 1_002_000, 2300], [3000, 1_003_000, 2000]]) {
    local = at;
    const before = clock.now();
    clock.accept(serverNow, start, at);
    assert.equal(clock.now(), before, 'An accepted sample must not instantly shift the clock');
    assert.ok(clock.now() >= previous, 'Clock must not rewind');
    previous = clock.now();
  }
});

import vm from 'node:vm';
import ts from 'typescript';
const hookJavaScript = ts.transpileModule(fs.readFileSync(new URL('../hooks/useFestivalRoom.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const flushReview = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const reviewResponse = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(data) });
const hookSnapshot = (serverNow = 0, revision = 1, sequence = 1) => ({
  roomId: 'main', revision, serverNow, capacity: 10, self: { id: 'self', role: 'participant', lastSequence: sequence },
  participants: [{ id: 'self', name: 'Nomad', preset: 'cat', slot: 0, joinedAt: 0, lastSeenAt: 0, x: 0, z: 44, targetX: 0, targetZ: 44, moveAt: 0, heading: 0, emote: 'dance', emoteAt: 0 }],
  installations: [], round: festival.festivalRoundAt(1, 0, serverNow),
});
function reviewHook(serve) {
  let now = 0, id = 0;
  const states = [], effects = [], requests = [], timers = new Map(), document = new EventTarget(), window = new EventTarget();
  document.visibilityState = 'visible';
  const context = vm.createContext({ exports: {}, crypto, AbortController, document, window,
    Date: class extends Date { static now() { return now; } }, performance: { now: () => now },
    setTimeout(callback, delay) { const key = ++id; timers.set(key, { at: now + delay, callback }); return key; }, clearTimeout(key) { timers.delete(key); },
    setInterval() { return ++id; }, clearInterval() {},
    fetch: async (url, options) => { const request = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined }; requests.push(request); return serve(request, now); },
    require(specifier) {
      if (specifier === '@/lib/festival-motion') return { FestivalClock: class extends motion.FestivalClock { constructor() { super(() => now, now); } } };
      if (specifier === 'react') return {
        useRef: current => ({ current }), useCallback: callback => callback, useEffect: callback => effects.push(callback),
        useState: initial => { const slot = states.length; states.push(initial); return [initial, next => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
      };
      throw new Error(`Unexpected hook import: ${specifier}`);
    },
  });
  vm.runInContext(hookJavaScript, context);
  const api = context.exports.useFestivalRoom(); let cleanups = [];
  return { api, states, requests,
    async mount() { cleanups = effects.map(effect => effect()).filter(Boolean); await flushReview(); },
    unmount() { cleanups.forEach(cleanup => cleanup()); },
    async tick(to) { now = to; for (const [key, timer] of [...timers]) if (timer.at <= now && timers.delete(key)) timer.callback(); await flushReview(); },
    setTime(to) { now = to; },
  };
}

test('v0.1.1 a delayed in-flight move preserves the last of forty queued alternating targets and stop', async t => {
  let release, posts = 0;
  const h = reviewHook((request, now) => {
    if (request.method === 'GET') return reviewResponse(hookSnapshot(now));
    if (++posts === 1) return new Promise(resolve => { release = resolve; });
    return reviewResponse(hookSnapshot(now, posts + 1, request.body.sequence));
  });
  t.after(() => h.unmount()); await h.mount();
  const pending = [h.api.send({ type: 'move', x: 30, z: 44 }, true)]; await flushReview();
  for (let i = 0; i < 40; i++) pending.push(h.api.send(i % 3 ? { type: 'move', x: i - 20, z: 60 } : { type: 'stop' }, true));
  pending.push(h.api.send({ type: 'move', x: 12.875, z: 66.625 }, true));
  h.setTime(1000); release(reviewResponse(hookSnapshot(500, 2, 2))); await Promise.all(pending);
  const mutations = h.requests.filter(request => request.method === 'POST');
  assert.equal(mutations.length, 2, 'Obsolete queued targets must never be replayed');
  assert.equal(mutations[1].body.x, 12.875); assert.equal(mutations[1].body.z, 66.625); assert.equal(mutations[1].body.sequence, 3);
  assert.equal(h.states[0].self.lastSequence, 3); assert.equal(h.states[3], false);
});

test('v0.1.1 movement throttling retries identical request identity and sequence, then stops without delayed replay', async t => {
  let posts = 0;
  const h = reviewHook((request, now) => {
    if (request.method === 'GET') return reviewResponse(hookSnapshot(now));
    if (++posts === 1) return reviewResponse({ error: { code: 'RATE_LIMITED', message: 'Wait', retryAfterMs: 80 }, snapshot: hookSnapshot(now) }, 429);
    return reviewResponse(hookSnapshot(now, posts, request.body.sequence));
  });
  t.after(() => h.unmount()); await h.mount();
  const moved = h.api.send({ type: 'move', x: 20, z: 65 }, true); await flushReview();
  await h.tick(79); assert.equal(h.requests.filter(request => request.method === 'POST').length, 1);
  await h.tick(80); assert.equal(await moved, true);
  const mutations = h.requests.filter(request => request.method === 'POST');
  assert.deepEqual(mutations[0].body, mutations[1].body, 'Rate-limit retry remains idempotent');
  assert.equal(await h.api.send({ type: 'stop' }, true), true);
  assert.equal(h.requests.filter(request => request.method === 'POST').at(-1).body.type, 'stop');
});

test('v0.1.1 superseded rate-limited movement is abandoned before retry while the latest stop survives', async t => {
  let posts = 0;
  const h = reviewHook((request, now) => {
    if (request.method === 'GET') return reviewResponse(hookSnapshot(now));
    if (++posts === 1) return reviewResponse({ error: { code: 'RATE_LIMITED', message: 'Wait', retryAfterMs: 80 }, snapshot: hookSnapshot(now) }, 429);
    return reviewResponse(hookSnapshot(now, posts, request.body.sequence));
  });
  t.after(() => h.unmount()); await h.mount();
  const first = h.api.send({ type: 'move', x: 20, z: 65 }, true); await flushReview();
  const stop = h.api.send({ type: 'stop' }, true); await h.tick(80);
  assert.equal(await first, false); assert.equal(await stop, true);
  assert.deepEqual(h.requests.filter(request => request.method === 'POST').map(request => request.body.type), ['move', 'stop']);
});

test('v0.1.1 late movement acknowledgement cannot roll back a newer poll or actor sequence', async t => {
  let release, polls = 0;
  const h = reviewHook((request, now) => {
    if (request.method === 'GET') return reviewResponse(++polls === 1 ? hookSnapshot(now) : hookSnapshot(now, 9, 9));
    return new Promise(resolve => { release = resolve; });
  });
  t.after(() => h.unmount()); await h.mount();
  const moved = h.api.send({ type: 'move', x: 20, z: 65 }, true); await flushReview();
  h.setTime(150); await h.api.reconnect(); const before = h.api.serverTime();
  h.setTime(1000); release(reviewResponse(hookSnapshot(50, 2, 2))); assert.equal(await moved, true);
  assert.equal(h.states[0].revision, 9); assert.equal(h.states[0].self.lastSequence, 9);
  assert.ok(h.api.serverTime() >= before);
});

test('v0.1.1 concurrent D1 recovery moves legacy enclosed avatars outside the landmark exactly once and preserves receipts and art', async t => {
  const { db, service, store, now } = serviceFixture(t);
  await service.command('one', joinReview(1));
  const legacy = await store.readState('one');
  delete legacy.room.geometryVersion;
  Object.assign(legacy.room.participants[0], { x: 12, z: 0, targetX: 12, targetZ: 0, moveAt: now() - 1000 });
  legacy.room.installations = [{ id: 'legacy-keep-art', actorId: 'departed', kind: 0, plotId: 'ring-2-6', x: -58, z: 0, createdAt: now(), roundIndex: 1 }];
  db.sql.prepare("UPDATE festival_rooms SET state_json = ? WHERE room_id = 'main'").run(JSON.stringify(legacy.room));
  // Replaying the original join takes the receipt path; it must still hydrate geometry.
  const snapshots = await Promise.all([service.command('one', joinReview(1)), ...Array.from({ length: 12 }, (_, i) => service.snapshot(`migration-review-${i}`))]);
  const hydrated = await store.readState('one');
  assert.equal(hydrated.room.geometryVersion, 2);
  assert.equal(hydrated.room.revision, legacy.room.revision + 1, 'Concurrent readers persist only one migration');
  assert.deepEqual(hydrated.visit, legacy.visit, 'Migration cannot consume actor sequence or receipts');
  assert.deepEqual(hydrated.room.installations, legacy.room.installations);
  for (const snapshot of snapshots) {
    const p = snapshot.participants[0];
    assert.ok(Math.hypot(p.x, p.z) >= festival.FESTIVAL_MONUMENT_RADIUS);
    assert.ok(Math.hypot(p.targetX, p.targetZ) >= festival.FESTIVAL_MONUMENT_RADIUS);
    assert.equal(snapshot.revision, hydrated.room.revision);
    const shown = motion.stepFestivalMotion(null, p, now(), .02), next = motion.stepFestivalMotion(shown, p, now() + 20, .02);
    assert.ok(Math.hypot(next.x - shown.x, next.z - shown.z) <= festival.FESTIVAL_MOVE_SPEED * .02 * 1.5 + .001, 'First two hydrated render frames must not snap out of the former stone footprint');
  }
  await service.snapshot('one');
  assert.deepEqual(await store.readState('one'), hydrated, 'Subsequent reads remain read-only');
});

import * as THREE from 'three';
const { createInstallation, disposeInstallation } = await import('../src/desert/installations.ts');
const { createDreaminaMonument } = await import('../src/desert/monument.ts');

test('v0.1.1 real sculpture vertices stay within authoritative footprints across seeds, orientation and moving parts', () => {
  const point = new THREE.Vector3();
  for (let kind = 0; kind < 12; kind++) {
    let measuredRadius = 0;
    for (const seed of [0, 7, 23, 79, 2147483647]) {
      const art = createInstallation(kind, seed), rotations = [];
      art.rotation.y = kind * .73;
      art.traverse(object => { if (object.userData.spinAxis === 'y') rotations.push([object, object.rotation.y]); });
      for (const phase of [0, .7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6]) {
        for (const [object, base] of rotations) object.rotation.y = base + phase;
        art.updateMatrixWorld(true);
        art.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const position = object.geometry.getAttribute('position');
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
            assert.ok(Number.isFinite(point.x + point.y + point.z));
            const radius = Math.hypot(point.x, point.z); measuredRadius = Math.max(measuredRadius, radius);
            assert.ok(radius <= festival.FESTIVAL_INSTALLATION_RADII[kind] + 1e-5, `${kind}: actual radius ${radius} exceeds server contract`);
          }
        });
      }
      const bounds = new THREE.Box3().setFromObject(art, true);
      assert.ok(bounds.max.y - bounds.min.y >= 15.99, `${kind}: artwork must truly be enlarged`);
      assert.ok(bounds.min.y >= -1e-5, `${kind}: enlarged artwork cannot be sunk below ground`);
      disposeInstallation(art);
    }
    assert.ok(measuredRadius > festival.FESTIVAL_INSTALLATION_RADII[kind] - .5, `${kind}: metadata cannot exaggerate a still-tiny sculpture`);
  }
});

test('v0.1.1 the actual grounded stone monument fits the server exclusion zone with clearance', () => {
  const monument = createDreaminaMonument(), vertices = new THREE.Vector3();
  monument.updateMatrixWorld(true);
  let maxRadius = 0, maxHeight = 0, weathered = false;
  monument.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    weathered ||= materials.some(material => material instanceof THREE.MeshStandardMaterial && material.roughness >= .85 && material.metalness === 0 && material.bumpMap);
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      vertices.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      maxRadius = Math.max(maxRadius, Math.hypot(vertices.x, vertices.z)); maxHeight = Math.max(maxHeight, vertices.y);
      assert.ok(vertices.y >= -1e-6);
    }
  });
  assert.ok(weathered, 'Weathered stone must be the actual material');
  assert.ok(maxHeight >= 28 && maxHeight <= 31); assert.ok(maxRadius > 12 && maxRadius < 15);
  assert.ok(maxRadius + .5 <= festival.FESTIVAL_MONUMENT_RADIUS);
  monument.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
});


test('arrival too late for ignition rejects the reservation without consuming sequence', async t => {
  const { service, advance } = serviceFixture(t);
  await service.command('one', joinReview(1));
  advance(festival.FESTIVAL_BUILD_MS - 1);
  await service.command('one', joinReview(2));
  await assert.rejects(service.command('one', buildReview(3)), { code: 'ROUND_CLOSED' });
  const unchanged = await service.snapshot('one');
  assert.equal(unchanged.self.lastSequence, 2);
  assert.equal(unchanged.installations.length, 0);
  assert.equal(unchanged.participants[0].buildTask, undefined);
});
