import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {getBlueprint,ownedBlueprintForSample} from '../src/blueprints.js';
import {loadGame,saveGame,validateState,SAVE_KEY} from '../src/storage.js';
import {renderPanel} from '../src/ui.js';

const NOW=1793062800000,CAT='fluffy_cat_cottage',BASE='example-'+CAT;
const TRIO=['xt50_memory_camera','scallop_shell_house','camping_tarp_pavilion'];
const fresh=()=>createState(NOW,'cat-owner');
const legacy=()=>{const state=fresh();delete state.catBlueprintsVersion;for(const [id,b]of Object.entries(state.blueprints))if(b.sampleId===CAT)delete state.blueprints[id];return state;};
const record=(state,id,sampleId='calico_reading_den')=>({id,sampleId,authorId:state.uid,authorName:'旧作作者',parentId:null,rootId:id,parentAuthorName:null});
const memory=(primary=null,recovery=null)=>{const data=new Map([[SAVE_KEY,primary],[SAVE_KEY+':recovery',recovery]]);let writes=0;return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes++;data.set(key,value);},get writes(){return writes;}};};
const ownedCats=state=>Object.values(state.blueprints).filter(b=>b.sampleId===CAT&&b.authorId===state.uid);
const withoutCatGrant=state=>{const copy=structuredClone(state);delete copy.catBlueprintsVersion;for(const [id,b]of Object.entries(copy.blueprints))if(b.sampleId===CAT)delete copy.blueprints[id];return copy;};
const encode=state=>{const text=JSON.stringify(state);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return JSON.stringify({format:1,savedAt:NOW,state,checksum:(h>>>0).toString(16)});};

test('new garden owns one free permanent Su cat blueprint, visible in construction without placing an instance',()=>{
 const state=fresh();assert.equal(ownedCats(state).length,1);
 assert.deepEqual(ownedCats(state)[0],{id:BASE,sampleId:CAT,authorId:'cat-owner',authorName:'苏贝壳',parentId:null,rootId:BASE,parentAuthorName:null});
 assert.equal(state.catBlueprintsVersion,1);assert.equal(Object.keys(state.blueprints).length,6);
 assert.equal(state.coins,120);assert.equal(state.crystals,3);assert.equal(state.nextId,1);assert.deepEqual(state.inventory,{radish:2});assert.deepEqual(state.buildings,[]);assert.deepEqual(state.buildingBag,[]);assert.deepEqual(state.receipts,[]);
 const html=renderPanel(state,{panel:'build'},{});assert.match(html,new RegExp('data-action="choose-blueprint"[^>]*data-id="'+BASE+'"'));assert.equal((html.match(/data-art="fluffy_cat_cottage"/g)??[]).length,1);assert.equal(validateState(state),true);
});

test('v30 save receives only the missing cat in memory, with exact raw head and all unrelated progress preserved',()=>{
 const before=legacy();before.coins=17;before.crystals=0;before.nextId=83;before.inventory.radish=7;
 const store=memory();assert.equal(saveGame(store,before,NOW).ok,true);const raw=store.getItem(SAVE_KEY),writes=store.writes;
 const loaded=loadGame(store,NOW+1000);assert.equal(loaded.status,'loaded');assert.equal(ownedCats(loaded.state).length,1);assert.equal(loaded.state.catBlueprintsVersion,1);assert.deepEqual(withoutCatGrant(loaded.state),before);assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.writes,writes);
 assert.deepEqual(loadGame(store).state,loaded.state);assert.equal(store.writes,writes);
 assert.equal(saveGame(store,loaded.state,NOW+1000,{expectedHead:raw}).ok,true);const saved=store.getItem(SAVE_KEY),savedWrites=store.writes;
 assert.deepEqual(loadGame(store).state,loaded.state);assert.equal(store.getItem(SAVE_KEY),saved);assert.equal(store.writes,savedWrites);
});

test('pre-starter saves gain the six active defaults but never resurrect a retired necklace grant',()=>{
 const before=legacy();delete before.memorialBlueprintsVersion;delete before.personalExhibitsVersion;before.blueprints={};
 for(const keepNecklace of [false,true]){
  const old=structuredClone(before);if(keepNecklace)old.blueprints['my-necklace']=record(old,'my-necklace','necklace_memory_monument');
  const raw=encode(old),store=memory(raw),loaded=loadGame(store).state;
  assert.equal(ownedCats(loaded).length,1);assert.equal(Object.keys(loaded.blueprints).length,keepNecklace?7:6);assert.equal(Object.values(loaded.blueprints).filter(b=>b.sampleId==='necklace_memory_monument').length,keepNecklace?1:0);
  if(keepNecklace)assert.deepEqual(loaded.blueprints['my-necklace'],old.blueprints['my-necklace']);
  assert.equal(loaded.memorialBlueprintsVersion,1);assert.equal(loaded.personalExhibitsVersion,1);assert.equal(loaded.catBlueprintsVersion,1);assert.equal(validateState(loaded),true);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.writes,0);
 }
});

test('already-authored cat is not duplicated and its ID, root, author, source projection and currency survive reload',()=>{
 const before=legacy();before.profileName='自己的署名';
 const created=reduce(before,{type:'CREATE_BLUEPRINT',sampleId:CAT,parentId:'demo-blueprint-portrait_rehearsal_pavilion',requestId:'prior-cat'},NOW);
 assert.equal(created.ok,true);const state=created.state,id=created.effect.blueprintId,original=structuredClone(state.blueprints[id]),source=getBlueprint(state,id);
 assert.equal(state.crystals,2);const store=memory(encode(state)),loaded=loadGame(store).state;
 assert.equal(ownedCats(loaded).length,1);assert.deepEqual(loaded.blueprints,state.blueprints);assert.deepEqual(loaded.blueprints[id],original);assert.deepEqual(getBlueprint(loaded,id),source);assert.equal(source.sourceFrameId,'fluffy-cat-real-photo');assert.equal(source.rootId,'demo-blueprint-portrait_rehearsal_pavilion');assert.equal(loaded.crystals,2);assert.equal(loaded.catBlueprintsVersion,1);assert.equal(store.writes,0);
 assert.equal(saveGame(store,loaded,NOW).ok,true);assert.deepEqual(loadGame(store).state,loaded);
});

test('cat grant skips occupied example IDs without overwriting records or their lineage',()=>{
 const old=legacy();old.blueprints[BASE]=record(old,BASE,'necklace_memory_monument');old.blueprints[BASE+'-1']={...record(old,BASE+'-1'),parentId:BASE,rootId:BASE,parentAuthorName:old.blueprints[BASE].authorName};
 const before=structuredClone(old),store=memory(encode(old)),loaded=loadGame(store).state;
 assert.equal(ownedCats(loaded).length,1);assert.equal(ownedCats(loaded)[0].id,BASE+'-2');assert.equal(ownedCats(loaded)[0].rootId,BASE+'-2');assert.deepEqual(withoutCatGrant(loaded),before);assert.equal(validateState(loaded),true);assert.equal(store.writes,0);assert.equal(saveGame(store,loaded,NOW).ok,true);assert.deepEqual(loadGame(store).state,loaded);
});

for(const [count,olderStarters,includeTrio,want]of [[99,true,false,104],[100,true,false,104],[99,false,false,100],[100,false,false,101],[99,false,true,100],[100,false,true,101],[101,false,true,102],[102,false,true,103],[103,false,true,104]]){
 test(`cat grant preserves a valid ${count}-record ${olderStarters?'pre-starter':includeTrio?'trio-reserved':'v30'} save and round-trips ${want} records`,()=>{
  const old=legacy();old.blueprints={};if(olderStarters){delete old.memorialBlueprintsVersion;delete old.personalExhibitsVersion;}
  for(let i=0;i<count;i++){const id='old-'+i;old.blueprints[id]=record(old,id,includeTrio&&i<3?TRIO[i]:'calico_reading_den');}
  assert.equal(validateState(old),true);const raw=encode(old),store=memory(raw),loaded=loadGame(store).state;
  assert.equal(ownedCats(loaded).length,1);assert.equal(Object.keys(loaded.blueprints).length,want);assert.equal(validateState(loaded),true);
  for(const [id,b]of Object.entries(old.blueprints))assert.deepEqual(loaded.blueprints[id],b);
  assert.equal(loaded.coins,old.coins);assert.equal(loaded.crystals,old.crystals);assert.equal(loaded.nextId,old.nextId);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.writes,0);assert.equal(saveGame(store,loaded,NOW).ok,true);assert.deepEqual(loadGame(store).state,loaded);
 });
}

test('the cat reserve counts one distinct owned sample, never markers, duplicates or arbitrary oversized records',()=>{
 for(const [count,reserved,valid]of [[100,[],true],[101,[],false],[101,[CAT],true],[102,[CAT,CAT],false],[104,[CAT,...TRIO],true],[105,[CAT,...TRIO,CAT],false],[104,[...TRIO],false]]){
  const state=legacy();state.catBlueprintsVersion=1;state.blueprints={};for(let i=0;i<count;i++){const id='entry-'+i;state.blueprints[id]=record(state,id,reserved[i]??'calico_reading_den');}
  assert.equal(validateState(state),valid,`${count}: ${reserved}`);
  if(!valid){const raw=encode(state),store=memory(raw);assert.equal(loadGame(store).status,'corrupt');assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.writes,0);assert.equal(saveGame(store,state).ok,false);}
 }
});

test('ordinary CREATE stays capped at 100 with or without the extra gift reserve and never spends on rejection',()=>{
 for(const count of [99,100,103,104]){
  const state=fresh();state.blueprints={};for(let i=0;i<count;i++){const id='owned-'+i;state.blueprints[id]=record(state,id,[CAT,...TRIO][i]??'calico_reading_den');}
  assert.equal(validateState(state),true);const before=structuredClone(state),result=reduce(state,{type:'CREATE_BLUEPRINT',sampleId:'camping_dog_workshop',requestId:'capacity-'+count},NOW);
  assert.equal(result.ok,count===99);if(count===99){assert.equal(Object.keys(result.state.blueprints).length,100);assert.equal(result.state.crystals,2);}else{assert.strictEqual(result.state,state);assert.deepEqual(state,before);assert.equal(result.state.crystals,3);}
 }
});

test('only marker version 1 is accepted and a completed grant is not repeated on reload',()=>{
 const old=legacy();for(const bad of [0,2,null,'1',{},[]])assert.equal(validateState({...old,catBlueprintsVersion:bad}),false);
 old.catBlueprintsVersion=1;const store=memory(encode(old));assert.equal(validateState(old),true);assert.deepEqual(loadGame(store).state,old);assert.equal(store.writes,0);
});

test('raw checksum and schema failures are rejected before migration; valid recovery migrates without rewriting either slot',()=>{
 const state=legacy(),valid=encode(state),tampered=JSON.parse(valid);tampered.state.crystals=19;const raw=JSON.stringify(tampered),broken=memory(raw);
 assert.equal(loadGame(broken).status,'corrupt');assert.equal(broken.getItem(SAVE_KEY),raw);assert.equal(broken.writes,0);
 const malformed=structuredClone(state);malformed.blueprints.bad={...record(state,'bad',CAT),authorId:'not-the-owner'};const invalid=memory(encode(malformed));assert.equal(loadGame(invalid).status,'corrupt');assert.equal(invalid.writes,0);
 const store=memory(raw,valid),loaded=loadGame(store);assert.equal(loaded.status,'recovered');assert.equal(ownedCats(loaded.state).length,1);assert.deepEqual(withoutCatGrant(loaded.state),state);assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.getItem(SAVE_KEY+':recovery'),valid);assert.equal(store.writes,0);
});

test('free cat blueprint builds for the existing 60 coins, retains the blueprint and needs no crystals',()=>{
 const state=fresh();state.crystals=0;state.tiles.push({id:'outside',x:0,y:2,kind:'land'});state.avatarTileId='outside';
 const cat=ownedBlueprintForSample(state,CAT);assert.ok(cat);
 const duplicate=reduce(state,{type:'CREATE_BLUEPRINT',sampleId:CAT,requestId:'already-free'},NOW);assert.equal(duplicate.ok,false);assert.strictEqual(duplicate.state,state);
 const built=reduce(state,{type:'CONSTRUCT_BUILDING',blueprintId:cat.id,tileId:'tile-0-0'},NOW);assert.equal(built.ok,true,built.message);assert.equal(built.state.coins,60);assert.equal(built.state.crystals,0);assert.equal(built.state.buildings.length,1);assert.deepEqual(built.state.blueprints,state.blueprints);assert.equal(validateState(built.state),true);
 const store=memory();assert.equal(saveGame(store,built.state,NOW).ok,true);assert.deepEqual(loadGame(store).state,built.state);
});
