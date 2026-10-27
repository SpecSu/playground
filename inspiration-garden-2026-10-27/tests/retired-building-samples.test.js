import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as bp from '../src/blueprints.js';
import {createState,reduce} from '../src/state.js';
import {BUILDING_EXAMPLES,newBlueprintCreation,rollBuildingExample,resolveBlueprintIdea} from '../src/ui-state.js';
import {renderPanel,renderContext} from '../src/ui.js';
import {loadGame,saveGame,validateState,SAVE_KEY} from '../src/storage.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/retired-necklace-v27.json',import.meta.url)));
const NOW=fixture.now,RETIRED='necklace_memory_monument',canonical='demo-blueprint-'+RETIRED;
const personal=['fluffy_cat_cottage','lamy_memory_column','airforce_memory_house','xt50_memory_camera','scallop_shell_house','camping_tarp_pavilion'];
const fresh=()=>createState(NOW,'retirement-test');
const legacy=()=>structuredClone(fixture.states.placedWorksiteBagAndChains.state);
const storageFor=raw=>{const map=new Map([[SAVE_KEY,raw]]);let writes=0;return {getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes++;map.set(key,value);},get writes(){return writes;},map};};
const atomic=(s,a)=>{const before=structuredClone(s),r=reduce(s,a,NOW);assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.deepEqual(s,before);};

test('active discovery excludes retired jewelry while trusted historical resolver stays intact',()=>{
 assert.equal(bp.BUILDING_SAMPLES.length,21);assert.equal(bp.buildingSample(RETIRED).id,RETIRED);assert.equal(bp.getBlueprint(fresh(),canonical).sampleId,RETIRED);
 assert.equal(bp.ACTIVE_BUILDING_SAMPLES?.length,20);assert.deepEqual(bp.RETIRED_BUILDING_SAMPLE_IDS,[RETIRED]);
 for(const id of personal)assert.equal(bp.isActiveBuildingSample(id),true,id);
 for(const id of [RETIRED,'unknown','constructor','__proto__',null,[personal[0]]])assert.equal(bp.isActiveBuildingSample(id),false);
});
test('dice and idea resolution never rediscover jewelry even with a retired parent or existing ownership',()=>{
 const s=legacy();assert.equal(BUILDING_EXAMPLES.some(e=>e.sampleId===RETIRED),false);
 for(const parentId of [null,'authored-necklace',canonical]){
  const c=newBlueprintCreation(parentId),matched=resolveBlueprintIdea(s,c,'项链 吊坠 银弧 细银链 银色 纪念庭');assert.equal(matched.sample,null);assert.equal(matched.reuseId,null);
  for(let i=0;i<40;i++){const roll=rollBuildingExample(s,c,()=>(i+.5)/40);assert.notEqual(roll.lastExampleId,RETIRED);assert.notEqual(resolveBlueprintIdea(s,roll,roll.idea).sample?.id,RETIRED);}
 }
 assert.equal(bp.matchBuildingIdeas('项链 吊坠 银弧 细银链 银色 纪念庭').some(s=>s.id===RETIRED),false);
});
test('direct retired creation fails atomically but an active result can retain retired parent credit',()=>{
 const s=fresh();for(const [id,b]of Object.entries(s.blueprints))if(b.sampleId===RETIRED)delete s.blueprints[id];
 for(const parentId of [null,'demo-blueprint-calico_reading_den'])atomic(s,{type:'CREATE_BLUEPRINT',sampleId:RETIRED,parentId,requestId:'retired-create'});
 for(const parentId of ['authored-necklace',canonical]){
  const old=legacy(),parent=bp.getBlueprint(old,parentId),r=reduce(old,{type:'CREATE_BLUEPRINT',sampleId:'fluffy_cat_cottage',parentId,requestId:'active-remix'},NOW);
  assert.equal(r.ok,true,r.message);const child=r.state.blueprints[r.effect.blueprintId];assert.equal(child.parentId,parentId);assert.equal(child.rootId,parent.rootId);assert.equal(child.parentAuthorName,parent.authorName);assert.equal(child.authorId,old.uid);assert.equal(child.authorName,old.profileName);assert.equal(validateState(r.state),true);
 }
});
test('fresh and pre-version saves grant six active examples including the cat but never add a necklace',()=>{
 const check=s=>{assert.deepEqual(Object.values(s.blueprints).map(b=>b.sampleId).sort(),[...personal].sort());assert.equal(s.coins,120);assert.equal(s.crystals,3);assert.equal(s.nextId,1);assert.equal(s.memorialBlueprintsVersion,1);assert.equal(s.personalExhibitsVersion,1);assert.equal(validateState(s),true);};
 check(fresh());const {rawEnvelope}=fixture.states.beforeStarterVersions,store=storageFor(rawEnvelope),r=loadGame(store,NOW);assert.equal(r.status,'loaded');check(r.state);assert.equal(r.head,rawEnvelope);assert.equal(store.getItem(SAVE_KEY),rawEnvelope);assert.equal(store.writes,0);
});
test('pre-retirement checksummed saves load without rewriting disk or removing old ownership, instances, timestamps and chains',()=>{
 for(const [name,{state,rawEnvelope}]of Object.entries(fixture.states)){
  assert.equal(validateState(state),true,name);const store=storageFor(rawEnvelope),before=[...store.map],r=loadGame(store,NOW);assert.equal(r.status,'loaded',name);assert.equal(r.head,rawEnvelope);assert.deepEqual([...store.map],before);assert.equal(store.writes,0);
  if(name!=='beforeStarterVersions'){const preserved=structuredClone(r.state);delete preserved.catBlueprintsVersion;const cat=preserved.blueprints['example-fluffy_cat_cottage'];assert.equal(cat?.sampleId,'fluffy_cat_cottage');assert.equal(cat.authorId,state.uid);delete preserved.blueprints[cat.id];assert.deepEqual(preserved,state,name);}
 }
 const s=fixture.states.ownedDemoIDCollision.state;assert.equal(bp.getBlueprint(s,canonical).sampleId,'camping_dog_workshop');assert.deepEqual(bp.getBlueprintRecord(s,canonical),s.blueprints[canonical]);assert.equal(bp.PUBLISHED_DEMO_BLUEPRINT_IDS.includes(canonical),false);assert.equal(bp.getBlueprint({blueprints:{}},canonical).sampleId,RETIRED);
});
test('pre-version grant collision is preserved without changing the checksum validation or blueprint capacity',()=>{
 const s=structuredClone(fixture.states.beforeStarterVersions.state),id='example-lamy_memory_column';s.blueprints[id]={id,sampleId:RETIRED,authorId:s.uid,authorName:'旧作',parentId:null,rootId:id,parentAuthorName:null};const store=storageFor(null);assert.equal(saveGame(store,s,NOW).ok,true);const raw=store.getItem(SAVE_KEY),writes=store.writes,r=loadGame(store,NOW);assert.deepEqual(r.state.blueprints[id],s.blueprints[id]);assert.equal(Object.values(r.state.blueprints).filter(b=>b.sampleId===RETIRED).length,1);assert.equal(Object.values(r.state.blueprints).filter(b=>b.sampleId==='lamy_memory_column').length,1);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.writes,writes);
 const corrupt=JSON.parse(raw);corrupt.state.coins++;const bad=JSON.stringify(corrupt),broken=storageFor(bad);assert.equal(loadGame(broken,NOW).status,'corrupt');assert.equal(broken.getItem(SAVE_KEY),bad);assert.equal(broken.writes,0);
 const full=fresh();full.blueprints={};for(let i=0;i<101;i++){const id='historical-'+i;full.blueprints[id]={id,sampleId:RETIRED,authorId:full.uid,authorName:'旧作',parentId:null,rootId:id,parentAuthorName:null};}assert.equal(validateState(full),false);
});
test('ordinary build grid hides necklace while legacy packed and placed management routes still work',()=>{
 const s=legacy(),before=structuredClone(s),html=renderPanel(s,{panel:'build'},{}),grid=html.split('待安置建筑')[0];assert.doesNotMatch(grid,/data-art="necklace_memory_monument"|data-id="(?:authored-necklace|example-necklace_memory_monument)"/);assert.match(grid,/data-art="lamy_memory_column"/);assert.doesNotMatch(html,/旧版收藏/);assert.match(html,/data-action="restore-building"[^>]*data-id="old-packed"/);
 const b=s.buildings[0],p=bp.getBlueprint(s,b.blueprintId),world={exhibits:[{...p,...b,personal:true,displayName:p.name}],plants:[],tiles:s.tiles};const context=renderContext(s,{selection:{kind:'exhibit',id:b.id}},world,NOW);for(const action of ['relocate-building','demolish-building','remix-building'])assert.match(context,new RegExp('data-action="'+action+'"'));assert.match(context,/data-source="necklace-memory-photo"/);assert.doesNotMatch(context,/data-action="confirm-demolition"/);assert.match(renderContext(s,{selection:{kind:'exhibit',id:b.id},demolishId:b.id},world,NOW),/data-action="confirm-demolition"/);assert.deepEqual(s,before);
 assert.match(renderPanel(s,{panel:'blueprint-create',blueprintCreation:newBlueprintCreation()},{}),/20 个离线样例/);
});
test('legacy necklace restoration, relocation, demolition and owned construction preserve existing prices and atomic invalid actions',()=>{
 const s=legacy();for(const a of [{type:'RESTORE_BUILDING',buildingId:'old-packed',tileId:'t0-0'},{type:'RELOCATE_BUILDING',buildingId:'old-placed',tileId:'t2-0'},{type:'RELOCATE_BUILDING',buildingId:'old-worksite',tileId:'t4-0'},{type:'DEMOLISH_BUILDING',buildingId:'old-worksite'},{type:'DEMOLISH_BUILDING',buildingId:'missing'}])atomic(s,a);
 for(const [action,coins,count,bag]of [[{type:'RESTORE_BUILDING',buildingId:'old-packed',tileId:'t4-0'},120,3,0],[{type:'RELOCATE_BUILDING',buildingId:'old-placed',tileId:'t4-0'},100,2,1],[{type:'DEMOLISH_BUILDING',buildingId:'old-placed'},70,1,1],[{type:'CONSTRUCT_BUILDING',blueprintId:'example-necklace_memory_monument',tileId:'t4-0'},60,3,1]]){
  const r=reduce(s,action,NOW);assert.equal(r.ok,true,r.message);assert.equal(r.state.coins,coins);assert.equal(r.state.buildings.length,count);assert.equal(r.state.buildingBag.length,bag);assert.deepEqual(r.state.blueprints,s.blueprints);assert.equal(validateState(r.state),true);
 }
 for(const type of ['RELOCATE_BUILDING','DEMOLISH_BUILDING'])atomic({...s,coins:0},{type,buildingId:'old-placed',tileId:'t4-0'});
});
