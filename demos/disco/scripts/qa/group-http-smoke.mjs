// Run after room-http-smoke.mjs has finished and cleaned up, never in parallel.
// This checks the deployed HTTP protocol only; it does not render or play audio.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { mergeResponseCookies } from './room-cookie-jar.mjs';

const input = process.env.QA_BASE_URL;
let target;
try { target = new URL(input); } catch { /* Report the same safe configuration error below. */ }
assert(target && target.protocol === 'https:' && !target.username && !target.password
  && target.pathname === '/' && !target.search && !target.hash
  && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname),
'QA_BASE_URL must be an explicit remote HTTPS origin; run only after the normal HTTP smoke has finished.');
const base = target.origin;
const room = 'soundcheck'; // Deliberately not configurable: never mutate the main floor.
const deadline = AbortSignal.timeout(120_000);
const observer = { sequence: 0 }, member = { sequence: 0 }, witness = { sequence: 0 };
const latencies = [];
let mayHaveJoined = false;
let result;

async function request(client, body, signal = deadline) {
  const before = Date.now();
  const response = await fetch(`${base}/api/room?room=${room}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal,
    headers: {
      ...(client.cookie ? { Cookie: client.cookie } : {}),
      ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify({ roomId: room, ...body }) : undefined,
  });
  client.cookie = mergeResponseCookies(client.cookie, response.headers.getSetCookie());
  const raw = await response.text();
  let json;
  try { json = JSON.parse(raw); }
  catch { throw new Error(`${body?.type || 'snapshot'} returned HTTP ${response.status}, non-JSON body: ${raw.slice(0, 180)}`); }
  const snapshot = json.self ? json : json.snapshot;
  if (snapshot?.self) client.sequence = Math.max(client.sequence, snapshot.self.lastSequence);
  const latency = Date.now() - before;
  latencies.push({ operation: body?.type || 'snapshot', status: response.status, ms: latency });
  return { response, json };
}

function command(client, body, signal) {
  // Never retry a POST: an ambiguous transport failure must remain visible.
  return request(client, { ...body, requestId: randomUUID(), sequence: client.sequence + 1 }, signal);
}

function ok(received) {
  assert.equal(received.response.status, 200, JSON.stringify(received.json));
  return received.json;
}

function sameGroup(snapshot, event) {
  assert.deepEqual(snapshot.groupAction, event, 'all clients retain the exact authoritative descriptor');
  assert.equal(snapshot.participants.length, 1);
  assert.equal(snapshot.participants[0].id, member.actorId);
}

function blocked(received, event) {
  assert.equal(received.response.status, 429, JSON.stringify(received.json));
  assert.equal(received.json.error.code, 'RATE_LIMITED');
  assert(received.json.error.retryAfterMs > 0);
  assert.equal(Number(received.response.headers.get('retry-after')), Math.ceil(received.json.error.retryAfterMs / 1000));
  sameGroup(received.json.snapshot, event);
  return received.json.snapshot;
}

async function waitUntil(serverTimestamp, snapshot) {
  // Waiting from the response's server clock is conservative by the HTTP RTT.
  const delay = Math.max(0, serverTimestamp - snapshot.serverNow);
  assert(delay <= 30_000, 'bounded wave smoke must not wait for an unrelated event');
  await sleep(delay, undefined, { signal: deadline });
}

try {
  const initial = ok(await request(observer));
  assert.equal(initial.roomId, room);
  assert.equal(initial.participants.length, 0, 'soundcheck is occupied; wait for the normal smoke/other test to finish');
  assert(!initial.groupAction || initial.serverNow >= initial.groupAction.endsAt + 5000,
    'soundcheck still has a group event/cooldown; do not overlap smoke runs');
  assert.equal(initial.self.role, 'visitor');
  assert(observer.cookie, 'GET issues the observer capability');
  ok(await request(member));
  ok(await request(witness));
  // A POST might succeed even if its response is lost, so always attempt our
  // own seat cleanup once after sending join, including failure paths.
  mayHaveJoined = true;
  const joined = ok(await command(member, { type: 'join', name: 'QA group dancer', preset: 'human-jiji' }));
  assert.equal(joined.self.role, 'participant');
  member.actorId = joined.self.id;
  assert.equal(joined.participants.length, 1);
  const originalPerson = joined.participants[0];

  const accepted = ok(await command(observer, { type: 'group-action', kind: 'wave' }));
  const event = accepted.groupAction;
  assert(event, 'deployed server must support group-action');
  assert.equal(event.kind, 'wave');
  assert.equal(event.version, 2);
  assert.equal(event.startsAt - accepted.serverNow, 3000);
  assert.equal(event.endsAt - event.startsAt, 24_000);
  assert.equal(event.sourceClockBySlot.length, 10);
  assert(event.sourceClockBySlot.every(Number.isFinite));
  assert(Number.isFinite(event.beatMs) && event.beatMs > 0);
  assert.equal(accepted.self.role, 'visitor', 'observer group control must not occupy a seat');
  assert.equal(accepted.totalVisits, joined.totalVisits);
  sameGroup(accepted, event);
  assert.deepEqual(accepted.participants[0], originalPerson, 'group overlay does not mutate personal pause state');

  const countIn = ok(await request(witness));
  sameGroup(countIn, event);
  assert(countIn.serverNow < event.startsAt, 'count-in was observable by another client; a slow connection can make this check inconclusive');
  assert.equal(countIn.revision, accepted.revision);
  blocked(await command(member, { type: 'action', action: 'spin' }), event);
  const competing = blocked(await command(witness, { type: 'group-action', kind: 'train' }), event);
  assert.equal(competing.revision, accepted.revision, 'rejected commands cannot replace the group event');

  await waitUntil(event.startsAt + 100, competing);
  const active = ok(await request(member));
  sameGroup(active, event);
  assert(active.serverNow >= event.startsAt && active.serverNow < event.endsAt);
  const activeObserver = ok(await request(observer));
  sameGroup(activeObserver, event);
  assert(activeObserver.serverNow >= event.startsAt && activeObserver.serverNow < event.endsAt);
  const activeBlocked = blocked(await command(member, { type: 'action', action: 'wave' }), event);
  assert.equal(activeBlocked.revision, accepted.revision);

  await waitUntil(event.endsAt + 100, activeBlocked);
  const expired = ok(await request(witness));
  sameGroup(expired, event);
  assert(expired.serverNow >= event.endsAt);
  assert.equal(expired.revision, accepted.revision, 'expiry is clock-driven, with no cleanup mutation');
  const resumed = ok(await command(member, { type: 'action', action: 'spin' }));
  sameGroup(resumed, event);
  assert.equal(resumed.participants[0].action, 'spin');
  assert.equal(resumed.participants[0].actionUntil - resumed.participants[0].actionAt, 6000);
  assert.equal(resumed.participants[0].slot, originalPerson.slot);
  assert.equal(resumed.participants[0].joinedAt, originalPerson.joinedAt);
  assert.equal(resumed.participants[0].routePauseMs, originalPerson.routePauseMs,
    'group duration must not accumulate as a personal route pause');

  result = { passed: true, room, observerGroupWithoutSeat: true, authoritativeFutureStart: true,
    sharedCountInAndActiveDescriptor: true, memberActionBlockedDuringGroup: true,
    competingGroupBlocked: true, clockDrivenExpiry: true, personalActionRestored: true,
    groupVersion: event.version, groupDurationMs: event.endsAt - event.startsAt, eventId: event.id };
} finally {
  if (mayHaveJoined) {
    const left = ok(await command(member, { type: 'leave' }, AbortSignal.timeout(15_000)));
    assert.equal(left.self.role, 'visitor');
    assert(!left.participants.some(person => person.id === member.actorId), 'QA member seat was removed');
    assert.equal(left.participants.length, 0, 'soundcheck is empty after group smoke');
    if (result) result.seatCleanup = true;
  }
}
console.log(JSON.stringify({ ...result, latencyMs: latencies }, null, 2));
