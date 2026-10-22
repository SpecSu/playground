import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceLife, animalScale, bondStage, claimProducts, createLife, feedingResult,
  growthSummary, playWith, settleOffline, settleProducts,
  type LifeState,
} from '../src/v5/life.ts';

const T = Date.UTC(2026, 0, 1, 12);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const feed = (life: LifeState, now: number, manual = true) =>
  feedingResult(life, {now, food: life.stage === 'baby' ? 'milk' : 'feed', manual});
const online = (life: LifeState, now: number, dtMs: number, extra = {}) =>
  advanceLife(life, {now, dtMs, sessionId: 's1', ...extra});
function readyBaby(multiplier: 1 | 240 = 1): LifeState {
  let life = createLife(T, {ageMultiplier: multiplier});
  for (let n = 0; n < 3; n++) {
    life = feed({...life, hunger: 55}, T + n * 30 * MINUTE).life;
  }
  life = online(life, T + 60 * MINUTE + 30_000, 30_000, {exploring: true, withPlayer: true});
  return online(life, T + 61 * MINUTE + 30_000, MINUTE, {safeBedId: 'bed-a'});
}

test('fresh nested life has finite independent needs and no invented care or memories', () => {
  const a = createLife(T);
  const b = createLife(T);
  assert.equal(a.stage, 'baby');
  assert.equal(a.bornAt, T); assert.equal(a.stageAt, T);
  assert.equal(a.hunger, 55); assert.equal(a.energy, 80);
  assert.equal(a.bond, 0); assert.deepEqual(a.memory, []);
  a.care.baby.feeds++;
  assert.equal(b.care.baby.feeds, 0);
  assert.ok(animalScale('baby') < animalScale('juvenile'));
  assert.ok(animalScale('juvenile') < animalScale('adult'));
});

test('legacy bond preserves each old relationship phase and legacy habits do not create milestones', () => {
  const oldAnimal = {id: 'momo', name: '茉茉', appearance: 'starlit', bond: 6,
    habits: {dance: {count: 3, stage: 'invite' as const, lastAt: T - DAY}}};
  const before = structuredClone(oldAnimal);
  const life = createLife(T, {legacyBond: oldAnimal.bond, legacyHabits: oldAnimal.habits});
  const migrated = {...oldAnimal, life};
  assert.deepEqual(oldAnimal, before);
  assert.equal(migrated.id, before.id); assert.equal(migrated.name, before.name);
  assert.equal(migrated.appearance, before.appearance);
  assert.equal(life.bond, 50); assert.equal(life.habits.dance?.stage, 'invite');
  assert.equal(life.habits.dance?.imported, true);
  assert.deepEqual(life.care.baby, {feeds: 0, explorationSessions: [], rests: 0, plays: 0});
  for (const [legacyBond, stage] of [[0, '初识'], [2, '初识'], [3, '熟悉'], [5, '熟悉'],
    [6, '亲近'], [9, '亲近'], [10, '默契'], [12, '默契']] as const) {
    assert.equal(bondStage(createLife(T, {legacyBond}).bond), stage);
  }
});

test('wrong food and full hunger reject without changing history, state or relationship', () => {
  const life = createLife(T);
  const wrong = feedingResult(life, {now: T, food: 'feed'});
  assert.equal(wrong.accepted, false); assert.deepEqual(wrong.life, life);
  const full = {...life, hunger: 80};
  const rejected = feed(full, T);
  assert.equal(rejected.accepted, false); assert.deepEqual(rejected.life, full);
  const older = createLife(T, {stage: 'juvenile'});
  assert.equal(feedingResult(older, {now: T, food: 'milk'}).accepted, false);
});

test('accepted feeding caps H, distinguishes supplements, and observes unscaled 30-minute cooldown', () => {
  const first = feed(createLife(T), T);
  assert.equal(first.accepted, true); assert.equal(first.effective, true);
  assert.equal(first.life.hunger, 85); assert.equal(first.bondAdded, 3);
  const early = feed({...first.life, hunger: 55}, T + 30 * MINUTE - 1);
  assert.equal(early.accepted, true); assert.equal(early.effective, false);
  assert.equal(early.life.care.baby.feeds, 1); assert.equal(early.bondAdded, 0);
  const second = feed({...early.life, hunger: 70}, T + 30 * MINUTE);
  assert.equal(second.effective, true); assert.equal(second.life.hunger, 100);
  const supplement = feed({...second.life, hunger: 79}, T + HOUR);
  assert.equal(supplement.life.hunger, 100); assert.equal(supplement.effective, false);
  assert.equal(supplement.life.lastEffectiveFeedAt, T + 30 * MINUTE);
  assert.equal(first.life.energy, 80);
});

test('helper feeding improves hunger without bonding or owner growth credit', () => {
  const result = feed(createLife(T), T, false);
  assert.equal(result.accepted, true); assert.equal(result.life.hunger, 85);
  assert.equal(result.effective, false); assert.equal(result.life.bond, 0);
  assert.equal(result.life.care.baby.feeds, 0); assert.equal(result.life.lastEffectiveFeedAt, null);
});

test('online needs use supplied elapsed time; real age and demonstration multipliers cannot scale care', () => {
  let life = createLife(T, {ageMultiplier: 240});
  life = online(life, T + DAY, MINUTE, {moving: true});
  assert.equal(life.hunger, 54); assert.equal(life.energy, 79);
  assert.equal(life.stage, 'baby');
  life = online(life, T + DAY + MINUTE, MINUTE, {safeBedId: 'bed'});
  assert.equal(life.energy, 84); assert.equal(life.hunger, 53);
  assert.equal(life.care.baby.rests, 1);
  const first = feed({...life, hunger: 55}, T + DAY + MINUTE);
  const tooSoon = feed({...first.life, hunger: 55}, T + DAY + 2 * MINUTE);
  assert.equal(tooSoon.effective, false);
});

test('uncompleted safe rest resets on interruption, bed switch or session change; finished records stay', () => {
  let life = online(createLife(T), T + 59_000, 59_000, {safeBedId: 'a'});
  assert.equal(life.care.baby.rests, 0);
  life = online(life, T + 60_000, 1000, {moving: true});
  life = online(life, T + 61_000, 1000, {safeBedId: 'a'});
  assert.equal(life.care.baby.rests, 0);
  life = online(life, T + 120_000, 59_000, {safeBedId: 'b'});
  assert.equal(life.care.baby.rests, 0);
  life = online(life, T + 121_000, 1000, {safeBedId: 'b', sessionId: 's2'});
  assert.equal(life.care.baby.rests, 0);
  life = online(life, T + 180_000, 59_000, {safeBedId: 'b', sessionId: 's2'});
  assert.equal(life.care.baby.rests, 1);
  life = online(life, T + 240_000, MINUTE, {safeBedId: 'b', sessionId: 's2'});
  assert.equal(life.care.baby.rests, 1, 'one continuous stay cannot create repeated rest records');
  life = online(life, T + 241_000, 1000, {moving: true});
  assert.equal(life.care.baby.rests, 1);
});

test('suitable exploration needs 30 online seconds and juvenile records different sessions', () => {
  let life = createLife(T, {stage: 'juvenile'});
  life = online(life, T + 29_999, 29_999, {exploring: true, withPlayer: true});
  assert.deepEqual(life.care.juvenile.explorationSessions, []);
  life = online(life, T + 30_000, 1, {exploring: true, withPlayer: true});
  assert.deepEqual(life.care.juvenile.explorationSessions, ['s1']);
  life = online(life, T + 60_000, 30_000, {exploring: true, withPlayer: true});
  assert.equal(life.care.juvenile.explorationSessions.length, 1);
  life = online(life, T + 90_000, 30_000, {exploring: true, withPlayer: true, sessionId: 's2'});
  assert.equal(life.care.juvenile.explorationSessions.length, 2);
  const alone = online(createLife(T), T + 30_000, 30_000, {exploring: true});
  assert.equal(alone.care.baby.explorationSessions.length, 1);
  assert.equal(alone.bond, 0);
});

test('joint exploration bond requires30 full seconds together rather than joining at the last second', () => {
  let life = online(createLife(T), T + 29_000, 29_000, {exploring: true});
  life = online(life, T + 30_000, 1000, {exploring: true, withPlayer: true});
  assert.equal(life.care.baby.explorationSessions.length, 1); assert.equal(life.bond, 0);
  life = online(life, T + 59_000, 29_000, {exploring: true, withPlayer: true});
  assert.equal(life.bond, 2);
});

test('23:59 cannot promote; missing conditions are explicit and completing rest promotes exactly once', () => {
  let life = readyBaby();
  life = settleOffline(life, T + DAY - MINUTE);
  assert.equal(life.stage, 'baby');
  assert.deepEqual(growthSummary(life, T + DAY - MINUTE).missing.map(item => item.kind), ['age']);
  life = settleOffline(life, T + DAY);
  assert.equal(life.stage, 'juvenile'); assert.equal(life.stageAt, T + DAY);
  assert.equal(settleOffline(life, T + DAY).stageAt, T + DAY);
  const missing = {...readyBaby(), care: {...readyBaby().care,
    baby: {...readyBaby().care.baby, rests: 0}}};
  const summary = growthSummary(missing, T + DAY);
  assert.equal(summary.ready, false); assert.deepEqual(summary.missing.map(item => item.kind), ['rest']);
  assert.match(summary.message, /1.*休息/);
  const promoted = online(missing, T + DAY, MINUTE, {safeBedId: 'new-bed'});
  assert.equal(promoted.stage, 'juvenile');
});

test('juvenile gates are new stage records and cannot mature before another 72 real hours', () => {
  let life = settleOffline(readyBaby(), T + DAY);
  assert.deepEqual(life.care.juvenile, {feeds: 0, explorationSessions: [], rests: 0, plays: 0});
  for (let n = 0; n < 6; n++) life = feed({...life, hunger: 55}, T + DAY + n * 30 * MINUTE).life;
  life = online(life, T + DAY + 3 * HOUR, 30_000, {exploring: true, withPlayer: true, sessionId: 'j1'});
  life = online(life, T + DAY + 3 * HOUR + 30_000, 30_000, {exploring: true, withPlayer: true, sessionId: 'j2'});
  life = playWith(life, {now: T + DAY + 3 * HOUR + MINUTE, sessionId: 'j2', action: 'bounce'}).life;
  life = online(life, T + DAY + 3 * HOUR + 2 * MINUTE, MINUTE, {safeBedId: 'bed'});
  life = online(life, T + DAY + 3 * HOUR + 2 * MINUTE + 1000, 1000);
  life = online(life, T + DAY + 3 * HOUR + 3 * MINUTE + 1000, MINUTE, {safeBedId: 'bed'});
  assert.equal(settleOffline(life, T + 4 * DAY - 1).stage, 'juvenile');
  life = settleOffline(life, T + 4 * DAY);
  assert.equal(life.stage, 'adult'); assert.equal(life.products.stored, 0);
});

test('demo 6/18-minute age gates do not complete missing care or promise maturity in 24 minutes', () => {
  const demo = createLife(T, {ageMultiplier: 240});
  const afterSix = settleOffline(demo, T + 6 * MINUTE);
  assert.equal(afterSix.stage, 'baby');
  assert.equal(growthSummary(afterSix, T + 6 * MINUTE).missing.some(item => item.kind === 'age'), false);
  assert.equal(growthSummary(afterSix, T + 24 * MINUTE).missing.some(item => item.kind === 'feed'), true);
  assert.equal(settleOffline(createLife(T), T + 6 * MINUTE).stage, 'baby');
});

test('completed demo care obeys exact6/18-minute stage gates while products still use real12h', () => {
  let life = createLife(T, {ageMultiplier: 240});
  life.care.baby = {feeds: 3, explorationSessions: ['baby-visit'], rests: 1, plays: 0};
  assert.equal(settleOffline(life, T + 6 * MINUTE - 1).stage, 'baby');
  life = settleOffline(life, T + 6 * MINUTE);
  assert.equal(life.stage, 'juvenile');
  life.care.juvenile = {feeds: 6, explorationSessions: ['j1', 'j2'], rests: 2, plays: 1};
  assert.equal(settleOffline(life, T + 24 * MINUTE - 1).stage, 'juvenile');
  life = settleOffline(life, T + 24 * MINUTE);
  assert.equal(life.stage, 'adult');
  assert.equal(claimProducts(life, T + 24 * MINUTE + 3 * MINUTE).materials, 0);
  assert.equal(claimProducts(life, T + 24 * MINUTE + 12 * HOUR).materials, 2);
});

test('daily bond categories grant at most 6+4+2=12 and UTC day renewal never deducts bond', () => {
  let life = createLife(T);
  for (let n = 0; n < 3; n++) life = feed({...life, hunger: 55}, T + n * 30 * MINUTE).life;
  for (let n = 0; n < 3; n++) life = playWith(life,
    {now: T + HOUR + n, sessionId: 's1', action: 'dance'}).life;
  life = online(life, T + HOUR + 30_000, 30_000, {exploring: true, withPlayer: true});
  life = online(life, T + HOUR + MINUTE, 30_000, {exploring: true, withPlayer: true, sessionId: 's2'});
  assert.equal(life.bond, 12); assert.equal(life.daily.total, 12);
  life = settleOffline(life, T + DAY);
  assert.equal(life.bond, 12);
  life = playWith(life, {now: T + DAY, sessionId: 'tomorrow', action: 'dance'}).life;
  assert.equal(life.bond, 14); assert.equal(life.daily.total, 2);
  assert.equal(playWith({...life, bond: 99}, {now: T + DAY, sessionId: 'tomorrow', action: 'love'}).life.bond, 100);
});

test('habits require same-category different sessions on different UTC days; only actual actions accepted', () => {
  let life = createLife(T);
  const first = playWith(life, {now: T, sessionId: 's1', action: 'dance'});
  life = first.life; assert.equal(life.habits.dance?.stage, 'observe');
  const sameDay = playWith(life, {now: T + HOUR, sessionId: 's2', action: 'dance'});
  assert.equal(sameDay.habitProgressed, false);
  life = playWith(sameDay.life, {now: T + DAY, sessionId: 's1', action: 'dance'}).life;
  assert.equal(life.habits.dance?.count, 1);
  life = playWith(life, {now: T + DAY, sessionId: 's2', action: 'dance'}).life;
  assert.equal(life.habits.dance?.stage, 'imitate');
  life = playWith(life, {now: T + 2 * DAY, sessionId: 's3', action: 'love'}).life;
  assert.equal(life.habits.dance?.count, 2); assert.equal(life.habits.love?.count, 1);
  life = playWith(life, {now: T + 2 * DAY, sessionId: 's3', action: 'dance'}).life;
  assert.equal(life.habits.dance?.stage, 'invite');
  const invalid = playWith(life, {now: T + 3 * DAY, sessionId: 's4', action: 'wave' as 'dance'});
  assert.equal(invalid.accepted, false); assert.deepEqual(invalid.life, life);
});

test('offline needs cap hunger loss at20, floor30 and energy100; no milestones, loss or duplicate settlement', () => {
  const before = {...createLife(T, {initialBond: 73}), hunger: 35, energy: 20};
  const settled = settleOffline(before, T + 100 * DAY);
  assert.equal(settled.hunger, 30); assert.equal(settled.energy, 100);
  assert.equal(settled.bond, 73); assert.equal(settled.stage, 'baby');
  assert.deepEqual(settled.care, before.care); assert.deepEqual(settled.memory, before.memory);
  assert.deepEqual(settleOffline(settled, T + 100 * DAY), settled);
  assert.equal(settleOffline(createLife(T), T + DAY).hunger, 35);
  assert.equal(settleOffline({...createLife(T), hunger: 15}, T + DAY).hunger, 15);
  assert.equal(settleOffline({...createLife(T), energy: 10}, T + MINUTE).energy, 15);
});

test('offline interrupts pending online rest/exploration without deleting completed care', () => {
  let life = online(createLife(T), T + 59_000, 59_000, {safeBedId: 'bed'});
  life = settleOffline(life, T + HOUR);
  life = online(life, T + HOUR + 1000, 1000, {safeBedId: 'bed'});
  assert.equal(life.care.baby.rests, 0);
});

test('adult production is real-time 2 per12h capped6, preserves fractions below capacity and claims once', () => {
  const baby = createLife(T);
  assert.equal(claimProducts(baby, T + 100 * DAY).materials, 0);
  let life = createLife(T, {stage: 'adult', ageMultiplier: 240});
  assert.equal(claimProducts(life, T + 6 * MINUTE).materials, 0);
  const first = claimProducts(life, T + 13 * HOUR);
  assert.equal(first.materials, 2); assert.equal(first.life.products.settledAt, T + 12 * HOUR);
  assert.equal(claimProducts(first.life, T + 13 * HOUR).materials, 0);
  assert.equal(claimProducts(first.life, T + 24 * HOUR).materials, 2);
  life = settleProducts(createLife(T, {stage: 'adult'}), T + 100 * DAY);
  assert.equal(life.products.stored, 6);
  const fullClaim = claimProducts(life, T + 101 * DAY);
  assert.equal(fullClaim.materials, 6);
  assert.equal(claimProducts(fullClaim.life, T + 101 * DAY).materials, 0);
  assert.equal(claimProducts(fullClaim.life, T + 101 * DAY + 12 * HOUR - 1).materials, 0);
  assert.equal(claimProducts(fullClaim.life, T + 101 * DAY + 12 * HOUR).materials, 2);
});

test('invalid numbers and backwards real time cannot create NaN or reverse settlement clocks', () => {
  assert.throws(() => createLife(Number.NaN), /finite/i);
  assert.throws(() => createLife(T, {initialBond: Number.POSITIVE_INFINITY}), /finite/i);
  const life = createLife(T);
  assert.throws(() => online(life, T, Number.NaN), /finite/i);
  assert.throws(() => online(life, T, -1), /non-negative/i);
  assert.throws(() => settleOffline(life, Number.NaN), /finite/i);
  assert.deepEqual(settleOffline(life, T - DAY), life);
  assert.equal(growthSummary(life, T - DAY).elapsedMs, 0);
});

test('all successful settlements preserve input state and simultaneous rest/explore cannot double-count time', () => {
  const life = createLife(T);
  const before = structuredClone(life);
  const rested = online(life, T + MINUTE, MINUTE,
    {safeBedId: 'bed', exploring: true, withPlayer: true});
  assert.equal(rested.care.baby.rests, 1);
  assert.equal(rested.care.baby.explorationSessions.length, 0); assert.equal(rested.bond, 0);
  feed(life, T);
  playWith(life, {now: T, sessionId: 's1', action: 'love'});
  settleOffline(life, T + DAY);
  settleProducts(life, T + DAY);
  claimProducts(life, T + DAY);
  assert.deepEqual(life, before);
});
