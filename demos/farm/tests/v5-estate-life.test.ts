import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandEstate, createEstate, currentProfile, releaseRest, requestRest, settleEstate,
  type Estate} from '../src/v5/estate.ts';
import {INITIAL_ACTOR_POINTS, INITIAL_PLAYER_POINT, isWalkable, shelterEntries} from '../src/v5/layout.ts';
import {createLife} from '../src/v5/life.ts';
import {createThreat} from '../src/v5/threat.ts';

const T = Date.UTC(2026, 1, 1, 12);
let commandId = 0;
function ready(): Estate {
  const state = commandEstate(createEstate('life-integration', T), {id: 'session-life', type: 'enter'}, T).state;
  const p = currentProfile(state); p.tutorial = 'done'; p.threat = null;
  return state;
}
function pulse(state: Estate, now: number): Estate {
  const result = commandEstate(state,
    {id: `pulse-life-${++commandId}`, type: 'pulse', session: currentProfile(state).session}, now);
  assert.equal(result.accepted, true, result.message);
  return result.state;
}

test('initial LX and every animal use the authoritative legal spawn constants', () => {
  const p = currentProfile(createEstate('spawn', T));
  assert.deepEqual(p.position, INITIAL_PLAYER_POINT);
  assert.deepEqual(p.animals.map(a => a.position), INITIAL_ACTOR_POINTS);
  assert.ok([p.position, p.guardianAt, ...p.animals.map(a => a.position)].every(q => isWalkable(p.layout, q)));
});

test('migration copies actual legacy experiences without renaming or resetting earned relations', async () => {
  const {createFarm} = await import('../src/model.ts');
  const legacy = createFarm('migration', T);
  legacy.animals[0].name = '旧伙伴'; legacy.animals[0].bond = 10;
  legacy.animals[0].experiences = [{text: '第一次吃你摘的青草', at: T - 3000}, {text: '学着和你蹦跳', at: T - 1000}];
  const a = currentProfile(createEstate('migration', T, legacy)).animals[0];
  assert.equal(a.id, legacy.animals[0].id); assert.equal(a.name, '旧伙伴'); assert.equal(a.life.bond, 80);
  assert.deepEqual(a.life.memory.map(({text, at}) => ({text, at})), legacy.animals[0].experiences);
  assert.equal(a.life.care.baby.feeds, 0);
});

test('rest reserves shared shelter slots, admits only through real doors and survives5s wander', () => {
  let state = ready(); const p = currentProfile(state); const a = p.animals[0];
  assert.equal(requestRest(p, a.id).ok, true);
  assert.equal(a.restAssignment?.phase, 'walk');
  const door = shelterEntries(p.layout)[0];
  assert.deepEqual(a.path.at(-1), {x: door.x, z: door.z});
  state = pulse(state, T + 1000);
  assert.equal(currentProfile(state).animals[0].life.care.baby.rests, 0);
  for (let i = 2; i <= 75; i++) state = pulse(state, T + i * 1000);
  const rested = currentProfile(state).animals[0];
  assert.equal(rested.restAssignment?.phase, 'admitted');
  assert.equal(rested.restAssignment?.buildingId, door.buildingId);
  assert.equal(rested.life.care.baby.rests, 1);
  assert.deepEqual(rested.position, {x: door.x, z: door.z});
  assert.ok(rested.life.energy >= 80);
});

test('six capacity is shared by all doors and cannot admit or reserve a seventh animal', () => {
  const p = currentProfile(ready());
  p.animals = Array.from({length: 7}, (_, i) => ({...structuredClone(p.animals[i % 3]),
    id: `capacity-${i}`, life: createLife(T), restAssignment: undefined}));
  const shelter = p.layout.buildings.find(b => b.kind === 'shelter')!;
  shelter.doors.push({id: 'extra-door', x: 4, z: 2, open: true, paidCost: 8});
  for (const animal of p.animals.slice(0, 6)) assert.equal(requestRest(p, animal.id).ok, true);
  assert.equal(requestRest(p, p.animals[6].id).ok, false);
  const reserved = p.animals.flatMap(a => a.restAssignment ? [a.restAssignment] : []);
  assert.equal(reserved.length, 6); assert.equal(new Set(reserved.map(r => `${r.buildingId}:${r.slot}`)).size, 6);
  releaseRest(p, p.animals[0].id);
  assert.equal(requestRest(p, p.animals[6].id).ok, true);
});

test('standing next to shelter without reservation does not count as safe rest', () => {
  let state = ready(); const p = currentProfile(state);
  const door = shelterEntries(p.layout)[0];
  p.position = {x: door.x, z: door.z};
  p.animals[0].position = {x: door.x, z: door.z};
  p.animals[0].life.energy = 80;
  for (let i = 1; i <= 65; i++) state = pulse(state, T + i * 1000);
  assert.equal(currentProfile(state).animals[0].life.care.baby.rests, 0);
});

test('low-energy autonomous rest finishes admission and safe60s without requiring LX nearby', () => {
  let state = ready(); const p = currentProfile(state);
  p.position = {x: 9, z: 0}; p.animals[0].life.energy = 29;
  for (let i = 1; i <= 80; i++) state = pulse(state, T + i * 1000);
  const animal = currentProfile(state).animals[0];
  assert.equal(animal.life.care.baby.rests, 1);
  assert.ok(animal.life.energy > 30);
});

test('release resets an unfinished rest and leaves a legal egress position', () => {
  let state = ready(); const p = currentProfile(state);
  assert.equal(requestRest(p, p.animals[0].id).ok, true);
  for (let i = 1; i <= 35; i++) state = pulse(state, T + i * 1000);
  const after = currentProfile(state); releaseRest(after, after.animals[0].id);
  assert.equal(after.animals[0].restAssignment, undefined);
  assert.equal(after.animals[0].life.rest.elapsedMs, 0);
  assert.ok(isWalkable(after.layout, after.animals[0].position));
  assert.equal(after.animals[0].life.care.baby.rests, 0);
});

test('feed locks target wandering through walk and3s action and full target never consumes inventory', () => {
  let state = ready(); const p = currentProfile(state); const target = p.animals[0];
  p.position = {...target.position}; p.onlineMs = 4500;
  const result = commandEstate(state, {session:currentProfile(state).session,id: 'feed-lock', type: 'feed', target: target.id, food: 'milk'}, T);
  assert.equal(result.accepted, true); state = result.state;
  const originalPosition = {...currentProfile(state).animals[0].position};
  state = pulse(state, T + 1000);
  assert.deepEqual(currentProfile(state).animals[0].position, originalPosition);
  assert.equal(currentProfile(state).inventory.hand, 3);
  currentProfile(state).animals[0].life.hunger = 100;
  state = pulse(state, T + 2000);
  assert.equal(currentProfile(state).inventory.hand, 3); assert.equal(currentProfile(state).job, null);
});

test('long offline gaps never advance online rest/jobs and repeated GET settlements share one hunger cap', () => {
  let state = ready(); const p = currentProfile(state);
  requestRest(p, p.animals[0].id);
  state = settleEstate(state, T + 20 * 60_000);
  assert.equal(currentProfile(state).animals[0].life.hunger, 35);
  state = settleEstate(state, T + 40 * 60_000);
  assert.equal(currentProfile(state).animals[0].life.hunger, 35);
  assert.equal(currentProfile(state).animals[0].life.care.baby.rests, 0);
  assert.equal(currentProfile(state).onlineMs, 0);
  assert.equal(currentProfile(state).lastPulseAt, T);
  const before = currentProfile(state).animals[0].position;
  state = pulse(state, T + 86400_000);
  assert.deepEqual(currentProfile(state).animals[0].position, before);
  assert.equal(currentProfile(state).onlineMs, 0);
});

test('tiny repeated offline GETs accumulate at most20 hunger loss over the complete absence', () => {
  let state = ready();
  for (let i = 1; i <= 60; i++) state = settleEstate(state, T + i * 60_000);
  assert.equal(currentProfile(state).animals[0].life.hunger, 35);
});

test('inactive profile retains its own activity clocks during natural-profile visits', () => {
  let state = ready();
  state = commandEstate(state, {session:currentProfile(state).session,id: 'lab-start', type: 'profile', profile: 'lab'}, T).state;
  state = commandEstate(state, {session:currentProfile(state).session,id: 'home-return', type: 'profile', profile: 'home'}, T + 1000).state;
  const lastSeen = state.profiles.lab!.lastSeenAt;
  state = settleEstate(state, T + 86400_000);
  assert.equal(state.profiles.lab!.lastSeenAt, lastSeen);
});

test('pulse caps online time at1500ms and same-time duplicate cannot advance needs or jobs', () => {
  let state = pulse(ready(), T + 4000);
  const p = currentProfile(state);
  assert.equal(p.onlineMs, 1500); assert.equal(p.animals[0].life.hunger, 55 - 1.5 / 60);
  state = pulse(state, T + 4000);
  assert.equal(currentProfile(state).onlineMs, 1500);
});

test('following navigates legally toward LX without being replaced by autonomous wandering', () => {
  let state = ready(); const p = currentProfile(state);
  p.position = {x: 9, z: 4}; p.animals[0].following = true;
  for (let i = 1; i <= 20; i++) {
    state = pulse(state, T + i * 1000);
    assert.ok(isWalkable(currentProfile(state).layout,
      {x: Math.round(currentProfile(state).animals[0].position.x), z: Math.round(currentProfile(state).animals[0].position.z)}));
  }
  const a = currentProfile(state).animals[0];
  assert.ok(Math.hypot(a.position.x - 9, a.position.z - 4) <= 1.6);
  assert.equal(a.following, true);
});

test('online age and actual admitted rest together promote one ready baby', () => {
  let state = ready(); const p = currentProfile(state); const a = p.animals[0];
  a.life.bornAt = T - 86400_000; a.life.stageAt = T - 86400_000;
  a.life.care.baby.feeds = 3; a.life.care.baby.explorationSessions = ['yesterday'];
  assert.equal(requestRest(p, a.id).ok, true);
  for (let i = 1; i <= 75; i++) state = pulse(state, T + i * 1000);
  assert.equal(currentProfile(state).animals[0].life.stage, 'juvenile');
  assert.equal(currentProfile(state).animals[0].life.care.baby.rests, 1);
  assert.equal(currentProfile(state).animals[0].life.care.juvenile.feeds, 0);
});

test('threat pauses delivery with held food intact while online needs still advance', () => {
  let state = ready(); const p = currentProfile(state);
  p.job = {id: 'held-food', type: 'delivery', phase: 'out', to: {x: 5, z: 4}, source: {x: 9, z: 4},
    progress: 500, carried: 3, rounds: 2};
  p.path = [{x: 5, z: 6}, {x: 5, z: 5}, {x: 5, z: 4}];
  const position = {...p.position};
  p.threat = createThreat({id: 'delivery-alert', seed: 7, mode: 'rehearsal', guardian: 'dog',
    actors: p.animals.map(a => ({id: a.id, position: {...a.position}}))}, p.layout);
  for (let i = 1; i <= 10; i++) state = pulse(state, T + i * 1000);
  const after = currentProfile(state);
  assert.deepEqual(after.position, position); assert.equal(after.job?.carried, 3);
  assert.equal(after.job?.progress, 500); assert.ok(after.animals[0].life.hunger < 55);
});

test('animals truly admitted by threat reservations can finish continuous safe rest during event', () => {
  let state = ready(); const p = currentProfile(state);
  p.threat = createThreat({id: 'safe-event', seed: 7, mode: 'rehearsal', guardian: 'dog',
    actors: p.animals.map(a => ({id: a.id, position: {...a.position}}))}, p.layout);
  const entry = shelterEntries(p.layout)[0]; p.threat.phase = 'complete';
  for (const [slot, actor] of p.threat.actors.entries()) {
    actor.status = 'safe'; actor.reservation = {buildingId: entry.buildingId, doorId: entry.doorId, slot};
    actor.position = {x: 2, z: 2};
  }
  for (let i = 1; i <= 65; i++) state = pulse(state, T + i * 1000);
  assert.equal(currentProfile(state).animals[0].life.care.baby.rests, 1);
});
