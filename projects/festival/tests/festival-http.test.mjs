import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function backend() {
  const url = new URL('../lib/festival-http.ts', import.meta.url);
  assert.ok(await readFile(url, 'utf8').then(() => true, () => false), 'The festival HTTP boundary must enforce CSRF and body limits');
  return import(url.href);
}
const url = 'https://festival.example/api/festival';

test('mutation protection requires the exact origin and JSON content type', async () => {
  const { validateFestivalMutationRequest } = await backend();
  for (const headers of [{}, { origin: 'https://foreign.example' }, { origin: 'https://festival.example', 'sec-fetch-site': 'cross-site' }]) {
    assert.throws(() => validateFestivalMutationRequest(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } })), { code: 'FORBIDDEN' });
  }
  assert.throws(() => validateFestivalMutationRequest(new Request(url, { method: 'POST', headers: { origin: 'https://festival.example', 'content-type': 'text/plain' } })), { status: 415 });
  assert.doesNotThrow(() => validateFestivalMutationRequest(new Request(url, { method: 'POST', headers: { origin: 'https://festival.example', 'content-type': 'application/json; charset=utf-8' } })));
});

test('body limits check declared length and streamed bytes, rejecting invalid UTF-8 and JSON', async () => {
  const { readFestivalCommandBody } = await backend();
  for (const request of [
    new Request(url, { method: 'POST', headers: { 'content-length': '5000' }, body: '{}' }),
    new Request(url, { method: 'POST', body: 'x'.repeat(5000) }),
  ]) await assert.rejects(() => readFestivalCommandBody(request), { status: 413 });
  for (const body of ['{', new Uint8Array([0xff, 0xfe]), '']) {
    await assert.rejects(() => readFestivalCommandBody(new Request(url, { method: 'POST', body })), { code: 'INVALID_COMMAND' });
  }
  assert.deepEqual(await readFestivalCommandBody(new Request(url, { method: 'POST', body: '{"type":"heartbeat"}' })), { type: 'heartbeat' });
});

test('cross-site reads and writes are refused before touching persistence', async () => {
  const { handleFestivalRequest } = await backend();
  let operations = 0;
  const db = { prepare() { operations++; throw new Error('Private database details'); }, batch() { operations++; throw new Error('Private database details'); } };
  for (const options of [
    { headers: { 'sec-fetch-site': 'cross-site' } },
    { headers: { origin: 'https://foreign.example' } },
    { method: 'POST', headers: { origin: 'https://foreign.example', 'content-type': 'application/json' }, body: '{}' },
  ]) {
    const response = await handleFestivalRequest(new Request(url, options), db);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN');
  }
  assert.equal(operations, 0);
});

test('the API never accepts another room, forged actor identity, or an unsupported method', async () => {
  const { handleFestivalRequest } = await backend();
  let operations = 0;
  const db = { prepare() { operations++; throw new Error('Should not reach DB'); }, batch() { operations++; throw new Error('Should not reach DB'); } };
  const wrongRoom = await handleFestivalRequest(new Request(`${url}?room=private`), db);
  assert.equal(wrongRoom.status, 400);
  const forged = await handleFestivalRequest(new Request(url, { method: 'POST', headers: { origin: 'https://festival.example', 'content-type': 'application/json' }, body: JSON.stringify({ type: 'heartbeat', requestId: 'forged-identity', sequence: 1, actorId: 'victim' }) }), db);
  assert.equal(forged.status, 400);
  const method = await handleFestivalRequest(new Request(url, { method: 'DELETE' }), db);
  assert.equal(method.status, 405);
  assert.equal(operations, 0);
});

test('unavailable persistence yields a safe no-store error rather than simulated participants', async () => {
  const { handleFestivalRequest } = await backend();
  const response = await handleFestivalRequest(new Request(url), undefined);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const result = await response.json();
  assert.equal(result.error.code, 'UNAVAILABLE');
  assert.equal(result.error.stack, undefined);
  assert.equal(result.snapshot, undefined);
});
