import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandEstate, createEstate, currentProfile, type Estate} from '../src/v5/estate.ts';
import {buildingApproaches, isWalkable, regionAt} from '../src/v5/layout.ts';
import {type GuardianKind} from '../src/v5/threat.ts';

const T = Date.UTC(2026, 3, 1, 12);
let seq = 0;
function ready(kind: GuardianKind = 'frog'): Estate {
  const state = commandEstate(createEstate('guardian-life', T), {id: 'guardian-session', type: 'enter'}, T).state;
  const p = currentProfile(state); p.threat = null; p.tutorial = 'done'; p.guardian = kind;
  p.guardianReadyMs = 0; p.guardianAt = {x: 4, z: 4}; p.position = {x: 9, z: 4};
  return state;
}
function command(state: Estate, kind: string, extra = {}) {
  return commandEstate(state, {id: `guardian-${++seq}`, type: 'guardianCommand',
    session: currentProfile(state).session, command: {kind, ...extra}}, T);
}
function pulse(state: Estate, elapsed: number): Estate {
  const result = commandEstate(state, {id: `pulse-guardian-${++seq}`, type: 'pulse',
    session: currentProfile(state).session}, T + elapsed);
  assert.equal(result.accepted, true, result.message); return result.state;
}

for (const [kind, speed] of [['dog', 1.8], ['cat', 2.2], ['frog', 1.2]] as const) {
  test(`${kind} follows LX along actual land path at${speed}cells/s without teleporting`, () => {
    const chosen = command(ready(kind), 'follow'); assert.equal(chosen.accepted, true);
    let state = pulse(chosen.state, 1000); const p = currentProfile(state);
    assert.ok(Math.abs(p.guardianAt.x - (4 + speed)) < 1e-9); assert.equal(p.guardianAt.z, 4);
    for (let elapsed = 2000; elapsed <= 10_000; elapsed += 1000) state = pulse(state, elapsed);
    const after = currentProfile(state);
    assert.ok(Math.hypot(after.guardianAt.x - after.position.x, after.guardianAt.z - after.position.z) <= 1.8 + 1e-9);
    assert.ok(isWalkable(after.layout, {x: Math.round(after.guardianAt.x), z: Math.round(after.guardianAt.z)}));
  });
}

test('station walks to fixed point and remains there when LX moves elsewhere', () => {
  const chosen = command(ready(), 'station', {target: {x: 4, z: 7}}); assert.equal(chosen.accepted, true);
  let state = pulse(chosen.state, 1000);
  assert.deepEqual(currentProfile(state).guardianAt, {x: 4, z: 5.2});
  for (let elapsed = 2000; elapsed <= 5000; elapsed += 1000) state = pulse(state, elapsed);
  assert.deepEqual(currentProfile(state).guardianAt, {x: 4, z: 7});
  currentProfile(state).position = {x: 9, z: 9};
  state = pulse(state, 6000); assert.deepEqual(currentProfile(state).guardianAt, {x: 4, z: 7});
});

test('patrol uses reachable points in all4 regions and frog first checks shore', () => {
  const chosen = command(ready(), 'patrol'); assert.equal(chosen.accepted, true);
  let state = pulse(chosen.state, 1000); const seen = new Set<string>();
  assert.equal(regionAt(currentProfile(state).guardianTarget!), 'shore');
  for (let elapsed = 2000; elapsed <= 60_000; elapsed += 1000) {
    state = pulse(state, elapsed); const p = currentProfile(state);
    if (p.guardianTarget) seen.add(regionAt(p.guardianTarget));
    assert.ok((p.guardianPath ?? []).every(q => isWalkable(p.layout, q)));
  }
  assert.deepEqual([...seen].sort(), ['home', 'meadow', 'pen', 'shore']);
});

test('cat patrol prefers an actual tower approach in its region', () => {
  let state = ready('cat'); const p = currentProfile(state);
  const tower = {id: 'guardian-tower', kind: 'tower' as const, x: 7, z: 1, rotation: 0 as const,
    paidCost: 12, capacity: 1, doors: []};
  p.layout.buildings.push(tower); p.guardianPatrolIndex = 2;
  state = command(state, 'patrol').state; state = pulse(state, 1000);
  assert.ok(buildingApproaches(currentProfile(state).layout, tower).some(q =>
    q.x === currentProfile(state).guardianTarget?.x && q.z === currentProfile(state).guardianTarget?.z));
});

test('preparation time blocks movement and invalid peaceful commands are rejected', () => {
  const state = ready(); const p = currentProfile(state); p.guardianReadyMs = 2000;
  assert.equal(command(state, 'follow').accepted, false);
  p.guardianBehavior = 'follow';
  let waiting = pulse(state, 1000); assert.deepEqual(currentProfile(waiting).guardianAt, p.guardianAt);
  waiting = pulse(waiting, 2000); assert.deepEqual(currentProfile(waiting).guardianAt, p.guardianAt);
  waiting = pulse(waiting, 3000); assert.notDeepEqual(currentProfile(waiting).guardianAt, p.guardianAt);
  assert.equal(command(ready(), 'station', {target: {x: 2, z: 2}}).accepted, false);
  assert.equal(command(ready(), 'station', {target: {x: Number.NaN, z: 2}}).accepted, false);
  assert.equal(command(ready(), 'bubble').accepted, false);
});
