import test from 'node:test';
import assert from 'node:assert/strict';
import {animalScale,advanceMinimalState,createMinimalState,isAdult,loadMinimalState,saveMinimalState,sellValue,minimalCommand,MINIMAL_STORAGE_KEY,type MinimalAnimal,type AnimalSize} from '../src/minimal/model.ts';

const bornAt=1_793_000_000_000;
const sizes:AnimalSize[]=['normal','large','giant'];
const birthScales=[1,1.3,1.8];
const adultScales=[1.25,1.625,2.2];
const animal=(size:AnimalSize):MinimalAnimal=>({id:`cow-${size}`,name:'小牛',species:'cow',sex:'female',size,position:{x:2,z:2},activity:'idle',energy:80,bond:0,bornAt,activityUntil:bornAt+99_000});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} ≈ ${expected}`);

test('legacy newborn sizes retain their existing normal, large and giant floors',()=>{
 sizes.forEach((size,i)=>assert.equal(animalScale(animal(size),bornAt),birthScales[i]));
});

test('legacy birth sizes retain the original smooth monotone growth curve',()=>{
 sizes.forEach((size,i)=>{
  const a=animal(size),span=adultScales[i]-birthScales[i];
  close(animalScale(a,bornAt+60_000/2),birthScales[i]+span/2);
  close(animalScale(a,bornAt+60_000/4),birthScales[i]+span*.15625);
  let previous=birthScales[i];
  for(let age=1;age<=60_000;age+=137){const scale=animalScale(a,bornAt+age);assert.ok(scale>=previous&&scale<=adultScales[i]);previous=scale;}
  close(animalScale(a,bornAt+60_000),adultScales[i]);
 });
});

test('backwards clocks stay at birth size and mature animals never grow without limit',()=>{
 sizes.forEach((size,i)=>{
  const a=animal(size);
  assert.equal(animalScale(a,bornAt-86_400_000),birthScales[i]);
  close(animalScale(a,bornAt+365*86_400_000),adultScales[i]);
 });
});

test('visible growth does not mutate birth classification, resources or resale values',()=>{
 sizes.forEach((size,i)=>{
  const a=animal(size),before=structuredClone(a);
  assert.ok(animalScale(a,bornAt+60_000)>animalScale(a,bornAt));
  assert.deepEqual(a,before);
  assert.equal(a.size,size);
  assert.equal(sellValue(a),[40,65,100][i]);
  assert.equal(isAdult(a,bornAt+60_000-1),false);
  assert.equal(isAdult(a,bornAt+60_000),true);
 });
});

test('offline reload derives mature size from birth time without extra eggs or currency',()=>{
 const s=createMinimalState(bornAt);s.coins=73;s.animals=[animal('giant')];
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 assert.equal(saveMinimalState(storage,s),true);
 const later=bornAt+86_400_000;
 const restored=loadMinimalState(storage,later);
 assert.equal(restored.animals.length,1);
 assert.equal(restored.animals[0].bornAt,bornAt);
 assert.equal(restored.animals[0].size,'giant');
 close(animalScale(restored.animals[0],later),2.2);
 assert.equal(restored.coins,73);
 assert.deepEqual(restored.eggs,[]);
 assert.equal(restored.animals[0].energy,advanceMinimalState(s,later).animals[0].energy);
 assert.equal(saveMinimalState(storage,restored),true);
 close(animalScale(loadMinimalState(storage,later).animals[0],later),2.2);
});

function hatched(sequence=0){
 let state=createMinimalState(bornAt);state.sequence=sequence;
 state=minimalCommand(state,{type:'welcome'},bornAt).state;state.player={x:1,z:1};
 state=minimalCommand(state,{type:'buyEgg'},bornAt).state;
 const egg=structuredClone(state.eggs[0]);
 state=minimalCommand(state,{type:'placeEgg',eggId:egg.id,at:{x:1,z:1}},bornAt).state;
 const result=minimalCommand(state,{type:'hatch',eggId:egg.id},bornAt+10_000);
 assert.equal(result.accepted,true);
 return {state:result.state,egg,animal:result.state.animals[0],message:result.message};
}

test('new hatches visibly start as babies and cannot breed until the second minute ends',()=>{
 const {animal:a}=hatched();
 assert.ok(animalScale(a,a.bornAt)>=.6 && animalScale(a,a.bornAt)<1,'newborn is small but visible');
 assert.ok(animalScale(a,a.bornAt)<animalScale(a,a.bornAt+60_000));
 assert.ok(animalScale(a,a.bornAt+60_000)<animalScale(a,a.bornAt+120_000));
 assert.equal(isAdult(a,a.bornAt+60_000),false,'juvenile is not adult at 60 seconds');
 assert.equal(isAdult(a,a.bornAt+119_999),false);
 assert.equal(isAdult(a,a.bornAt+120_000),true);
});

test('stage labels, countdowns and progress share exact 60 and 120 second boundaries',async()=>{
 const m=await import('../src/minimal/model.ts');
 assert.equal(typeof m.animalGrowthStage,'function','shared stage helper exists');
 const {animal:a}=hatched();
 for(const [age,stage,label,remaining,progress] of [
  [0,'baby','幼崽',60_000,0],
  [30_000,'baby','幼崽',30_000,.5],
  [59_999,'baby','幼崽',1,59_999/60_000],
  [60_000,'juvenile','少年',60_000,0],
  [90_000,'juvenile','少年',30_000,.5],
  [119_999,'juvenile','少年',1,59_999/60_000],
  [120_000,'adult','成年',0,1],
  [86400_000,'adult','成年',0,1],
 ] as const){
  assert.equal(m.animalGrowthStage(a,a.bornAt+age),stage);
  assert.equal(m.animalGrowthLabel(a,a.bornAt+age),label);
  assert.equal(m.animalGrowthRemainingMs(a,a.bornAt+age),remaining);
  close(m.animalGrowthProgress(a,a.bornAt+age),progress);
 }
});

test('eggs save distinct ordered growth endpoints and hatch without rerolling them',()=>{
 const endpoints=new Set<string>();let minAdult=Infinity,maxAdult=0;
 for(let sequence=0;sequence<100;sequence++){
  const {egg,animal:a}=hatched(sequence);
  assert.ok(egg.growth,'growth potential is chosen when the egg is bought');
  assert.deepEqual(a.growth,egg.growth);
  assert.ok(a.growth);
  const [baby,juvenile,adult]=a.growth.scales;
  assert.ok(baby>=.6&&baby<1&&baby<juvenile&&juvenile<adult&&adult<=2.2);
  assert.equal(animalScale(a,a.bornAt),baby);
  assert.equal(animalScale(a,a.bornAt+60_000),juvenile);
  assert.equal(animalScale(a,a.bornAt+120_000),adult);
  endpoints.add(JSON.stringify(a.growth));minAdult=Math.min(minAdult,adult);maxAdult=Math.max(maxAdult,adult);
 }
 assert.equal(endpoints.size,100,'separate individuals are not restricted to three preset scales');
 assert.ok(minAdult<1&&maxAdult>2,'small and very large adults are both possible');
});

function memory(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}

test('forward ticks checkpoint growth so a clock rollback cannot shrink or demote animals',async()=>{
 const m=await import('../src/minimal/model.ts');const {state,animal:a}=hatched();
 const forward=advanceMinimalState(state,a.bornAt+90_000),atNinety=animalScale(forward.animals[0],a.bornAt+90_000);
 const rollback=advanceMinimalState(forward,a.bornAt+15_000);
 assert.equal(rollback.updatedAt,forward.updatedAt);
 assert.equal(animalScale(rollback.animals[0],a.bornAt+15_000),atNinety);
 assert.equal(m.animalGrowthStage(rollback.animals[0],a.bornAt+15_000),'juvenile');
 assert.equal(m.animalGrowthRemainingMs(rollback.animals[0],a.bornAt+15_000),30_000);
 const adult=advanceMinimalState(forward,a.bornAt+120_000);
 assert.equal(isAdult(adult.animals[0],a.bornAt),true);
 assert.equal(animalScale(adult.animals[0],a.bornAt),a.growth!.scales[2]);
 const storage=memory();assert.equal(saveMinimalState(storage,adult),true);
 const restored=loadMinimalState(storage,a.bornAt-60_000);
 assert.equal(animalScale(restored.animals[0],a.bornAt-60_000),a.growth!.scales[2]);
 assert.equal(isAdult(restored.animals[0],a.bornAt-60_000),true);
});

test('legacy saved adult status and visible size survive first load during a clock rollback',()=>{
 for(const size of sizes){
  const legacy=createMinimalState(bornAt);legacy.animals=[animal(size)];legacy.updatedAt=bornAt+65_000;
  const storage=memory();storage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(legacy));
  const restored=loadMinimalState(storage,bornAt+15_000);
  assert.equal(restored.animals.length,1);
  assert.equal(restored.animals[0].bornAt,bornAt);
  assert.equal(restored.animals[0].growth,undefined,'legacy profile is not randomly replaced');
  assert.equal(isAdult(restored.animals[0],bornAt+15_000),true);
  assert.equal(animalScale(restored.animals[0],bornAt+15_000),animalScale(legacy.animals[0],legacy.updatedAt));
 }
});

test('invalid growth profiles and elapsed floors cannot overwrite a valid save',()=>{
 const {state}=hatched();
 const invalidProfiles:unknown[]=[null,{},[],{version:2,scales:[.6,1,2]},
  {version:1,scales:[.59,1,2]},{version:1,scales:[.6,1,2.21]},
  {version:1,scales:[.9,.8,1.2]},{version:1,scales:[.6,1.4,1.2]},
  {version:1,scales:[.8,.8,.8]},{version:1,scales:[.6,1]},
  {version:1,scales:[.6,1,2,2]},{version:1,scales:[.6,NaN,2]},
  {version:1,scales:[.6,1,Infinity]},{version:1,scales:[.6,'1',2]}];
 for(const growth of invalidProfiles){
  const storage=memory();assert.equal(saveMinimalState(storage,state),true);const previous=storage.getItem(MINIMAL_STORAGE_KEY);
  const bad=structuredClone(state);Object.assign(bad.animals[0],{growth});
  assert.equal(saveMinimalState(storage,bad),false,JSON.stringify(growth));
  assert.equal(storage.getItem(MINIMAL_STORAGE_KEY),previous);
  const eggOnly=createMinimalState(bornAt);eggOnly.welcomeClaimed=true;eggOnly.coins=60;eggOnly.player={x:1,z:1};
  const eggs=minimalCommand(eggOnly,{type:'buyEgg'},bornAt).state;Object.assign(eggs.eggs[0],{growth});
  assert.equal(saveMinimalState(memory(),eggs),false);
 }
 for(const growthAgeMs of [-1,120_001,NaN,Infinity,'100',null]){
  const bad=structuredClone(state);Object.assign(bad.animals[0],{growthAgeMs});
  assert.equal(saveMinimalState(memory(),bad),false,String(growthAgeMs));
 }
 const equalEndpoint=structuredClone(state);equalEndpoint.animals[0].growth={version:1,scales:[.6,.6,1]};
 assert.equal(saveMinimalState(memory(),equalEndpoint),true,'equal neighboring stages are allowed if adulthood is larger than birth');
});

test('new profiles stay monotone at every tick across both stage transitions',()=>{
 for(let sequence=0;sequence<30;sequence++){
  const {animal:a}=hatched(sequence);const before=structuredClone(a);let previous=animalScale(a,a.bornAt);
  for(let age=0;age<=120_100;age+=71){const scale=animalScale(a,a.bornAt+age);assert.ok(scale>=previous&&scale>=.6&&scale<=2.2);previous=scale;}
  for(const boundary of [60_000,120_000])assert.ok(animalScale(a,a.bornAt+boundary)>=animalScale(a,a.bornAt+boundary-1));
  assert.equal(animalScale(a,a.bornAt-60_000),a.growth!.scales[0]);
  assert.equal(animalScale(a,a.bornAt+365*86_400_000),a.growth!.scales[2]);
  assert.deepEqual(a,before,'view helpers never mutate the profile or financial classification');
  assert.equal(sellValue(a),a.size==='giant'?100:a.size==='large'?65:40);
 }
});

test('new profile and offline growth survive save reload without changes to coins or eggs',()=>{
 const {state,animal:a}=hatched();const storage=memory();
 state.coins=73;assert.equal(saveMinimalState(storage,state),true);
 const juvenile=loadMinimalState(storage,a.bornAt+90_000);
 assert.deepEqual(juvenile.animals[0].growth,a.growth);
 assert.equal(isAdult(juvenile.animals[0],juvenile.updatedAt),false);
 assert.equal(saveMinimalState(storage,juvenile),true);
 const reloaded=loadMinimalState(storage,juvenile.updatedAt);
 assert.equal(animalScale(reloaded.animals[0],reloaded.updatedAt),animalScale(juvenile.animals[0],juvenile.updatedAt));
 const adult=loadMinimalState(storage,a.bornAt+7*86400_000);
 assert.equal(isAdult(adult.animals[0],adult.updatedAt),true);
 assert.equal(animalScale(adult.animals[0],adult.updatedAt),a.growth!.scales[2]);
 assert.equal(adult.coins,73);assert.deepEqual(adult.eggs,[]);assert.equal(adult.animals.length,1);
 assert.deepEqual(adult.animals[0].growth,a.growth);
});

test('egg potential survives bag refresh and incubation without rerolling any outcome',()=>{
 let state=createMinimalState(bornAt);state.welcomeClaimed=true;state.coins=60;state.player={x:1,z:1};
 state=minimalCommand(state,{type:'buyEgg'},bornAt).state;const egg=structuredClone(state.eggs[0]);
 const storage=memory();assert.equal(saveMinimalState(storage,state),true);
 state=loadMinimalState(storage,bornAt+100_000);assert.deepEqual(state.eggs[0],egg);
 state=minimalCommand(state,{type:'placeEgg',eggId:egg.id,at:{x:1,z:1}},state.updatedAt).state;
 assert.equal(saveMinimalState(storage,state),true);
 state=loadMinimalState(storage,bornAt+120_000);
 const result=minimalCommand(state,{type:'hatch',eggId:egg.id},state.updatedAt);assert.equal(result.accepted,true);
 const a=result.state.animals[0];assert.deepEqual(a.growth,egg.growth);
 assert.deepEqual([a.species,a.sex,a.size],[egg.species,egg.sex,egg.size]);
 assert.equal(animalScale(a,a.bornAt),egg.growth!.scales[0]);
});

test('legacy eggs without a profile hatch deterministic new babies after refresh',()=>{
 let state=createMinimalState(bornAt);state.welcomeClaimed=true;state.coins=60;state.player={x:1,z:1};
 state=minimalCommand(state,{type:'buyEgg'},bornAt).state;delete state.eggs[0].growth;
 state=minimalCommand(state,{type:'placeEgg',eggId:state.eggs[0].id,at:{x:1,z:1}},bornAt).state;
 const storage=memory();assert.equal(saveMinimalState(storage,state),true);
 const first=minimalCommand(loadMinimalState(storage,bornAt+10_000),{type:'hatch',eggId:state.eggs[0].id},bornAt+10_000);
 const second=minimalCommand(loadMinimalState(storage,bornAt+90_000),{type:'hatch',eggId:state.eggs[0].id},bornAt+90_000);
 assert.equal(first.accepted,true);assert.equal(second.accepted,true);
 assert.deepEqual(first.state.animals[0].growth,second.state.animals[0].growth,'hatch timing cannot reroll an old egg');
 assert.equal(isAdult(second.state.animals[0],bornAt+90_000),false);
});

test('care and carry preserve individual growth while growth continues in the owners arms',()=>{
 const {state,animal:a}=hatched();const profile=structuredClone(a.growth);
 const care=minimalCommand(state,{type:'care',animalId:a.id},state.updatedAt);assert.equal(care.accepted,true);
 assert.deepEqual(care.state.animals[0].growth,profile);
 const picked=minimalCommand(care.state,{type:'pickup',animalId:a.id},state.updatedAt);assert.equal(picked.accepted,true);
 const carried=advanceMinimalState(picked.state,a.bornAt+90_000);
 assert.equal(carried.animals[0].activity,'carried');assert.equal(carried.carriedAnimalId,a.id);
 assert.deepEqual(carried.animals[0].growth,profile);
 assert.ok(animalScale(carried.animals[0],carried.updatedAt)>animalScale(a,a.bornAt));
 const dropped=minimalCommand(carried,{type:'putdown',at:{x:2,z:1}},carried.updatedAt);assert.equal(dropped.accepted,true);
 assert.deepEqual(dropped.state.animals[0].growth,profile);
 assert.equal(animalScale(dropped.state.animals[0],carried.updatedAt),animalScale(carried.animals[0],carried.updatedAt));
 const storage=memory();assert.equal(saveMinimalState(storage,dropped.state),true);
 assert.deepEqual(loadMinimalState(storage,carried.updatedAt).animals[0].growth,profile);
});

test('new breeding pairs unlock at 120 seconds while legacy adults retain 60 second eligibility',async()=>{
 const m=await import('../src/minimal/model.ts');const {state,animal:a}=hatched();
 state.animals=[{...a,id:'male',sex:'male',position:{x:2,z:2}}, {...structuredClone(a),id:'female',sex:'female',position:{x:2,z:3}}];
 assert.deepEqual(m.eligiblePairs(state,a.bornAt+60_000),[]);
 assert.deepEqual(m.eligiblePairs(state,a.bornAt+119_999),[]);
 assert.deepEqual(m.eligiblePairs(state,a.bornAt+120_000),[['male','female']]);
 for(const candidate of state.animals){delete candidate.growth;delete candidate.growthAgeMs;}
 assert.deepEqual(m.eligiblePairs(state,a.bornAt+60_000),[['male','female']]);
});


test('hatch announcement describes a newborn instead of claiming its future giant size',()=>{
 const seen=new Set<AnimalSize>();
 for(let sequence=0;sequence<100;sequence++){
  const result=hatched(sequence);if(seen.has(result.animal.size))continue;seen.add(result.animal.size);
  assert.match(result.message,/幼崽/);
  assert.doesNotMatch(result.message,/巨大|大大的/);
 }
 assert.equal(seen.size,3);
});
