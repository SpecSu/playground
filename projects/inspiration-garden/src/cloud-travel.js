/**
 * Cloud travel owns only transient phases/timers, never the scene, audio or save.
 *
 * prepare(target, {signal}) warms assets only. Rejection/timeout still travels
 * with existing placeholders and reports partial:true; late completion is inert.
 * commit(target) MUST be synchronous and atomic. Returning false or throwing
 * must leave the old world intact; this helper cannot roll back caller mutations.
 * All asynchronous work belongs in prepare, not in commit or onPhase.
 *
 * onPhase receives covering → covered → revealing → idle, duration (ms), and a
 * reducedMotion flag: the view uses a short fade instead of sliding when true.
 * request resolves after idle; ok means the destination was reached (or was
 * already current). Cancellation after commit therefore retains ok:true.
 * setHidden(true)/cancel/dispose release input immediately; resume never replays.
 * Scheduling is injectable; at most two timers exist per active journey. The
 * default maximum is 1800 ms preparation + 380 ms reveal (2400 ms if customized).
 */
export function createCloudTravel({
 prepare, commit, currentWorld, onPhase = () => {}, reducedMotion = () => false,
 setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout,
 now = () => globalThis.performance?.now() ?? Date.now(),
 coverMs = 320, coveredMs = 40, revealMs = 380, maxWaitMs = 1800,
} = {}) {
 const bounded = (value, fallback, max) => Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
 coverMs = bounded(coverMs, 320, 500); coveredMs = bounded(coveredMs, 40, 100);
 revealMs = bounded(revealMs, 380, 600); maxWaitMs = bounded(maxWaitMs, 1800, 1800);
 let active = null, version = 0, hidden = false, disposed = false;

 function schedule(run, fn, duration) {
  if (active !== run) return null;
  const id = setTimeout(() => { run.timers.delete(id); if (active === run) fn(); }, duration);
  run.timers.add(id);
  return id;
 }
 function phase(run, name, duration = 0) {
  let reduced = true;
  try { reduced = Boolean(reducedMotion()); } catch { /* Prefer the gentler fallback. */ }
  try {
   if (reduced && (name === 'covering' || name === 'revealing')) duration = Math.min(duration, 60);
   onPhase({phase: name, target: name === 'idle' ? null : run.target, duration,
    reducedMotion: reduced, version: run.version, startedAt: now()});
  } catch { if (active === run) cancel('phase-error'); }
  return duration;
 }
 function release(run, result) {
  for (const id of run.timers) clearTimeout(id);
  run.timers.clear();
  run.resolve(result);
 }
 function finish(run, result) {
  if (active !== run) return;
  active = null; release(run, result); phase(run, 'idle');
 }
 function cancel(reason = 'cancelled') {
  const run = active;
  if (!run) return;
  finish(run, {ok: run.committed, reason});
  run.abort.abort();
 }
 function handoff(run) {
  if (active !== run || !run.ready || !run.covered || run.attempted) return;
  run.attempted = true;
  try {
   const result = commit(run.target);
   if (result && typeof result.then === 'function') {
    // Asynchronous work belongs in prepare. Consume rejection but never await it.
    Promise.resolve(result).catch(() => {});
    run.result = {ok: false, reason: 'commit-async'};
   } else if (result === false) run.result = {ok: false, reason: 'commit-rejected'};
   else run.committed = true;
  } catch { run.result = {ok: false, reason: 'commit-error'}; }
  if (active !== run) return;
  const duration = phase(run, 'revealing', revealMs);
  schedule(run, () => finish(run, run.result), duration);
 }
 function prepared(run, result) {
  if (active !== run || run.ready) return;
  run.ready = true; run.result = result;
  clearTimeout(run.loadTimer); run.timers.delete(run.loadTimer);
  handoff(run);
 }
 return {
  get busy() { return active !== null; },
  request(target) {
   if (disposed || hidden) return Promise.resolve({ok: false, reason: disposed ? 'disposed' : 'hidden'});
   if (active?.target === target) return active.promise;
   if (target === currentWorld()) { cancel('superseded'); return Promise.resolve({ok: true, reason: 'same-world'}); }
   const previous = active;
   const run = {target, version: ++version, timers: new Set(), abort: new AbortController(), ready: false, covered: false, committed: false};
   run.promise = new Promise(resolve => { run.resolve = resolve; }); active = run;
   // Establish ownership before abort callbacks run: they may request an even
   // newer destination, hide the page, or dispose this controller synchronously.
   if (previous) { release(previous, {ok: previous.committed, reason: 'superseded'}); previous.abort.abort(); }
   if (active !== run) return run.promise;
   const duration = phase(run, 'covering', coverMs);
   schedule(run, () => { phase(run, 'covered', coveredMs); schedule(run, () => { run.covered = true; handoff(run); }, coveredMs); }, duration);
   run.loadTimer = schedule(run, () => {
    prepared(run, {ok: true, partial: true, reason: 'prepare-timeout'}); run.abort.abort();
   }, maxWaitMs);
   if (active !== run) return run.promise;
   try {
    Promise.resolve(prepare(target, {signal: run.abort.signal})).then(
     value => prepared(run, value?.partial === true ? {ok: true, partial: true} : {ok: true}),
     () => prepared(run, {ok: true, partial: true, reason: 'prepare-error'}),
    );
   } catch { prepared(run, {ok: true, partial: true, reason: 'prepare-error'}); }
   return run.promise;
  },
  cancel() { cancel(); },
  setHidden(value) { hidden = Boolean(value); if (hidden) cancel('hidden'); },
  dispose() { disposed = true; cancel('disposed'); },
 };
}
