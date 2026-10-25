import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_ISLANDS} from '../lib/game/demo-catalogue.js';

const ranking = await import('../lib/game/simulated-ranking.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const {simulatedIncomeForNpc, mergeIncomeRankingRows} = ranking;
const saturday = Date.UTC(2026, 9, 24, 6, 30);
const monday = Date.UTC(2026, 9, 25, 16); // Monday 00:00 in Beijing.

test('display helpers are available without a server or persistence dependency', () => {
  assert.equal(typeof simulatedIncomeForNpc, 'function');
  assert.equal(typeof mergeIncomeRankingRows, 'function');
});

test('each NPC has a stable positive income tier and its week covers every daily amount', () => {
  const today = DEMO_ISLANDS.map(npc => simulatedIncomeForNpc(npc.uid, saturday));
  assert.equal(new Set(today.map(value => value.day)).size, 4);
  assert.equal(new Set(today.map(value => value.week)).size, 4);
  for (const npc of DEMO_ISLANDS) {
    const income = simulatedIncomeForNpc(npc.uid, saturday);
    assert.deepEqual(simulatedIncomeForNpc(npc.uid, saturday + 1000), income);
    assert.ok(Number.isSafeInteger(income.day) && income.day > 0);
    assert.ok(Number.isSafeInteger(income.week) && income.week >= income.day);
    for (let day = 0; day < 7; day++) {
      const daily = simulatedIncomeForNpc(npc.uid, monday + day * 86400000);
      assert.ok(daily.week >= daily.day, `${npc.uid} on day ${day}`);
    }
  }
  assert.equal(simulatedIncomeForNpc('qa-real-player', saturday), null);
});

test('daily values change at Beijing midnight, not UTC midnight', () => {
  const midnight = Date.UTC(2026, 9, 24, 16);
  const utcMidnight = Date.UTC(2026, 9, 24);
  for (const npc of DEMO_ISLANDS) {
    const before = simulatedIncomeForNpc(npc.uid, midnight - 1);
    const after = simulatedIncomeForNpc(npc.uid, midnight);
    assert.notEqual(after.day, before.day, npc.uid);
    assert.equal(after.week, before.week, npc.uid);
    assert.deepEqual(simulatedIncomeForNpc(npc.uid, utcMidnight - 1), simulatedIncomeForNpc(npc.uid, utcMidnight));
  }
});

test('weekly values stay stable until the Monday Beijing boundary', () => {
  for (const npc of DEMO_ISLANDS) {
    const before = simulatedIncomeForNpc(npc.uid, monday - 1);
    const after = simulatedIncomeForNpc(npc.uid, monday);
    assert.notEqual(after.week, before.week, npc.uid);
    assert.equal(after.week, simulatedIncomeForNpc(npc.uid, monday + 7 * 86400000 - 1).week);
  }
});

test('real people and all four NPCs share descending income order and continuous ranks', () => {
  const realRows = [
    {uid: 'qa-self', rank: 1, income: 300, registered: true, self: true, profile: {name: 'Me', avatar: 'milk-frog'}},
    {uid: 'qa-friend', rank: 2, income: 1000, registered: true, self: false, profile: {name: 'Friend', avatar: 'banana-cat'}},
  ];
  const rows = mergeIncomeRankingRows(realRows, 'day', saturday);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rows.map(row => row.uid), ['demo-bear', 'demo-kelly', 'qa-friend', 'demo-frog', 'qa-self', 'demo-cat']);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].income >= rows[i].income);
  const self = rows.find(row => row.self);
  assert.equal(self.uid, 'qa-self');
  assert.equal(self.income, 300);
  assert.deepEqual(self.profile, realRows[0].profile);
  assert.equal(self.simulated, false);
  for (const npc of DEMO_ISLANDS) {
    const row = rows.find(row => row.uid === npc.uid);
    assert.equal(row.simulated, true);
    assert.equal(row.registered, true);
    assert.equal(row.self, false);
    assert.deepEqual(row.profile, {name: npc.name, avatar: npc.avatar});
    assert.equal(row.theme, npc.theme);
  }
});

test('equal income sorts by UID regardless of input order, without skipped ranks', () => {
  const realRows = [{uid: 'qa-zebra', income: 0}, {uid: 'qa-alpha', income: 0}];
  const rows = mergeIncomeRankingRows(realRows, 'week', saturday);
  assert.deepEqual(rows.slice(-2).map(row => [row.uid, row.rank]), [['qa-alpha', 5], ['qa-zebra', 6]]);
  assert.deepEqual(mergeIncomeRankingRows([...realRows].reverse(), 'week', saturday), rows);
});

test('merging does not mutate real data, duplicate NPCs, or mix day and week amounts', () => {
  const profile = Object.freeze({name: 'Me', avatar: 'milk-frog'});
  const real = Object.freeze({uid: 'qa-self', income: 9, rank: 77, profile, self: true, registered: true});
  const rows = Object.freeze([real, Object.freeze({uid: 'demo-bear', income: 999999, rank: 1})]);
  const before = structuredClone(rows);
  const day = mergeIncomeRankingRows(rows, 'day', saturday);
  const week = mergeIncomeRankingRows(rows, 'week', saturday);
  assert.deepEqual(rows, before);
  assert.equal(day.length, 5);
  assert.equal(new Set(day.map(row => row.uid)).size, 5);
  assert.equal(day.find(row => row.uid === 'qa-self').income, 9);
  assert.equal(week.find(row => row.uid === 'qa-self').income, 9);
  for (const npc of DEMO_ISLANDS) {
    const amounts = simulatedIncomeForNpc(npc.uid, saturday);
    assert.equal(day.find(row => row.uid === npc.uid).income, amounts.day);
    assert.equal(week.find(row => row.uid === npc.uid).income, amounts.week);
  }
  assert.equal(mergeIncomeRankingRows(undefined, 'day', saturday).length, 4);
});
