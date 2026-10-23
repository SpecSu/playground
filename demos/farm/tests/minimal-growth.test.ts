import test from 'node:test';
import assert from 'node:assert/strict';
import {animalScale,advanceMinimalState,createMinimalState,isAdult,loadMinimalState,saveMinimalState,sellValue,MINIMAL_RULES,type MinimalAnimal,type AnimalSize} from '../src/minimal/model.ts';

const bornAt=1_793_000_000_000;
const sizes:AnimalSize[]=['normal','large','giant'];
const birthScales=[1,1.3,1.8];
const adultScales=[1.25,1.625,2.2];
const animal=(size:AnimalSize):MinimalAnimal=>({id:`cow-${size}`,name:'小牛',species:'cow',sex:'female',size,position:{x:2,z:2},activity:'idle',energy:80,bond:0,bornAt,activityUntil:bornAt+99_000});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} ≈ ${expected}`);

test('newborn sizes retain the existing normal, large and giant floors',()=>{
 sizes.forEach((size,i)=>assert.equal(animalScale(animal(size),bornAt),birthScales[i]));
});

test('all birth sizes grow smoothly and monotonically to adulthood',()=>{
 sizes.forEach((size,i)=>{
  const a=animal(size),span=adultScales[i]-birthScales[i];
  close(animalScale(a,bornAt+MINIMAL_RULES.adultMs/2),birthScales[i]+span/2);
  close(animalScale(a,bornAt+MINIMAL_RULES.adultMs/4),birthScales[i]+span*.15625);
  let previous=birthScales[i];
  for(let age=1;age<=MINIMAL_RULES.adultMs;age+=137){const scale=animalScale(a,bornAt+age);assert.ok(scale>=previous&&scale<=adultScales[i]);previous=scale;}
  close(animalScale(a,bornAt+MINIMAL_RULES.adultMs),adultScales[i]);
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
  assert.ok(animalScale(a,bornAt+MINIMAL_RULES.adultMs)>animalScale(a,bornAt));
  assert.deepEqual(a,before);
  assert.equal(a.size,size);
  assert.equal(sellValue(a),[40,65,100][i]);
  assert.equal(isAdult(a,bornAt+MINIMAL_RULES.adultMs-1),false);
  assert.equal(isAdult(a,bornAt+MINIMAL_RULES.adultMs),true);
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
