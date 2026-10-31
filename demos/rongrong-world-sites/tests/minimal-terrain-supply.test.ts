import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/minimal/model.ts';
const now=1_793_000_000_000;
test('terrain upgrade is a paid exact-target command and duplicate cannot spend twice',()=>{
 const s=model.createMinimalState(now);s.welcomeClaimed=true;s.hatchedCount=1;s.coins=100;
 const r=model.minimalCommand(s,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:2},now);
 assert.equal(r.accepted,true);assert.equal(r.state.coins,70);
 assert.equal(model.tileAt(r.state,{x:2,z:2})?.level,2);
 const duplicate=model.minimalCommand(r.state,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:2},now);
 assert.equal(duplicate.accepted,false);assert.equal(duplicate.state.coins,70);
});
import {createAnimalGrowth,animalGrowthAgeMs} from '../src/minimal/animal-growth.ts';
const animal=(id='cow'):model.MinimalAnimal=>({id,name:'小牛',species:'cow',sex:'female',size:'normal',growth:createAnimalGrowth(id,'normal'),position:{x:2,z:1},activity:'idle',energy:85,bond:0,bornAt:now,activityUntil:now+999999});
test('new farm receives positive bounded terrain growth bonus',()=>{
 const s=model.createMinimalState(now);s.animals=[animal()];
 const next=model.advanceMinimalState(s,now+10000);
 assert.ok(animalGrowthAgeMs(next.animals[0],now+10000)>10000);
 assert.equal(animalGrowthAgeMs(next.animals[0],now+10000),12000);
});
test('old save does not retroactively receive growth bonus',()=>{
 const s=model.createMinimalState(now);delete s.terrainGrowthAt;s.animals=[animal()];
 const next=model.advanceMinimalState(s,now+10000);
 assert.equal(animalGrowthAgeMs(next.animals[0],now+10000),10000);
 assert.equal(next.terrainGrowthAt,now+10000);
});
test('supply API exists for visible terrain feedback',()=>{
 assert.equal(typeof model.farmSupply,'function');
});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
test('starter supplies are bounded and population explains the growth rate',()=>{
 const s=model.createMinimalState(now);
 assert.deepEqual(model.farmSupply(s).capacity,{food:14,water:10,rest:2});
 assert.equal(model.farmSupply(s).growthBonusRate,0);
 for(const [n,rate] of [[2,.2],[4,.18],[8,.17],[16,.125]]){s.animals=Array.from({length:n},(_,i)=>animal(`${i}`));close(model.farmSupply(s).growthBonusRate,rate);}
});
test('each terrain and level has explicit contributions',()=>{
 for(const [terrain,base] of Object.entries({meadow:{food:1,water:0,rest:0},creek:{food:0,water:4,rest:0},pond:{food:0,water:6,rest:0},grove:{food:0,water:0,rest:4},hill:{food:0,water:0,rest:2}})){
  for(const level of [1,2,3] as const){const result=model.tileSupply({terrain:terrain as model.Terrain,level});for(const kind of ['food','water','rest'] as const)assert.equal(result[kind],base[kind]*(1+(level-1)*.5));}
 }
});
test('unowned disconnected terrain and shop cannot create phantom supply',()=>{
 const s=model.createMinimalState(now),before=model.farmSupply(s).capacity;
 s.tiles.find(t=>t.x===6&&t.z===6)!.owned=true;s.tiles.find(t=>t.x===0&&t.z===0)!.level=3;
 assert.deepEqual(model.farmSupply(s).capacity,before);
 s.tiles.find(t=>t.x===2&&t.z===2)!.level=2;
 assert.equal(model.farmSupply(s).capacity.food,before.food+.5);
});
test('upgrade guards preserve coins and existing conversion retains level',()=>{
 const s=model.createMinimalState(now);s.welcomeClaimed=true;s.hatchedCount=1;s.expansions=1;s.coins=100;
 for(const at of [{x:0,z:0},{x:-1,z:-1},{x:Infinity,z:0}]){const r=model.minimalCommand(s,{type:'upgradeTerrain',at,toLevel:2},now);assert.equal(r.accepted,false);assert.equal(r.state.coins,100);}
 assert.equal(model.minimalCommand(s,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:3},now).accepted,false);
 const first=model.minimalCommand(s,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:2},now).state;
 const second=model.minimalCommand(first,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:3},now).state;
 assert.equal(second.coins,10);assert.equal(model.tileAt(second,{x:2,z:2})!.level,3);
 const poor=model.minimalCommand({...s,coins:29},{type:'upgradeTerrain',at:{x:2,z:2},toLevel:2},now);assert.equal(poor.accepted,false);assert.equal(poor.state.coins,29);
 const converted=model.minimalCommand(first,{type:'convert',at:{x:2,z:2},terrain:'grove'},now);
 assert.equal(converted.accepted,true);assert.equal(model.tileAt(converted.state,{x:2,z:2})!.level,2);assert.equal(converted.state.coins,50);
});
test('bonus settles old terrain before upgrade and freezes under duplicate/backwards ticks',()=>{
 const s=model.createMinimalState(now);s.welcomeClaimed=true;s.hatchedCount=1;s.coins=100;s.animals=Array.from({length:8},(_,i)=>animal(`${i}`));
 model.tileAt(s,{x:2,z:2})!.terrain='grove';
 const oldRate=model.farmSupply(s).growthBonusRate;
 const r=model.minimalCommand(s,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:2},now+10000);
 close(r.state.animals[0].growthBonusMs!,oldRate*10000);
 const duplicate=model.advanceMinimalState(r.state,now+10000),back=model.advanceMinimalState(r.state,now);
 assert.equal(duplicate.animals[0].growthBonusMs,r.state.animals[0].growthBonusMs);
 assert.equal(back.animals[0].growthBonusMs,r.state.animals[0].growthBonusMs);
});
test('growth bonus is bounded offline, legacy growth unchanged and old fields load',()=>{
 const s=model.createMinimalState(now);s.animals=[animal(),{...animal('old'),growth:undefined}];
 const r=model.advanceMinimalState(s,now+86400000);
 assert.ok(r.animals[0].growthBonusMs!<=24000);assert.equal(r.animals[1].growthBonusMs,undefined);
 assert.equal(animalGrowthAgeMs(r.animals[0],now+86400000),120000);assert.equal(animalGrowthAgeMs(r.animals[1],now+86400000),60000);
 const old=model.createMinimalState(now);delete old.terrainGrowthAt;assert.equal(model.validateMinimalSave(old),true);
 assert.equal(model.validateMinimalSave({...old,terrainGrowthAt:NaN}),false);
 const invalid=structuredClone(old);invalid.tiles[0].level=9 as 1;assert.equal(model.validateMinimalSave(invalid),false);
});
test('bonus ages advance continuously between ticks and never change price or potential',()=>{
 const s=model.createMinimalState(now);s.animals=[animal()];const r=model.advanceMinimalState(s,now+10000),a=r.animals[0];
 assert.equal(animalGrowthAgeMs(a,now+10500),12500);assert.equal(model.sellValue(a),40);assert.deepEqual(a.growth,s.animals[0].growth);
});
test('invalid null animal save is rejected without throwing',()=>{
 const s=model.createMinimalState(now);(s.animals as unknown[])=[null];
 assert.equal(model.validateMinimalSave(s),false);
});
test('locked animals do not accrue environmental bonus and do not bank it for unlock',()=>{
 const s=model.createMinimalState(now);s.animals=[animal()];
 const locked=model.advanceMinimalState(s,now+10000,['cow']);assert.equal(locked.animals[0].growthBonusMs,undefined);
 const unlocked=model.advanceMinimalState(locked,now+11000);assert.equal(unlocked.animals[0].growthBonusMs,200);
});
test('removing animals cannot apply lower population bonus to a past interval',()=>{
 const s=model.createMinimalState(now);s.animals=Array.from({length:16},(_,i)=>animal(`${i}`));s.welcomeClaimed=true;s.player={x:1,z:1};s.carriedAnimalId='0';s.animals[0].activity='carried';
 const r=model.minimalCommand(s,{type:'sellAnimal'},now+10000);assert.equal(r.accepted,true);assert.equal(r.state.animals.length,15);
 close(r.state.animals[0].growthBonusMs!,1250);
});
test('an upgraded pond supplies its entire connected water component without becoming walkable',()=>{
 const s=model.createMinimalState(now);s.tiles.find(t=>t.x===4&&t.z===2)!.owned=true;s.tiles.find(t=>t.x===5&&t.z===2)!.owned=true;
 model.tileAt(s,{x:5,z:2})!.level=3;
 assert.equal(model.farmSupply(s).capacity.water,28);assert.equal(model.isWalkableTile(s,{x:4,z:2}),false);
});
test('valid pond conversion at shop approach does not erase connected farm supplies',()=>{
 const s=model.createMinimalState(now);s.welcomeClaimed=true;s.hatchedCount=1;s.coins=100;s.expansions=1;
 const r=model.minimalCommand(s,{type:'convert',at:{x:1,z:1},terrain:'pond'},now);
 assert.equal(r.accepted,true);assert.equal(model.validateMinimalSave(r.state),true);
 assert.deepEqual(model.farmSupply(r.state).capacity,{food:13,water:16,rest:2});
});
test('meadow upgrade keeps fractional 1.5 capacity and a real marginal effect for sixteen animals',()=>{
 const s=model.createMinimalState(now);s.welcomeClaimed=true;s.hatchedCount=1;s.coins=100;s.animals=Array.from({length:16},(_,i)=>animal(`${i}`));
 const before=model.farmSupply(s),r=model.minimalCommand(s,{type:'upgradeTerrain',at:{x:2,z:2},toLevel:2},now),after=model.farmSupply(r.state);
 assert.equal(r.accepted,true);assert.equal(model.tileSupply(model.tileAt(r.state,{x:2,z:2})!).food,1.5);assert.equal(after.capacity.food,14.5);
 close(before.growthBonusRate,.125);close(after.growthBonusRate,.1275);assert.equal(r.state.coins,70);
});
