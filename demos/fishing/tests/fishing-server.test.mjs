import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { createFishingService, validateFishingCommand } = await import('../lib/fishing-server.ts');
const { MARINE_SPECIES } = await import('../lib/fishing-catalog.ts');

class MemoryStore {
  rooms = new Map(); visits = new Map(); conflicts = 0;
  async ensureRoom(id, state) { if (!this.rooms.has(id)) this.rooms.set(id, structuredClone(state)); }
  async ensureVisit(room, actor, state) { const k=room+actor;if(!this.visits.has(k))this.visits.set(k,structuredClone(state)); }
  async readState(room,actor) { return {room:structuredClone(this.rooms.get(room)??null),visit:structuredClone(this.visits.get(room+actor)??null)}; }
  async commit(room,revision,next,actor,sequence,visit) { await Promise.resolve();if(this.rooms.get(room).revision!==revision || (visit&&this.visits.get(room+actor).lastSequence!==sequence)){this.conflicts++;return false;}this.rooms.set(room,structuredClone(next));if(visit)this.visits.set(room+actor,structuredClone(visit));return true; }
}
function setup(random=()=>0) { let now=1800000000000;const store=new MemoryStore();const service=createFishingService(store,{now:()=>now,random});let n=0;return {store,service,advance:ms=>now+=ms,cmd:(type,extra={},actor='alice')=>service.command(actor,{roomId:'ocean',requestId:`request-${++n}`,sequence:n,type,...extra}),now:()=>now}; }
const join={name:'小浪',preset:'cat'};
test('catalog contains twenty distinct species with weighted rarities and dramatic scale',()=>{assert.equal(MARINE_SPECIES.length,20);assert.equal(new Set(MARINE_SPECIES.map(s=>s.id)).size,20);assert.ok(MARINE_SPECIES.some(s=>s.maxCm>=600));assert.ok(MARINE_SPECIES.some(s=>s.maxCm<=20));for(const id of ['lobster','tuna','squid','king-crab'])assert.ok(MARINE_SPECIES.some(s=>s.id===id));assert.ok(MARINE_SPECIES.every(s=>s.selectionWeight>0&&s.minCm>0&&s.maxCm>=s.minCm));});
test('cast waits at least five seconds, bite lasts exactly five, early reel rejected',async()=>{const x=setup();await x.cmd('join',join);let s=await x.cmd('cast');assert.equal(s.self.fishing.phase,'waiting');assert.equal(s.self.fishing.biteAt-x.now(),5000);assert.equal(s.self.fishing.expiresAt-s.self.fishing.biteAt,5000);await assert.rejects(()=>x.cmd('reel'),{code:'INVALID_COMMAND'});x.advance(5000);s=await x.service.snapshot('ocean','alice');assert.equal(s.self.fishing.phase,'bite');x.advance(5000);s=await x.cmd('reel');assert.equal(s.self.fishing.phase,'escaped');assert.equal(s.self.inventory.total,0);});
test('random bite never exceeds thirty seconds',async()=>{const x=setup(()=>0.999999999);await x.cmd('join',join);const s=await x.cmd('cast');assert.ok(s.self.fishing.biteAt-x.now()<=30000);assert.ok(s.self.fishing.biteAt-x.now()>29999);});
test('successful reel holds catch, explicit collection persists and duplicate request cannot duplicate',async()=>{const x=setup();await x.cmd('join',join);await x.cmd('cast');x.advance(5000);let s=await x.cmd('reel');const caught=s.self.fishing.catch;assert.equal(s.self.fishing.phase,'holding');assert.equal(s.self.inventory.total,0);assert.ok(caught.id);await assert.rejects(()=>x.cmd('cast'),{code:'INVALID_COMMAND'});const c={roomId:'ocean',requestId:'collect-stable-id',sequence:100,type:'collect',catchId:caught.id};await x.service.command('alice',c);s=await x.service.command('alice',c);assert.equal(s.self.inventory.total,1);assert.equal(s.self.inventory.recent[0].id,caught.id);assert.equal(s.self.fishing.phase,'idle');await assert.rejects(()=>x.service.command('alice',{...c,requestId:'different-collect',sequence:101}),{code:'INVALID_COMMAND'});assert.equal((await x.service.snapshot('ocean','alice')).self.inventory.total,1);});
test('concurrent collections write a single inventory entry atomically',async()=>{const x=setup();await x.cmd('join',join);await x.cmd('cast');x.advance(5000);const caught=(await x.cmd('reel')).self.fishing.catch;const a={roomId:'ocean',requestId:'same-collect-request',sequence:10,type:'collect',catchId:caught.id};const results=await Promise.all([x.service.command('alice',a),x.service.command('alice',a)]);assert.equal(results[0].self.inventory.total,1);assert.equal(results[1].self.inventory.total,1);});
test('eleven simultaneous joins allocate ten real participants and leave the eleventh as spectator',async()=>{const x=setup();const results=await Promise.all(Array.from({length:11},(_,i)=>x.service.command(`guest-${i}`,{roomId:'ocean',requestId:`join-person-${i}`,sequence:1,type:'join',...join})));assert.equal(results.filter(s=>s.self.role==='participant').length,10);assert.equal(results.filter(s=>s.self.role==='spectator').length,1);assert.ok(x.store.conflicts>0);});
test('holding catch survives leave and expired seat, backpack survives rejoin',async()=>{const x=setup();await x.cmd('join',join);await x.cmd('cast');x.advance(5000);const id=(await x.cmd('reel')).self.fishing.catch.id;await x.cmd('leave');x.advance(65000);let s=await x.cmd('join',join);assert.equal(s.self.fishing.catch.id,id);s=await x.cmd('collect',{catchId:id});await x.cmd('leave');s=await x.cmd('join',join);assert.equal(s.self.inventory.total,1);});
test('observer sees casts and held catches but never someone else inventory',async()=>{const x=setup();await x.cmd('join',join);await x.cmd('cast');let s=await x.service.snapshot('ocean','observer');assert.equal(s.participants[0].fishing.phase,'waiting');assert.equal(s.self.inventory.total,0);x.advance(5000);await x.cmd('reel');s=await x.service.snapshot('ocean','observer');assert.equal(s.participants[0].fishing.phase,'holding');assert.ok(s.events.some(e=>e.type==='catch'));assert.equal('inventory' in s.participants[0],false);});
test('spoofed species/timing and reused request IDs are rejected',async()=>{const x=setup();await x.cmd('join',join);await assert.rejects(()=>x.cmd('cast',{biteAt:1}),{code:'INVALID_COMMAND'});await assert.rejects(()=>x.cmd('reel',{speciesId:'tuna'}),{code:'INVALID_COMMAND'});const c={roomId:'ocean',requestId:'same-request-join',sequence:30,type:'join',...join};await x.service.command('alice',c);await assert.rejects(()=>x.service.command('alice',{...c,name:'Changed'}),{code:'REQUEST_CONFLICT'});});
test('expired members cannot reel until boarding and seat heartbeat renews membership',async()=>{const x=setup();await x.cmd('join',join);x.advance(45000);await x.cmd('heartbeat');x.advance(45000);assert.equal((await x.service.snapshot('ocean','alice')).self.role,'participant');x.advance(16000);await assert.rejects(()=>x.cmd('reel'),{code:'NOT_PARTICIPANT'});});

function slots(snapshot) { return [...snapshot.participants, ...snapshot.ambientParticipants].map(p => p.slot); }
test('all twelve physical positions are available randomly without human/NPC collisions', async () => {
 const low=setup(()=>0), high=setup(()=>.999999);
 const a=await low.cmd('join',join), b=await high.cmd('join',join);
 assert.equal(a.capacity,10);
 assert.notDeepEqual(a.ambientParticipants.map(p=>p.slot),b.ambientParticipants.map(p=>p.slot));
 assert.notEqual(a.participants[0].slot,b.participants[0].slot);
 for(const x of [low,high]) {
  for(let i=0;i<9;i++)await x.cmd('join',join,`guest-${i}`);
  const s=await x.service.snapshot('ocean','alice');
  assert.equal(s.participants.length,10);
  assert.equal(s.ambientParticipants.length,2);
  assert.equal(new Set(slots(s)).size,12);
  assert.ok(slots(s).every(slot=>slot>=0&&slot<12));
 }
});
test('refresh, rejoin, and a new service retain shared slots across midnight', async () => {
 const x=setup(()=>.63);const first=await x.cmd('join',join);
 const initialSlots=slots(first);
 assert.deepEqual(slots(await x.cmd('join',join)),initialSlots);
 const restart=createFishingService(x.store,{now:x.now,random:()=>0});
 assert.deepEqual(slots(await restart.snapshot('ocean','viewer')),initialSlots);
 // Hold presence steady while crossing the UTC day boundary.
 x.advance(86_400_000-x.now()%86_400_000-1000);
 x.store.rooms.get('ocean').participants[0].lastSeenAt=x.now();
 await x.cmd('heartbeat');x.advance(2000);
 assert.deepEqual(slots(await x.service.snapshot('ocean','alice')),initialSlots);
});
test('legacy room reload uses original NPC names while player nicknames, chat and event names stay intact', async () => {
 const x=setup();await x.cmd('join',{name:'阿遥',preset:'banana-cat'});
 await x.cmd('chat',{text:'我自己起的昵称'});
 const stored=x.store.rooms.get('ocean');delete stored.ambientSlots;
 const player=structuredClone(stored.participants[0]),events=structuredClone(stored.events);
 const restart=createFishingService(x.store,{now:x.now,random:()=>.5});
 const loaded=await restart.snapshot('ocean','viewer');
 assert.deepEqual(loaded.ambientParticipants.map(p=>p.name),['香蕉猫','奶蛙']);
 assert.deepEqual(loaded.participants[0],player);
 assert.deepEqual(loaded.events,events);
 assert.equal(loaded.participants[0].chat.text,'我自己起的昵称');
 const changed=await x.cmd('profile',{name:'自定义奶蛙',preset:'milk-frog'});
 assert.equal(changed.participants[0].name,'自定义奶蛙');
 assert.equal(changed.events[0].name,'阿遥');
 assert.deepEqual(changed.ambientParticipants.map(p=>p.name),['香蕉猫','奶蛙']);
});
test('leaving makes a seat available while the eleventh visitor waits', async () => {
 const x=setup();for(let i=0;i<10;i++)await x.cmd('join',join,`guest-${i}`);
 const before=await x.service.snapshot('ocean','guest-0');const freed=before.participants[0].slot;
 assert.equal((await x.cmd('join',join,'waiting')).self.role,'spectator');
 await x.cmd('leave',{},'guest-0');const next=await x.cmd('join',join,'waiting');
 assert.equal(next.self.role,'participant');assert.equal(next.participants.find(p=>p.id==='waiting').slot,freed);
 assert.equal(new Set(slots(next)).size,12);
});
test('legacy ten-human room migrates once without kicking anglers or changing inventory', async () => {
 const x=setup();await x.cmd('join',join);await x.cmd('cast');x.advance(5000);await x.cmd('reel');
 const room=x.store.rooms.get('ocean');delete room.ambientSlots;
 const alice=structuredClone(room.participants[0]);
 room.participants=Array.from({length:10},(_,i)=>({...structuredClone(alice),id:i===0?'alice':`legacy-${i}`,slot:i}));
 const before=structuredClone(x.store.visits.get('oceanalice'));
 const [a,b]=await Promise.all([x.service.snapshot('ocean','alice'),x.service.snapshot('ocean','observer')]);
 assert.equal(a.participants.length,10);assert.equal(new Set(slots(a)).size,12);
 assert.deepEqual(x.store.rooms.get('ocean').ambientSlots,a.ambientParticipants.map(p=>p.slot));
 assert.deepEqual(a.ambientParticipants.map(p=>p.slot),b.ambientParticipants.map(p=>p.slot));
 assert.deepEqual(x.store.visits.get('oceanalice'),before);
 assert.equal((await x.cmd('join',join,'newcomer')).self.role,'spectator');
 const caught=a.self.fishing.catch;assert.equal((await x.cmd('collect',{catchId:caught.id})).self.inventory.total,1);
 for(let i=1;i<=3;i++)await x.cmd('leave',{},`legacy-${i}`);
 assert.equal((await x.cmd('join',join,'newcomer')).self.role,'participant');
});

const seatCommand = (slot, sequence = 2, requestId = 'move-seat-stable') => ({ roomId: 'ocean', type: 'move-seat', slot, sequence, requestId });
const selfPerson = snapshot => snapshot.participants.find(person => person.id === snapshot.self.id);
const freeSlots = snapshot => Array.from({ length: 12 }, (_, slot) => slot).filter(slot => !slots(snapshot).includes(slot));

test('move-seat validates an exact integer slot without accepting client identity or movement clocks', () => {
  for (const slot of [0, 11]) assert.deepEqual(validateFishingCommand(seatCommand(slot)), seatCommand(slot));
  for (const slot of [undefined, null, -1, 12, .5, '3', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => validateFishingCommand(seatCommand(slot)), { code: 'INVALID_COMMAND' });
  }
  for (const extra of [{ actorId: 'other' }, { fromSlot: 2 }, { startedAt: 0 }, { endsAt: 0 }, { movement: {} }]) {
    assert.throws(() => validateFishingCommand({ ...seatCommand(3), ...extra }), { code: 'INVALID_COMMAND' });
  }
});

test('idle move atomically claims its destination and projects a server-timed 700 ms hop', async () => {
  const x = setup(), before = await x.cmd('join', join), fromSlot = selfPerson(before).slot;
  const slot = freeSlots(before).at(-1), startedAt = x.now();
  const moved = await x.cmd('move-seat', { slot });
  assert.equal(selfPerson(moved).slot, slot);
  assert.deepEqual(selfPerson(moved).movement, { fromSlot, startedAt, endsAt: startedAt + 700 });
  assert.equal(moved.revision, before.revision + 1);
  assert.deepEqual(moved.self.fishing, before.self.fishing);
  assert.deepEqual(moved.self.inventory, before.self.inventory);
  assert.deepEqual(moved.events, before.events);
  assert.equal(new Set(slots(moved)).size, slots(moved).length);
  const observer = await x.service.snapshot('ocean', 'viewer');
  assert.deepEqual(observer.participants, moved.participants);
  x.advance(699);
  assert.deepEqual(selfPerson(await x.service.snapshot('ocean', 'alice')).movement, selfPerson(moved).movement);
  x.advance(1);
  const landed = await x.service.snapshot('ocean', 'alice');
  assert.equal(selfPerson(landed).movement, undefined);
  assert.equal(selfPerson(landed).slot, slot);
  assert.equal(landed.revision, moved.revision, 'projecting a finished hop needs no write');
});

test('only idle or escaped participants can move; catches and collected inventory remain intact', async () => {
  const x = setup(), joined = await x.cmd('join', join), slot = freeSlots(joined)[0];
  await x.cmd('cast');
  for (const phase of ['waiting', 'bite', 'holding']) {
    if (phase === 'bite') x.advance(5000);
    if (phase === 'holding') await x.cmd('reel');
    const before = await x.store.readState('ocean', 'alice');
    await assert.rejects(x.cmd('move-seat', { slot }), { code: 'INVALID_COMMAND' });
    assert.deepEqual(await x.store.readState('ocean', 'alice'), before);
  }
  const caught = (await x.service.snapshot('ocean', 'alice')).self.fishing.catch;
  const collected = await x.cmd('collect', { catchId: caught.id });
  const moved = await x.cmd('move-seat', { slot });
  assert.equal(selfPerson(moved).slot, slot);
  assert.deepEqual(moved.self.inventory, collected.self.inventory);
  x.advance(700); await x.cmd('cast'); x.advance(10000);
  const escaped = await x.cmd('move-seat', { slot: selfPerson(joined).slot });
  assert.equal(escaped.self.fishing.phase, 'escaped');
  assert.deepEqual(escaped.self.inventory, collected.self.inventory);
});

test('visitors, spectators and ambient actors cannot move a human seat', async () => {
  const x = setup();
  await assert.rejects(x.cmd('move-seat', { slot: 11 }), { code: 'NOT_PARTICIPANT' });
  for (let i = 0; i < 10; i++) await x.cmd('join', join, `guest-${i}`);
  assert.equal((await x.cmd('join', join)).self.role, 'spectator');
  await assert.rejects(x.cmd('move-seat', { slot: 11 }), { code: 'NOT_PARTICIPANT' });
  await assert.rejects(x.cmd('move-seat', { slot: 11 }, 'ambient:ocean:0'), { code: 'FORBIDDEN' });
});

test('human, ambient and current stations are occupied and a rejection changes nothing', async () => {
  const x = setup(); await x.cmd('join', join);
  const joined = await x.cmd('join', join, 'bob');
  for (const slot of slots(joined)) {
    const before = await x.store.readState('ocean', 'alice');
    await assert.rejects(x.cmd('move-seat', { slot }), { code: 'INVALID_COMMAND' });
    assert.deepEqual(await x.store.readState('ocean', 'alice'), before);
  }
});

test('concurrent claims for one empty station have one winner with no overlapping humans or NPCs', async () => {
  const x = setup(); await x.cmd('join', join); const joined = await x.cmd('join', join, 'bob');
  const slot = freeSlots(joined).at(-1);
  const before = Object.fromEntries(await Promise.all(['alice', 'bob'].map(async actor => [actor, await x.store.readState('ocean', actor)])));
  const results = await Promise.allSettled(['alice', 'bob'].map(actor => x.service.command(actor, seatCommand(slot, 10, `${actor}-claim-seat`))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(x.store.conflicts > 0);
  const winner = results.find(result => result.status === 'fulfilled').value.self.id;
  const loser = winner === 'alice' ? 'bob' : 'alice';
  const snapshot = await x.service.snapshot('ocean', loser);
  assert.equal(snapshot.participants.find(person => person.id === winner).slot, slot);
  assert.equal(selfPerson(snapshot).slot, before[loser].room.participants.find(person => person.id === loser).slot);
  assert.equal(selfPerson(snapshot).movement, undefined);
  assert.deepEqual((await x.store.readState('ocean', loser)).visit, before[loser].visit);
  assert.equal(new Set(slots(snapshot)).size, slots(snapshot).length);
});

test('identical concurrent moves and late replay never restart or reverse a hop', async () => {
  const x = setup(), joined = await x.cmd('join', join), [slot, nextSlot] = freeSlots(joined);
  const cmd = seatCommand(slot), beforeTokens = x.store.visits.get('oceanalice').tokens;
  const [a, b] = await Promise.all([x.service.command('alice', cmd), x.service.command('alice', cmd)]);
  assert.deepEqual(selfPerson(a), selfPerson(b));
  assert.equal(a.revision, joined.revision + 1);
  assert.equal(x.store.visits.get('oceanalice').tokens, beforeTokens - 1);
  x.advance(700);
  const replay = await x.service.command('alice', cmd);
  assert.equal(selfPerson(replay).movement, undefined);
  assert.equal(replay.revision, a.revision);
  const movedAgain = await x.service.command('alice', seatCommand(nextSlot, 3, 'move-seat-again'));
  const lateReplay = await x.service.command('alice', cmd);
  assert.deepEqual(selfPerson(lateReplay), selfPerson(movedAgain));
  await assert.rejects(x.service.command('alice', { ...cmd, slot: nextSlot }), { code: 'REQUEST_CONFLICT' });
});

test('movement blocks another hop and casting through its final millisecond without blocking heartbeat', async () => {
  for (const next of ['cast', 'move-seat']) {
    const x = setup(), joined = await x.cmd('join', join), [slot, nextSlot] = freeSlots(joined);
    const moved = await x.cmd('move-seat', { slot });
    for (const advance of [0, 699]) {
      x.advance(advance);
      await assert.rejects(x.cmd('cast'), { code: 'INVALID_COMMAND' });
      await assert.rejects(x.cmd('move-seat', { slot: nextSlot }), { code: 'INVALID_COMMAND' });
    }
    const heartbeat = await x.cmd('heartbeat');
    assert.deepEqual(selfPerson(heartbeat).movement, selfPerson(moved).movement);
    x.advance(1);
    const landed = await x.cmd(next, next === 'move-seat' ? { slot: nextSlot } : {});
    if (next === 'cast') {
      assert.equal(landed.self.fishing.phase, 'waiting');
      assert.equal(selfPerson(landed).movement, undefined);
    } else {
      assert.equal(selfPerson(landed).slot, nextSlot);
      assert.equal(selfPerson(landed).movement.fromSlot, slot);
    }
  }
});

test('seat moves use the normal token bucket and rejected rate limits can retry without losing intent', async () => {
  const x = setup(), joined = await x.cmd('join', join), slot = freeSlots(joined)[0];
  for (let i = 0; i < 15; i++) await x.cmd('heartbeat');
  const before = await x.store.readState('ocean', 'alice'), cmd = seatCommand(slot, 17);
  await assert.rejects(x.service.command('alice', cmd), { code: 'RATE_LIMITED', status: 429 });
  assert.deepEqual(await x.store.readState('ocean', 'alice'), before);
  x.advance(350);
  const moved = await x.service.command('alice', cmd);
  assert.equal(selfPerson(moved).slot, slot);
  assert.equal((await x.service.command('alice', cmd)).revision, moved.revision);
});

test('a move replay beyond receipt retention cannot move the actor again', async () => {
  const x = setup(), joined = await x.cmd('join', join), [slot, nextSlot] = freeSlots(joined);
  const cmd = seatCommand(slot); await x.service.command('alice', cmd);
  x.advance(700); await x.service.command('alice', seatCommand(nextSlot, 3, 'move-seat-second'));
  for (let sequence = 4; sequence < 90; sequence++) {
    x.advance(400);
    await x.service.command('alice', { roomId: 'ocean', type: 'heartbeat', sequence, requestId: `move-heartbeat-${sequence}` });
  }
  await assert.rejects(x.service.command('alice', cmd), { code: 'STALE_SEQUENCE' });
  assert.equal(selfPerson(await x.service.snapshot('ocean', 'alice')).slot, nextSlot);
});

test('persisted three-second casts retain their deadline while the next cast receives five seconds', async () => {
  const x = setup(); await x.cmd('join', join); const cast = await x.cmd('cast');
  // Simulate a room/visit written by the previous deployment. Deployment must
  // not extend an already-issued bite deadline or rewrite the cast identity.
  const legacy = { ...cast.self.fishing, expiresAt: cast.self.fishing.biteAt + 3000 };
  x.store.rooms.get('ocean').participants[0].fishing = structuredClone(legacy);
  x.store.visits.get('oceanalice').fishing = structuredClone(legacy);
  const restarted = createFishingService(x.store, { now: x.now, random: () => 0 });
  x.advance(7999);
  const bite = await restarted.snapshot('ocean', 'alice');
  assert.equal(bite.self.fishing.phase, 'bite');
  assert.equal(bite.self.fishing.expiresAt, legacy.expiresAt);
  assert.equal(bite.self.fishing.castId, legacy.castId);
  x.advance(1);
  const escaped = await restarted.command('alice', { roomId: 'ocean', type: 'reel', sequence: 3, requestId: 'legacy-reel-deadline' });
  assert.equal(escaped.self.fishing.phase, 'escaped');
  const next = await restarted.command('alice', { roomId: 'ocean', type: 'cast', sequence: 4, requestId: 'new-five-second-cast' });
  assert.equal(next.self.fishing.expiresAt - next.self.fishing.biteAt, 5000);
});
