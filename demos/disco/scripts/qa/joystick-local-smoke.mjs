// Reuse the already-built Worker and already-migrated local D1 state. No build,
// migration, browser, hosted request, or playback occurs in this launcher.
// Run: node scripts/qa/joystick-local-smoke.mjs
// Optional: QA_LOCAL_PORT=8792 (default 8787; an occupied port fails closed).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function localSmokePlan(projectRoot = root, env = process.env) {
  const port = env.QA_LOCAL_PORT || '8787';
  assert(/^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535, 'QA_LOCAL_PORT must be an integer from 1 to 65535');
  const base = `http://127.0.0.1:${Number(port)}`;
  const serverEnv = { ...env, XDG_CONFIG_HOME: `${projectRoot}/.sites-runtime/config`,
    WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', WRANGLER_HIDE_BANNER: 'true',
    WRANGLER_REGISTRY_PATH: `${projectRoot}/.wrangler/dev-registry`, MINIFLARE_REGISTRY_PATH: `${projectRoot}/.wrangler/registry` };
  return { base, port: Number(port), serverEnv, smokeEnv: { ...env, QA_BASE_URL: base },
    serverArgs: ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'dev',
      '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1',
      '--port', String(Number(port)), '--inspector-port', '0'],
    smokeArgs: ['--experimental-strip-types', 'scripts/qa/joystick-http-smoke.mjs'] };
}

export async function waitForHttpReady(base, serverExit, signal, fetchImpl = fetch) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
  const exited = serverExit.then(result => { throw new Error(`Wrangler exited before HTTP readiness (${result.code ?? result.signal ?? result.error?.message})`); });
  while (!deadline.aborted) {
    const response = await Promise.race([
      fetchImpl(`${base}/`, { redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(1500)]) }).catch(() => null),
      exited,
    ]);
    const ready = response && response.status < 500;
    await response?.body?.cancel();
    if (ready) return;
    await sleep(300, undefined, { signal: deadline });
  }
  deadline.throwIfAborted();
}

async function requireFreePort(port) {
  const probe = createServer();
  await new Promise((resolvePromise, reject) => {
    probe.once('error', error => reject(new Error(`Local QA port ${port} is unavailable: ${error.message}`)));
    probe.listen(port, '127.0.0.1', resolvePromise);
  });
  await new Promise((resolvePromise, reject) => probe.close(error => error ? reject(error) : resolvePromise()));
}

function track(child, processGroup = false) {
  const state = { child, processGroup, closed: false };
  state.exit = new Promise(resolvePromise => {
    child.once('error', error => { state.closed = true; resolvePromise({ error }); });
    child.once('close', (code, signal) => { state.closed = true; resolvePromise({ code, signal }); });
  });
  return state;
}
function timed(promise, ms, message) {
  let timeout;
  const limit = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timeout));
}
function sendSignal(state, signal) {
  if (!state || state.closed) return;
  try {
    if (state.processGroup && state.child.pid) process.kill(-state.child.pid, signal);
    else state.child.kill(signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function stopChild(state, graceMs) {
  if (!state || state.closed) return;
  sendSignal(state, 'SIGTERM');
  try { await timed(state.exit, graceMs, 'Child cleanup deadline reached'); }
  catch {
    sendSignal(state, 'SIGKILL');
    await timed(state.exit, 3000, 'Child failed to terminate after SIGKILL');
  }
}

export async function runLocalLauncher() {
  const plan = localSmokePlan();
  await access(resolve(root, 'dist/server/wrangler.json'));
  await requireFreePort(plan.port);
  const interrupted = new AbortController();
  const interrupt = () => interrupted.abort(new Error('Local QA interrupted; allowing owned-seat cleanup before stopping Wrangler'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let server, smoke;
  try {
    const processGroup = process.platform !== 'win32';
    server = track(spawn(process.execPath, plan.serverArgs, { cwd: root, env: plan.serverEnv,
      detached: processGroup, stdio: ['ignore', 'pipe', 'pipe'] }), processGroup);
    // Consume stdout so the pipe cannot fill; keep JSON QA output on stdout.
    server.child.stdout.on('data', () => {});
    server.child.stderr.on('data', chunk => process.stderr.write(chunk));
    await waitForHttpReady(plan.base, server.exit, interrupted.signal);
    interrupted.signal.throwIfAborted();
    smoke = track(spawn(process.execPath, plan.smokeArgs, { cwd: root, env: plan.smokeEnv, stdio: 'inherit' }));
    const onAbort = new Promise((_, reject) => interrupted.signal.addEventListener('abort', () => reject(interrupted.signal.reason), { once: true }));
    const outcome = await timed(Promise.race([smoke.exit, onAbort,
      server.exit.then(result => { throw new Error(`Wrangler exited during HTTP QA (${result.code ?? result.signal ?? result.error?.message})`); }),
    ]), 155_000, 'HTTP QA exceeded its 120-second work plus 30-second cleanup budget');
    if (outcome.error) throw outcome.error;
    assert.equal(outcome.code, 0, `Joystick HTTP smoke failed (${outcome.code ?? outcome.signal})`);
  } finally {
    // Keep D1 serving while the QA process handles SIGTERM and leaves its own
    // seats. Then stop the entire Wrangler process group, including workerd.
    try { await stopChild(smoke, 35_000); }
    finally {
      try { await stopChild(server, 5000); }
      finally {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runLocalLauncher().catch(error => { console.error(`Local joystick QA failed: ${error.message}`); process.exitCode = 1; });
}
