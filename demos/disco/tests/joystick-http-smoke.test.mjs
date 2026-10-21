import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseQaTarget, createQaHttp, QA_ROOM } from '../scripts/qa/joystick-http-smoke.mjs';

test('joystick smoke accepts only explicit HTTPS remote or loopback HTTP origins', () => {
  for (const base of ['', undefined, 'https://u:p@club.example', 'https://club.example/?room=main', 'https://club.example/api/room', 'http://club.example', 'file:///tmp/x']) {
    assert.throws(() => parseQaTarget(base), /QA_BASE_URL/);
  }
  assert.equal(parseQaTarget('https://club.example/'), 'https://club.example');
  assert.equal(parseQaTarget('http://127.0.0.1:8790'), 'http://127.0.0.1:8790');
  assert.equal(parseQaTarget('http://localhost:8787/'), 'http://localhost:8787');
  assert.equal(QA_ROOM, 'soundcheck');
});

test('missing target fails before any runtime startup or HTTP work', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/qa/joystick-http-smoke.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, QA_BASE_URL: '' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA_BASE_URL/);
  assert.doesNotMatch(result.stdout, /"passed": true/);
});

test('HTTP transport confines commands to soundcheck and keeps ordinary and movement sequences independent', async () => {
  const sent = [];
  const http = createQaHttp('http://127.0.0.1:8790', { fetchImpl: async (url, init) => {
    sent.push({ url, ...init });
    return new Response(JSON.stringify({ roomId: 'soundcheck', accepted: true, lastMoveSequence: 103 }), { headers: { 'set-cookie': 'club_device=abc; HttpOnly; Path=/' } });
  } });
  const client = { sequence: 1, issuedSequence: 1 };
  await http.request(client, 'move', { roomId: 'main', moveSequence: 103 });
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/api\/room\/move$/);
  assert.equal(JSON.parse(sent[0].body).roomId, 'soundcheck');
  assert.equal(sent[0].redirect, 'error');
  assert.equal(client.sequence, 1);
  assert.equal(client.moveSequence, 103);
  assert.equal(client.cookie, 'club_device=abc');
});

test('ambiguous failed POST is never retried and next ordinary command uses a new sequence', async () => {
  let calls = 0;
  const http = createQaHttp('http://127.0.0.1:8790', { fetchImpl: async () => { calls++; throw new Error('connection lost'); } });
  const client = { sequence: 0 };
  await assert.rejects(http.command(client, { type: 'join', name: 'QA', preset: 'cat' }), /connection lost/);
  assert.equal(calls, 1);
  assert.equal(client.issuedSequence, 1);
  await assert.rejects(http.command(client, { type: 'leave' }), /connection lost/);
  assert.equal(calls, 2);
  assert.equal(client.issuedSequence, 2);
});

test('request and write budgets stop before an extra fetch', async () => {
  let calls = 0;
  const http = createQaHttp('http://127.0.0.1:8790', { maxWrites: 1, fetchImpl: async () => {
    calls++;
    return new Response('{}');
  } });
  const client = { sequence: 0 };
  await http.command(client, { type: 'leave' });
  await assert.rejects(http.command(client, { type: 'leave' }), /write budget/);
  assert.equal(calls, 1);
  const reads = createQaHttp('http://127.0.0.1:8790', { maxRequests: 1, fetchImpl: async () => new Response('{}') });
  await reads.request(client);
  await assert.rejects(reads.request(client), /request budget/);
});

async function createRealHttpFixture(t) {
  await import('./room-loader.mjs');
  const { DatabaseSync } = await import('node:sqlite');
  const { readFile } = await import('node:fs/promises');
  const { handleRoomRequest } = await import('../lib/room-server-http.ts');
  const { handleMovementRequest } = await import('../lib/room-movement-http.ts');
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const filename of ['0000_amazing_quentin_quire.sql', '0001_grey_orphan.sql', '0002_independent_movement.sql']) {
    sql.exec(await readFile(new URL(`../drizzle/${filename}`, import.meta.url), 'utf8'));
  }
  let queued = Promise.resolve();
  const statements = [];
  const db = {
    prepare(query) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { statements.push(query); return sql.prepare(query).get(...params) ?? null; },
        async all() { statements.push(query); return { results: sql.prepare(query).all(...params) }; },
        async run() { statements.push(query); return { success: true, meta: { changes: Number(sql.prepare(query).run(...params).changes) } }; },
      };
    },
    batch(operations) {
      // Model D1 transaction serialization; unrelated HTTP requests remain concurrent.
      const work = queued.then(async () => {
        sql.exec('BEGIN IMMEDIATE');
        try {
          const out = [];
          for (const operation of operations) out.push(await operation.run());
          sql.exec('COMMIT');
          return out;
        } catch (error) { sql.exec('ROLLBACK'); throw error; }
      });
      queued = work.catch(() => {});
      return work;
    },
  };
  const seenRooms = new Set();
  const fetchImpl = async (url, init) => {
    const request = new Request(url, init);
    const parsed = new URL(url);
    if (init.body) seenRooms.add(JSON.parse(init.body).roomId);
    else seenRooms.add(parsed.searchParams.get('room'));
    return parsed.pathname.endsWith('/move') ? handleMovementRequest(request, db) : handleRoomRequest(request, db);
  };
  return { sql, seenRooms, statements, fetchImpl };
}

test('complete HTTP scenario uses real handlers and migrated SQLite, then removes all ten seats', { timeout: 15000 }, async t => {
  const { sql, seenRooms, statements, fetchImpl } = await createRealHttpFixture(t);
  const { runMovementSmoke } = await import('../scripts/qa/joystick-http-smoke.mjs');
  const report = await runMovementSmoke('http://127.0.0.1:8790', { fetchImpl });
  assert.equal(report.passed, true);
  assert.equal(report.simultaneousActors, 10);
  assert.equal(report.acceptedLoadMoves, 60);
  assert.equal(report.cleanup.confirmedRemovedSeats, 10);
  assert.equal(report.cleanup.remainingOwnSeats, 0);
  assert.equal(report.cleanup.failedLeaveResponses, 0);
  assert.equal(report.postRequests, 121);
  assert.equal(report.requests, 169);
  assert.equal(report.spectatorGroupDenied, true);
  assert.deepEqual([...seenRooms], ['soundcheck']);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM nightclub_rooms WHERE room_id != ?').get('soundcheck').n, 0);
  assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM nightclub_rooms').get().state_json).participants.length, 0);
  assert.equal(statements.filter(query => /^UPDATE nightclub_visits SET move_sequence/.test(query)).length, 70);
  assert.ok(Date.parse(report.remainingGroupCooldownUntil) > Date.now());
});


test('lost successful join responses are not retried and all owned seats are still cleaned up', { timeout: 10000 }, async t => {
  const fixture = await createRealHttpFixture(t);
  const { runMovementSmoke } = await import('../scripts/qa/joystick-http-smoke.mjs');
  let joins = 0, leaves = 0;
  await assert.rejects(runMovementSmoke('http://127.0.0.1:8790', { fetchImpl: async (url, init) => {
    const type = init.body && JSON.parse(init.body).type;
    const response = await fixture.fetchImpl(url, init);
    if (type === 'join') { joins++; throw new Error('simulated lost acknowledged join response'); }
    if (type === 'leave') leaves++;
    return response;
  } }), error => {
    assert.match(error.message, /simulated lost/);
    assert.equal(error.report.passed, false);
    assert.equal(error.report.cleanup.remainingOwnSeats, 0);
    assert.equal(error.report.cleanup.soundcheckEmpty, true);
    return true;
  });
  assert.equal(joins, 10);
  assert.equal(leaves, 10);
  assert.equal(JSON.parse(fixture.sql.prepare('SELECT state_json FROM nightclub_rooms').get().state_json).participants.length, 0);
});

test('occupied soundcheck is rejected before any POST and an existing seat is untouched', async t => {
  const fixture = await createRealHttpFixture(t);
  const { runMovementSmoke } = await import('../scripts/qa/joystick-http-smoke.mjs');
  const url = 'http://127.0.0.1:8790/api/room?room=soundcheck';
  const first = await fixture.fetchImpl(url, {});
  const cookie = first.headers.getSetCookie()[0].split(';')[0];
  const joined = await fixture.fetchImpl(url, { method: 'POST', headers: {
    cookie, origin: 'http://127.0.0.1:8790', 'content-type': 'application/json',
  }, body: JSON.stringify({ roomId: 'soundcheck', requestId: 'existing-soundcheck-user', sequence: 1, type: 'join', name: 'Existing', preset: 'cat' }) });
  assert.equal(joined.status, 200);
  const ownerId = (await joined.json()).self.id;
  await assert.rejects(runMovementSmoke('http://127.0.0.1:8790', { fetchImpl: fixture.fetchImpl }), error => {
    assert.match(error.message, /soundcheck is occupied/);
    assert.equal(error.report.postRequests, 0);
    assert.equal(error.report.cleanup.attemptedJoins, 0);
    return true;
  });
  const participants = JSON.parse(fixture.sql.prepare('SELECT state_json FROM nightclub_rooms').get().state_json).participants;
  assert.equal(participants.length, 1);
  assert.equal(participants[0].id, ownerId);
});
