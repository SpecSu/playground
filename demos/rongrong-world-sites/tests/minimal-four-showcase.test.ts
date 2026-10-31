import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {SAMPLE_FRIENDS,sampleFarm} from '../src/minimal/sample-farms.ts';import {SampleScenery} from '../src/minimal/sample-scenery.ts';import {VisitorSession} from '../src/minimal/visitor-session.ts';import {isWalkableTile,playerWalkRoute,WATER_BOWL,REST_MAT} from '../src/minimal/model.ts';
const NOW=1_800_000_000_000;
import {KNOWN_SPECIES} from '../src/minimal/species.ts';
import {prepareSampleModels,clearSampleModels} from './helpers/sample-model-fixture.ts';
test('four authored themes keep display portraits separate from unlinked real accounts',()=>{
 assert.equal(SAMPLE_FRIENDS.length,4);assert.deepEqual(new Set(SAMPLE_FRIENDS.map(c=>c.themeId)),new Set(['desert','glacier','wetland','lunar']));
 assert.deepEqual(new Set(SAMPLE_FRIENDS.map(c=>c.target.sampleId)),new Set(['forest','glacier','oasis','lunar']));
 for(const card of SAMPLE_FRIENDS){assert.equal(card.target.kind,'sample');assert.equal(card.badge,'示例');assert.equal(card.identityStatus,'unlinked-account');assert.match(card.avatar??'',/^\/assets\/friends\/[a-z]+\.png$/);assert.deepEqual(Object.keys(card.target).sort(),['kind','sampleId']);}
});
test('four distinct land and water plans stay navigable and lunar actors remain outside ordinary animal assets',()=>{
 const signatures=new Set();for(const card of SAMPLE_FRIENDS){const farm=sampleFarm(card.target.sampleId,NOW),s=farm.state;signatures.add(s.tiles.filter(t=>t.owned).map(t=>t.terrain).join(','));assert.ok(card.themeId==='lunar'?s.animals.length===0:s.animals.length>=2&&s.animals.length<=5);assert.equal(s.coins,0);assert.deepEqual(s.eggs,[]);assert.deepEqual(s.staticObstacles,undefined);
  for(const p of [WATER_BOWL,REST_MAT,...farm.route,...farm.viewpoints,...farm.restSpots]){assert.ok(isWalkableTile(s,p),`${card.themeId} ${JSON.stringify(p)}`);assert.notEqual(playerWalkRoute(s,s.player,p),null);}
  assert.ok(s.animals.every(a=>KNOWN_SPECIES.includes(a.species)&&!a.creative));
  if(card.themeId==='lunar'){assert.ok(s.tiles.some(t=>t.owned&&t.appearance==='lunar'));assert.equal(farm.pendingDIY.length,0);for(const slot of farm.pendingDIY){assert.equal(slot.status,'awaiting-glb');assert.equal(slot.assetId,undefined);assert.ok(slot.position.x<-.5||slot.position.x>5.5||slot.position.z<-.5||slot.position.z>5.5);}assert.equal(s.animals.some(a=>/diy|drama/i.test(a.id)),false);}else assert.deepEqual(farm.pendingDIY,[]);
 }
 assert.equal(signatures.size,4);
});
test('lunar scenery has explicit cosmetic crater geometry but no in-land obstacle or fake model marker',()=>{
 const f=sampleFarm('lunar',NOW),parent=new THREE.Group(),scenery=new SampleScenery(parent,f,{loadModel:async()=>{throw Error('offline');}});let craters=0,pending=0;scenery.root.traverse(o=>{assert.equal(o.userData.target,undefined);assert.equal(o.userData.pickTarget,undefined);if(o.name==='sample-lunar-crater')craters++;if(o.userData.pendingDIY===true){pending++;assert.equal(o.userData.assetId,undefined);}});assert.ok(craters>=3);assert.equal(pending,0);scenery.dispose();assert.equal(parent.children.length,0);
});
test('all four targets preserve ephemeral carry and whitelist with no economic assets after visiting',async()=>{
 await prepareSampleModels();try{
 const visitor=VisitorSession.sample('forest',NOW);for(const card of SAMPLE_FRIENDS){visitor.switchSample(card.target.sampleId,NOW);const a=visitor.state.animals[0];if(!a){assert.equal(card.themeId,'lunar');assert.equal(visitor.command({type:'pickup',animalId:'yellow-long-ear'},NOW).accepted,false);continue;}const owner=visitor.ownerOf(a.id);assert.equal(visitor.command({type:'pickup',animalId:a.id},NOW).accepted,true);assert.equal(visitor.state.carriedAnimalId,a.id);assert.deepEqual(visitor.ownerOf(a.id),owner);for(const type of ['sellAnimal','exchange','breed','creativePlace','setOwner','upgradeTerrain'])assert.equal(visitor.command({type},NOW).accepted,false);visitor.tick(NOW+1000);assert.equal(visitor.state.coins,0);assert.deepEqual(visitor.state.eggs,[]);}visitor.dispose();assert.equal(visitor.state.carriedAnimalId,null);
 }finally{await clearSampleModels();}
});
test('each theme keeps boarding rewards in its caller-owned demo realm, without admitting lunar DIY actors',async()=>{
 const {createSampleBoardingAdapter,sampleBoardingCandidates}=await import('../src/minimal/sample-boarding.ts');
 for(const card of SAMPLE_FRIENDS.filter(c=>c.themeId!=='lunar')){const id=card.target.sampleId,realm=`test:${id}`,a=createSampleBoardingAdapter({realmId:realm,now:()=>NOW,outcome:()=>true}),b=createSampleBoardingAdapter({realmId:realm+':other',now:()=>NOW}),c=sampleBoardingCandidates(id,realm);await a.invite({sampleId:id,parentId:c.visitor.id,requestId:'invite'});await a.confirm({sampleId:id,partnerId:c.hosts[0].id,requestId:'confirm'});const result=await a.fastForwardDemo(id);assert.equal(result.nonTransferable,true);assert.equal(result.mode,'sample');assert.equal(result.demoEggs,1);assert.equal(result.demoCoins,5);assert.equal((await b.read(id)).demoEggs,0);assert.equal(sampleFarm(id,NOW).state.coins,0);assert.equal(sampleFarm(id,NOW).state.eggs.length,0);}
});
