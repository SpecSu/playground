import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { MARINE_SPECIES, getSpecies } = await import('../lib/fishing-catalog.ts');
const { createFishingService } = await import('../lib/fishing-server.ts');
const { projectFishingAmbientParticipants } = await import('../lib/fishing-ambient.ts');

const expected={clownfish:12,'blue-tang':24,pufferfish:45,sardine:20,mackerel:42,squid:70,cuttlefish:55,octopus:120,lobster:85,'king-crab':160,'snow-crab':65,salmon:95,'mahi-mahi':150,tuna:220,swordfish:280,sailfish:240,'manta-ray':450,hammerhead:380,oarfish:650,sunfish:300};
test('all twenty species have one canonical, species-appropriate size and increasing rarity scale',()=>{
 assert.deepEqual(Object.fromEntries(MARINE_SPECIES.map(s=>[s.id,s.fixedCm])),expected);
 for(const s of MARINE_SPECIES)assert.ok(s.fixedCm>=s.minCm&&s.fixedCm<=s.maxCm);
 const averages=['common','uncommon','rare','epic','legendary'].map(r=>{const a=MARINE_SPECIES.filter(s=>s.rarity===r);return a.reduce((n,s)=>n+s.fixedCm,0)/a.length;});
 for(let i=1;i<averages.length;i++)assert.ok(averages[i]>averages[i-1]);
 assert.deepEqual(MARINE_SPECIES.map(s=>s.selectionWeight),[12,10,7,14,11,8,6,4,5,2.5,6,8,4,2.7,2,1.8,.8,.7,.3,.7],'species selection probabilities remain unchanged');
});
class Store{rooms=new Map();visits=new Map();async ensureRoom(id,state){if(!this.rooms.has(id))this.rooms.set(id,structuredClone(state));}async ensureVisit(room,actor,state){if(!this.visits.has(room+actor))this.visits.set(room+actor,structuredClone(state));}async readState(room,actor){return{room:structuredClone(this.rooms.get(room)??null),visit:structuredClone(this.visits.get(room+actor)??null)};}async commit(room,revision,next,actor,sequence,visit){if(this.rooms.get(room).revision!==revision||visit&&this.visits.get(room+actor).lastSequence!==sequence)return false;this.rooms.set(room,structuredClone(next));if(visit)this.visits.set(room+actor,structuredClone(visit));return true;}}
test('server reels every species at its canonical size with exactly one random species draw',async()=>{
 const total=MARINE_SPECIES.reduce((n,s)=>n+s.selectionWeight,0);let bucket=0;
 for(const species of MARINE_SPECIES){let now=1800000000000,value=0,draws=0,sequence=0;const service=createFishingService(new Store(),{now:()=>now,random:()=>{draws++;return value;}});const command=(type,extra={})=>service.command('alice',{roomId:'ocean',requestId:`fixed-size-${++sequence}`,sequence,type,...extra});await command('join',{name:'小浪',preset:'cat'});let first;
  for(const fraction of[.25,.75]){value=0;await command('cast');now+=5000;value=(bucket+species.selectionWeight*fraction)/total;const before=draws,caught=(await command('reel')).self.fishing.catch;assert.equal(draws-before,1,'no random length draw');assert.equal(caught.speciesId,species.id);assert.equal(caught.lengthCm,expected[species.id]);assert.ok(caught.weightKg>0);if(first)assert.equal(caught.lengthCm,first.lengthCm);first=caught;const collected=await command('collect',{catchId:caught.id});assert.equal(collected.self.inventory.species[species.id].count,fraction===.25?1:2);}
  bucket+=species.selectionWeight;
 }
});
test('NPC catches share the same per-species canonical sizes without changing their species pool',()=>{
 const seen=new Set();for(let t=1800000000000;t<1800003600000;t+=500){for(const person of projectFishingAmbientParticipants(t)){const caught=person.fishing.catch;if(!caught)continue;const species=getSpecies(caught.speciesId);assert.equal(caught.lengthCm,expected[species.id]);assert.ok(species.minCm<=80,'existing ambient species pool is retained');seen.add(species.id);}}assert.ok(seen.size>8);
});

test('legacy stored lengths remain collectible without deleting or rewriting inventory history',async()=>{
 const store=new Store(),now=1800000000000,service=createFishingService(store,{now:()=>now,random:()=>0});
 await service.command('alice',{roomId:'ocean',requestId:'legacy-fixed-join',sequence:1,type:'join',name:'小浪',preset:'cat'});
 const legacy={id:'legacy-variable-catch',speciesId:'tuna',lengthCm:317.7,weightKg:333.12,caughtAt:now-1000};
 const visit=store.visits.get('oceanalice');visit.fishing={phase:'holding',catch:structuredClone(legacy)};visit.inventory={total:3,species:{tuna:{count:3,largest:structuredClone(legacy)}},recent:[structuredClone(legacy)]};store.rooms.get('ocean').participants[0].fishing=structuredClone(visit.fishing);
 const before=await service.snapshot('ocean','alice');assert.deepEqual(before.self.fishing.catch,legacy);assert.deepEqual(before.self.inventory.recent[0],legacy);
 const after=await service.command('alice',{roomId:'ocean',requestId:'legacy-fixed-collect',sequence:2,type:'collect',catchId:legacy.id});assert.equal(after.self.inventory.total,4);assert.equal(after.self.inventory.species.tuna.count,4);assert.deepEqual(after.self.inventory.recent[0],legacy);assert.equal(getSpecies(legacy.speciesId).fixedCm,220,'renderers use catalog size rather than overwriting this record');
});
