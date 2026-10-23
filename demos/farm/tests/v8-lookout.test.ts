import test from 'node:test';
import assert from 'node:assert/strict';
import {commitEdit, createLayout, isWalkable, type Building, type Layout, type LayoutEdit} from '../src/v5/layout.ts';
import * as api from '../src/v5/lookout.ts';
import type {LookoutState} from '../src/v5/lookout.ts';

const tower = (rotation: Building['rotation'] = 0): Building => ({id: 'test-tower', kind: 'tower', x: 7, z: 3, rotation, paidCost: 12, doors: [], capacity: 1});
const fixture = (rotation: Building['rotation'] = 0): Layout => ({...createLayout(), buildings: [tower(rotation)]});
const start = (layout = fixture(), from = {x: 5, z: 6}) => {
  const state = api.startLookout(layout, from); assert.ok(state); return state;
};
const until = (layout: Layout, initial: LookoutState, phase: LookoutState['phase']) => {
  let state = initial;
  for (let i = 0; state.phase !== phase && i < 1000; i++) state = api.advanceLookout(layout, state, 50)!;
  assert.equal(state.phase, phase); return state;
};

test('tower access has a ground entrance, ascending stair route and actual platform centre', () => {
  const access = api.towerAccess(fixture(), tower()); assert.ok(access);
  assert.deepEqual(access.entry, {x: 7, z: 5});
  assert.deepEqual(access.route, [
    {x: 7, z: 5, height: 0}, {x: 7, z: 4, height: 1.115}, {x: 7, z: 3, height: 2.23},
    {x: 7.5, z: 3, height: 2.23}, {x: 7.5, z: 3.5, height: 2.23},
  ]);
  assert.equal(isWalkable(fixture(), {x: 7, z: 4}), false, 'Stair authorization must not open the tower to ground navigation');
});

test('rotated towers expose their own entrance and never authorize a different building', () => {
  const entries = [{x: 7, z: 5}, {x: 6, z: 3}, {x: 8, z: 2}, {x: 9, z: 4}];
  for (const [index, rotation] of ([0, 90, 180, 270] as const).entries()) {
    const layout = fixture(rotation), access = api.towerAccess(layout, tower(rotation)); assert.ok(access);
    assert.deepEqual(access.entry, entries[index]);
    layout.buildings.push({...tower(), id: 'blocker', kind: 'decor', ...entries[index]});
    assert.equal(api.towerAccess(layout, tower(rotation)), null);
  }
});

test('unreachable or missing towers are rejected rather than teleporting to an entrance', () => {
  const layout = fixture(); layout.owned = layout.owned.filter(p => p.x !== 6);
  assert.equal(api.startLookout(layout, {x: 5, z: 6}), null);
  assert.equal(api.startLookout(fixture(), {x: 5, z: 6}, 'missing'), null);
  assert.equal(api.startLookout(fixture(), {x: NaN, z: 6}), null);
});

test('approach follows legal ground cells and does not grant height or sight early', () => {
  const layout = fixture(), original = start(layout), copy = structuredClone(original);
  let state = original;
  for (let i = 0; state.phase === 'approach' && i < 200; i++) {
    assert.equal(state.height, 0); assert.equal(api.lookoutIsReady(layout, state), false);
    assert.ok(isWalkable(layout, {x: Math.round(state.position.x), z: Math.round(state.position.z)}));
    const next = api.advanceLookout(layout, state, 50)!;
    assert.ok(Math.hypot(next.position.x - state.position.x, next.position.z - state.position.z, next.height - state.height) <= .076);
    state = next;
  }
  assert.equal(state.phase, 'ascent'); assert.deepEqual(original, copy, 'Advancement must not mutate a saved snapshot');
});

test('climbing increases height continuously and waits on the platform before sight applies', () => {
  const layout = fixture(); let state = until(layout, start(layout), 'ascent'), raised = false;
  while (state.phase === 'ascent') {
    assert.equal(api.lookoutIsReady(layout, state), false);
    const next = api.advanceLookout(layout, state, 50)!;
    assert.ok(next.height >= state.height); assert.ok(next.height - state.height <= .076);
    raised ||= next.height > 0 && next.height < 2.23; state = next;
  }
  assert.ok(raised); assert.equal(state.phase, 'settle'); assert.equal(api.lookoutIsReady(layout, state), false);
  state = until(layout, state, 'watching'); assert.equal(api.lookoutIsReady(layout, state), true);
  assert.deepEqual(state.position, {x: 7.5, z: 3.5}); assert.equal(state.height, 2.23);
  assert.equal(api.lookoutIsReady(layout, {...state, position: {x: 7, z: 5}}), false);
  assert.equal(api.lookoutIsReady(layout, {...state, height: 0}), false);
});

test('eight seconds of watching ends by walking back to the same ground entrance', () => {
  const layout = fixture(), watching = {...until(layout, start(layout), 'watching'), phaseMs: 0};
  const almost = api.advanceLookout(layout, watching, 7999)!; assert.equal(almost.phase, 'watching');
  const down = api.advanceLookout(layout, almost, 1)!; assert.equal(down.phase, 'descent');
  assert.equal(down.height, 2.23); assert.equal(api.lookoutIsReady(layout, down), false);
  const done = until(layout, down, 'done'); assert.deepEqual(done.position, {x: 7, z: 5}); assert.equal(done.height, 0);
});

test('cancel halfway up reverses the traversed stairs without teleporting', () => {
  const layout = fixture(), ascent = until(layout, start(layout), 'ascent');
  const halfway = api.advanceLookout(layout, ascent, 900)!; assert.ok(halfway.height > 0);
  const cancelled = api.advanceLookout(layout, halfway, 0, {cancel: true})!;
  assert.equal(cancelled.phase, 'descent'); assert.deepEqual(cancelled.position, halfway.position); assert.equal(cancelled.height, halfway.height);
  let state = cancelled;
  while (state.phase !== 'done') {
    const next = api.advanceLookout(layout, state, 50)!;
    assert.ok(next.height <= state.height); assert.ok(state.height - next.height <= .076); state = next;
  }
  assert.deepEqual(state.position, {x: 7, z: 5});
});

test('cancel on approach ends in place and repeated commands preserve the occupied tower', () => {
  const layout = fixture(), state = api.advanceLookout(layout, start(layout), 300)!;
  assert.deepEqual(api.startLookout(layout, {x: 9, z: 9}, undefined, state), state);
  const stopped = api.advanceLookout(layout, state, 1000, {cancel: true})!;
  assert.equal(stopped.phase, 'done'); assert.deepEqual(stopped.position, state.position); assert.equal(stopped.height, 0);
});

test('danger pauses for a bounded report then descends even if danger remains asserted', () => {
  const layout = fixture(), watching = until(layout, start(layout), 'watching');
  const report = api.advanceLookout(layout, watching, 300, {alert: true})!;
  assert.equal(report.alerted, true); assert.equal(report.phase, 'watching'); assert.equal(api.lookoutIsReady(layout, report), false);
  assert.deepEqual(report.position, watching.position);
  const down = api.advanceLookout(layout, report, 500, {alert: true})!; assert.equal(down.phase, 'descent');
  assert.equal(api.advanceLookout(layout, down, 20000, {alert: true})!.phase, 'done');
});

test('newly blocked approach is recomputed and an isolated entrance cancels safely', () => {
  const layout = fixture(), state = start(layout, {x: 5, z: 5});
  layout.buildings.push({...tower(), id: 'wall', kind: 'decor', x: 6, z: 5});
  const next = api.advanceLookout(layout, state, 400)!;
  assert.ok(isWalkable(layout, {x: Math.round(next.position.x), z: Math.round(next.position.z)}));
  assert.notDeepEqual(next.position, {x: 5.6, z: 5});
  layout.buildings.push({...tower(), id: 'entry-wall', kind: 'decor', x: 7, z: 5});
  const stopped = api.advanceLookout(layout, next, 400)!; assert.equal(stopped.phase, 'done'); assert.deepEqual(stopped.position, next.position);
});

test('a blocked descent holds its position until the stair exit clears', () => {
  const layout = fixture(), watching = until(layout, start(layout), 'watching');
  let state = api.advanceLookout(layout, watching, 0, {cancel: true})!;
  layout.buildings.push({...tower(), id: 'entry-wall', kind: 'decor', x: 7, z: 5});
  const held = api.advanceLookout(layout, state, 10000)!;
  assert.equal(held.phase, 'descent'); assert.deepEqual(held.position, state.position); assert.equal(held.height, state.height);
  layout.buildings.pop(); state = until(layout, held, 'done'); assert.equal(state.height, 0);
});

test('serialized traversal resumes deterministically while absent legacy state stays absent', () => {
  const layout = fixture(), state = api.advanceLookout(layout, until(layout, start(layout), 'ascent'), 500)!;
  assert.deepEqual(api.advanceLookout(layout, JSON.parse(JSON.stringify(state)), 350), api.advanceLookout(layout, state, 350));
  assert.equal(api.advanceLookout(layout, undefined, 1000), null);
  assert.equal(api.lookoutIsReady(layout, undefined), false);
  assert.deepEqual(api.advanceLookout(layout, state, NaN), state);
  assert.deepEqual(api.advanceLookout(layout, state, -1000), state);
});

test('large elapsed chunks match many small updates across every phase boundary', () => {
  const layout = fixture(), initial = start(layout); let sliced = initial;
  for (let i = 0; i < 180; i++) sliced = api.advanceLookout(layout, sliced, 100)!;
  const lumped = api.advanceLookout(layout, initial, 18000)!;
  assert.equal(lumped.phase, sliced.phase); assert.ok(Math.abs(lumped.height - sliced.height) < 1e-7);
  assert.ok(Math.hypot(lumped.position.x - sliced.position.x, lumped.position.z - sliced.position.z) < 1e-7);
});

test('fractional ground positions keep their exact origin when beginning a traversal', () => {
  const layout = fixture(), from = {x: 5.25, z: 6}, state = start(layout, from);
  assert.deepEqual(state.position, from); assert.deepEqual(state.path[0], {...from, height: 0});
  const next = api.advanceLookout(layout, state, 20)!;
  assert.ok(Math.hypot(next.position.x - from.x, next.position.z - from.z) <= .030001);
});

test('removed or moved towers revoke sight and never snap an elevated guardian to new geometry', () => {
  const layout = fixture(), watching = until(layout, start(layout), 'watching');
  layout.buildings[0].x = 8;
  assert.equal(api.lookoutIsReady(layout, watching), false);
  const waiting = api.advanceLookout(layout, watching, 10000)!;
  assert.equal(waiting.phase, 'descent'); assert.deepEqual(waiting.position, watching.position); assert.equal(waiting.height, 2.23);
  layout.buildings[0].x = 7;
  assert.equal(until(layout, waiting, 'done').height, 0);
  layout.buildings = [];
  assert.equal(api.towerAccess(layout, tower()), null);
});

test('incomplete legacy or malformed traversal snapshots are ignored safely', () => {
  const layout = fixture();
  for (const state of [{}, {phase: 'watching'}, {...start(layout), pathIndex: -1}, {...start(layout), height: NaN}]) {
    assert.equal(api.advanceLookout(layout, state as LookoutState, 1000), null);
    assert.equal(api.lookoutIsReady(layout, state as LookoutState), false);
  }
});

const constructed = (edit: LayoutEdit) => {
  const layout = createLayout(); layout.buildings.push(tower());
  const result = commitEdit(layout, edit, {materials: 100, eventId: 'lookout-construction-test'});
  assert.equal(result.ok, true, result.reasons.join('; ')); assert.ok(result.layout.construction);
  return result.layout;
};

test('pending demolition or relocation cannot accept a lookout before construction removes its tower', () => {
  for (const edit of [
    {type: 'remove', id: 'test-tower'}, {type: 'move', id: 'test-tower', x: 8, z: 6},
  ] satisfies LayoutEdit[]) {
    const layout = constructed(edit);
    if (edit.type === 'remove') assert.deepEqual(layout.construction!.footprint, []);
    assert.equal(api.towerAccess(layout, tower()), null);
    assert.equal(api.startLookout(layout, {x: 5, z: 6}), null);
  }
});

test('future aggregate geometry must preserve tower orientation and its usable entry even with an empty footprint', () => {
  for (const change of ['remove', 'move', 'rotate', 'block-entry', 'remove-entry-land'] as const) {
    const layout = constructed({type: 'road', cells: [{x: 6, z: 6}]});
    const target = layout.construction!.target, b = target.buildings.find(item => item.id === 'test-tower')!;
    if (change === 'remove') target.buildings = target.buildings.filter(item => item !== b);
    if (change === 'move') b.x = 8;
    if (change === 'rotate') b.rotation = 90;
    if (change === 'block-entry') target.buildings.push({...tower(), id: 'blocker', kind: 'decor', x: 7, z: 5});
    if (change === 'remove-entry-land') target.owned = target.owned.filter(p => p.x !== 7 || p.z !== 5);
    assert.deepEqual(layout.construction!.footprint, []);
    assert.equal(api.towerAccess(layout, tower()), null, change);
  }
});

test('reservation validation blocks changed current and future access but allows unrelated work and finished traversals', () => {
  assert.equal(typeof api.lookoutReservationSafe, 'function');
  const base = createLayout(); base.buildings.push(tower());
  const state = until(base, start(base), 'watching');
  for (const edit of [
    {type: 'remove', id: 'test-tower'}, {type: 'move', id: 'test-tower', x: 8, z: 6},
    {type: 'place', id: 'entry-blocker', kind: 'decor', x: 7, z: 5},
  ] satisfies LayoutEdit[]) {
    const layout = constructed(edit);
    assert.equal(api.lookoutReservationSafe(layout, state), false);
    assert.equal(api.lookoutReservationSafe(layout, {...state, phase: 'done'}), true);
    assert.equal(api.lookoutReservationSafe(layout), true);
    assert.equal(api.lookoutReservationSafe(layout, null), true);
  }
  const harmless = constructed({type: 'road', cells: [{x: 6, z: 6}]});
  assert.equal(api.lookoutReservationSafe(harmless, state), true);
  assert.ok(api.startLookout(harmless, {x: 5, z: 6}));
  base.buildings = base.buildings.filter(b => b.kind !== 'tower');
  assert.equal(api.lookoutReservationSafe(base, state), false);
});

test('future target cannot cut an approaching guardian off from an otherwise unchanged tower entry', () => {
  const layout = constructed({type: 'road', cells: [{x: 6, z: 6}]});
  const state = start(layout);
  layout.construction!.target.owned = layout.owned.filter(p => p.x !== 6);
  assert.ok(api.towerAccess(layout, tower()), 'Tower and entry are themselves intact');
  assert.equal(api.startLookout(layout, {x: 5, z: 6}), null);
  assert.equal(api.lookoutReservationSafe(layout, state), false);
});
