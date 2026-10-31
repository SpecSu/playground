import test from 'node:test';
import assert from 'node:assert/strict';
import {createMinimalState,minimalCommand,eligiblePairs,canPlaceEgg,dayKey,type MinimalAnimal} from '../src/minimal/model.ts';
const now=1_793_000_000_000;
const animal=(id:string,sex:'male'|'female',x=2,z=2):MinimalAnimal=>({id,name:id,species:'cow',sex,size:'normal',position:{x,z},bornAt:now-200000,activity:'idle',activityUntil:now+100000,energy:80,bond:0});
const fixture=()=>{const s=createMinimalState(now);s.welcomeClaimed=true;s.animals=[animal('Alice','female'),animal('Bob','male',2,3)];return s;};
test('full ground space is excluded from eligible pairs and reports truthful reason without consuming chance',()=>{const s=fixture();s.animals=s.tiles.filter(t=>canPlaceEgg({...s,animals:[]},t)).map((t,i)=>animal(`${i}`,i?'male':'female',t.x,t.z));assert.equal(eligiblePairs(s,now).length,0);const r=minimalCommand(s,{type:'breed',animalIds:['0','2']},now);assert.equal(r.accepted,false);assert.match(r.message,/空地/);assert.ok(r.state.animals.every(a=>!a.lastBreedAttemptDay));});
test('capacity and farm daily quota have distinct accurate rejection reasons',()=>{const s=fixture();s.eggs=Array.from({length:14},(_,i)=>({id:`egg-${i}`,source:'shop',species:'cow',sex:'male',size:'normal',location:'bag',boughtAt:now}));assert.match(minimalCommand(s,{type:'breed',animalIds:['Alice','Bob']},now).message,/16/);s.eggs=[];s.breedingDay=dayKey(now);assert.match(minimalCommand(s,{type:'breed',animalIds:['Alice','Bob']},now).message,/今天.*蛋/);});

test('status is pure, chooses stable nearest eligible partner and never substitutes a rejected clicked pair',async()=>{
 const {animalBreedingStatus,breedingPairStatus}=await import('../src/minimal/breeding-status.ts');
 const s=fixture();s.animals.push(animal('Charlie','male',2.4,2),animal('David','male',2,2.4));const before=JSON.stringify(s);
 for(let i=0;i<10;i++){assert.deepEqual(animalBreedingStatus(s,'Alice',now).pair,['Alice','Charlie']);assert.equal(breedingPairStatus(s,['Alice','Bob'],now).code,'ready');}
 assert.equal(JSON.stringify(s),before,'checks neither mutate nor consume sequence/RNG');
 s.animals[1].position={x:0,z:3};const denied=minimalCommand(s,{type:'breed',animalIds:['Alice','Bob']},now);assert.equal(denied.accepted,false);assert.match(denied.message,/走远/);assert.equal(denied.state.lastBreeding,null);assert.ok(denied.state.animals.every(a=>!a.lastBreedAttemptDay));
 const retry=minimalCommand(denied.state,{type:'breed',animalIds:['Alice','Charlie']},now);assert.equal(retry.accepted,true);assert.deepEqual(retry.state.lastBreeding?.animalIds,['Alice','Charlie']);
});
test('status distinguishes young, carried, used chance and absent nearby partner without spending a chance',async()=>{
 const {animalBreedingStatus,breedingPairStatus}=await import('../src/minimal/breeding-status.ts');const s=fixture();
 s.animals[0].bornAt=now;assert.equal(animalBreedingStatus(s,'Alice',now).code,'young');
 s.animals[0].bornAt=now-200000;s.carriedAnimalId='Alice';s.animals[0].activity='carried';assert.equal(breedingPairStatus(s,['Alice','Bob'],now).code,'carried');
 s.carriedAnimalId=null;s.animals[0].activity='idle';s.animals[0].lastBreedAttemptDay=dayKey(now);assert.equal(animalBreedingStatus(s,'Alice',now).code,'attempted');
 delete s.animals[0].lastBreedAttemptDay;s.animals[1].position={x:0,z:3};assert.equal(animalBreedingStatus(s,'Alice',now).code,'partner');assert.equal(s.sequence,0);
});
