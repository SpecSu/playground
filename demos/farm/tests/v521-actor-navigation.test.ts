import test from 'node:test';
import assert from 'node:assert/strict';
import {findActorPath} from '../src/v5/actor-navigation.ts';
import {createLayout, isWalkable, type GridPoint} from '../src/v5/layout.ts';

test('cardinal routes include real endpoints and each intermediate integer node in travel order', () => {
  const layout = createLayout();
  assert.deepEqual(findActorPath(layout, {x: 4.2, z: 4}, {x: 7.3, z: 4}), [
    {x: 4.2, z: 4}, {x: 5, z: 4}, {x: 6, z: 4}, {x: 7, z: 4}, {x: 7.3, z: 4},
  ]);
  assert.deepEqual(findActorPath(layout, {x: 7.3, z: 4}, {x: 4.2, z: 4}), [
    {x: 7.3, z: 4}, {x: 7, z: 4}, {x: 6, z: 4}, {x: 5, z: 4}, {x: 4.2, z: 4},
  ]);
});

test('fractional routes never overshoot their endpoint or retrace the rounded cell', () => {
  const layout = createLayout();
  assert.deepEqual(findActorPath(layout, {x: 6.4, z: 4}, {x: 6.9, z: 4}), [{x: 6.4, z: 4}, {x: 6.9, z: 4}]);
  assert.deepEqual(findActorPath(layout, {x: 5.8, z: 4}, {x: 6, z: 4.3}), [{x: 5.8, z: 4}, {x: 6, z: 4}, {x: 6, z: 4.3}]);
});

test('same-point routes require a legal position and unreachable endpoints return null', () => {
  const layout = createLayout();
  const p = {x: 6.4, z: 4};
  assert.deepEqual(findActorPath(layout, p, p), [p]);
  assert.equal(findActorPath(layout, {x: 2, z: 2}, {x: 2, z: 2}), null);
  assert.equal(findActorPath(layout, p, {x: 12, z: 4}), null);
  assert.equal(findActorPath(layout, p, {x: NaN, z: 4}), null);
});

test('fractional endpoints stay on legal cardinal segments around an intervening building', () => {
  const layout = createLayout(), from = {x: 0, z: 2.2}, to = {x: 4, z: 2.2};
  const path = findActorPath(layout, from, to)!;
  assert.ok(path); assert.deepEqual(path[0], from); assert.deepEqual(path.at(-1), to);
  let length = 0;
  const segmentLength = (a: GridPoint, b: GridPoint) => Math.hypot(a.x - b.x, a.z - b.z);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]; length += segmentLength(a, b);
    assert.ok(a.x === b.x || a.z === b.z);
    for (let j = 0; j <= 20; j++) assert.ok(isWalkable(layout, {x: Math.round(a.x + (b.x - a.x) * j / 20), z: Math.round(a.z + (b.z - a.z) * j / 20)}));
  }
  assert.ok(Math.abs(length - 7.6) < 1e-8);
});
