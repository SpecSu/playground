import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandEstate, createEstate, currentProfile, settleEstate, settleProfileOffline,
  type Estate} from '../src/v5/estate.ts';
import {findPath, type Building} from '../src/v5/layout.ts';

const T = Date.UTC(2026, 2, 1, 12);
let seq = 0;
function command(state: Estate, type: string, now: number, extra = {}) {
  return commandEstate(state, {id: `finance-${++seq}`, type, session: currentProfile(state).session, ...extra}, now);
}
function fixture(distance = 4): Estate {
  const state = commandEstate(createEstate('finance-owner', T), {id: 'finance-session', type: 'enter'}, T).state;
  const p = currentProfile(state); p.tutorial = 'done'; p.threat = null; p.animals = [];
  const factory: Building = {id: 'factory-finance', kind: 'factory', x: 2, z: 2, rotation: 0, paidCost: 20, doors: [], capacity: 12};
  const trough: Building = {id: 'trough-finance', kind: 'trough', x: 2 + distance, z: 0, rotation: 0, paidCost: 8, doors: [], capacity: 6};
  p.layout.buildings = [factory, trough];
  for (let x = 12; x < 18; x++) for (let z = 0; z < 6; z++) p.layout.owned.push({x, z});
  p.position = {x: 2, z: 1}; p.path = [];
  p.factory = {stock: 6, ms: 0, at: T};
  assert.equal(findPath(p.layout, p.position, {x: 2 + distance, z: 1})!.length - 1, distance);
  return state;
}
function pulse(state: Estate, now: number): Estate {
  const result = command(state, 'pulse', now); assert.equal(result.accepted, true, result.message); return result.state;
}
function start(state: Estate): Estate {
  const result = command(state, 'delivery', T, {target: 'trough-finance'});
  assert.equal(result.accepted, true, result.message); return result.state;
}

test('fresh food remains exactly6; empty actual troughs do not mint starting food', () => {
  const p = currentProfile(createEstate('fresh-food', T));
  assert.equal(p.inventory.hand + p.inventory.pantry + p.factory.stock
    + Object.values(p.troughFood ?? {}).reduce((sum, n) => sum + n, 0), 6);
});

for (const [distance, unloadedAt, returnedAt] of [[4, 20_000, 24_000], [12, 44_000, 56_000]] as const) {
  test(`actual L${distance} delivery loads2s, walks1cell/s, unloads2s: six food at${unloadedAt / 1000}s, returns at${returnedAt / 1000}s`, () => {
    let state = start(fixture(distance)); let lastUnload = 0; let completed = 0;
    for (let elapsed = 1000; elapsed <= returnedAt; elapsed += 1000) {
      state = pulse(state, T + elapsed); const p = currentProfile(state);
      if ((p.troughFood?.['trough-finance'] ?? 0) === 6 && !lastUnload) lastUnload = elapsed;
      if (!p.job && !completed) completed = elapsed;
      assert.ok((p.troughFood?.['trough-finance'] ?? 0) <= 6);
    }
    const p = currentProfile(state);
    assert.equal(lastUnload, unloadedAt); assert.equal(completed, returnedAt);
    assert.equal(p.troughFood?.['trough-finance'], 6); assert.equal(p.factory.stock, 0);
    assert.deepEqual(p.position, {x: 2, z: 1}); assert.equal(p.inventory.hand, 3);
    assert.equal(p.inventory.pantry, 3 + Math.floor(returnedAt / 30_000) * 3, 'delivery does not unload into the workbench pantry');
  });
}

test('partial trough unload keeps remainder held until return and refunds it exactly once', () => {
  let state = fixture(); currentProfile(state).troughFood = {'trough-finance': 5}; state = start(state);
  for (let i = 1; i <= 8; i++) state = pulse(state, T + i * 1000);
  assert.equal(currentProfile(state).troughFood?.['trough-finance'], 6);
  assert.equal(currentProfile(state).job?.carried, 2); assert.equal(currentProfile(state).job?.phase, 'back');
  assert.match(currentProfile(state).notice, /满|剩|退/);
  for (let i = 9; i <= 15; i++) state = pulse(state, T + i * 1000);
  const p = currentProfile(state);
  assert.equal(p.job, null); assert.equal(p.factory.stock, 5); assert.equal(p.troughFood?.['trough-finance'], 6);
  assert.equal(p.factory.stock + p.troughFood!['trough-finance'], 11);
});

test('target filled during travel cancels and returns held food once without overfilling', () => {
  let state = start(fixture()); state = pulse(state, T + 1000); state = pulse(state, T + 2000);
  assert.equal(currentProfile(state).job?.carried, 3);
  currentProfile(state).troughFood = {'trough-finance': 6};
  state = pulse(state, T + 3000); assert.equal(currentProfile(state).job, null);
  assert.equal(currentProfile(state).factory.stock, 6); assert.match(currentProfile(state).notice, /满/);
  state = pulse(state, T + 4000); assert.equal(currentProfile(state).factory.stock, 6);
});

test('deleted or blocked target returns held food rather than losing it', () => {
  for (const removed of [true, false]) {
    let state = start(fixture()); state = pulse(state, T + 1000); state = pulse(state, T + 2000);
    const p = currentProfile(state);
    if (removed) p.layout.buildings = p.layout.buildings.filter(b => b.id !== 'trough-finance');
    else p.layout.buildings.push({id: 'blocked-cell', kind: 'decor', x: 3, z: 1, rotation: 0, capacity: 0, paidCost: 2, doors: []});
    state = pulse(state, T + 3000);
    assert.equal(currentProfile(state).job, null); assert.equal(currentProfile(state).factory.stock, 6);
    assert.match(currentProfile(state).notice, /路线|断|目标|食槽/);
  }
});

test('trough refill consumes only selected actual stock while free pantry stays separate', () => {
  let state = fixture(); const p = currentProfile(state); p.inventory.hand = 1;
  p.troughFood = {'trough-finance': 2}; p.position = {x: 6, z: 1};
  p.job = {id: 'trough-refill', type: 'refill', target: 'trough-finance', progress: 0, phase: 'walk', to: {x: 6, z: 1}};
  state = pulse(state, T + 1000); state = pulse(state, T + 2000);
  assert.equal(currentProfile(state).inventory.hand, 3);
  assert.equal(currentProfile(state).troughFood?.['trough-finance'], 0);
  assert.equal(currentProfile(state).inventory.pantry, 3);
});

test('factory55online seconds plus5offline seconds complete one interval and repeated GETs preserve the remainder', () => {
  let state = fixture(); currentProfile(state).factory.stock = 0;
  for (let i = 1; i <= 55; i++) state = pulse(state, T + i * 1000);
  const p = currentProfile(state); assert.equal(p.factory.ms, 55_000); assert.equal(p.factory.stock, 0);
  settleProfileOffline(p, T + 60_000);
  assert.equal(p.factory.stock, 3); assert.equal(p.factory.ms, 0);
  state = settleEstate(state, T + 65_000); state = settleEstate(state, T + 65_000);
  assert.equal(currentProfile(state).factory.stock, 3); assert.equal(currentProfile(state).factory.ms, 5000);
  state = settleEstate(state, T + 120_000);
  assert.equal(currentProfile(state).factory.stock, 6); assert.equal(currentProfile(state).factory.ms, 0);
});

test('full factory pauses fractional production and reserves room to return carried food', () => {
  let state = fixture(); const p = currentProfile(state);
  p.factory = {stock: 9, ms: 55_000, at: T};
  p.job = {id: 'return-space', type: 'delivery', target: 'trough-finance', phase: 'back', progress: 0,
    carried: 3, rounds: 1, source: {x: 2, z: 1}, to: {x: 6, z: 1}};
  p.position = {x: 6, z: 1}; p.path = findPath(p.layout, p.position, p.job.source!)!;
  state = pulse(state, T + 1000);
  assert.equal(currentProfile(state).factory.ms, 0); assert.equal(currentProfile(state).factory.stock, 9);
  for (let i = 2; i <= 4; i++) state = pulse(state, T + i * 1000);
  assert.equal(currentProfile(state).factory.stock, 12); assert.equal(currentProfile(state).job, null);
  state = settleEstate(state, T + 86400_000);
  assert.equal(currentProfile(state).factory.stock, 12); assert.equal(currentProfile(state).factory.ms, 0);
});

test('delivery honors the specifically selected owned trough rather than always the first',()=>{const s=fixture(4),p=currentProfile(s);p.layout.buildings.push({id:'second-selected',kind:'trough',x:9,z:0,rotation:0,paidCost:8,capacity:6,doors:[]});const r=command(s,'delivery',T,{target:'second-selected'});assert.equal(r.accepted,true,r.message);assert.equal(currentProfile(r.state).job?.target,'second-selected');});
