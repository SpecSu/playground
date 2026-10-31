import test from 'node:test';
import assert from 'node:assert/strict';
type Bounds={left:number;right:number;top:number;bottom:number};
type Point={x:number;y:number};
type Candidate={id:string;bounds:Bounds;depth:number};
type Api={animalTouchBounds:(bounds:Bounds)=>Bounds|null;insideAnimalTouchBounds:(point:Point,bounds:Bounds)=>boolean;rankAnimalTouchCandidates:(point:Point,candidates:Candidate[])=>Candidate[]};
const load=async()=>await import(new URL('../src/minimal/animal-picking.ts',import.meta.url).href) as Api;
const box=(left:number,top:number,width:number,height:number):Bounds=>({left,right:left+width,top,bottom:top+height});

test('small animal hit bounds reach44 physical pixels without changing their visual mesh',async()=>{
 const {animalTouchBounds}=await load(),input=box(100,200,18,20),copy={...input},hit=animalTouchBounds(input)!;
 assert.deepEqual(hit,{left:87,right:131,top:188,bottom:232});assert.deepEqual(input,copy);
});
test('overview padding is capped at14 physical pixels per side rather than claiming nearby ground',async()=>{
 const {animalTouchBounds}=await load(),input=box(100,200,4,6),hit=animalTouchBounds(input)!;
 assert.deepEqual(hit,{left:86,right:118,top:186,bottom:220});assert.ok(hit.right-hit.left<44);
});
test('already large axes gain no invisible padding',async()=>{
 const {animalTouchBounds}=await load();assert.deepEqual(animalTouchBounds(box(20,30,90,60)),box(20,30,90,60));const mixed=animalTouchBounds(box(20,30,90,20))!;assert.equal(mixed.left,20);assert.equal(mixed.right,110);assert.equal(mixed.bottom-mixed.top,44);
});
test('rounded corners avoid a square far-corner grab zone',async()=>{
 const {insideAnimalTouchBounds}=await load(),input=box(100,200,18,20);
 assert.equal(insideAnimalTouchBounds({x:109,y:189},input),true);assert.equal(insideAnimalTouchBounds({x:88,y:189},input),false);assert.equal(insideAnimalTouchBounds({x:86.9,y:210},input),false);
});
test('closest unexpanded body wins before center depth and stable id tie-breaks',async()=>{
 const {rankAnimalTouchCandidates}=await load(),point={x:100,y:100};
 const candidates:Candidate[]=[{id:'far-center',bounds:box(95,98,30,4),depth:.2},{id:'near-body',bounds:box(99,99,2,2),depth:.5}];
 assert.equal(rankAnimalTouchCandidates(point,candidates)[0].id,'near-body');
 const twins:Candidate[]=['z','a','m'].map(id=>({id,bounds:box(95,95,10,10),depth:.5}));assert.deepEqual(rankAnimalTouchCandidates(point,twins).map(x=>x.id),['a','m','z']);assert.deepEqual(rankAnimalTouchCandidates(point,twins.slice().reverse()).map(x=>x.id),['a','m','z']);
 twins[0].depth=.1;assert.equal(rankAnimalTouchCandidates(point,twins)[0].id,'z');
});
test('invalid invisible-space inputs cannot generate a padded animal target',async()=>{
 const {animalTouchBounds,rankAnimalTouchCandidates}=await load();for(const invalid of [box(NaN,0,10,10),box(0,0,Infinity,10),box(0,0,-1,10),box(0,0,0,0)])assert.equal(animalTouchBounds(invalid),null);
 assert.deepEqual(rankAnimalTouchCandidates({x:NaN,y:10},[{id:'a',bounds:box(0,0,20,20),depth:.5}]),[]);assert.deepEqual(rankAnimalTouchCandidates({x:100,y:100},[{id:'a',bounds:box(0,0,20,20),depth:.5}]),[]);
});
