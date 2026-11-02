import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDING_SAMPLES,buildingSample,getBlueprint,matchBuildingIdeas} from '../src/blueprints.js';
import {BUILDING_EXAMPLES} from '../src/ui-state.js';
import {createState} from '../src/state.js';
import {validateState,saveGame,loadGame,SAVE_KEY} from '../src/storage.js';
const additions=['xt50_memory_camera','scallop_shell_house','camping_tarp_pavilion'];
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};

test('six personal directions use new modern motifs without changing legacy identities or footprints',()=>{
 const cat=buildingSample('fluffy_cat_cottage'),pendant=buildingSample('necklace_memory_monument'),car=buildingSample('airforce_memory_house');
 assert.match(cat.name,/绒云|折|壳/);assert.equal(cat.sourceFrameId,'fluffy-cat-real-photo');assert.equal(cat.sourceDate,'2026-10-26');
 assert.match(pendant.name,/银|坠/);assert.doesNotMatch(pendant.sourceStory,/金色|心环/);assert.deepEqual(pendant.footprint,[2,2]);
 assert.equal(car.interaction,'hover');assert.deepEqual(car.footprint,[2,1]);assert.match(car.sourceTitle+car.sourceStory,/Roadster|特斯拉/);assert.doesNotMatch(car.sourceStory,/我的特斯拉|最喜欢的一双|白鞋|球鞋/);
 for(const [id,footprint] of [[additions[0],[1,1]],[additions[1],[2,2]],[additions[2],[2,2]]])assert.deepEqual(buildingSample(id)?.footprint,footprint,id);
 assert.equal(BUILDING_SAMPLES.length,21);assert.equal(buildingSample('lamy_memory_column').name,'字里灯塔');
 for(const id of ['fluffy_cat_cottage','lamy_memory_column','airforce_memory_house',...additions]){const example=BUILDING_EXAMPLES.find(e=>e.sampleId===id);assert.ok(example,id);assert.equal(matchBuildingIdeas(example.text)[0]?.id,id);}
 assert.equal(matchBuildingIdeas('富士 X-T50 相机')[0]?.id,additions[0]);assert.equal(matchBuildingIdeas('扇贝房子')[0]?.id,additions[1]);assert.equal(matchBuildingIdeas('露营天幕')[0]?.id,additions[2]);
});
test('three added permanent blueprints arrive once without touching original grants, economy or counters',()=>{
 const state=createState(1000,'owner');assert.equal(state.personalExhibitsVersion,1);
 for(const id of additions)assert.equal(Object.values(state.blueprints).filter(b=>b.sampleId===id&&b.authorId===state.uid).length,1);
 assert.equal(state.coins,120);assert.equal(state.crystals,3);assert.equal(state.nextId,1);assert.equal(validateState(state),true);
 for(const id of ['lamy_memory_column','airforce_memory_house'])assert.equal(Object.values(state.blueprints).filter(b=>b.sampleId===id).length,1);
});
test('old valid saves hydrate new grants only in memory and preserve occupied blueprint IDs',()=>{
 const state=createState(1000,'legacy');delete state.personalExhibitsVersion;
 for(const [id,b]of Object.entries(state.blueprints))if(additions.includes(b.sampleId))delete state.blueprints[id];
 const collision='example-'+additions[0];state.blueprints[collision]={id:collision,sampleId:'calico_reading_den',authorId:state.uid,authorName:'我',parentId:null,rootId:collision,parentAuthorName:null};
 const store=memory();assert.equal(saveGame(store,state).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store);
 assert.equal(loaded.status,'loaded');assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(loaded.head,raw);assert.deepEqual(loaded.state.blueprints[collision],state.blueprints[collision]);
 for(const id of additions)assert.equal(Object.values(loaded.state.blueprints).filter(b=>b.sampleId===id).length,1);
 assert.deepEqual(loadGame(store).state,loaded.state);assert.equal(saveGame(store,loaded.state).ok,true);assert.deepEqual(loadGame(store).state,loaded.state);
 const oldCar=Object.values(loaded.state.blueprints).find(b=>b.sampleId==='airforce_memory_house');assert.equal(getBlueprint(loaded.state,oldCar.id).interaction,'hover');
 assert.equal(loaded.state.coins,state.coins);assert.equal(loaded.state.nextId,state.nextId);
});
test('reserved slots deliver all three gifts to old 97–100 blueprint saves without replacing any record',()=>{
 for(const count of [97,98,99,100]){
  const state=createState(1000,'full');delete state.personalExhibitsVersion;state.blueprints={};
  for(let i=0;i<count;i++){const id='old-'+i;state.blueprints[id]={id,sampleId:'calico_reading_den',authorId:state.uid,authorName:'我',parentId:null,rootId:id,parentAuthorName:null};}
  assert.equal(validateState(state),true);const store=memory();assert.equal(saveGame(store,state).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store).state;
  for(const id of additions)assert.equal(Object.values(loaded.blueprints).filter(b=>b.sampleId===id).length,1,`${count}: ${id}`);
  assert.equal(Object.keys(loaded.blueprints).length,count+3);assert.equal(loaded.personalExhibitsVersion,1);assert.equal(validateState(loaded),true);
  for(const [id,record]of Object.entries(state.blueprints))assert.deepEqual(loaded.blueprints[id],record);
  assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(saveGame(store,loaded).ok,true);assert.deepEqual(loadGame(store).state,loaded);
 }
});
test('reserve counts distinct owned gifted directions, not duplicate records or arbitrary oversized saves',()=>{
 const state=createState(1000,'full');delete state.personalExhibitsVersion;state.blueprints={};
 for(let i=0;i<100;i++){const id='old-'+i;state.blueprints[id]={id,sampleId:i===0?additions[0]:'calico_reading_den',authorId:state.uid,authorName:'我',parentId:null,rootId:id,parentAuthorName:null};}
 const store=memory();assert.equal(saveGame(store,state).ok,true);const loaded=loadGame(store).state;assert.equal(Object.keys(loaded.blueprints).length,102);assert.equal(Object.values(loaded.blueprints).filter(b=>b.sampleId===additions[0]).length,1);
 const forged=structuredClone(state);for(let i=100;i<104;i++){const id='extra-'+i;forged.blueprints[id]={...state.blueprints['old-1'],id,rootId:id};}assert.equal(validateState(forged),false);
 const duplicates=structuredClone(state);for(let i=100;i<102;i++){const id='extra-'+i;duplicates.blueprints[id]={...state.blueprints['old-0'],id,rootId:id};}assert.equal(validateState(duplicates),false,'one sample cannot multiply the reserve');
});
test('ordinary blueprint creation at 100 or reserved 103 fails atomically before spending a crystal',async()=>{
 const {reduce}=await import('../src/state.js');
 for(const count of [100,103]){
  const state=createState(1000,'capacity');state.blueprints={};
  for(let i=0;i<count;i++){const id='owned-'+i;state.blueprints[id]={id,sampleId:i<3?additions[i]:'calico_reading_den',authorId:state.uid,authorName:'我',parentId:null,rootId:id,parentAuthorName:null};}
  assert.equal(validateState(state),true);const result=reduce(state,{type:'CREATE_BLUEPRINT',sampleId:'fluffy_cat_cottage',requestId:'capacity-'+count},1000);assert.equal(result.ok,false);assert.strictEqual(result.state,state);assert.equal(result.state.crystals,3);assert.equal(validateState(result.state),true);
 }
});
