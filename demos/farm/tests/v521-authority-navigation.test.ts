import test from 'node:test';
import assert from 'node:assert/strict';
import {commandEstate, createEstate, currentProfile, type Estate} from '../src/v5/estate.ts';
import {createLayout, isWalkable, type GridPoint} from '../src/v5/layout.ts';
import {createThreat, guardianCommand, stepThreat} from '../src/v5/threat.ts';

const T = 1_800_000_000_000;
let sequence = 0;
function command(state: Estate, type: string, at: number, extra: Record<string, unknown> = {}) {
  const result = commandEstate(state, {id: `navigation-${++sequence}`, type, session: currentProfile(state).session, ...extra}, at);
  assert.equal(result.accepted, true, result.message);
  return result.state;
}
function ready() {
  let state = createEstate('navigation', T);
  const p = currentProfile(state); p.tutorial = 'done'; p.threat = null;
  p.position = {x: 9, z: 4}; p.animals = [p.animals[0]];
  p.animals[0].position = {x: 4, z: 4}; p.animals[0].personality = 'eager';
  state = command(state, 'enter', T);
  return state;
}
const distance = (a: GridPoint, b: GridPoint) => Math.hypot(a.x - b.x, a.z - b.z);

for (const [personality, speed] of [['eager', 1.15], ['shy', .6], ['independent', .9]] as const) {
  test(`authoritative ${personality} sheep keeps forward progress across repeated 100ms follow pulses`, () => {
    let state = ready(); currentProfile(state).animals[0].personality = personality;
    state = command(state, 'follow', T, {target: currentProfile(state).animals[0].id});
    for (let i = 1; i <= 20; i++) {
      state = command(state, 'pulse', T + i * 100);
      const position = currentProfile(state).animals[0].position;
      assert.ok(Math.abs(position.x - (4 + speed * i / 10)) < 1e-8, `tick ${i}: ${JSON.stringify(position)}`);
      assert.equal(position.z, 4);
    }
  });
}

test('authoritative follow reverses continuously when the player changes direction between cell centres', () => {
  let state = ready(); state = command(state, 'follow', T, {target: currentProfile(state).animals[0].id});
  state = command(state, 'pulse', T + 200);
  const start = {...currentProfile(state).animals[0].position};
  currentProfile(state).position = {x: 0, z: 4};
  for (let i = 1; i <= 10; i++) {
    state = command(state, 'pulse', T + 200 + i * 100);
    assert.ok(Math.abs(currentProfile(state).animals[0].position.x - (start.x - 1.15 * i / 10)) < 1e-8, `reverse tick ${i}`);
  }
});

test('authoritative sheep follows around the shelter from a fractional edge without entering walls', () => {
  let state = ready(); let p = currentProfile(state);
  p.animals[0].position = {x: 0, z: 2.2}; p.position = {x: 4, z: 2};
  state = command(state, 'follow', T, {target: p.animals[0].id});
  let previous = {...p.animals[0].position};
  for (let i = 1; i <= 80; i++) {
    state = command(state, 'pulse', T + i * 100); p = currentProfile(state);
    const next = p.animals[0].position;
    assert.ok(distance(previous, next) <= .115 + 1e-8);
    for (let sample = 0; sample <= 12; sample++) assert.ok(isWalkable(p.layout, {
      x: Math.round(previous.x + (next.x - previous.x) * sample / 12),
      z: Math.round(previous.z + (next.z - previous.z) * sample / 12),
    }), `wall crossing on tick ${i}`);
    previous = {...next};
  }
  assert.ok(distance(p.animals[0].position, p.position) <= 1.6, JSON.stringify(p.animals[0].position));
});

test('peaceful guardian retargeting preserves fractional progress when the player keeps moving ahead', () => {
  let state = ready(); let p = currentProfile(state);
  p.guardian = 'dog'; p.guardianAt = {x: 4, z: 4}; p.guardianReadyMs = 0;
  state = command(state, 'guardianCommand', T, {command: {kind: 'follow'}});
  for (let i = 1; i <= 20; i++) {
    currentProfile(state).position = {x: 10 + i % 2, z: 4};
    state = command(state, 'pulse', T + i * 100); p = currentProfile(state);
    assert.ok(Math.abs(p.guardianAt.x - (4 + 1.8 * i / 10)) < 1e-8, `guardian tick ${i}: ${JSON.stringify(p.guardianAt)}`);
  }
});

test('threat guardian follows a moving target across repeated real 50ms simulation steps', () => {
  const layout = createLayout();
  let state = createThreat({id: 'fractional-guardian', mode: 'reassure', seed: 1,
    actors: [{id: 'sheep', position: {x: 6, z: 6}}], guardian: 'dog', guardianPosition: {x: 4, z: 4}, wolfSpawns: [{x: 11, z: 0}]}, layout);
  state = guardianCommand(state, layout, {kind: 'follow'}).state;
  for (let i = 1; i <= 20; i++) {
    state = stepThreat(state, layout, {dt: .05, playerPosition: {x: 9 + i % 2, z: 4}});
    assert.ok(Math.abs(state.guardian!.position.x - (4 + 1.8 * i / 20)) < 1e-8, `threat guardian tick ${i}: ${JSON.stringify(state.guardian!.position)}`);
  }
});

test('wolf pursuit advances through a corner after real door service leaves one unreserved sheep', () => {
  const layout = createLayout();
  let state = createThreat({id: 'fractional-chase', mode: 'reassure', seed: 4,
    actors: [...Array.from({length: 6}, (_, i) => ({id: `in-${i}`, position: {x: 2, z: 4}})), {id: 'overflow', position: {x: 8, z: 6}}],
    guardian: 'frog', guardianPosition: {x: 2, z: 4}, wolfSpawns: [{x: 11, z: 0}]}, layout);
  state = guardianCommand(state, layout, {kind: 'calm'}).state;
  state = stepThreat(state, layout, {dt: 13, playerPosition: {x: 11, z: 0}});
  assert.equal(state.actors.filter(a => a.status === 'safe').length, 6);
  assert.equal(state.actors.find(a => a.id === 'overflow')!.reservation, null);
  const reservations = state.actors.filter(a => a.reservation).map(a => a.reservation);
  assert.equal(new Set(reservations.map(r => `${r!.buildingId}/${r!.slot}`)).size, 6);
  assert.deepEqual(state.wolves[0].position, {x: 2, z: 4});
  for (let i = 1; i <= 80; i++) {
    state = stepThreat(state, layout, {dt: .05});
    const expected = {x: 2 + Math.max(0, i / 20 - 2), z: 4 + Math.min(2, i / 20)};
    assert.ok(distance(state.wolves[0].position, expected) < 1e-8, `chase tick ${i}: ${JSON.stringify(state.wolves[0].position)}`);
    assert.ok(isWalkable(layout, {x: Math.round(state.wolves[0].position.x), z: Math.round(state.wolves[0].position.z)}));
  }
  assert.equal(state.actors.find(a => a.id === 'overflow')!.injuredAt, null);
  assert.equal(state.actors.find(a => a.id === 'overflow')!.reservation, null);
  assert.equal(state.rewards, 0);
});

test('fractional evacuation starts toward the safe detour without visiting the rounded cell behind it', () => {
  const layout = createLayout();
  let state = createThreat({id: 'fractional-evacuation', seed: 2, mode: 'rehearsal', actors: [{id: 'a', position: {x: 0, z: 1.8}}],
    guardian: 'cat', guardianPosition: {x: 4, z: 0}, wolfSpawns: [{x: 0, z: 4}]}, layout);
  state = stepThreat(state, layout, {dt: 2});
  const assignment = state.actors[0].reservation;
  assert.ok(assignment);
  for (let i = 1; i <= 10; i++) {
    state = stepThreat(state, layout, {dt: .05});
    assert.ok(Math.abs(state.actors[0].position.z - (1.8 - i * .05)) < 1e-8, `evacuation tick ${i}: ${JSON.stringify(state.actors[0].position)}`);
    assert.equal(state.actors[0].position.x, 0);
    assert.deepEqual(state.actors[0].reservation, assignment);
  }
  assert.equal(state.actors[0].pathLength, 11.8);
});

test('threat follow keeps accepting a player moving diagonally between cell centres', () => {
  const layout = createLayout();
  let state = createThreat({id: 'diagonal-player', mode: 'reassure', seed: 1,
    actors: [{id: 'sheep', position: {x: 6, z: 6}}], guardian: 'dog', guardianPosition: {x: 4, z: 4}, wolfSpawns: [{x: 11, z: 0}]}, layout);
  state = guardianCommand(state, layout, {kind: 'follow'}).state;
  for (let i = 1; i <= 10; i++) {
    state = stepThreat(state, layout, {dt: .05, playerPosition: {x: 9.1 + i / 100, z: 4.1 + i / 100}});
    assert.ok(Math.abs(state.guardian!.position.x - (4 + 1.8 * i / 20)) < 1e-8);
    assert.equal(state.guardian!.position.z, 4);
  }
});

test('threat station commands retain their cell destination when supplied fractional ground coordinates', () => {
  const layout = createLayout();
  let state = createThreat({id: 'fractional-station', mode: 'reassure', seed: 1,
    actors: [{id: 'sheep', position: {x: 6, z: 6}}], guardian: 'dog', guardianPosition: {x: 4, z: 4}, wolfSpawns: [{x: 11, z: 0}]}, layout);
  const result = guardianCommand(state, layout, {kind: 'station', target: {x: 9.2, z: 4.2}});
  assert.equal(result.ok, true, result.reason);
  state = stepThreat(result.state, layout, {dt: .5});
  assert.deepEqual(state.guardian!.target, {x: 9, z: 4});
  assert.deepEqual(state.guardian!.position, {x: 4.9, z: 4});
});

test('station command continues from fractional position and reroutes around new construction', () => {
  let state = ready(); let p = currentProfile(state);
  p.guardian = 'dog'; p.guardianAt = {x: 4.2, z: 4}; p.guardianReadyMs = 0;
  state = command(state, 'guardianCommand', T, {command: {kind: 'station', target: {x: 9, z: 4}}});
  state = command(state, 'pulse', T + 100);
  assert.ok(Math.abs(currentProfile(state).guardianAt.x - 4.38) < 1e-8);
  state = command(state, 'layout', T + 100, {baseVersion: 1, edit: {type: 'place', id: 'path-obstacle', kind: 'decor', x: 6, z: 4}});
  let previous = {...currentProfile(state).guardianAt};
  for (let i = 2; i <= 50; i++) {
    state = command(state, 'pulse', T + i * 100); p = currentProfile(state);
    const next = p.guardianAt;
    for (let sample = 0; sample <= 12; sample++) assert.ok(isWalkable(p.layout, {
      x: Math.round(previous.x + (next.x - previous.x) * sample / 12),
      z: Math.round(previous.z + (next.z - previous.z) * sample / 12),
    }), `construction crossing on tick ${i}`);
    previous = {...next};
  }
  assert.deepEqual(p.guardianAt, {x: 9, z: 4});
});
