import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMinimalState,createMinimalState,dayKey,loadMinimalState,minimalCommand,saveMinimalState,validateMinimalSave,type MinimalAnimal,type MinimalState,type Point} from '../src/minimal/model.ts';

const NOW=Date.UTC(2026,9,25,8);
const IDS:[string,string]=['a','b'];
function animal(id:string,sex:'male'|'female',position:Point):MinimalAnimal{return {id,name:id,species:'sheep',sex,size:'normal',position,activity:'idle',energy:80,bond:0,bornAt:NOW-120_000,activityUntil:NOW+100_000};}
function ready(sequence=0){const s=minimalCommand(createMinimalState(NOW),{type:'welcome'},NOW).state;s.player={x:1,z:1};s.sequence=sequence;s.hatchedCount=2;s.animals=[animal('a','male',{x:2,z:3}),animal('b','female',{x:1,z:3})];return s;}
function memory(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};}
// Frozen valid contact produced by the audited seed-52 simulation, not a cell-center approximation.
function creekDrinker(approaching=false):MinimalAnimal{
 const stance={x:2.6324364207983018,z:1.9528902425407433},site={x:3,z:2};
 const a:MinimalAnimal={id:'drinker',name:'drinker',species:'pig',sex:'male',size:'normal',growth:{version:1,scales:[.7606156148517769,.9336960372690609,1.084132784884423]},position:{...stance},activity:'drink',energy:44,bond:54,bornAt:NOW-120_000,activityUntil:NOW+6000,growthAgeMs:120_000,drinkAnchor:{site,stance,waterSite:{...site}}};
 if(approaching)Object.assign(a,{activity:'walk',position:{x:3,z:3},target:{...site},path:[{...site},{...stance}],targetActivity:'drink'});
 return a;
}
// Independent, physically validated bowl stance, well away from the new nest at (2,2).
function safeDrinker(approaching=false):MinimalAnimal{
 const stance={x:-.06789293416944422,z:.9388963592475001},site={x:0,z:1};
 const a:MinimalAnimal={id:'safe-drinker',name:'safe-drinker',species:'duck',sex:'male',size:'normal',growth:{version:1,scales:[.6,.8,1]},growthAgeMs:120_000,position:{...stance},activity:'drink',energy:44,bond:54,bornAt:NOW-120_000,activityUntil:NOW+6000,drinkAnchor:{site,stance,waterSite:{...site}}};
 if(approaching)Object.assign(a,{activity:'walk',position:{x:0,z:2},target:{...site},path:[{...stance}],targetActivity:'drink'});
 return a;
}
function assertRoundTrip(state:MinimalState){
 assert.equal(validateMinimalSave(state),true,'the accepted command must leave a validator-valid farm');
 const storage=memory();assert.equal(saveMinimalState(storage,state),true,'the new nest must be persistable');
 const loaded=loadMinimalState(storage,NOW);
 assert.deepEqual(loaded.eggs,state.eggs,'same-time load retains the bred egg and parent IDs');
 assert.deepEqual(loaded.animals,state.animals,'same-time load retains the parents and other animals');
 assert.equal(loaded.coins,state.coins);assert.equal(loaded.breedingDay,state.breedingDay);assert.deepEqual(loaded.lastBreeding,state.lastBreeding);assert.equal(loaded.sequence,state.sequence);
 return loaded;
}
function assertStopped(a:MinimalAnimal,before:MinimalAnimal){
 assert.equal(a.activity,'idle');assert.equal(a.activityUntil,NOW+5000);
 for(const field of ['target','path','targetActivity','drinkAnchor'] as const)assert.equal(a[field],undefined,`${field} is cleared with the unsafe drink action`);
 assert.deepEqual(a.position,before.position);assert.equal(a.energy,before.energy,'canceling an unsafe drink cannot grant water energy');assert.equal(a.bond,before.bond);
}

test('a successful bred nest cancels the model player route that it obstructs and survives save/load',()=>{
 const s=ready();s.animals=[animal('a','male',{x:2,z:2}),animal('b','female',{x:1,z:2})];
 assert.equal(validateMinimalSave(s),true);
 const moving=minimalCommand(s,{type:'move',to:{x:3,z:1}},NOW);assert.equal(moving.accepted,true);moving.state.playerSpeed=.2;assert.equal(validateMinimalSave(moving.state),true);
 const result=minimalCommand(moving.state,{type:'breed',animalIds:IDS},NOW);assert.equal(result.accepted,true);assert.equal(result.state.lastBreeding?.success,true);assert.deepEqual(result.state.eggs[0].position,{x:2,z:1});
 assertRoundTrip(result.state);assert.deepEqual(result.state.player,s.player);assert.deepEqual(result.state.playerPath,[],'the old route crosses the newly created nest');assert.equal(result.state.playerSpeed,0);
 assert.equal(result.state.coins,120);assert.equal(result.state.breedingDay,dayKey(NOW));
});

for(const approaching of [false,true])test(`a successful bred nest stops only the newly unsafe ${approaching?'approaching':'planted'} drink anchor`,()=>{
 const s=ready();s.animals.push(creekDrinker(approaching),safeDrinker(approaching));s.hatchedCount=s.animals.length;
 assert.equal(validateMinimalSave(s),true,'both drink fixtures start valid');
 const before=advanceMinimalState(s,NOW);assert.deepEqual(before.animals[2],s.animals[2],'the unsafe fixture is stable until the nest appears');assert.deepEqual(before.animals[3],s.animals[3]);
 const result=minimalCommand(s,{type:'breed',animalIds:IDS},NOW);assert.equal(result.accepted,true);assert.equal(result.state.lastBreeding?.success,true);assert.deepEqual(result.state.eggs[0].position,{x:2,z:2});
 assertRoundTrip(result.state);assert.deepEqual(result.state.player,s.player,'the stationary-player case needs no movement');assertStopped(result.state.animals[2],s.animals[2]);
 assert.deepEqual(result.state.animals[3],s.animals[3],'an unrelated safe drink action, including its deadline and path, is retained');
 assert.equal(result.state.coins,120);assert.equal(result.state.breedingDay,dayKey(NOW));
});

for(const approaching of [false,true])test(`a failed breeding roll preserves the player route and unrelated ${approaching?'approaching':'planted'} drink action`,()=>{
 const s=ready(1);s.animals.push(creekDrinker(approaching));s.hatchedCount=s.animals.length;
 const moving=minimalCommand(s,{type:'move',to:{x:3,z:1}},NOW);assert.equal(moving.accepted,true);moving.state.playerSpeed=.2;assert.equal(validateMinimalSave(moving.state),true);
 const result=minimalCommand(moving.state,{type:'breed',animalIds:IDS},NOW);assert.equal(result.accepted,true);assert.equal(result.state.lastBreeding?.success,false);assert.deepEqual(result.state.eggs,[]);
 assert.deepEqual(result.state.playerPath,[{x:3,z:1}]);assert.equal(result.state.playerSpeed,.2);assert.deepEqual(result.state.animals[2],s.animals[2]);assert.equal(result.state.coins,120);assert.equal(result.state.breedingDay,null);assert.equal(result.state.sequence,2);
 for(const parent of result.state.animals.slice(0,2))assert.equal(parent.lastBreedAttemptDay,dayKey(NOW));
 const loaded=assertRoundTrip(result.state),repeat=minimalCommand(loaded,{type:'breed',animalIds:IDS},NOW);assert.equal(repeat.accepted,false);assert.equal(repeat.state.sequence,2);assert.deepEqual(repeat.state.eggs,[]);assert.deepEqual(repeat.state.playerPath,loaded.playerPath);assert.equal(repeat.state.playerSpeed,.2);assert.deepEqual(repeat.state.animals,loaded.animals);
});

test('a rejected pair does not consume randomness or clear a valid route or drink action',()=>{
 const s=ready();s.animals[1].sex='male';s.animals.push(creekDrinker());s.hatchedCount=s.animals.length;
 const moving=minimalCommand(s,{type:'move',to:{x:3,z:1}},NOW).state;moving.playerSpeed=.2;
 assert.equal(validateMinimalSave(moving),true);const result=minimalCommand(moving,{type:'breed',animalIds:IDS},NOW);assert.equal(result.accepted,false);assert.equal(result.state.sequence,0);assert.equal(result.state.lastBreeding,null);assert.equal(result.state.breedingDay,null);assert.deepEqual(result.state.eggs,[]);assert.deepEqual(result.state.playerPath,moving.playerPath);assert.equal(result.state.playerSpeed,.2);assert.deepEqual(result.state.animals,advanceMinimalState(moving,NOW).animals);assertRoundTrip(result.state);
});

test('successful breeding preserves the deterministic egg, parents, economy and daily cap on repeated attempts',()=>{
 const s=ready();const result=minimalCommand(s,{type:'breed',animalIds:IDS},NOW);assert.equal(result.accepted,true);
 assert.deepEqual(result.state.eggs,[{id:'egg-2',rarity:'green',source:'bred',species:'sheep',sex:'female',size:'normal',growth:{version:1,scales:[.6301653815455278,.8695503076449245,1.1443482016213238]},location:'ground',boughtAt:NOW,parents:['a','b'],position:{x:2,z:2},placedAt:NOW,readyAt:NOW+15_000}]);
 assert.equal(result.state.sequence,2);assert.equal(result.state.coins,s.coins);assert.equal(result.state.placedEggCount,s.placedEggCount);assert.equal(result.state.hatchedCount,s.hatchedCount);
 for(let i=0;i<2;i++){const parent=result.state.animals[i];assert.deepEqual(parent,{...s.animals[i],growthAgeMs:60_000,lastBreedAttemptDay:dayKey(NOW),activityUntil:NOW+5000});}
 const loaded=assertRoundTrip(result.state),repeat=minimalCommand(loaded,{type:'breed',animalIds:IDS},NOW);assert.equal(repeat.accepted,false);assert.deepEqual(repeat.state.eggs,result.state.eggs);assert.equal(repeat.state.sequence,2);assert.equal(repeat.state.coins,120);
 const otherPair=structuredClone(loaded);otherPair.animals.push(animal('other-a','male',{x:1,z:2}),animal('other-b','female',{x:0,z:3}));otherPair.hatchedCount=4;assert.equal(validateMinimalSave(otherPair),true);
 const capped=minimalCommand(otherPair,{type:'breed',animalIds:['other-a','other-b']},NOW);assert.equal(capped.accepted,false);assert.equal(capped.state.sequence,2);assert.deepEqual(capped.state.eggs,result.state.eggs);assert.equal(capped.state.animals[2].lastBreedAttemptDay,undefined);assert.equal(capped.state.animals[3].lastBreedAttemptDay,undefined);
});

test('the new-nest cleanup does not consume or reorder the established breeding random sequence',()=>{
 for(const [sequence,success,after,eggId] of [[0,true,2,'egg-2'],[1,false,2,undefined],[2,true,4,'egg-4'],[3,false,4,undefined],[4,false,5,undefined]] as const){const result=minimalCommand(ready(sequence),{type:'breed',animalIds:IDS},NOW);assert.equal(result.accepted,true);assert.equal(result.state.lastBreeding?.success,success,`sequence ${sequence}`);assert.equal(result.state.sequence,after);assert.equal(result.state.eggs[0]?.id,eggId);assert.equal(result.state.coins,120);assertRoundTrip(result.state);}
});

test('placing a bag egg retains the same route and unsafe-anchor cleanup without stopping a safe drinker',()=>{
 const s=ready();s.animals.push(creekDrinker(),safeDrinker());s.hatchedCount=s.animals.length;s.eggs=[{id:'bag-egg',source:'shop',species:'duck',sex:'male',size:'normal',location:'bag',boughtAt:NOW}];s.player={x:1,z:2};
 assert.equal(validateMinimalSave(s),true);const moving=minimalCommand(s,{type:'move',to:{x:3,z:2}},NOW);assert.equal(moving.accepted,true);moving.state.playerSpeed=.2;
 const placed=minimalCommand(moving.state,{type:'placeEgg',eggId:'bag-egg',at:{x:2,z:2}},NOW);assert.equal(placed.accepted,true);assert.deepEqual(placed.state.playerPath,[]);assert.equal(placed.state.playerSpeed,0);assertStopped(placed.state.animals[2],s.animals[2]);assert.deepEqual(placed.state.animals[3],s.animals[3]);assert.equal(placed.state.placedEggCount,1);assert.equal(placed.state.eggs[0].readyAt,NOW+10_000);assert.equal(placed.state.coins,120);assert.equal(placed.state.breedingDay,null);assertRoundTrip(placed.state);
});
