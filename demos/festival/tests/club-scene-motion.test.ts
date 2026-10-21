import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

async function motion() {
  assert.ok(existsSync(new URL('../lib/club-scene-motion.ts', import.meta.url)), 'deterministic motion module exists');
  return import('../lib/club-scene-motion.ts');
}
const epoch = 1_791_806_400_000;
const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('all territories reserve an animated body on both sides of every separating plane', async () => {
  const { clubTerritory, CLUB_BODY_RADIUS, CLUB_BODY_GAP } = await motion();
  const { dancerSlot } = await import('../lib/club-scene-math.ts');
  for (let i = 0; i < 10; i++) {
    const a = dancerSlot(i);
    for (let j = i + 1; j < 10; j++) {
      const b = dancerSlot(j), length = gap(a, b), nx = (b.x - a.x) / length, nz = (b.z - a.z) / length;
      const world = ({ u, v }: { u: number; v: number }) => ({ x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 });
      const aMax = Math.max(...clubTerritory(i).map((p) => { const q = world(p); return q.x * nx + q.z * nz; }));
      const bMin = Math.min(...clubTerritory(j).map((p) => { const q = world(p); return q.x * nx + q.z * nz; }));
      assert.ok(bMin - aMax >= CLUB_BODY_RADIUS * 2 + CLUB_BODY_GAP - 1e-9, `${i}/${j} reserve full body envelopes`);
    }
  }
});

test('closed epoch routes visibly stroll, pause, face their travel and stay collision safe', async () => {
  const { clubMotionAt, CLUB_BODY_RADIUS, CLUB_BODY_GAP, CLUB_BOOTH_BOUNDS, CLUB_WALK_BOUNDS } = await motion();
  const extents = Array.from({ length: 10 }, () => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, moving: 0, still: 0 }));
  for (let offset = 0; offset < 90_000; offset += 47) {
    const states = Array.from({ length: 10 }, (_, slot) => clubMotionAt(epoch + offset, slot));
    for (let i = 0; i < 10; i++) {
      const state = states[i], e = extents[i];
      assert.ok([state.x, state.z, state.heading, state.speed, state.distance, state.walkBlend].every(Number.isFinite));
      assert.ok(state.speed >= 0 && state.speed < 0.8);
      assert.ok(state.walkBlend >= 0 && state.walkBlend <= 1);
      const u = (state.x - state.z) * Math.SQRT1_2, v = (state.x + state.z) * Math.SQRT1_2;
      assert.ok(u >= CLUB_WALK_BOUNDS.minU && u <= CLUB_WALK_BOUNDS.maxU);
      assert.ok(v >= CLUB_WALK_BOUNDS.minV && v <= CLUB_WALK_BOUNDS.maxV);
      const du = Math.max(CLUB_BOOTH_BOUNDS.minU - u, 0, u - CLUB_BOOTH_BOUNDS.maxU);
      const dv = Math.max(CLUB_BOOTH_BOUNDS.minV - v, 0, v - CLUB_BOOTH_BOUNDS.maxV);
      assert.ok(Math.hypot(du, dv) >= CLUB_BODY_RADIUS + 0.1, `${i} clears the booth and DJ`);
      for (let j = i + 1; j < 10; j++) assert.ok(gap(state, states[j]) >= 2 * CLUB_BODY_RADIUS + CLUB_BODY_GAP - 1e-8);
      e.minX = Math.min(e.minX, state.x); e.maxX = Math.max(e.maxX, state.x);
      e.minZ = Math.min(e.minZ, state.z); e.maxZ = Math.max(e.maxZ, state.z);
      if (state.speed > 0.08) {
        e.moving++;
        const next = clubMotionAt(epoch + offset + 1, i);
        assert.ok(angleGap(state.heading, Math.atan2(next.x - state.x, next.z - state.z)) < 0.02, 'body faces forward while walking');
      }
      if (state.speed < 0.001) e.still++;
    }
  }
  for (const e of extents) {
    assert.ok(Math.hypot(e.maxX - e.minX, e.maxZ - e.minZ) > 1.15, 'each person takes visible steps across their territory');
    assert.ok(e.moving > 250 && e.still > 50, 'each person alternates strolling and dancing');
  }
});

test('late join and arbitrary prior frames cannot change epoch motion, including after track changes', async () => {
  const { clubMotionAt } = await motion();
  for (let slot = 0; slot < 10; slot++) {
    const expected = clubMotionAt(epoch, slot);
    for (const time of [0, epoch - 100_000, epoch + 42_000, 1e12]) clubMotionAt(time, slot);
    assert.deepEqual(clubMotionAt(epoch, slot), expected);
    assert.deepEqual(clubMotionAt(epoch, slot), clubMotionAt(epoch + 500 - 500, slot));
  }
});

test('route and segment boundaries are position, speed and heading continuous', async () => {
  const { clubMotionAt, clubRouteDurationMs } = await motion();
  for (let slot = 0; slot < 10; slot++) {
    const period = clubRouteDurationMs(slot);
    const first = clubMotionAt(epoch, slot), loop = clubMotionAt(epoch + period, slot);
    assert.ok(gap(first, loop) < 1e-7);
    assert.ok(angleGap(first.heading, loop.heading) < 1e-6);
    for (let offset = 0; offset < period; offset += 11) {
      const a = clubMotionAt(epoch + offset - 0.1, slot), b = clubMotionAt(epoch + offset + 0.1, slot);
      assert.ok(gap(a, b) < 0.0003);
      assert.ok(Math.abs(a.speed - b.speed) < 0.001);
      assert.ok(angleGap(a.heading, b.heading) < 0.01);
    }
  }
});

test('distance sampling reconstructs the route for deterministic planted-foot anchors', async () => {
  const { clubMotionAt, clubMotionAtDistance } = await motion();
  for (let slot = 0; slot < 10; slot++) for (let offset = 0; offset < 30_000; offset += 131) {
    const state = clubMotionAt(epoch + offset, slot);
    const sampled = clubMotionAtDistance(slot, state.distance);
    assert.ok(gap(state, sampled) < 0.002, 'inverse arc-length lookup follows the same curve');
  }
});

test('reduced motion is a stable safe pose and malformed clocks never produce NaNs', async () => {
  const { clubMotionAt } = await motion();
  for (let slot = 0; slot < 10; slot++) {
    assert.deepEqual(clubMotionAt(epoch, slot, true), clubMotionAt(epoch + 60_000, slot, true));
    for (const time of [NaN, Infinity, -Infinity]) {
      const state = clubMotionAt(time, slot);
      assert.ok([state.x, state.z, state.heading, state.speed, state.distance].every(Number.isFinite));
    }
  }
});

test('routes give energetic in-place dances substantial time without speeding up walking', async () => {
  const { clubMotionAt } = await motion();
  for (let slot = 0; slot < 10; slot++) {
    let standing = 0, moving = 0;
    for (let offset = 0; offset < 120_000; offset += 83) {
      const state = clubMotionAt(epoch + offset, slot);
      if (state.speed === 0) standing++;
      else moving++;
      assert.ok(state.speed < 0.8, 'dance energy must not accelerate navigation');
    }
    assert.ok(standing / (standing + moving) > 0.42, 'the cast spends enough time actually dancing');
  }
});
