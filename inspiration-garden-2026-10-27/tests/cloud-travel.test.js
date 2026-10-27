import test from 'node:test';
import assert from 'node:assert/strict';

const cloud = await import('../src/cloud-travel.js').catch(() => ({}));
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
function deferred() {
 let resolve, reject;
 const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
 return {promise, resolve, reject};
}
function manualClock() {
 let time = 0, sequence = 0;
 const timers = new Map();
 return {
  timers, now: () => time,
  setTimeout(fn, ms) { assert.ok(Number.isFinite(ms) && ms >= 0); const id = ++sequence; timers.set(id, {at: time + ms, fn}); return id; },
  clearTimeout(id) { timers.delete(id); },
  async advance(ms) {
   const end = time + ms;
   for (;;) {
    const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
    if (!next) break;
    const [id, timer] = next; time = timer.at; timers.delete(id); timer.fn(); await flush();
   }
   time = end; await flush();
  },
 };
}
function fixture(options = {}) {
 assert.equal(typeof cloud.createCloudTravel, 'function', 'cloud controller must be exported');
 const clock = manualClock(), requests = [], commits = [], phases = [];
 let world = 'home';
 const travel = cloud.createCloudTravel({
  ...clock, currentWorld: () => world,
  prepare(target, {signal}) { const gate = deferred(); requests.push({target, signal, ...gate}); return gate.promise; },
  commit(target) { commits.push({target, phase: phases.at(-1)?.phase, at: clock.now()}); world = target; },
  onPhase(state) { phases.push(state); },
  ...options,
 });
 return {travel, clock, requests, commits, phases, world: () => world};
}

test('clouds cover, hold an opaque boundary, commit once, then reveal and release all timers', async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 assert.equal(f.travel.busy, true);
 assert.deepEqual(f.phases.map(p => p.phase), ['covering']);
 assert.equal(f.phases[0].duration, 320);
 assert.equal(f.phases[0].reducedMotion, false);
 f.requests[0].resolve(); await flush();
 await f.clock.advance(319); assert.equal(f.commits.length, 0);
 await f.clock.advance(1); assert.equal(f.phases.at(-1).phase, 'covered'); assert.equal(f.commits.length, 0);
 await f.clock.advance(39); assert.equal(f.commits.length, 0);
 await f.clock.advance(1);
 assert.deepEqual(f.commits, [{target: 'friend-a', phase: 'covered', at: 360}]);
 assert.equal(f.phases.at(-1).phase, 'revealing');
 assert.equal(f.phases.at(-1).duration, 380);
 await f.clock.advance(380);
 assert.deepEqual(await done, {ok: true});
 assert.equal(f.travel.busy, false);
 assert.equal(f.phases.at(-1).phase, 'idle');
 assert.equal(f.clock.timers.size, 0);
});

test('same committed world does not prepare, animate, or commit again', async () => {
 const f = fixture();
 assert.deepEqual(await f.travel.request('home'), {ok: true, reason: 'same-world'});
 assert.equal(f.requests.length, 0); assert.equal(f.commits.length, 0); assert.equal(f.phases.length, 0);
 assert.equal(f.travel.busy, false); assert.equal(f.clock.timers.size, 0);
});

test('repeated requests for the active destination share one preparation and completion', async () => {
 const f = fixture(), first = f.travel.request('friend-a');
 assert.equal(f.travel.request('friend-a'), first);
 await f.clock.advance(320); assert.equal(f.travel.request('friend-a'), first);
 f.requests[0].resolve(); await f.clock.advance(40);
 assert.equal(f.travel.request('friend-a'), first);
 await f.clock.advance(380);
 assert.deepEqual(await first, {ok: true}); assert.equal(f.requests.length, 1); assert.equal(f.commits.length, 1);
});

test('rapid friend A to B to home cancels pending destinations without visiting either', async () => {
 const f = fixture(), a = f.travel.request('friend-a');
 await f.clock.advance(75);
 const b = f.travel.request('friend-b');
 assert.deepEqual(await a, {ok: false, reason: 'superseded'});
 assert.equal(f.requests[0].signal.aborted, true);
 await f.clock.advance(75);
 assert.deepEqual(await f.travel.request('home'), {ok: true, reason: 'same-world'});
 assert.deepEqual(await b, {ok: false, reason: 'superseded'});
 assert.equal(f.requests[1].signal.aborted, true);
 f.requests[1].resolve(); f.requests[0].resolve(); await f.clock.advance(3000);
 assert.equal(f.world(), 'home'); assert.equal(f.commits.length, 0);
 assert.equal(f.travel.busy, false); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

test('latest destination owns the only commit even when an abandoned load resolves first', async () => {
 const f = fixture(), a = f.travel.request('friend-a');
 await f.clock.advance(80); const b = f.travel.request('friend-b');
 f.requests[0].resolve(); await f.clock.advance(360);
 assert.equal(f.commits.length, 0); assert.equal(f.phases.at(-1).phase, 'covered');
 f.requests[1].resolve(); await flush();
 assert.deepEqual(f.commits.map(c => c.target), ['friend-b']);
 await f.clock.advance(380);
 assert.deepEqual(await a, {ok: false, reason: 'superseded'}); assert.deepEqual(await b, {ok: true}); assert.equal(f.clock.timers.size, 0);
});

for (const at of ['covering', 'covered', 'revealing']) test(`cancel during ${at} clears the overlay and every owned timer`, async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 if (at === 'covered') await f.clock.advance(320);
 if (at === 'revealing') { f.requests[0].resolve(); await flush(); await f.clock.advance(360); }
 assert.equal(f.phases.at(-1).phase, at);
 const count = f.commits.length;
 f.travel.cancel();
 assert.deepEqual(await done, {ok: at === 'revealing', reason: 'cancelled'});
 assert.equal(f.requests[0].signal.aborted, true); assert.equal(f.travel.busy, false);
 assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
 f.requests[0].resolve(); await f.clock.advance(3000);
 assert.equal(f.commits.length, count); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

test('a new trip during reveal starts from the actually committed world and supersedes the old reveal', async () => {
 const f = fixture(), a = f.travel.request('friend-a');
 f.requests[0].resolve(); await flush(); await f.clock.advance(400);
 const home = f.travel.request('home');
 assert.deepEqual(await a, {ok: true, reason: 'superseded'});
 f.requests[1].resolve(); await flush(); await f.clock.advance(740);
 assert.deepEqual(await home, {ok: true}); assert.equal(f.world(), 'home');
 assert.deepEqual(f.commits.map(c => c.target), ['friend-a', 'home']); assert.equal(f.clock.timers.size, 0);
});

test('hidden pages cancel pending work and resume without replaying a stale journey', async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 await f.clock.advance(320); f.travel.setHidden(true);
 assert.deepEqual(await done, {ok: false, reason: 'hidden'});
 assert.deepEqual(await f.travel.request('friend-b'), {ok: false, reason: 'hidden'});
 assert.equal(f.clock.timers.size, 0); assert.equal(f.travel.busy, false);
 f.requests[0].resolve(); f.travel.setHidden(false); await f.clock.advance(3000);
 assert.equal(f.requests.length, 1); assert.equal(f.commits.length, 0); assert.equal(f.phases.at(-1).phase, 'idle');
 const fresh = f.travel.request('friend-b'); f.requests[1].resolve(); await flush(); await f.clock.advance(740);
 assert.deepEqual(await fresh, {ok: true}); assert.equal(f.world(), 'friend-b'); assert.equal(f.clock.timers.size, 0);
});

test('disposal is terminal, idempotent, and leaves no input ownership or timers', async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 f.travel.dispose(); f.travel.dispose(); f.travel.cancel(); f.travel.setHidden(false);
 assert.deepEqual(await done, {ok: false, reason: 'disposed'});
 assert.deepEqual(await f.travel.request('friend-b'), {ok: false, reason: 'disposed'});
 f.requests[0].resolve(); await f.clock.advance(3000);
 assert.equal(f.commits.length, 0); assert.equal(f.travel.busy, false); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

test('a slow preparation commits the latest placeholder destination at the bounded deadline', async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 await f.clock.advance(1799); assert.equal(f.commits.length, 0); assert.equal(f.travel.busy, true);
 await f.clock.advance(1);
 assert.deepEqual(f.commits, [{target: 'friend-a', phase: 'covered', at: 1800}]);
 assert.equal(f.requests[0].signal.aborted, true); assert.equal(f.phases.at(-1).phase, 'revealing');
 await f.clock.advance(380);
 assert.deepEqual(await done, {ok: true, partial: true, reason: 'prepare-timeout'});
 assert.equal(f.travel.busy, false); assert.equal(f.clock.timers.size, 0);
 f.requests[0].resolve(); await f.clock.advance(3000);
 assert.equal(f.commits.length, 1); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

test('a rejected preparation still commits the latest placeholder destination only after full cover', async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 f.requests[0].reject(new Error('image unavailable')); await flush();
 await f.clock.advance(359); assert.equal(f.commits.length, 0);
 await f.clock.advance(381);
 assert.deepEqual(await done, {ok: true, partial: true, reason: 'prepare-error'});
 assert.equal(f.world(), 'friend-a'); assert.equal(f.commits.length, 1); assert.equal(f.clock.timers.size, 0);
});

test('synchronous preparation errors take the same truthful placeholder fallback', async () => {
 const f = fixture({prepare() { throw new Error('offline'); }}), done = f.travel.request('friend-a');
 await f.clock.advance(740);
 assert.deepEqual(await done, {ok: true, partial: true, reason: 'prepare-error'});
 assert.equal(f.world(), 'friend-a'); assert.equal(f.clock.timers.size, 0);
});

test('partial preparation is reported without pretending every asset warmed successfully', async () => {
 const f = fixture(), done = f.travel.request('friend-a');
 f.requests[0].resolve({partial: true}); await flush(); await f.clock.advance(740);
 assert.deepEqual(await done, {ok: true, partial: true}); assert.equal(f.clock.timers.size, 0);
});

test('late rejected loads from superseded and hidden requests cannot revive a transition', async () => {
 const f = fixture(), first = f.travel.request('friend-a'), second = f.travel.request('friend-b');
 f.requests[0].reject(new Error('stale first load')); await flush();
 assert.equal(f.phases.at(-1).target, 'friend-b'); assert.equal(f.commits.length, 0);
 f.travel.setHidden(true); f.requests[1].reject(new Error('stale hidden load')); await f.clock.advance(3000);
 assert.deepEqual(await first, {ok: false, reason: 'superseded'}); assert.deepEqual(await second, {ok: false, reason: 'hidden'});
 assert.equal(f.commits.length, 0); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

for (const [kind, commit, reason] of [
 ['throw', () => { throw new Error('scene unavailable'); }, 'commit-error'],
 ['false', () => false, 'commit-rejected'],
 ['async rejection', () => Promise.reject(new Error('unsupported asynchronous commit')), 'commit-async'],
]) test(`a ${kind} commit reveals safely and releases input without claiming success`, async () => {
 const f = fixture({commit}), done = f.travel.request('friend-a');
 f.requests[0].resolve(); await flush(); await f.clock.advance(360);
 assert.equal(f.phases.at(-1).phase, 'revealing'); assert.equal(f.world(), 'home');
 await f.clock.advance(380);
 assert.deepEqual(await done, {ok: false, reason}); assert.equal(f.travel.busy, false); assert.equal(f.clock.timers.size, 0);
});

test('reduced motion uses brief fades while preserving the same covered commit boundary', async () => {
 const f = fixture({reducedMotion: () => true}), done = f.travel.request('friend-a');
 assert.equal(f.phases[0].duration, 60); assert.equal(f.phases[0].reducedMotion, true);
 f.requests[0].resolve(); await flush();
 await f.clock.advance(59); assert.equal(f.commits.length, 0);
 await f.clock.advance(1); assert.equal(f.phases.at(-1).phase, 'covered'); assert.equal(f.commits.length, 0);
 await f.clock.advance(40); assert.equal(f.commits[0].phase, 'covered'); assert.equal(f.phases.at(-1).duration, 60);
 await f.clock.advance(60);
 assert.deepEqual(await done, {ok: true}); assert.equal(f.clock.timers.size, 0); assert.equal(f.travel.busy, false);
});

test('a reduced-motion preference change applies at the next phase without stale sliding metadata', async () => {
 let reduced = false;
 const f = fixture({reducedMotion: () => reduced}), done = f.travel.request('friend-a');
 reduced = true; f.requests[0].resolve(); await flush(); await f.clock.advance(360);
 assert.equal(f.phases.at(-1).phase, 'revealing'); assert.equal(f.phases.at(-1).reducedMotion, true); assert.equal(f.phases.at(-1).duration, 60);
 await f.clock.advance(60); assert.deepEqual(await done, {ok: true}); assert.equal(f.clock.timers.size, 0);
});

for (const [timing, finishAt] of [
 [{coverMs: Infinity, coveredMs: NaN, revealMs: -1, maxWaitMs: Infinity}, 2180],
 [{coverMs: 9999, coveredMs: 9999, revealMs: 9999, maxWaitMs: 9999}, 2400],
 [{coverMs: 0, coveredMs: 0, revealMs: 0, maxWaitMs: 0}, 0],
]) test(`injected durations cannot leave travel blocked beyond ${finishAt} ms`, async () => {
 const f = fixture(timing), done = f.travel.request('friend-a');
 await f.clock.advance(finishAt);
 assert.equal(f.travel.busy, false); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
 assert.deepEqual(await done, {ok: true, partial: true, reason: 'prepare-timeout'});
});

for (const at of ['covering', 'covered', 'revealing']) test(`cancellation from the ${at} phase callback cannot schedule abandoned work`, async () => {
 let travel;
 const phases = [], f = fixture({onPhase(state) { phases.push(state); if (state.phase === at) travel.cancel(); }});
 travel = f.travel;
 const done = travel.request('friend-a');
 if (at !== 'covering') { f.requests[0].resolve(); await flush(); await f.clock.advance(at === 'covered' ? 320 : 360); }
 assert.deepEqual(await done, {ok: at === 'revealing', reason: 'cancelled'});
 assert.equal(f.requests.length, at === 'covering' ? 0 : 1); assert.equal(travel.busy, false);
 assert.equal(phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

for (const at of ['covering', 'covered', 'revealing']) test(`a failing ${at} phase renderer releases owned work and attempts idle cleanup`, async () => {
 const phases = [], f = fixture({onPhase(state) { phases.push(state); if (state.phase === at) throw new Error('overlay unavailable'); }});
 const done = f.travel.request('friend-a');
 if (at !== 'covering') { f.requests[0].resolve(); await flush(); await f.clock.advance(740); }
 assert.deepEqual(await done, {ok: at === 'revealing', reason: 'phase-error'});
 assert.equal(f.travel.busy, false); assert.equal(phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

test('a newer request made by an abort listener supersedes the interrupting request without orphaning timers', async () => {
 const f = fixture(), a = f.travel.request('friend-a');
 let latest;
 f.requests[0].signal.addEventListener('abort', () => { latest = f.travel.request('friend-c'); });
 const b = f.travel.request('friend-b');
 assert.equal(f.phases.at(-1).target, 'friend-c');
 assert.deepEqual(f.requests.map(r => r.target), ['friend-a', 'friend-c']);
 assert.deepEqual(await a, {ok: false, reason: 'superseded'});
 assert.deepEqual(await b, {ok: false, reason: 'superseded'});
 f.requests[1].resolve(); await flush(); await f.clock.advance(740);
 assert.deepEqual(await latest, {ok: true}); assert.equal(f.world(), 'friend-c'); assert.equal(f.clock.timers.size, 0);
});

test('disposal triggered by an abort listener prevents the interrupting trip from starting', async () => {
 const f = fixture(), a = f.travel.request('friend-a');
 f.requests[0].signal.addEventListener('abort', () => f.travel.dispose());
 const b = f.travel.request('friend-b');
 assert.equal(f.travel.busy, false);
 assert.deepEqual(await a, {ok: false, reason: 'superseded'}); assert.deepEqual(await b, {ok: false, reason: 'disposed'});
 assert.equal(f.requests.length, 1); assert.equal(f.phases.at(-1).phase, 'idle'); assert.equal(f.clock.timers.size, 0);
});

test('an unavailable motion preference safely falls back to a short fade and still renders idle cleanup', async () => {
 let broken = false;
 const f = fixture({reducedMotion() { if (broken) throw new Error('media query unavailable'); return false; }});
 const done = f.travel.request('friend-a');
 broken = true; f.requests[0].resolve(); await flush(); await f.clock.advance(420);
 assert.deepEqual(await done, {ok: true}); assert.equal(f.phases.at(-1).phase, 'idle');
 assert.equal(f.phases.find(p => p.phase === 'revealing').duration, 60); assert.equal(f.clock.timers.size, 0);
});
