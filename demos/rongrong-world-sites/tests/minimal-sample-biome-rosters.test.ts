import test from 'node:test';import assert from 'node:assert/strict';
import {sampleFarm} from '../src/minimal/sample-farms.ts';
import {VisitorSession} from '../src/minimal/visitor-session.ts';
import {tileAt,createMinimalState,isWalkableTile} from '../src/minimal/model.ts';
import {isSafeAnimalArrival} from '../src/minimal/interaction-motion.ts';
import {prepareSampleModels,clearSampleModels} from './helpers/sample-model-fixture.ts';
const NOW=1_800_000_000_000;
const counts=(id:string)=>sampleFarm(id,NOW).state.animals.reduce((out,a)=>({...out,[a.species]:(out[a.species]??0)+1}),{} as Record<string,number>);
test('sample rosters match admitted biome identities rather than repeating the same farm animals',()=>{
 assert.deepEqual(counts('oasis'),{alpaca:3,bunny:2});assert.deepEqual(counts('glacier'),{penguin:4});assert.deepEqual(counts('forest'),{duck:4,cow:1});assert.deepEqual(counts('lunar'),{});
 for(const id of ['oasis','glacier','forest'])for(const animal of sampleFarm(id,NOW).state.animals){const tile=tileAt(sampleFarm(id,NOW).state,animal.position)!;assert.notEqual(tile.terrain,'pond');assert.notEqual(tile.terrain,'creek');if(['bunny','cow'].includes(animal.species))assert.equal(tile.terrain,'meadow','green habitat for ordinary grazers');if(animal.species==='penguin'){assert.equal(tile.terrain,'glacier');assert.notEqual(animal.activity,'graze');}}
});
test('actual admitted alpaca and penguin support safe placement, temporary carry and zero economic mutation',async()=>{
 await prepareSampleModels();try{const home=createMinimalState(NOW),original=JSON.stringify(home);
  for(const id of ['oasis','glacier','forest']){const visitor=VisitorSession.sample(id,NOW),s=visitor.state;
   for(const animal of s.animals)assert.ok(isSafeAnimalArrival(s,animal,NOW,animal.position,{free:()=>true,ground:p=>isWalkableTile(s,p)&&!['creek','pond'].includes(tileAt(s,p)?.terrain??'')}),`${id} ${animal.name} dry footprint`);
   const animal=s.animals[0],owner=visitor.ownerOf(animal.id);assert.equal(visitor.command({type:'care',animalId:animal.id},NOW).accepted,true);assert.equal(visitor.command({type:'pickup',animalId:animal.id},NOW).accepted,true);assert.equal(visitor.state.carriedAnimalId,animal.id);assert.deepEqual(visitor.ownerOf(animal.id),owner);assert.equal(visitor.command({type:'putdown'},NOW).accepted,true);
   for(const type of ['sellAnimal','exchange','breed','paintTerrain'])assert.equal(visitor.command({type},NOW).accepted,false);visitor.tick(NOW+30_000);assert.equal(visitor.state.coins,0);assert.deepEqual(visitor.state.eggs,[]);assert.deepEqual(visitor.state.gifts,[]);visitor.dispose();assert.equal(visitor.state.carriedAnimalId,null);
  }assert.equal(JSON.stringify(home),original);
 }finally{await clearSampleModels();}
});
test('missing scoped resources cannot be greeted or picked up as invisible or substitute animals',async()=>{
 await clearSampleModels();const v=VisitorSession.sample('glacier',NOW),a=v.state.animals[0],before=v.state;
 assert.equal(a.species,'penguin');assert.equal(v.command({type:'care',animalId:a.id},NOW).accepted,false);assert.equal(v.command({type:'pickup',animalId:a.id},NOW).accepted,false);assert.deepEqual(v.state,before);
});
