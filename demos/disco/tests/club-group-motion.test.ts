import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { clubMotionAt, CLUB_BODY_RADIUS, CLUB_BODY_GAP, CLUB_BOOTH_BOUNDS, CLUB_WALK_BOUNDS } from '../lib/club-scene-motion.ts';

async function group() {
  assert.ok(existsSync(new URL('../lib/club-group-motion.ts', import.meta.url)), 'pure group choreography must exist');
  return import('../lib/club-group-motion.ts');
}
const epoch = 1_791_806_400_000;
const durations = { train: 28000, wave: 14000, unison: 18000 };
function event(kind: keyof typeof durations = 'train', start = epoch) {
  return { id: 'shared-group', kind, version: 1 as const, startsAt: start, endsAt: start + durations[kind], beatMs: 500, sourceClockBySlot: Array.from({ length: 10 }, (_, slot) => start - slot * 500) };
}
function normal(now: number, slot: number) { return clubMotionAt(now - slot * 500, slot); }
const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('group overlay is bounded, deterministic and reconstructs late joins without frame history', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of ['train', 'wave', 'unison'] as const) {
    const action = event(kind);
    for (const outside of [action.startsAt - 3001, action.endsAt, action.endsAt + 1]) assert.equal(clubGroupMotionAt(outside, 3, action, normal(outside, 3)), null);
    const now = action.startsAt + 6700;
    const expected = clubGroupMotionAt(now, 3, action, normal(now, 3));
    assert.ok(expected);
    for (const t of [epoch - 1e6, epoch + 1e6]) clubGroupMotionAt(t, 3, action, normal(t, 3));
    const replay = clubGroupMotionAt(now, 3, action, normal(now, 3));
    assert.deepEqual({ ...replay?.motion, sampleAtDistance: null }, { ...expected.motion, sampleAtDistance: null });
    assert.deepEqual(replay?.pose, expected.pose);
  }
});

test('every action preserves full animated body clearance through ingress, performance and moving-target return', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of ['train', 'wave', 'unison'] as const) for (const offset of [0, 8917, 42033]) {
    const action = event(kind, epoch + offset);
    for (let t = action.startsAt - 3000; t < action.endsAt; t += 29) {
      const poses = Array.from({ length: 10 }, (_, slot) => clubGroupMotionAt(t, slot, action, normal(t, slot))!.motion);
      for (let i = 0; i < 10; i++) {
        const m = poses[i];
        assert.ok([m.x, m.z, m.heading, m.distance, m.speed, m.walkBlend].every(Number.isFinite));
        const u = (m.x - m.z) * Math.SQRT1_2, v = (m.x + m.z) * Math.SQRT1_2;
        assert.ok(u >= CLUB_WALK_BOUNDS.minU - 1e-9 && u <= CLUB_WALK_BOUNDS.maxU + 1e-9);
        assert.ok(v >= CLUB_WALK_BOUNDS.minV - 1e-9 && v <= CLUB_WALK_BOUNDS.maxV + 1e-9);
        const booth = CLUB_BOOTH_BOUNDS;
        const boothGap = Math.hypot(Math.max(booth.minU - u, 0, u - booth.maxU), Math.max(booth.minV - v, 0, v - booth.maxV));
        assert.ok(boothGap >= CLUB_BODY_RADIUS + 0.1 - 1e-9, `${kind} slot ${i} clears DJ at ${t - action.startsAt}`);
        for (let j = i + 1; j < 10; j++) assert.ok(gap(m, poses[j]) >= CLUB_BODY_RADIUS * 2 + CLUB_BODY_GAP - 1e-8, `${kind} slots ${i}/${j} collide at ${t - action.startsAt}`);
      }
    }
  }
});

test('countdown aligns changed occupants to captured slot sources without a jump at group start', async () => {
  const { clubGroupMotionAt } = await group();
  const action = event('train');
  action.sourceClockBySlot[9] = epoch - 10549;
  const begin = epoch - 3000;
  const ordinary = (now: number) => clubMotionAt(now, 9);
  const first = clubGroupMotionAt(begin, 9, action, ordinary(begin))!;
  assert.ok(first);
  assert.ok(gap(first.motion, ordinary(begin)) < 1e-9);
  assert.equal(first.pose.phase, 'prepare');
  assert.equal(first.pose.weight, 0);
  const before = clubGroupMotionAt(epoch - 0.001, 9, action, ordinary(epoch - 0.001))!;
  const after = clubGroupMotionAt(epoch, 9, action, ordinary(epoch))!;
  assert.ok(gap(before.motion, after.motion) < 0.000001, 'old paused actor to new NPC stays continuous at start');
  assert.equal(before.pose.weight, 0);
});

test('entry begins at captured slot route clock and return reaches current effective roam without a pop', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of ['train', 'wave', 'unison'] as const) {
    const action = event(kind);
    for (let slot = 0; slot < 10; slot++) {
      const first = clubGroupMotionAt(action.startsAt, slot, action, normal(action.startsAt, slot))!;
      assert.ok(gap(first.motion, normal(action.startsAt, slot)) < 1e-9);
      const before = action.endsAt - 0.001;
      const last = clubGroupMotionAt(before, slot, action, normal(before, slot))!;
      assert.ok(gap(last.motion, normal(action.endsAt, slot)) < 0.00001);
      assert.ok(Math.abs(last.motion.walkBlend - normal(action.endsAt, slot).walkBlend) < 0.00001, 'normal gait blending is restored without an expiry snap');
      assert.ok(Math.abs(last.motion.distance - normal(action.endsAt, slot).distance) < 0.00001, 'normal planted-foot phase is restored');
      for (const boundary of [2000, 3000, 5000, durations[kind] - 5000, durations[kind] - 3000, durations[kind] - 2000]) {
        const a = clubGroupMotionAt(action.startsAt + boundary - 0.001, slot, action, normal(action.startsAt + boundary - 0.001, slot))!;
        const b = clubGroupMotionAt(action.startsAt + boundary + 0.001, slot, action, normal(action.startsAt + boundary + 0.001, slot))!;
        assert.ok(gap(a.motion, b.motion) < 0.00002, `${kind}/${slot} boundary ${boundary} is continuous`);
      }
    }
  }
});

test('train makes one complete orbit and path samples reconstruct planted-foot contacts', async () => {
  const { clubGroupMotionAt } = await group();
  const action = event('train');
  for (let slot = 0; slot < 10; slot++) {
    const enter = clubGroupMotionAt(epoch + 5000, slot, action, normal(epoch + 5000, slot))!.motion;
    const halfway = clubGroupMotionAt(epoch + 14000, slot, action, normal(epoch + 14000, slot))!.motion;
    const leave = clubGroupMotionAt(epoch + 23000, slot, action, normal(epoch + 23000, slot))!.motion;
    assert.ok(gap(enter, halfway) > 7.99);
    assert.ok(gap(enter, leave) < 1e-9);
    for (let offset = 31; offset < durations.train; offset += 173) {
      const m = clubGroupMotionAt(epoch + offset, slot, action, normal(epoch + offset, slot))!.motion;
      assert.ok(m.sampleAtDistance);
      assert.ok(gap(m, m.sampleAtDistance(m.distance)) < 0.004, `slot ${slot} path inverse at ${offset}`);
    }
  }
});

test('human wave reaches every slot in a staggered pulse while unison beat matches every dancer', async () => {
  const { clubGroupMotionAt } = await group();
  const action = event('wave');
  const peaks = Array.from({ length: 10 }, () => -1);
  for (let t = 5000; t < 9000; t += 10) for (let slot = 0; slot < 10; slot++) {
    const pose = clubGroupMotionAt(epoch + t, slot, action, normal(epoch + t, slot))!.pose;
    assert.ok(pose.wave >= 0 && pose.wave <= 1);
    if (pose.wave > 0.99 && peaks[slot] < 0) peaks[slot] = t;
  }
  assert.ok(peaks.every(t => t >= 0), 'each dancer gets a full raised-arm pulse');
  assert.equal(new Set(peaks).size, 10, 'ten staggered responses, not one simultaneous emote');
  const unison = event('unison');
  const beats = Array.from({ length: 10 }, (_, slot) => clubGroupMotionAt(epoch + 7234, slot, unison, normal(epoch + 7234, slot))!.pose.beat);
  assert.ok(beats.every(beat => beat === beats[0]));
});

test('reduced motion retains safe static local poses and malformed clocks cannot animate', async () => {
  const { clubGroupMotionAt } = await group();
  const action = event();
  for (let slot = 0; slot < 10; slot++) {
    const base = clubMotionAt(epoch, slot, true);
    assert.equal(clubGroupMotionAt(epoch + 9000, slot, action, base, true), null);
    for (const now of [NaN, Infinity, -Infinity]) assert.equal(clubGroupMotionAt(now, slot, action, base), null);
  }
});

test('human wave starts and finishes at rest instead of cutting an arm pulse at formation boundaries', async () => {
  const { clubGroupMotionAt } = await group();
  const action = event('wave');
  for (let slot = 0; slot < 10; slot++) for (const time of [epoch + 5000, epoch + 8999.999]) {
    const sample = clubGroupMotionAt(time, slot, action, normal(time, slot))!;
    assert.ok(sample.pose.wave < 0.000001, `slot ${slot} pulse is quiet at the performance edge`);
  }
});

const v2Durations = { train: 28000, wave: 10000, unison: 18000, battle: 26000, grid: 22000 };
const v2FormationMs = { train: 5000, wave: 0, unison: 4000, battle: 7000, grid: 4000 };
type V2Kind = keyof typeof v2Durations;
function eventV2(kind: V2Kind, start = epoch) {
  return { ...event('train', start), version: 2 as const, kind, endsAt: start + v2Durations[kind] };
}
const expectedTargets: Record<Exclude<V2Kind, 'train' | 'wave'>, number[][]> = {
  // Original authored targets are fitted into the enlarged bodies' reserved
  // cells. Snapshot these new positions without relaxing any clearance checks.
  unison: [[-3.042748, 2.965596], [3.042748, 2.965596], [-3.282398, -.197213], [3.282398, -.197213], [-3.524998, -3.465913], [3.524998, -3.465913], [0, -3.8544], [0, 2.260182], [-1.903174, 5.7573], [1.903174, 5.7573]],
  battle: [[-3.290157, 3.078721], [2.9712, 2.945029], [-3.458073, .034715], [3.32231, -.194213], [-3.448575, -3.168227], [3.630101, -3.875313], [-.618641, -4.1856], [0, 3.470814], [-2.878074, 5.993163], [2.545175, 5.912623]],
  grid: [[-3.116032, 2.986663], [3.116032, 2.986663], [-3.303026, -.195662], [3.303026, -.195662], [-3.458524, -3.206979], [3.458524, -3.206979], [0, -3.8544], [0, 2.269382], [-2.878074, 5.993163], [2.878074, 5.993163]],
};

test('version two fits unison, battles and cell relay formations into enlarged-body territories', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of ['unison', 'battle', 'grid'] as const) {
    const action = eventV2(kind), now = epoch + v2FormationMs[kind] + 1200;
    for (let slot = 0; slot < 10; slot++) {
      const sample = clubGroupMotionAt(now, slot, action, normal(now, slot))!;
      const u = (sample.motion.x - sample.motion.z) * Math.SQRT1_2, v = (sample.motion.x + sample.motion.z) * Math.SQRT1_2;
      assert.ok(Math.hypot(u - expectedTargets[kind][slot][0], v - expectedTargets[kind][slot][1]) < 1e-6, `${kind} slot ${slot} reaches its own formation`);
      assert.equal(sample.pose.phase, 'perform');
    }
  }
});

test('all five version-two routes clear one another and the booth throughout every authored transition', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of Object.keys(v2Durations) as V2Kind[]) for (const offset of [0, 22017, 74091]) {
    const action = eventV2(kind, epoch + offset);
    for (let now = action.startsAt - (kind === 'wave' ? 350 : 3000); now < action.endsAt; now += 31) {
      const states = Array.from({ length: 10 }, (_, slot) => clubGroupMotionAt(now, slot, action, normal(now, slot))!.motion);
      for (let slot = 0; slot < 10; slot++) {
        const state = states[slot], u = (state.x - state.z) * Math.SQRT1_2, v = (state.x + state.z) * Math.SQRT1_2;
        assert.ok([state.x, state.z, state.heading, state.speed, state.distance, state.walkBlend].every(Number.isFinite));
        assert.ok(u >= CLUB_WALK_BOUNDS.minU - 1e-8 && u <= CLUB_WALK_BOUNDS.maxU + 1e-8 && v >= CLUB_WALK_BOUNDS.minV - 1e-8 && v <= CLUB_WALK_BOUNDS.maxV + 1e-8);
        const b = CLUB_BOOTH_BOUNDS;
        assert.ok(Math.hypot(Math.max(b.minU - u, 0, u - b.maxU), Math.max(b.minV - v, 0, v - b.maxV)) >= CLUB_BODY_RADIUS + .1 - 1e-8, `${kind}/${slot} booth clearance`);
        for (let j = slot + 1; j < 10; j++) assert.ok(gap(state, states[j]) >= 2 * CLUB_BODY_RADIUS + CLUB_BODY_GAP - 1e-8, `${kind} ${slot}/${j} collision at ${now - action.startsAt}`);
        assert.ok(state.sampleAtDistance && gap(state, state.sampleAtDistance(state.distance)) < .004, `${kind}/${slot} foot path matches root`);
      }
    }
  }
});

test('new formations restore current normal position and gait at expiry and fit the legacy loop to the same floor', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of Object.keys(v2Durations) as V2Kind[]) for (let slot = 0; slot < 10; slot++) {
    const action = eventV2(kind), now = action.endsAt - .001;
    const final = clubGroupMotionAt(now, slot, action, normal(now, slot))!;
    assert.ok(gap(final.motion, normal(action.endsAt, slot)) < .00001);
    assert.ok(Math.abs(final.motion.walkBlend - normal(action.endsAt, slot).walkBlend) < .00001);
    assert.ok(Math.abs(final.motion.distance - normal(action.endsAt, slot).distance) < .00001);
    assert.equal(clubGroupMotionAt(action.endsAt, slot, action, normal(action.endsAt, slot)), null);
    assert.equal(clubGroupMotionAt(epoch + 9000, slot, action, normal(epoch + 9000, slot), true), null);
  }
  const legacy = event('wave');
  for (let slot = 0; slot < 10; slot++) {
    const old = clubGroupMotionAt(epoch + 6000, slot, legacy, normal(epoch + 6000, slot))!;
    const u = (old.motion.x - old.motion.z) * Math.SQRT1_2, v = (old.motion.x + old.motion.z) * Math.SQRT1_2;
    const qU = Math.abs(u) - 2.2, qV = Math.abs(v - .9) - 3.1;
    const perimeterDistance = Math.hypot(Math.max(qU, 0), Math.max(qV, 0)) + Math.min(Math.max(qU, qV), 0) - 2;
    assert.ok(Math.abs(perimeterDistance) < 1e-8, 'version-one events use a radius-two rounded perimeter inside the original 8.4 × 10.2 metre walk bounds');
  }
});

test('battle alternates two opposing teams through its final complete turn', async () => {
  const { clubGroupMotionAt } = await group();
  const action = eventV2('battle'), start = epoch + v2FormationMs.battle;
  const activation = (offset: number, slot: number) => clubGroupMotionAt(start + offset, slot, action, normal(start + offset, slot))!.pose.activation ?? 1;
  assert.ok(activation(1100, 6) > .9 && activation(1100, 5) < .1, 'left side calls first');
  assert.ok(activation(3100, 6) < .1 && activation(3100, 5) > .9, 'right side answers four beats later');
  assert.ok(activation(11000, 6) < .1 && activation(11000, 5) > .9, 'the final right-side answer stays alternating');
  const left = clubGroupMotionAt(start + 1100, 6, action, normal(start + 1100, 6))!.motion;
  const right = clubGroupMotionAt(start + 1100, 5, action, normal(start + 1100, 5))!.motion;
  assert.ok(Math.abs(Math.cos(left.heading - right.heading) + 1) < 1e-8, 'the columns face each other');
});

test('battle somersaults keep the full scaled 1.8 metre swept envelope outside the booth', async () => {
  const { clubGroupMotionAt } = await group();
  const action = eventV2('battle'), b = CLUB_BOOTH_BOUNDS;
  for (let now = action.startsAt + v2FormationMs.battle; now < action.endsAt - v2FormationMs.battle; now += 29) {
    for (let slot = 0; slot < 10; slot++) {
      const sample = clubGroupMotionAt(now, slot, action, normal(now, slot))!;
      if (sample.pose.backflipElapsedMs === undefined || sample.pose.backflipElapsedMs < 0) continue;
      const u = (sample.motion.x - sample.motion.z) * Math.SQRT1_2, v = (sample.motion.x + sample.motion.z) * Math.SQRT1_2;
      assert.ok(Math.hypot(Math.max(b.minU - u, 0, u - b.maxU), Math.max(b.minV - v, 0, v - b.maxV)) >= 1.8, `slot ${slot} flip clears solid scenery`);
    }
  }
});

test('cell relay has isolated early turns, alternating checkerboards and a shared final jump', async () => {
  const { clubGroupMotionAt } = await group();
  const action = eventV2('grid'), start = epoch + v2FormationMs.grid;
  const activations = (offset: number) => Array.from({ length: 10 }, (_, slot) => clubGroupMotionAt(start + offset, slot, action, normal(start + offset, slot))!.pose.activation ?? 1);
  const early = activations(700);
  assert.ok(early.filter(value => value > .5).length >= 1 && early.filter(value => value > .5).length <= 2, 'early cell turns are visibly local');
  const checker = activations(7800);
  assert.ok(checker.filter(value => value > .8).length >= 3 && checker.filter(value => value < .2).length >= 3, 'middle phase uses opposing checkerboard cells');
  assert.ok(activations(13000).every(value => value > .9), 'last phase gathers all ten dancers');
});

const v2Boundaries: Record<V2Kind, number[]> = {
  train: [0, 2000, 3000, 5000, 23000, 25000, 26000, 28000],
  wave: [0, 8800, 10000],
  unison: [0, 2000, 4000, 14000, 16000, 18000],
  battle: [0, 2000, 3000, 5000, 7000, 19000, 21000, 23000, 24000, 26000],
  grid: [0, 2000, 4000, 18000, 20000, 22000],
};

test('every version-two waypoint and performance boundary is position and heading continuous', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of Object.keys(v2Durations) as V2Kind[]) for (let slot = 0; slot < 10; slot++) {
    const action = eventV2(kind);
    for (const offset of v2Boundaries[kind].slice(0, -1)) {
      const aTime = epoch + offset - .001, bTime = epoch + offset + .001;
      const a = clubGroupMotionAt(aTime, slot, action, normal(aTime, slot))!.motion;
      const b = clubGroupMotionAt(bTime, slot, action, normal(bTime, slot))!.motion;
      assert.ok(gap(a, b) < .00003, `${kind}/${slot} continuous root at ${offset}`);
      assert.ok(Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading))) < .0001, `${kind}/${slot} continuous heading at ${offset}`);
    }
  }
});

test('linear waypoint segments analytically reserve the full body gap between all forty-five dancer pairs', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of ['unison', 'battle', 'grid'] as const) {
    const action = eventV2(kind), boundaries = v2Boundaries[kind].slice(0, -1);
    for (let segment = 0; segment < boundaries.length - 1; segment++) {
      if (boundaries[segment] === v2FormationMs[kind]) continue; // Stationary performance, already checked.
      const start = epoch + boundaries[segment], finish = epoch + boundaries[segment + 1];
      const a = Array.from({ length: 10 }, (_, slot) => clubGroupMotionAt(start, slot, action, normal(start, slot))!.motion);
      const b = Array.from({ length: 10 }, (_, slot) => clubGroupMotionAt(finish, slot, action, normal(finish, slot))!.motion);
      for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
        const x = a[i].x - a[j].x, z = a[i].z - a[j].z;
        const dx = b[i].x - b[j].x - x, dz = b[i].z - b[j].z - z;
        const denominator = dx * dx + dz * dz;
        const t = denominator ? Math.min(1, Math.max(0, -(x * dx + z * dz) / denominator)) : 0;
        assert.ok(Math.hypot(x + t * dx, z + t * dz) >= 2 * CLUB_BODY_RADIUS + CLUB_BODY_GAP - 1e-8, `${kind}/${i}/${j} whole segment ${segment} clears`);
      }
    }
  }
});

test('full-radius, tall jumping bodies remain on the existing floor and inside the default overview', async () => {
  const { ClubCameraController } = await import('../lib/club-camera.ts');
  const THREE = await import('three');
  const { stagePosition } = await import('../lib/club-scene-math.ts');
  const camera = new ClubCameraController().update({ width: 402, height: 575, mode: 'overview', orbit: { yaw: 0, pitch: 0 }, deltaSeconds: 1 / 40, reducedMotion: false, subject: null });
  for (const u of [CLUB_WALK_BOUNDS.minU, CLUB_WALK_BOUNDS.maxU]) for (const v of [CLUB_WALK_BOUNDS.minV, CLUB_WALK_BOUNDS.maxV]) {
    for (const y of [0, 3.5]) for (let angle = 0; angle < 64; angle++) {
      const p = stagePosition(u + Math.cos(angle * Math.PI / 32), v + Math.sin(angle * Math.PI / 32));
      assert.ok(Math.abs(p.x) < 9 && Math.abs(p.z) < 9, 'one-metre body envelope stays on18m floor');
      const projection = new THREE.Vector3(p.x, y, p.z).project(camera);
      assert.ok(Math.abs(projection.x) < .97 && Math.abs(projection.y) < .97, 'body envelope remains framed by default overview');
    }
  }
});

test('grid finales settle before returning at real catalog tempos', async () => {
  const { clubGroupMotionAt } = await group();
  for (const kind of ['grid'] as const) for (const bpm of [120, 123.125, 133.075]) {
    const action = { ...eventV2(kind), beatMs: 60000 / bpm };
    const returningAt = action.endsAt - v2FormationMs[kind];
    for (let slot = 0; slot < 10; slot++) {
      const activation = (now: number) => clubGroupMotionAt(now, slot, action, normal(now, slot))!.pose.activation!;
      assert.ok(activation(returningAt - 500) > .99, 'the shared finale remains fully active before settling');
      assert.ok(Math.abs(activation(returningAt - .001) - activation(returningAt + .001)) < 1e-6,
        `${kind}/${slot}/${bpm} cannot cut an airborne pose off at the return boundary`);
      let previous = activation(returningAt - 300);
      for (let now = returningAt - 299; now < returningAt; now++) {
        const current = activation(now);
        assert.ok(current <= previous + 1e-9 && previous - current < .01, 'the final settling envelope is gradual and monotonic');
        previous = current;
      }
    }
  }
});

test('battle schedules complete backflips for alternating teams and never cuts a flip at return', async () => {
  const { clubGroupMotionAt } = await group();
  const { backflipAt, BACKFLIP_DURATION_MS } = await import('../lib/club-backflip.ts');
  for (const bpm of [120, 123.125, 133.075]) {
    const action = { ...eventV2('battle'), beatMs: 60000 / bpm };
    const start = action.startsAt + v2FormationMs.battle;
    const end = action.endsAt - v2FormationMs.battle;
    const pose = (offset: number, slot: number) => clubGroupMotionAt(start + offset, slot, action, normal(start + offset, slot))!.pose;
    const block = Math.max(BACKFLIP_DURATION_MS + 100, action.beatMs * 4);
    assert.equal(pose(880, 6).backflipElapsedMs, 880, 'left team starts a complete phrase');
    assert.equal(pose(880, 5).backflipElapsedMs, -1, 'right team waits grounded');
    assert.ok(Math.abs(pose(block + 880, 5).backflipElapsedMs! - 880) < 1e-4, 'right team answers');
    assert.equal(pose(block + 880, 6).backflipElapsedMs, -1);
    for (let slot = 0; slot < 10; slot++) {
      let airborne = false, flights = 0;
      for (let now = start; now < end; now += 10) {
        const sample = clubGroupMotionAt(now, slot, action, normal(now, slot))!;
        assert.equal(typeof sample.pose.backflipElapsedMs, 'number');
        const next = backflipAt(sample.pose.backflipElapsedMs!).lift > 0;
        if (next && !airborne) flights++;
        airborne = next;
      }
      assert.ok(flights >= 2 && flights <= 3, 'each team gets bounded, separated somersaults');
      const settled = pose(end - start - .001, slot);
      assert.equal(backflipAt(settled.backflipElapsedMs!).lift, 0);
      assert.equal(backflipAt(settled.backflipElapsedMs!).rotation, 0);
    }
  }
});


test('wave starts where the cast already is and immediately performs without walking into rows', async () => {
  const { clubGroupMotionAt } = await group();
  const action = eventV2('wave');
  for (let slot = 0; slot < 10; slot++) {
    const source = normal(action.startsAt, slot);
    for (const elapsed of [0, 100, 500, 2000, 5000, 8700]) {
      const now = action.startsAt + elapsed;
      const sample = clubGroupMotionAt(now, slot, action, normal(now, slot))!;
      assert.ok(sample, 'starts without the old seven-second formation');
      assert.equal(sample.pose.phase, 'perform');
      assert.ok(gap(sample.motion, source) < 1e-9, 'holds its captured current spot instead of seeking a wave formation');
      assert.equal(sample.motion.walkBlend, 0);
      assert.equal(sample.motion.speed, 0);
    }
    assert.equal(clubGroupMotionAt(action.startsAt - 351, slot, action, normal(action.startsAt - 351, slot)), null);
    const before = clubGroupMotionAt(action.startsAt - 100, slot, action, normal(action.startsAt - 100, slot))!;
    assert.ok(gap(before.motion, normal(action.startsAt - 100, slot)) < 1e-9, 'brief count-in has no positioning');
  }
});
