import assert from 'node:assert/strict';
import test from 'node:test';
import { localSmokePlan, waitForHttpReady } from '../scripts/qa/joystick-local-smoke.mjs';

test('local launcher uses the built Wrangler artifact, persisted local DB, and forces loopback smoke target', () => {
  const plan = localSmokePlan('/project', { QA_BASE_URL: 'https://unrelated.example', QA_LOCAL_PORT: '8792' });
  assert.equal(plan.base, 'http://127.0.0.1:8792');
  assert.equal(plan.smokeEnv.QA_BASE_URL, plan.base);
  assert(plan.serverArgs.includes('--local'));
  assert(plan.serverArgs.includes('dist/server/wrangler.json'));
  assert(plan.serverArgs.includes('.wrangler/state'));
  assert(plan.serverArgs.includes('./scripts/sites-env.mjs'));
  assert.equal(plan.serverEnv.WRANGLER_SEND_METRICS, 'false');
  assert.equal(plan.serverEnv.WRANGLER_HIDE_BANNER, 'true', 'local Wrangler must skip its banner update check');
  assert.equal(plan.serverEnv.XDG_CONFIG_HOME, '/project/.sites-runtime/config');
  assert.deepEqual(plan.smokeArgs, ['--experimental-strip-types', 'scripts/qa/joystick-http-smoke.mjs']);
  for (const port of ['0', '1.5', '65536', 'abc']) assert.throws(() => localSmokePlan('/project', { QA_LOCAL_PORT: port }), /QA_LOCAL_PORT/);
});

test('readiness is read-only, stays on loopback, and stops on an exited server', async () => {
  let calls = 0;
  await waitForHttpReady('http://127.0.0.1:8792', new Promise(() => {}), new AbortController().signal, async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:8792/');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return new Response('ready');
  });
  assert.equal(calls, 1);
  await assert.rejects(waitForHttpReady('http://127.0.0.1:8792', Promise.resolve({ code: 1 }), new AbortController().signal,
    async () => { throw new Error('not listening'); }), /Wrangler exited/);
});
