// HTTP only: no browser, audio requests, playback, or mutations to the main room.
// Run exclusively after other soundcheck QA and after migrations/build are ready:
// QA_BASE_URL=http://127.0.0.1:8787 node --experimental-strip-types scripts/qa/joystick-http-smoke.mjs
// A hosted HTTPS origin requires the release owner's explicit published/ready gate.
// A final unison event is checked without waiting for it to finish. The report
// includes its cooldown timestamp; do not overlap the next soundcheck run.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { mergeResponseCookies } from './room-cookie-jar.mjs';

export const QA_ROOM = 'soundcheck'; // Deliberately never configurable.
const ACTORS = 10;
const LOAD_ROUNDS = 6;
const MAIN_DEADLINE_MS = 120_000;
const CLEANUP_DEADLINE_MS = 30_000;
const REQUEST_DEADLINE_MS = 8_000;
const MAX_REQUESTS = 210;
const MAX_WRITES = 140;

export function parseQaTarget(input) {
  let target;
  try { target = new URL(input); } catch { /* One configuration error below. */ }
  const loopback = target && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  assert(target && (target.protocol === 'https:' || (loopback && target.protocol === 'http:'))
    && !target.username && !target.password && target.pathname === '/' && !target.search && !target.hash,
  'QA_BASE_URL must be an explicit HTTPS origin or loopback HTTP origin, without credentials/path/query/hash. Start the supported local harness separately.');
  return target.origin;
}

export function createQaHttp(baseUrl, { fetchImpl = fetch, signal, maxRequests = MAX_REQUESTS, maxWrites = MAX_WRITES } = {}) {
  const base = parseQaTarget(baseUrl);
  let requests = 0, writes = 0;
  const latencyMs = [];
  async function request(client, operation = 'snapshot', body, overrideSignal) {
    assert(requests < maxRequests, 'HTTP QA request budget exhausted');
    if (body) assert(writes < maxWrites, 'HTTP QA write budget exhausted');
    requests++;
    if (body) writes++;
    const before = Date.now();
    const path = operation === 'move' ? '/api/room/move' : `/api/room?room=${QA_ROOM}`;
    const signals = [AbortSignal.timeout(REQUEST_DEADLINE_MS), overrideSignal || signal].filter(Boolean);
    // Exactly one fetch per call. Never automatically replay a failed POST.
    const response = await fetchImpl(`${base}${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.any(signals),
      headers: { ...(client.cookie ? { Cookie: client.cookie } : {}),
        ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify({ ...body, roomId: QA_ROOM }) : undefined,
    });
    client.cookie = mergeResponseCookies(client.cookie, response.headers.getSetCookie());
    const raw = await response.text();
    let json;
    try { json = JSON.parse(raw); }
    catch { throw new Error(`${operation} returned HTTP ${response.status}: ${raw.slice(0, 160)}`); }
    const snapshot = json.self ? json : json.snapshot;
    if (snapshot?.self) {
      assert.equal(snapshot.roomId, QA_ROOM, 'server returned the reserved QA room');
      client.sequence = Math.max(client.sequence || 0, snapshot.self.lastSequence);
      client.moveSequence = Math.max(client.moveSequence || 0, snapshot.self.lastMoveSequence || 0);
      client.actorId = snapshot.self.id;
    }
    if (Number.isSafeInteger(json.lastMoveSequence)) client.moveSequence = Math.max(client.moveSequence || 0, json.lastMoveSequence);
    latencyMs.push({ operation, status: response.status, ms: Date.now() - before });
    return { response, json };
  }
  function command(client, body, overrideSignal) {
    // Allocate before sending, so cleanup after a lost join response cannot reuse
    // its ordinary sequence. A new leave is cleanup, never a blind join retry.
    client.issuedSequence = Math.max(client.sequence || 0, client.issuedSequence || 0) + 1;
    return request(client, body.type, { ...body, requestId: randomUUID(), sequence: client.issuedSequence }, overrideSignal);
  }
  return { request, command, latencyMs, get counts() { return { requests, postRequests: writes }; } };
}

const ok = (result) => {
  assert.equal(result.response.status, 200, JSON.stringify(result.json));
  return result.json;
};
const rejects = (result, status, code) => {
  assert.equal(result.response.status, status, JSON.stringify(result.json));
  assert.equal(result.json.error?.code, code, JSON.stringify(result.json));
};
async function batch(promises) {
  // Drain all in-flight work before propagating a failure into seat cleanup.
  const results = await Promise.allSettled(promises);
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, errors.map(error => error.message).join('; '));
  return results.map(result => result.value);
}
function movementMap(snapshot) {
  assert(Array.isArray(snapshot.movements), 'movement-enriched snapshots require the published migration and route');
  return [...snapshot.movements].sort((a, b) => a.actorId.localeCompare(b.actorId));
}
function assertSharedState(actual, before) {
  assert.equal(actual.revision, before.revision, 'movement must not churn ordinary room revision');
  for (const key of ['participants', 'events', 'totalVisits', 'track', 'playlistOrder', 'lightMode', 'groupAction']) {
    assert.deepEqual(actual[key], before[key], `movement must not change ordinary ${key}`);
  }
}
function assertSample(reply, command, actorId) {
  assert.equal(reply.accepted, true);
  assert.equal(reply.lastMoveSequence, command.moveSequence);
  for (const [key, value] of Object.entries(command)) if (key !== 'roomId') assert.equal(reply.movement[key], value, `${actorId}: stored ${key}`);
  assert.equal(reply.movement.actorId, actorId);
  assert(Number.isFinite(reply.movement.acceptedAt));
}

export async function runMovementSmoke(baseUrl, { fetchImpl = fetch } = {}) {
  const base = parseQaTarget(baseUrl);
  // Load canonical, pure movement geometry only; no renderer or audio imports.
  await import('../../tests/room-loader.mjs');
  const { clubMotionAt, clubTerritory } = await import('../../lib/club-scene-motion.ts');
  const { personalRouteTime } = await import('../../lib/room-action-state.ts');
  const started = Date.now();
  const interrupted = new AbortController();
  const stop = () => interrupted.abort(new Error('QA interrupted; cleaning up its own seats'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const deadline = AbortSignal.any([AbortSignal.timeout(MAIN_DEADLINE_MS), interrupted.signal]);
  const http = createQaHttp(base, { fetchImpl, signal: deadline });
  const clients = Array.from({ length: ACTORS + 1 }, () => ({ sequence: 0, issuedSequence: 0 }));
  const members = clients.slice(0, ACTORS), spectator = clients.at(-1);
  const attemptedJoins = [];
  let result, failure, cleanup, groupCooldownUntil;
  const seatedActors = new Set();
  try {
    const initial = ok(await http.request(spectator));
    assert.equal(initial.participants.length, 0, 'soundcheck is occupied; do not run concurrent QA');
    assert(!initial.groupAction || initial.serverNow >= initial.groupAction.endsAt + 5000,
      `soundcheck group cooldown is still active until ${initial.groupAction?.endsAt + 5000}; wait before running QA`);
    assert.equal(initial.self.role, 'visitor');
    assert(Array.isArray(initial.movements), 'deployed snapshot must include the movement lane');
    await batch(members.map(async client => {
      const snapshot = ok(await http.request(client));
      assert.equal(snapshot.self.role, 'visitor');
      assert(client.cookie, 'GET must issue a device capability');
    }));
    // Join the ten actors concurrently, then admit the overflow spectator.
    // This avoids serial network RTT consuming the actors' 60-second leases.
    async function join(client, index) {
      attemptedJoins.push(client);
      const snapshot = ok(await http.command(client, { type: 'join', name: `QA joystick ${index + 1}`, preset: 'cat' }));
      assert.equal(snapshot.self.role, index < ACTORS ? 'participant' : 'spectator');
      if (snapshot.self.role === 'participant') seatedActors.add(client.actorId);
    }
    await batch(members.map(join));
    await join(spectator, ACTORS);
    // Renew presence only at fixed phase boundaries, never inside a movement
    // invariant window. Both windows have a 45-second sub-deadline, below TTL.
    const loadPhase = AbortSignal.any([deadline, AbortSignal.timeout(45_000)]);
    await batch(members.map(async client => ok(await http.command(client, { type: 'heartbeat' }, loadPhase))));
    const snapshots = await batch(clients.map(async client => ok(await http.request(client, 'snapshot', undefined, loadPhase))));
    const before = snapshots.at(-1);
    assert.equal(before.participants.length, ACTORS);
    assert.equal(new Set(before.participants.map(person => person.slot)).size, ACTORS);
    assert.equal(new Set(clients.map(client => client.actorId)).size, ACTORS + 1);
    const ordinarySequences = members.map(client => client.sequence);
    const samples = members.map((client, index) => {
      const person = before.participants.find(person => person.id === client.actorId);
      assert(person, 'every QA member owns one of the ten seats');
      const motion = clubMotionAt(personalRouteTime(person, before.serverNow), person.slot);
      const polygon = clubTerritory(person.slot);
      const center = polygon.reduce((p, q) => ({ u: p.u + q.u / polygon.length, v: p.v + q.v / polygon.length }), { u: 0, v: 0 });
      const x = (center.u + center.v) * Math.SQRT1_2, z = (center.v - center.u) * Math.SQRT1_2;
      // The centroid is within the 2.05 m first-placement allowance of every
      // point in this convex canonical territory. Unlike a stale route sample,
      // this remains valid across slow HTTP round trips; assert the bound.
      assert(polygon.every(point => Math.hypot(point.u - center.u, point.v - center.v) <= 2.05), 'canonical territory exceeds latency-safe first-placement bound');
      return { command: { roomId: QA_ROOM, moveSequence: 100 + index * 20, joinedAt: person.joinedAt,
        groupId: before.groupAction?.id ?? null, mode: 'manual', x, z, heading: index / 10, vx: 0.1 + index / 100, vz: 0 },
      origin: { x, z }, target: motion };
    });
    rejects(await http.request(spectator, 'move', samples[0].command, loadPhase), 403, 'NOT_PARTICIPANT');
    const loadStarted = Date.now();
    const latest = new Map();
    for (let round = 0; round < LOAD_ROUNDS; round++) {
      if (round) await sleep(550, undefined, { signal: loadPhase });
      await batch(members.map(async (client, index) => {
        const entry = samples[index];
        const fraction = round * 0.015;
        const command = { ...entry.command, moveSequence: entry.command.moveSequence + round,
          x: entry.origin.x + (entry.target.x - entry.origin.x) * fraction,
          z: entry.origin.z + (entry.target.z - entry.origin.z) * fraction, heading: index / 10 + round / 100 };
        const reply = ok(await http.request(client, 'move', command, loadPhase));
        assertSample(reply, command, client.actorId);
        latest.set(client.actorId, reply.movement);
      }));
    }
    const loadElapsedMs = Date.now() - loadStarted;
    const movingSnapshots = await batch(clients.map(async client => ok(await http.request(client, 'snapshot', undefined, loadPhase))));
    for (const [index, snapshot] of movingSnapshots.entries()) {
      assertSharedState(snapshot, before);
      assert.deepEqual(movementMap(snapshot), [...latest.values()].sort((a, b) => a.actorId.localeCompare(b.actorId)), 'all eleven clients agree on all ten independent movement samples');
      if (index < ACTORS) {
        assert.equal(snapshot.self.lastSequence, ordinarySequences[index]);
        assert.equal(snapshot.self.lastMoveSequence, latest.get(members[index].actorId).moveSequence);
      }
    }
    const stopPhase = AbortSignal.any([deadline, AbortSignal.timeout(45_000)]);
    await batch(members.map(async client => ok(await http.command(client, { type: 'heartbeat' }, stopPhase))));
    const stopBefore = ok(await http.request(spectator, 'snapshot', undefined, stopPhase));
    const stopOrdinarySequences = members.map(client => client.sequence);
    assert.deepEqual(movementMap(stopBefore), movementMap(movingSnapshots[0]), 'ordinary presence renewal preserves independent movement');
    // Simulate a delayed lower-sequence vector arriving after the owner's newer
    // stop. This is deliberate packet reordering, not a claim about network RTT.
    const delayed = { ...samples[0].command, ...latest.get(members[0].actorId), moveSequence: members[0].moveSequence + 1 };
    delete delayed.actorId; delete delayed.acceptedAt;
    await sleep(1200, undefined, { signal: stopPhase });
    const stopCommands = members.map(client => {
      const sample = { ...latest.get(client.actorId) };
      delete sample.actorId; delete sample.acceptedAt;
      return { ...sample, roomId: QA_ROOM, moveSequence: sample.moveSequence + 2, vx: 0, vz: 0 };
    });
    await batch(members.map(async (client, index) => {
      const reply = ok(await http.request(client, 'move', stopCommands[index], stopPhase));
      assertSample(reply, stopCommands[index], client.actorId);
      latest.set(client.actorId, reply.movement);
    }));
    const old = ok(await http.request(members[0], 'move', delayed, stopPhase));
    assert.equal(old.accepted, false);
    assert.deepEqual(old.movement, latest.get(members[0].actorId));
    assert.equal(old.lastMoveSequence, stopCommands[0].moveSequence);
    // An intentional replay of a known-acknowledged stop checks protocol
    // idempotence; this is never transport-failure retry logic.
    const duplicate = ok(await http.request(members[0], 'move', stopCommands[0], stopPhase));
    assert.deepEqual(duplicate.movement, latest.get(members[0].actorId));
    rejects(await http.request(members[0], 'move', { ...stopCommands[0], heading: 1.9 }, stopPhase), 409, 'REQUEST_CONFLICT');
    const stoppedSnapshots = await batch(clients.map(async client => ok(await http.request(client, 'snapshot', undefined, stopPhase))));
    for (const [index, snapshot] of stoppedSnapshots.entries()) {
      assertSharedState(snapshot, stopBefore);
      assert.deepEqual(movementMap(snapshot), [...latest.values()].sort((a, b) => a.actorId.localeCompare(b.actorId)));
      assert(snapshot.movements.every(sample => sample.vx === 0 && sample.vz === 0));
      if (index < ACTORS) {
        assert.equal(snapshot.self.lastSequence, stopOrdinarySequences[index]);
        assert.equal(snapshot.self.lastMoveSequence, stopCommands[index].moveSequence);
      }
    }
    const heartbeat = ok(await http.command(members[0], { type: 'heartbeat' }));
    assert.equal(heartbeat.self.lastSequence, stopOrdinarySequences[0] + 1);
    assert.equal(heartbeat.self.lastMoveSequence, stopCommands[0].moveSequence);
    assert.equal(heartbeat.revision, stopBefore.revision + 1);
    assert.deepEqual(movementMap(heartbeat), movementMap(stoppedSnapshots[0]));
    // Group transition is last, so epoch guards can be checked immediately and
    // all owned seats can be cleaned up without a 30-second wait.
    const group = ok(await http.command(spectator, { type: 'group-action', kind: 'unison' }));
    assert(group.groupAction && group.groupAction.id !== stopCommands[0].groupId);
    groupCooldownUntil = new Date(group.groupAction.endsAt + 5000).toISOString();
    rejects(await http.request(members[0], 'move', { ...stopCommands[0], moveSequence: stopCommands[0].moveSequence + 1 }), 409, 'STALE_MOVEMENT_EPOCH');
    rejects(await http.request(members[0], 'move', { ...stopCommands[0], groupId: group.groupAction.id, moveSequence: stopCommands[0].moveSequence + 1 }), 409, 'GROUP_ACTIVE');
    const grouped = await batch([members[0], spectator].map(async client => ok(await http.request(client))));
    for (const snapshot of grouped) {
      assert.equal(snapshot.revision, group.revision, 'rejected group-epoch moves cannot churn room revision');
      assert.deepEqual(snapshot.groupAction, group.groupAction);
      assert.deepEqual(movementMap(snapshot), movementMap(stoppedSnapshots[0]), 'group rejection preserves each acknowledged parked sample');
    }
    result = { passed: true, room: QA_ROOM, simultaneousActors: ACTORS, spectators: 1, loadRounds: LOAD_ROUNDS,
      acceptedLoadMoves: ACTORS * LOAD_ROUNDS, independentMovementSequences: true, ordinarySequencePreserved: true,
      noMovementRevisionOrPresenceChurn: true, elevenClientSnapshotAgreement: true, exactStopPositions: true,
      stalePacketCannotUndoStop: true, acknowledgedStopIdempotent: true, conflictingSequenceDenied: true,
      spectatorDenied: true, ordinaryHeartbeatStillWorks: true, staleGroupEpochDenied: true, activeGroupDenied: true,
      remainingGroupCooldownUntil: groupCooldownUntil,
      presenceCheckpoints: 2, movementOnlyWindowLimitMs: 45_000, loadElapsedMs, observedAcceptedMovesPerSecond: Number((ACTORS * LOAD_ROUNDS * 1000 / loadElapsedMs).toFixed(2)) };
  } catch (error) {
    failure = error;
  } finally {
    // Cleanup has an independent finite budget even after the main deadline or
    // an interrupt. Only identities whose join was attempted receive one leave.
    const cleanupDeadline = AbortSignal.timeout(CLEANUP_DEADLINE_MS);
    const leaveResults = await Promise.allSettled(attemptedJoins.map(async client => {
      const left = ok(await http.command(client, { type: 'leave' }, cleanupDeadline));
      assert.equal(left.self.role, 'visitor');
      assert(!left.participants.some(person => person.id === client.actorId));
    }));
    try {
      if (attemptedJoins.length) {
        const after = ok(await http.request(spectator, 'snapshot', undefined, cleanupDeadline));
        const ownIds = new Set(attemptedJoins.map(client => client.actorId));
        const remainingOwnSeats = after.participants.filter(person => ownIds.has(person.id)).length;
        assert.equal(remainingOwnSeats, 0, 'cleanup left an owned QA seat behind');
        assert.equal(after.participants.length, 0, 'another actor entered soundcheck during this exclusive smoke');
        assert.equal(after.movements.length, 0, 'departed QA movement rows are not visible to spectators');
        cleanup = { attemptedJoins: attemptedJoins.length, leaveRequests: leaveResults.length,
          confirmedRemovedSeats: seatedActors.size, confirmedAbsentOwnedIdentities: attemptedJoins.length, remainingOwnSeats,
          failedLeaveResponses: leaveResults.filter(item => item.status === 'rejected').length, soundcheckEmpty: true };
      } else cleanup = { attemptedJoins: 0, leaveRequests: 0, skipped: 'no QA join was attempted' };
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], `${failure.message}; cleanup: ${error.message}`) : error;
      cleanup = { attemptedJoins: attemptedJoins.length, verified: false,
        failedLeaveResponses: leaveResults.filter(item => item.status === 'rejected').length };
    }
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  const report = { ...result, passed: !failure && Boolean(result), room: QA_ROOM,
    elapsedMs: Date.now() - started, limits: { mainMs: MAIN_DEADLINE_MS, cleanupMs: CLEANUP_DEADLINE_MS, maxRequests: MAX_REQUESTS, maxPostRequests: MAX_WRITES },
    ...http.counts, cleanup, latencyMs: http.latencyMs, ...(groupCooldownUntil ? { remainingGroupCooldownUntil: groupCooldownUntil } : {}), ...(failure ? { error: failure.message } : {}) };
  if (failure) throw Object.assign(failure, { report });
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(JSON.stringify(await runMovementSmoke(process.env.QA_BASE_URL), null, 2));
  } catch (error) {
    console.error(JSON.stringify(error.report || { passed: false, error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
