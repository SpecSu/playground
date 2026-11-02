import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { MARINE_SPECIES } = await import('../lib/fishing-catalog.ts');
const { projectFishingAmbientParticipants, FISHING_AMBIENT_COUNT } = await import('../lib/fishing-ambient.ts');

test('two ambient anglers are deterministic, varied and outside human admission slots', () => {
  const now = 1_800_000_025_000;
  const people = projectFishingAmbientParticipants(now);
  assert.equal(FISHING_AMBIENT_COUNT, 2);
  assert.deepEqual(people, projectFishingAmbientParticipants(now));
  assert.equal(new Set(people.map(p => p.preset)).size, 2);
  assert.equal(new Set(people.map(p => p.name)).size, 2);
  assert.deepEqual(people.map(p => p.slot), [10, 11]);
  assert.ok(people.every(p => p.ambient && p.id.startsWith('ambient:') && !('inventory' in p)));
  assert.deepEqual(people.map(p => [p.id,p.name,p.preset]), projectFishingAmbientParticipants(now+90_000).map(p => [p.id,p.name,p.preset]));
});

test('ambient fishing repeatedly casts, gets a bite and displays a stable catch without human commands', () => {
  const phases = new Set(), catches = new Set();
  for (let now=1_800_000_000_000;now<1_800_000_180_000;now+=250) {
    for (const person of projectFishingAmbientParticipants(now)) {
      phases.add(person.fishing.phase);
      if (person.fishing.phase==='holding') {
        assert.ok(person.fishing.catch.caughtAt<=now);
        assert.equal(person.fishing.catch.lengthCm, MARINE_SPECIES.find(s=>s.id===person.fishing.catch.speciesId).fixedCm);
        catches.add(person.fishing.catch.id);
        assert.deepEqual(person.fishing.catch, projectFishingAmbientParticipants(now).find(p=>p.id===person.id).fishing.catch);
      }
      if (person.fishing.phase==='waiting') assert.ok(person.fishing.castAt<=now && person.fishing.biteAt>now);
      if (person.fishing.phase==='bite') assert.ok(person.fishing.biteAt<=now && person.fishing.expiresAt>now);
    }
  }
  assert.deepEqual([...phases].sort(),['bite','holding','idle','waiting']);
  assert.ok(catches.size>=6);
});

class MemoryStore {
 rooms=new Map();visits=new Map();writes=0;
 async ensureRoom(id,state){if(!this.rooms.has(id))this.rooms.set(id,structuredClone(state));}
 async ensureVisit(room,actor,state){const key=room+actor;if(!this.visits.has(key))this.visits.set(key,structuredClone(state));}
 async readState(room,actor){return structuredClone({room:this.rooms.get(room)??null,visit:this.visits.get(room+actor)??null});}
 async commit(room,revision,next,actor,sequence,visit){await Promise.resolve();if(this.rooms.get(room).revision!==revision||(visit&&this.visits.get(room+actor).lastSequence!==sequence))return false;this.rooms.set(room,structuredClone(next));if(visit)this.visits.set(room+actor,structuredClone(visit));this.writes++;return true;}
}
const {createFishingService}=await import('../lib/fishing-server.ts');
test('ambient anglers consume no real seats, visits, inventory, events or tick writes',async()=>{
 let now=1_800_000_000_000;const store=new MemoryStore(),service=createFishingService(store,{now:()=>now});
 const empty=await service.snapshot('ocean','observer');assert.equal(empty.participants.length,0);assert.equal(empty.ambientParticipants.length,2);
 const a=await service.snapshot('ocean','observer'),b=await service.snapshot('ocean','other');assert.deepEqual(a.ambientParticipants,b.ambientParticipants);
 for(let i=0;i<10;i++){now+=500;await service.snapshot('ocean','observer');}
 assert.equal(store.writes,0);assert.equal(store.visits.size,2);assert.equal(store.rooms.get('ocean').events.length,0);
 const results=await Promise.all(Array.from({length:11},(_,i)=>service.command(`person-${i}`,{roomId:'ocean',type:'join',name:'旅人',preset:'cat',sequence:1,requestId:`person-join-${i}`})));
 assert.equal(results.filter(s=>s.self.role==='participant').length,10);assert.equal(results.filter(s=>s.self.role==='spectator').length,1);
 const real=await service.snapshot('ocean','person-0');assert.equal(real.participants.length,10);assert.equal(real.ambientParticipants.length,2);assert.equal(real.self.inventory.total,0);
 await assert.rejects(()=>service.command('ambient:ocean:0',{roomId:'ocean',type:'cast',sequence:1,requestId:'spoof-ambient'}),{code:'FORBIDDEN'});
 await assert.rejects(()=>service.command('person-0',{roomId:'ocean',type:'collect',catchId:'ambient:ocean:0:catch',sequence:2,requestId:'collect-ambient'}),{code:'INVALID_COMMAND'});
 await assert.rejects(()=>service.command('person-0',{roomId:'ocean',type:'heartbeat',sequence:2,requestId:'inject-ambient',ambientParticipants:[]}),{code:'INVALID_COMMAND'});
 assert.equal((await service.snapshot('ocean','person-0')).self.inventory.total,0);
 assert.ok([...store.visits.keys()].every(id=>!id.includes('ambient:')));
});


test('ambient bite deadlines use the same five-second window as real anglers', () => {
  let seen = 0;
  for (let now=1_800_000_000_000;now<1_800_000_060_000;now+=250) {
    for (const { fishing } of projectFishingAmbientParticipants(now)) {
      if (fishing.phase === 'waiting' || fishing.phase === 'bite') {
        assert.equal(fishing.expiresAt - fishing.biteAt, 5000);
        seen++;
      }
    }
  }
  assert.ok(seen > 0);
});

test('ambient animals stay exactly banana cat and miaocuijiao across day seeds and assigned seats',()=>{
 for(let day=20000;day<20060;day++){
  const people=projectFishingAmbientParticipants(day*86400000+25000,[3,8]);
  assert.deepEqual(people.map(p=>p.preset),['banana-cat','milk-frog']);
  assert.deepEqual(people.map(p=>p.slot),[3,8]);
 }
});

test('an existing room gets fixed animals without changing its seats, humans or inventory',async()=>{
 const now=1_800_000_000_000,store=new MemoryStore(),service=createFishingService(store,{now:()=>now});
 await service.command('person',{roomId:'ocean',type:'join',name:'保留昵称',preset:'human-jiji',sequence:1,requestId:'existing-join'});
 const before=await service.snapshot('ocean','person'),persisted=structuredClone(store.rooms.get('ocean')),visit=structuredClone(store.visits.get('oceanperson')),writes=store.writes;
 const after=await service.snapshot('ocean','person');
 assert.deepEqual(after.ambientParticipants.map(p=>p.preset),['banana-cat','milk-frog']);
 assert.deepEqual(after.ambientParticipants.map(p=>p.slot),persisted.ambientSlots);
 assert.deepEqual(after.ambientParticipants.map(p=>p.id),['ambient:ocean:0','ambient:ocean:1']);
 assert.deepEqual(after.ambientParticipants.map(p=>p.name),['香蕉猫','奶蛙']);
 assert.deepEqual(after.participants,before.participants);
 assert.deepEqual(after.self.inventory,before.self.inventory);
 assert.deepEqual(store.rooms.get('ocean'),persisted);
 assert.deepEqual(store.visits.get('oceanperson'),visit);
 assert.equal(store.writes,writes);
});
