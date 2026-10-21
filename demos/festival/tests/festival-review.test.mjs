import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import './room-loader.mjs';
const motion = await import('../lib/festival-motion.ts');

// Execute the production hook with inert React state and an offline transport.
// There is no browser, live HTTP, or audio in this suite.
const javascript = ts.transpileModule(readFileSync(new URL('../hooks/useFestivalRoom.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(data) });

function snapshot(now = 0, revision = 1, lastSequence = 1, actorId = 'actor-one', role = 'participant') {
  return {
    roomId: 'main', revision, serverNow: now, capacity: 10,
    self: { id: actorId, role, lastSequence },
    participants: role === 'participant' ? [{ id: actorId, name: 'Traveller', preset: 'human-subeike', slot: 0,
      joinedAt: 0, lastSeenAt: 0, x: 20, z: 20, targetX: 20, targetZ: 20, moveAt: 0, heading: 0, emote: 'dance', emoteAt: 0 }] : [],
    installations: [],
    round: { index: 1, startsAt: 0, burnAt: 300_000, ashesAt: 335_000, endsAt: 345_000, phase: 'building' },
  };
}

function harness(serve = (_request, now) => response(snapshot(now))) {
  const states = [], effects = [], requests = [], timers = new Map(), intervals = new Map();
  const document = new EventTarget(), window = new EventTarget();
  document.visibilityState = 'visible';
  let now = 0, timerId = 0;
  const context = vm.createContext({ exports: {}, document, window, crypto, AbortController,
    Date: class extends Date { static now() { return now; } }, performance: { now: () => now },
    setTimeout(callback, milliseconds) { const id = ++timerId; timers.set(id, { at: now + milliseconds, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, milliseconds) { const id = ++timerId; intervals.set(id, { milliseconds, callback }); return id; },
    clearInterval(id) { intervals.delete(id); },
    fetch: async (url, options) => {
      const request = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined };
      requests.push(request); return serve(request, now);
    },
    require(specifier) {
      if (specifier === '@/lib/festival-motion') return { FestivalClock: class extends motion.FestivalClock { constructor() { super(() => now, now); } } };
      if (specifier === 'react') return {
        useRef: current => ({ current }), useCallback: callback => callback,
        useState: initial => { const slot = states.length; states.push(initial); return [initial, value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
        useEffect: callback => effects.push(callback),
      };
      throw new Error(`Unexpected hook dependency: ${specifier}`);
    },
  });
  vm.runInContext(javascript, context);
  const api = context.exports.useFestivalRoom();
  let cleanups = [];
  return { api, requests, states, document, window,
    async mount() { cleanups = effects.map(callback => callback()).filter(Boolean); await flush(); },
    unmount() { cleanups.forEach(callback => callback()); },
    setTime(value) { now = value; },
    async runTimers() {
      const due = [...timers].filter(([, timer]) => timer.at <= now);
      for (const [id, timer] of due) { if (timers.delete(id)) timer.callback(); }
      await flush();
    },
    async heartbeat() { for (const interval of intervals.values()) interval.callback(); await flush(); },
    async wake() { document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await flush(); },
  };
}

test('visibility return renews an existing seat immediately rather than waiting past the presence TTL', async t => {
  const h = harness((request, now) => response(snapshot(now, request.method === 'POST' ? 2 : 1, request.method === 'POST' ? 2 : 1)));
  t.after(() => h.unmount());
  await h.mount();
  h.document.visibilityState = 'hidden';
  h.setTime(59_000); // Seat expires at 60s; scheduled heartbeat may not run until 64s.
  await h.wake();
  assert.ok(h.requests.some(request => request.method === 'POST' && request.body.type === 'heartbeat'), 'Waking while the seat still exists must immediately renew it');
});

test('a lost mutation response retries the same identity and sequence', async t => {
  let postCount = 0;
  const h = harness((request, now) => {
    if (request.method === 'GET') return response(snapshot(now));
    if (++postCount === 1) throw new Error('Response lost after the server committed');
    return response(snapshot(now, 2, 2));
  });
  t.after(() => h.unmount());
  await h.mount();
  const sent = h.api.send({ type: 'build', kind: 0, x: -41.137, z: -35.271, roundIndex: 1 });
  await flush(); h.setTime(350); await h.runTimers();
  assert.equal(await sent, true);
  const posts = h.requests.filter(request => request.method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0].body, posts[1].body, 'Retry must not duplicate a non-idempotent command');
});

test('a concurrent tab sequence conflict is repaired using the server snapshot', async t => {
  let postCount = 0;
  const h = harness((request, now) => {
    if (request.method === 'GET') return response(snapshot(now));
    if (++postCount === 1) return response({ error: { code: 'STALE_SEQUENCE', message: 'Try again' }, snapshot: snapshot(now, 7, 7) }, 409);
    return response(snapshot(now, 8, 8));
  });
  t.after(() => h.unmount());
  await h.mount();
  assert.equal(await h.api.send({ type: 'emote', emote: 'wave' }), true);
  const posts = h.requests.filter(request => request.method === 'POST');
  assert.deepEqual(posts.map(request => request.body.sequence), [2, 8]);
  assert.notEqual(posts[0].body.requestId, posts[1].body.requestId);
  assert.equal(h.states[0].self.lastSequence, 8);
});

test('late HTTP responses cannot roll the accepted shared state backward', async t => {
  const deferred = [];
  let gets = 0;
  const h = harness((_request, now) => ++gets === 1 ? response(snapshot(now)) : new Promise(resolve => deferred.push(resolve)));
  t.after(() => h.unmount());
  await h.mount();
  const older = h.api.reconnect(), newer = h.api.reconnect();
  deferred[1](response(snapshot(500, 3, 3))); await newer;
  deferred[0](response(snapshot(600, 2, 2))); await older;
  assert.equal(h.states[0].revision, 3);
  assert.equal(h.states[0].self.lastSequence, 3);
  const sameRevisionOlder = h.api.reconnect();
  deferred[2](response(snapshot(450, 3, 3))); await sameRevisionOlder;
  assert.equal(h.states[0].serverNow, 500);
});

test('an expired session is replaced by the next read without inheriting the former actor sequence', async t => {
  let expired = false;
  const h = harness((request, now) => {
    if (request.method === 'GET') return response(expired ? snapshot(now, 2, 0, 'actor-two', 'visitor') : snapshot(now, 1, 40));
    if (!expired) { expired = true; return response({ error: { code: 'FORBIDDEN', message: 'Reconnect' } }, 403); }
    return response(snapshot(now, 3, request.body.sequence, 'actor-two'));
  });
  t.after(() => h.unmount());
  await h.mount();
  assert.equal(await h.api.send({ type: 'emote', emote: 'wave' }), false);
  await h.api.reconnect();
  assert.equal(h.states[0].self.id, 'actor-two');
  assert.equal(h.states[0].self.role, 'visitor');
  assert.equal(await h.api.send({ type: 'join', name: 'Traveller', preset: 'human-subeike' }), true);
  assert.equal(h.requests.filter(request => request.method === 'POST').at(-1).body.sequence, 1);
});

test('returning from background accepts the current round instead of restarting a local cycle', async t => {
  const current = snapshot(700_000, 12, 2, 'actor-one', 'spectator');
  current.round = { index: 3, startsAt: 690_000, burnAt: 990_000, ashesAt: 1_025_000, endsAt: 1_035_000, phase: 'building' };
  let reads = 0;
  const h = harness(() => response(++reads === 1 ? snapshot() : current));
  t.after(() => h.unmount());
  await h.mount(); h.document.visibilityState = 'hidden'; h.setTime(700_000);
  await h.wake();
  assert.deepEqual(h.states[0].round, current.round);
  assert.equal(h.api.serverTime(), 700_000);
  assert.equal(h.requests.filter(request => request.method === 'POST' && request.body.type === 'join').length, 0, 'Background return does not silently claim a vacated seat');
});

test('a delayed clock sample cannot rewind an avatar clock on an unchanged route', async t => {
  let reads = 0, release;
  const h = harness((_request, now) => ++reads === 1 ? response(snapshot(now)) : new Promise(resolve => { release = resolve; }));
  t.after(() => h.unmount());
  await h.mount();
  h.setTime(1000);
  const waiting = h.api.reconnect();
  h.setTime(2000);
  const before = h.api.serverTime();
  release(response(snapshot(1050, 2)));
  await waiting;
  const after = h.api.serverTime();
  assert.ok(after >= before, `Clock rewound ${before - after}ms when the delayed poll arrived`);
  assert.ok(after - before < 20, 'A sample cannot teleport a running movement forward either');
});

test('queued movement keeps only the latest target and stop supersedes unsent targets', async t => {
  let release;
  const h = harness((request, now) => request.method === 'GET' ? response(snapshot(now)) :
    request.body.type === 'emote' ? new Promise(resolve => { release = resolve; }) : response(snapshot(now, 3, request.body.sequence)));
  t.after(() => h.unmount());
  await h.mount();
  const blocking = h.api.send({ type: 'emote', emote: 'wave' });
  await flush();
  const first = h.api.send({ type: 'move', x: 25, z: 20 }, true);
  const second = h.api.send({ type: 'move', x: 30, z: 20 }, true);
  const stop = h.api.send({ type: 'stop' }, true);
  release(response(snapshot(0, 2, 2)));
  await Promise.all([blocking, first, second, stop]);
  assert.deepEqual(h.requests.filter(request => request.method === 'POST').map(request => request.body.type), ['emote', 'stop']);
});

test('queued movement cannot cross an expired actor identity into a replacement session', async t => {
 let release,changed=false;
 const h=harness((request,now)=>request.method==='GET'?response(changed?snapshot(now,10,1,'actor-two'):snapshot(now)):
  request.body.type==='emote'?new Promise(resolve=>{release=resolve;}):response(snapshot(now,11,2,'actor-two')));
 t.after(()=>h.unmount());await h.mount();
 const blocker=h.api.send({type:'emote',emote:'wave'});await flush();
 const queued=h.api.send({type:'move',x:30,z:44},true);
 changed=true;await h.api.reconnect();release(response(snapshot(0,2,2)));
 await Promise.all([blocker,queued]);
 assert.equal(h.requests.filter(request=>request.method==='POST'&&request.body.type==='move').length,0);
});
