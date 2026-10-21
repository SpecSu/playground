import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { planFestivalBuildApproach, getFestivalBuildPhase, FESTIVAL_CONSTRUCTION_MS } = await import('../lib/festival-build-job.ts');
const { FESTIVAL_AVATAR_RADIUS } = await import('../lib/festival-types.ts');
const person = { id: 'builder', x: -13.5, z: 44, targetX: -13.5, targetZ: 44, moveAt: 0, heading: 0 };
const art = { kind: 0, x: -35, z: 50 };
test('builder standpoint leaves space for another participant at the nearest point', () => {
  const nearest = planFestivalBuildApproach(person, art, [], 1000);
  assert.ok(nearest);
  const other = { ...person, id: 'other', x: nearest.movement.targetX, z: nearest.movement.targetZ, targetX: nearest.movement.targetX, targetZ: nearest.movement.targetZ };
  const safe = planFestivalBuildApproach(person, art, [], 1000, [person, other]);
  assert.ok(safe);
  assert.ok(Math.hypot(safe.movement.targetX - other.x, safe.movement.targetZ - other.z) >= FESTIVAL_AVATAR_RADIUS * 2);
});
test('job phase switches only at authoritative arrival and finish boundaries', () => {
  const task = { installationId: 'work', arrivalAt: 5000, finishAt: 17000, facing: 0 };
  assert.equal(getFestivalBuildPhase(task, 4999), 'approaching');
  assert.equal(getFestivalBuildPhase(task, 5000), 'building');
  assert.equal(getFestivalBuildPhase(task, 16999), 'building');
  assert.equal(getFestivalBuildPhase(task, 17000), 'complete');
});

test("construction uses the same twelve-second server and client duration", async () => {
 const { INSTALLATION_CONSTRUCTION_MS } = await import("../src/desert/visual-math.ts");
 assert.equal(FESTIVAL_CONSTRUCTION_MS, 12_000);
 assert.equal(INSTALLATION_CONSTRUCTION_MS, FESTIVAL_CONSTRUCTION_MS);
});
