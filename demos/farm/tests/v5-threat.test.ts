import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThreat, evaluateEvacuation, guardianCommand, stepThreat, threatSummary } from '../src/v5/threat.ts';
import { createLayout, isWalkable, type Layout } from '../src/v5/layout.ts';

test('V5 arithmetic fixtures derive strict timely counts from independent arrivals and door queues', () => {
  const fixture = (kind: 'dog' | 'cat' | 'frog', dense = false, length = 12) => evaluateEvacuation({
    actors: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, doorId: dense || i < 3 ? 'left' : 'right',
      pathLength: dense ? 6 : length, discoveredAt: !dense && kind === 'cat' ? 0 : 6,
      reaction: dense && kind === 'cat' ? 0 : 2 })),
    doors: (dense ? ['left'] : ['left', 'right']).map((id) => ({ id, wolfArrival: 23 + (kind === 'dog' && id === 'left' ? 6 : 0),
      panic: dense ? 2 : 1, calm: kind === 'frog' && id === 'left' ? [{ from: 14, until: 26 }] : [] })),
  });
  assert.deepEqual(['dog', 'cat', 'frog'].map(k => fixture(k as 'dog' | 'cat' | 'frog').timely), [4, 6, 3]);
  assert.deepEqual(['dog', 'cat', 'frog'].map(k => fixture(k as 'dog' | 'cat' | 'frog', true).timely), [4, 3, 6]);
  assert.deepEqual(['dog', 'cat', 'frog'].map(k => fixture(k as 'dog' | 'cat' | 'frog', false, 8).timely), [6, 6, 6]);
  const equality = evaluateEvacuation({ actors: [{ id: 'a', doorId: 'd', arrivalAt: 2 }], doors: [{ id: 'd', wolfArrival: 4, panic: 1 }] });
  assert.equal(equality.timely, 0);
  assert.equal(equality.records[0].enteredAt, 4);
  assert.equal(equality.records[0].exposed, true);
});

const animals = (count = 3) => Array.from({ length: count }, (_, i) => ({ id: `animal-${i}`, position: { x: 4 + i % 2, z: 4 + Math.floor(i / 2) % 2 } }));
const run = (state: ReturnType<typeof createThreat>, layout: Layout, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) state = stepThreat(state, layout, { dt: 0.1 });
  return state;
};

test('tutorial choice freezes its seed, paths and online clocks; all three choices have safe fallback', () => {
  const layout = createLayout();
  for (const guardian of ['dog', 'cat', 'frog'] as const) {
    const waiting = createThreat({ id: `tutorial-${guardian}`, seed: 15, mode: 'tutorial', actors: animals() }, layout);
    assert.deepEqual(stepThreat(waiting, layout, { dt: 50 }), waiting);
    const selection = guardianCommand(waiting, layout, { kind: 'select', guardian });
    assert.equal(selection.ok, true);
    const final = run(selection.state, layout, 65);
    assert.equal(final.phase, 'complete');
    assert.equal(threatSummary(final).safe, 3);
    assert.equal(threatSummary(final).injured, 0);
    assert.equal(threatSummary(final).lost, 0);
    assert.equal(final.rewards, 0);
    assert.ok(final.events.some(e => e.type === 'tutorial-fallback'));
  }
});

test('reservation counts shelter capacity once across doors and is deterministic by distance then stable ID', () => {
  const layout = createLayout();
  const shelter = layout.buildings.find(b => b.kind === 'shelter')!;
  shelter.doors.push({ id: 'second-door', x: 0, z: 2, open: true, paidCost: 8 });
  const actors = Array.from({ length: 7 }, (_, i) => ({ id: `a${6 - i}`, position: { x: 4, z: 4 } }));
  const s = createThreat({ id: 'capacity', seed: 1, mode: 'rehearsal', actors, guardian: 'cat', guardianPosition: { x: 10, z: 0 }, wolfSpawns: [{ x: 11, z: 0 }] }, layout);
  const next = stepThreat(s, layout, { dt: 0.1 });
  const reserved = next.actors.filter(a => a.reservation);
  assert.equal(reserved.length, 6);
  assert.deepEqual(reserved.map(a => a.id).sort(), ['a0', 'a1', 'a2', 'a3', 'a4', 'a5']);
  assert.equal(new Set(reserved.map(a => a.reservation!.slot)).size, 6);
  assert.equal(next.actors.find(a => a.id === 'a6')!.reason, '没有可达的空余保护位');
});

test('door arrival alone is exposed until service admits the actual assigned slot', () => {
  const layout = createLayout();
  let state = createThreat({ id: 'door', seed: 1, mode: 'rehearsal', actors: [{ id: 'a', position: { x: 2, z: 4 } }], guardian: 'cat', guardianPosition: { x: 10, z: 0 }, wolfSpawns: [{ x: 11, z: 0 }] }, layout);
  state = stepThreat(state, layout, { dt: 0.1 });
  state = run(state, layout, 2);
  assert.equal(state.actors[0].status, 'queued');
  assert.equal(state.actors[0].enteredAt, null);
  state = run(state, layout, 3);
  assert.equal(state.actors[0].status, 'safe');
  assert.ok(state.actors[0].enteredAt! > state.actors[0].doorArrivalAt!);
  for (const type of ['discovered', 'depart', 'path', 'door-arrival', 'entry']) assert.ok(state.events.some(e => e.type === type));
});

test('guardian commands reject unreachable points, keep one slot, and frog bubble cancels local calm', () => {
  const layout = createLayout();
  let state = createThreat({ id: 'skills', seed: 1, mode: 'reassure', actors: animals(), guardian: 'frog', guardianPosition: { x: 10, z: 0 }, wolfSpawns: [{ x: 11, z: 0 }] }, layout);
  assert.equal(guardianCommand(state, layout, { kind: 'station', target: { x: 2, z: 2 } }).ok, false);
  assert.equal(guardianCommand(state, layout, { kind: 'select', guardian: 'dog' }).ok, false);
  state = guardianCommand(state, layout, { kind: 'calm' }).state;
  assert.equal(state.guardian!.ability, 'calm');
  state = guardianCommand(state, layout, { kind: 'bubble', wolfId: state.wolves[0].id }).state;
  assert.equal(state.guardian!.ability, 'bubble');
  assert.equal(state.wolves[0].slowedUntil, 4);
  assert.equal(guardianCommand(state, layout, { kind: 'bubble', wolfId: state.wolves[0].id }).ok, false);
  assert.deepEqual(stepThreat(state, layout, { dt: 0 }), state);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('challenge requires explicit whitelisted own participants and never deletes records', () => {
  const layout = createLayout();
  assert.throws(() => createThreat({ id: 'bad', seed: 1, mode: 'challenge', actors: animals(), guardian: 'dog' }, layout), /确认/);
  assert.throws(() => createThreat({ id: 'bad-list', seed: 1, mode: 'challenge', actors: [{ id: 'visitor', position: { x: 4, z: 4 }, role: 'visitor', participant: true }], guardian: 'dog', challengeAuthorized: true, confirmedParticipants: ['visitor'] }, layout), /名单/);
  const state = createThreat({ id: 'no-spawn', seed: 1, mode: 'reassure', actors: animals(), guardian: 'dog' }, layout);
  assert.ok(state.wolves.every(w => !state.actors.some(a => a.position.x === w.position.x && a.position.z === w.position.z)));
});

function exposedFixture(mode: 'reassure' | 'challenge' = 'reassure', participant = 'overflow') {
  const layout = createLayout();
  const actors = [...Array.from({ length: 6 }, (_, i) => ({ id: `in-${i}`, position: { x: 2, z: 4 }, participant: participant === `in-${i}` })),
    { id: 'overflow', position: { x: 0, z: 4 }, participant: participant === 'overflow' }];
  let state = createThreat({ id: `attack-${mode}-${participant}`, mode, seed: 4, actors, guardian: 'frog', guardianPosition: { x: 10, z: 0 },
    wolfSpawns: [{ x: 0, z: 3 }], challengeAuthorized: mode === 'challenge', confirmedParticipants: mode === 'challenge' ? [participant] : undefined }, layout);
  state = guardianCommand(state, layout, { kind: 'station', target: { x: 10, z: 0 } }).state;
  return { layout, state };
}

test('visible attack needs windup then injury then sustained grab before a routed carry', () => {
  const fixture = exposedFixture();
  const before = run(fixture.state, fixture.layout, 2);
  assert.equal(before.actors.find(a => a.id === 'overflow')!.injuredAt, null);
  const injured = run(before, fixture.layout, 1);
  const actor = injured.actors.find(a => a.id === 'overflow')!;
  assert.ok(actor.injuredAt !== null);
  assert.equal(actor.status, 'waiting');
  const grabbed = run(injured, fixture.layout, 4);
  assert.ok(grabbed.events.some(e => e.type === 'carried'));
  const boundary = grabbed.events.find(e => e.type === 'boundary-rescue')!;
  const atBoundary = grabbed.actors.find(a => a.id === 'overflow')!;
  assert.equal(atBoundary.status, 'boundary');
  assert.ok(Math.abs(atBoundary.rescueRemaining! + grabbed.elapsed - boundary.at - 180) < 1e-8);
  assert.deepEqual(stepThreat(grabbed, fixture.layout, { dt: 0 }), grabbed);
  assert.deepEqual(stepThreat(JSON.parse(JSON.stringify(grabbed)), fixture.layout, { dt: 0 }), grabbed);
});

test('drive-off releases at the real carry position and cannot instantly grant shelter safety', () => {
  const fixture = exposedFixture();
  let state = fixture.state;
  for (let i = 0; i < 200 && !state.wolves.some(w => w.status === 'carrying'); i++) state = stepThreat(state, fixture.layout, { dt: 0.05 });
  const wolf = state.wolves.find(w => w.status === 'carrying')!;
  assert.ok(wolf);
  const actual = { ...wolf.position };
  state = stepThreat(state, fixture.layout, { dt: 0.05, driveOff: wolf.id, playerPosition: actual });
  const actor = state.actors.find(a => a.id === 'overflow')!;
  assert.deepEqual(actor.position, actual);
  assert.equal(actor.status, 'evacuating');
  assert.equal(actor.enteredAt, null);
  assert.ok(actor.rescuedAt !== null);
  assert.ok(state.events.some(e => e.type === 'rescue'));
});

test('180 ONLINE seconds can only make a natural animal recoverably lost; confirmed lab list alone may memorialize', () => {
  for (const [mode, participant, expected] of [['reassure', 'overflow', 'lost'], ['challenge', 'overflow', 'memorial'], ['challenge', 'in-0', 'lost']] as const) {
    const fixture = exposedFixture(mode, participant);
    let state = run(fixture.state, fixture.layout, 200);
    assert.equal(state.actors.length, 7);
    assert.equal(state.actors.find(a => a.id === 'overflow')!.status, expected);
    assert.equal(threatSummary(state).memorial, expected === 'memorial' ? 1 : 0);
    assert.equal(threatSummary(state).injured, 1);
    if (expected === 'lost') {
      state = stepThreat(state, fixture.layout, { dt: 0.1, findBackActorId: 'overflow' });
      assert.equal(state.actors.find(a => a.id === 'overflow')!.status, 'evacuating');
      assert.equal(threatSummary(state).lost, 0);
      assert.equal(threatSummary(state).rescued, 1);
      assert.equal(state.rewards, 0);
    }
  }
});

test('boundary rescue requires continuous proximity and three seconds rather than one click', () => {
  const fixture = exposedFixture();
  let state = run(fixture.state, fixture.layout, 8);
  const actual = { ...state.actors.find(a => a.id === 'overflow')!.position };
  state = stepThreat(state, fixture.layout, { dt: 2, rescueActorId: 'overflow', playerPosition: actual });
  assert.equal(state.actors.find(a => a.id === 'overflow')!.status, 'boundary');
  state = stepThreat(state, fixture.layout, { dt: 1, rescueActorId: 'overflow', playerPosition: { x: 10, z: 0 } });
  assert.equal(state.actors.find(a => a.id === 'overflow')!.rescueProgress, 0);
  state = stepThreat(state, fixture.layout, { dt: 3, rescueActorId: 'overflow', playerPosition: actual });
  assert.equal(state.actors.find(a => a.id === 'overflow')!.status, 'evacuating');
  assert.equal(state.actors.find(a => a.id === 'overflow')!.enteredAt, null);
});

test('a cat gathering window already active at discovery removes reaction locally for eight seconds', () => {
  const layout = createLayout();
  let state = createThreat({ id: 'cat-window', seed: 3, mode: 'rehearsal', actors: [{ id: 'near', position: { x: 4, z: 4 } }, { id: 'far', position: { x: 8, z: 4 } }],
    guardian: 'cat', guardianPosition: { x: 4, z: 0 }, wolfSpawns: [{ x: 3, z: 0 }] }, layout);
  state = guardianCommand(state, layout, { kind: 'gather' }).state;
  state = stepThreat(state, layout, { dt: 0.1 });
  assert.equal(state.actors.find(a => a.id === 'near')!.departAt, 0);
  assert.equal(state.actors.find(a => a.id === 'far')!.departAt, 2);
  assert.equal(state.guardian!.abilityUntil, 8);
});

test('LOS and an actual adjacent tower determine discovery instead of a fixed cat bonus', () => {
  const layout = createLayout();
  const blind = createThreat({ id: 'blind', seed: 3, mode: 'rehearsal', actors: [{ id: 'a', position: { x: 5, z: 4 } }], guardian: 'cat', guardianPosition: { x: 4, z: 2 }, wolfSpawns: [{ x: 0, z: 2 }] }, layout);
  assert.equal(stepThreat(guardianCommand(blind, layout, { kind: 'station', target: { x: 4, z: 2 } }).state, layout, { dt: 0.05 }).discoveredAt, null);
  for (let x = 12; x < 18; x++) for (let z = 0; z < 6; z++) layout.owned.push({ x, z });
  const options = { id: 'tower', seed: 3, mode: 'rehearsal' as const, actors: [{ id: 'a', position: { x: 5, z: 4 } }], guardian: 'cat' as const, guardianPosition: { x: 14, z: 0 }, wolfSpawns: [{ x: 3, z: 0 }] };
  const without = guardianCommand(createThreat(options, layout), layout, { kind: 'station', target: { x: 14, z: 0 } }).state;
  assert.equal(stepThreat(without, layout, { dt: 0.05 }).discoveredAt, null);
  layout.buildings.push({ id: 'lookout', kind: 'tower', x: 15, z: 0, rotation: 0, doors: [], paidCost: 12, capacity: 1 });
  assert.equal(stepThreat(createThreat(options, layout), layout, { dt: 0.05 }).discoveredAt, 0);
});

test('dog only blocks one reachable wolf for six seconds and bubble adds only actual remaining path delay', () => {
  const layout = createLayout();
  let dog = createThreat({ id: 'dog-limit', seed: 2, mode: 'rehearsal', actors: animals(), guardian: 'dog', guardianPosition: { x: 1, z: 0 }, wolfSpawns: [{ x: 0, z: 0 }] }, layout);
  dog = guardianCommand(dog, layout, { kind: 'block', wolfId: dog.wolves[0].id }).state;
  dog = run(dog, layout, 6);
  assert.deepEqual(dog.wolves[0].position, { x: 0, z: 0 });
  assert.equal(dog.wolves[0].blockUsed, 6);
  assert.equal(guardianCommand(dog, layout, { kind: 'block', wolfId: dog.wolves[0].id }).ok, false);
  let frog = createThreat({ id: 'bubble-distance', seed: 2, mode: 'rehearsal', actors: animals(), guardian: 'frog', guardianPosition: { x: 0, z: 5 }, wolfSpawns: [{ x: 0, z: 4 }] }, layout);
  frog = guardianCommand(frog, layout, { kind: 'station', target: { x: 0, z: 5 } }).state;
  frog = run(frog, layout, 1.5);
  frog = guardianCommand(frog, layout, { kind: 'bubble', wolfId: frog.wolves[0].id }).state;
  frog = run(frog, layout, 4);
  assert.equal(frog.wolves[0].bubbleDelay, 0.5);
  assert.equal(frog.wolves[0].arrivedAt, 2.5);
});

test('calm expires at its actual local service time; live queue uses the fixture service equation', () => {
  const layout = createLayout();
  let state = createThreat({ id: 'calm-expiry', seed: 2, mode: 'rehearsal', actors: Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, position: { x: 8, z: 4 } })),
    guardian: 'frog', guardianPosition: { x: 5, z: 4 }, wolfSpawns: [{ x: 0, z: 0 }] }, layout);
  state = guardianCommand(state, layout, { kind: 'calm' }).state;
  state = stepThreat(state, layout, { dt: 0.05, playerPosition: { x: 0, z: 1 } });
  state = run(state, layout, 15);
  const fixture = evaluateEvacuation({ actors: state.actors.map(a => ({ id: a.id, doorId: 'd', arrivalAt: 8 })), doors: [{ id: 'd', wolfArrival: 6, panic: 1, calm: [{ from: 0, until: 12 }] }] });
  assert.deepEqual(state.actors.map(a => a.enteredAt), [9, 10, 11, 13]);
  assert.deepEqual(state.actors.map(a => a.enteredAt), fixture.records.map(a => a.enteredAt));
});

test('recoverable lost remains recoverable after an ended event permits a new layout version', () => {
  const fixture = exposedFixture();
  const lost = run(fixture.state, fixture.layout, 200);
  assert.equal(lost.phase, 'complete');
  const revised = structuredClone(fixture.layout);
  revised.version++;
  revised.buildings.push({ id: 'new-shelter', kind: 'shelter', x: 6, z: 0, rotation: 0, paidCost: 24, capacity: 6,
    doors: [{ id: 'new-door', x: 7, z: 3, open: true, paidCost: 0 }] });
  const returned = stepThreat(lost, revised, { dt: 0.1, findBackActorId: 'overflow' });
  assert.equal(returned.actors.find(a => a.id === 'overflow')!.reservation?.buildingId, 'new-shelter');
  assert.equal(threatSummary(returned).lost, 0);
  assert.equal(run(returned, revised, 40).actors.find(a => a.id === 'overflow')!.status, 'safe');
});

test('a service completing just before calm expiry stays complete across a step boundary', () => {
  const layout = createLayout();
  let state = createThreat({ id: 'fractional-calm', seed: 2, mode: 'rehearsal', actors: Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, position: { x: 7, z: 4 } })),
    guardian: 'frog', guardianPosition: { x: 5, z: 4 }, wolfSpawns: [{ x: 0, z: 0 }] }, layout);
  state = guardianCommand(state, layout, { kind: 'calm' }).state;
  state = stepThreat(state, layout, { dt: 0.99 });
  assert.equal(state.discoveredAt, null);
  state = stepThreat(state, layout, { dt: 0.02, playerPosition: { x: 0, z: 1 } });
  state = run(state, layout, 12);
  assert.deepEqual(state.actors.map(a => a.enteredAt), [8.99, 9.99, 10.99, 11.99]);
});

test('shared frog cast lock prevents calm while bubble remains active', () => {
  const layout = createLayout();
  let state = createThreat({ id: 'shared-lock', seed: 1, mode: 'reassure', actors: animals(), guardian: 'frog', guardianPosition: { x: 10, z: 0 }, wolfSpawns: [{ x: 11, z: 0 }] }, layout);
  state = guardianCommand(state, layout, { kind: 'bubble', wolfId: state.wolves[0].id }).state;
  const calm = guardianCommand(state, layout, { kind: 'calm' });
  assert.equal(calm.ok, false);
  assert.match(calm.reason!, /施法/);
});

test('evacuation prefers a real alternative route around a visible wolf without crossing walls', () => {
  const layout = createLayout();
  const state = createThreat({ id: 'avoid-visible', seed: 2, mode: 'rehearsal', actors: [{ id: 'a', position: { x: 0, z: 2 } }],
    guardian: 'cat', guardianPosition: { x: 4, z: 0 }, wolfSpawns: [{ x: 0, z: 4 }] }, layout);
  const actor = stepThreat(state, layout, { dt: 0.05 }).actors[0];
  assert.ok(actor.pathLength > 4);
  assert.equal(actor.path.some(p => p.x === 0 && (p.z === 3 || p.z === 4)), false);
  assert.ok(actor.path.every(p => isWalkable(layout, p)));
  for (let i = 1; i < actor.path.length; i++) assert.equal(Math.abs(actor.path[i].x - actor.path[i - 1].x) + Math.abs(actor.path[i].z - actor.path[i - 1].z), 1);
});

test('cat gather range uses a reachable four-cell route rather than reaching through a shelter wall', () => {
  const layout = createLayout();
  const state = createThreat({ id: 'cat-wall', seed: 2, mode: 'rehearsal', actors: [{ id: 'a', position: { x: 0, z: 2 } }],
    guardian: 'cat', guardianPosition: { x: 4, z: 2 }, wolfSpawns: [{ x: 0, z: 0 }] }, layout);
  assert.equal(stepThreat(state, layout, { dt: 0.05 }).actors[0].departAt, 2);
});

test('twelve actual actors reserve twelve distinct beds across two six-capacity shelters',()=>{
 const layout=createLayout();const first=layout.buildings.find(b=>b.kind==='shelter')!;
 layout.buildings.push({...structuredClone(first),id:'second',x:7,z:0,doors:[{id:'second-door',x:8,z:3,open:true,paidCost:0}],paidCost:24});
 const positions=layout.owned.filter(p=>isWalkable(layout,p)).slice(0,12);
 const state=createThreat({id:'twelve-live',seed:22,mode:'rehearsal',guardian:'cat',guardianPosition:{x:5,z:5},actors:positions.map((position,i)=>({id:`twelve-${i}`,position}))},layout);
 const running=stepThreat(state,layout,{dt:.1,playerPosition:{x:5,z:5}});
 const reservations=running.actors.map(a=>a.reservation).filter(Boolean);assert.equal(running.actors.length,12);assert.equal(reservations.length,12);assert.equal(new Set(reservations.map(r=>`${r!.buildingId}/${r!.slot}`)).size,12);assert.ok(reservations.every(r=>r!.slot<6));
});
