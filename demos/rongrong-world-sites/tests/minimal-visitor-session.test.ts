import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE_FRIENDS,sampleFarm} from '../src/minimal/sample-farms.ts';
import {VisitorSession} from '../src/minimal/visitor-session.ts';
import {createMinimalState,isWalkableTile,playerWalkRoute,WATER_BOWL,REST_MAT} from '../src/minimal/model.ts';
import {KNOWN_SPECIES} from '../src/minimal/species.ts';
const NOW=1_800_000_000_000;
test('four curated themes use bounded released animals and reachable routes/rest/viewpoints',()=>{
 assert.equal(SAMPLE_FRIENDS.length,4);
 for(const card of SAMPLE_FRIENDS){
  assert.equal(card.target.kind,'sample');assert.equal(card.badge,'示例');
  const farm=sampleFarm(card.target.sampleId,NOW),s=farm.state;
  assert.ok(card.themeId==='lunar'?s.animals.length===0:s.animals.length>=2&&s.animals.length<=5);assert.equal(s.coins,0);assert.deepEqual(s.eggs,[]);
  assert.ok(s.animals.every(a=>KNOWN_SPECIES.includes(a.species)));
  assert.ok(s.animals.every(a=>a.id.startsWith(`sample:${card.target.sampleId}:`)));
  for(const p of [WATER_BOWL,REST_MAT,...farm.route,...farm.viewpoints]){assert.ok(isWalkableTile(s,p));assert.notEqual(playerWalkRoute(s,s.player,p),null,JSON.stringify(p));}
  const again=sampleFarm(card.target.sampleId,NOW);if(s.animals[0]){s.animals[0].name='Changed';assert.notEqual(again.state.animals[0].name,'Changed');}else{assert.equal(card.themeId,'lunar');assert.notEqual(s.tiles,again.state.tiles);}
 }
});
test('visitor capability rejects direct economic, ownership and land commands without changing home or owner',()=>{
 const home=createMinimalState(NOW),original=JSON.stringify(home),v=VisitorSession.sample('forest',NOW);
 const before=v.state;for(const type of ['sellAnimal','buyEgg','collectEgg','hatch','breed','convert','expand','upgradeTerrain','welcome','help','exchange','transfer','creativePlace','boardingInvite','setOwner','constructor']){
  assert.equal(v.command({type},NOW).accepted,false,type);assert.deepEqual(v.state,before,type);
 }
 const animal=v.state.animals[0];assert.deepEqual(v.ownerOf(animal.id),{kind:'sample',sampleId:'forest'});assert.equal(v.ownerOf('home-animal'),null);assert.equal(JSON.stringify(home),original);
});
test('carry and greeting are temporary and cannot mint rewards or mutate baseline ownership',()=>{
 const v=VisitorSession.sample('forest',NOW),a=v.state.animals[0],owner=v.ownerOf(a.id),base=v.state;
 assert.ok(v.command({type:'pickup',animalId:a.id},NOW).accepted);assert.equal(v.state.carriedAnimalId,a.id);assert.deepEqual(v.ownerOf(a.id),owner);
 assert.ok(v.command({type:'putdown'},NOW).accepted);assert.equal(v.state.carriedAnimalId,null);
 for(let i=0;i<5;i++)assert.ok(v.command({type:'care',animalId:a.id},NOW+i).accepted);
 assert.equal(v.state.coins,0);assert.deepEqual(v.state.eggs,[]);assert.equal(v.state.lastCompanionGiftDay,undefined);assert.equal(v.state.animals[0].bond,base.animals[0].bond);
 v.dispose();assert.equal(v.state.carriedAnimalId,null);assert.equal(v.command({type:'pickup',animalId:a.id},NOW).accepted,false);
 const fresh=VisitorSession.sample('forest',NOW);assert.deepEqual(fresh.state,base);
});
test('switch and stale async replies invalidate carry and never apply a previous farm snapshot',async()=>{
 const v=VisitorSession.sample('forest',NOW);const old=v.token;v.command({type:'pickup',animalId:v.state.animals[0].id},NOW);
 let resolve!:(state:ReturnType<typeof sampleFarm>['state'])=>void;const pending=v.refresh(()=>new Promise(r=>resolve=r));
 v.switchSample('glacier',NOW+1);const current=v.state;assert.equal(current.carriedAnimalId,null);
 assert.equal(v.command({type:'move',to:{x:2,z:2}},NOW+1,old).accepted,false);
 resolve(sampleFarm('forest',NOW).state);assert.equal(await pending,false);assert.deepEqual(v.state,current);
 let late!:(state:typeof current)=>void;const after=v.refresh(()=>new Promise(r=>late=r));v.dispose();late(current);assert.equal(await after,false);assert.equal(v.state.carriedAnimalId,null);
});
test('real-readonly visits never mutate provided account state or admit sample refreshes',async()=>{
 const source=sampleFarm('forest',NOW).state;source.animals[0].id='real-animal';source.coins=321;const baseline=JSON.stringify(source);
 const v=VisitorSession.readonly({kind:'real',uid:'uid_real'},source,NOW);assert.equal(v.mode,'real-readonly');assert.ok(v.command({type:'pickup',animalId:'real-animal'},NOW).accepted);assert.equal(v.command({type:'sellAnimal'},NOW).accepted,false);assert.equal(JSON.stringify(source),baseline);
 assert.equal(v.state.coins,0);assert.deepEqual(v.ownerOf('real-animal'),{kind:'real',uid:'uid_real'});v.dispose();assert.equal(v.state.carriedAnimalId,null);
});
