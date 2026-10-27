import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {validateState,loadGame,saveGame,SAVE_KEY} from '../src/storage.js';
import * as bp from '../src/blueprints.js';
const NOW=Date.UTC(2026,9,26,3),fresh=()=>{const s=createState(NOW,'builder');s.tiles.push({id:'outside',x:0,y:2,kind:'land'});s.avatarTileId='outside';return s;};
const act=(s,a,t=NOW)=>{const r=reduce(s,a,t);assert.equal(r.ok,true,r.message);assert.equal(validateState(r.state),true);return r.state;};
function own(){const s=act(fresh(),{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'first-blueprint'});return {s,id:Object.keys(s.blueprints)[0]};}
test('one crystal creates permanent blueprint only; each instance costs60coins and legacy return is exact/free',()=>{
 let {s,id}=own();assert.equal(s.crystals,2);assert.equal(s.coins,120);assert.equal(s.buildings.length,0);s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});const building=structuredClone(s.buildings[0]);assert.equal(s.coins,60);
 s={...s,lastSeenAt:NOW+15000,buildings:[],buildingBag:[building]};assert.equal(validateState(s),true);
 s=act(s,{type:'RESTORE_BUILDING',buildingId:building.id,tileId:'tile-0-0'});assert.deepEqual(s.buildings,[building]);assert.equal(s.coins,60);s=act(s,{type:'DEMOLISH_BUILDING',buildingId:building.id});assert.equal(s.coins,10);assert.ok(s.blueprints[id]);assert.equal(s.tiles.length,5);assert.equal(reduce(s,{type:'DEMOLISH_BUILDING',buildingId:building.id},NOW).ok,false);
 assert.equal(reduce(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'},NOW).ok,false);assert.equal(s.crystals,2);
});
test('unsupported duplicate same-parent and repeated receipt creation never charge or grant a demo blueprint',()=>{
 let {s,id}=own();const before=structuredClone(s);for(const a of [{sampleId:'arbitrary-ai',requestId:'unknown'},{sampleId:'calico_reading_den',requestId:'again'},{sampleId:'calico_reading_den',parentId:id,requestId:'same-parent'},{sampleId:'camping_dog_workshop',requestId:'first-blueprint'}]){const r=reduce(s,{type:'CREATE_BLUEPRINT',...a},NOW);assert.equal(r.ok,false);assert.deepEqual(r.state,before);}
 assert.equal(typeof bp.DEMO_BLUEPRINTS,'object');for(const demoId of Object.keys(bp.DEMO_BLUEPRINTS)){const r=reduce(s,{type:'CONSTRUCT_BUILDING',blueprintId:demoId,tileId:'tile-0-0'},NOW);assert.equal(r.ok,false);assert.equal(r.state,s);}
});
test('remix preserves resolvable canonical parent/root credit and changes only to a different supported sample',()=>{
 assert.equal(typeof bp.DEMO_BLUEPRINTS,'object');const parent=Object.values(bp.DEMO_BLUEPRINTS).find(b=>b.sampleId==='portrait_rehearsal_pavilion');let s=act(fresh(),{type:'CREATE_BLUEPRINT',sampleId:'camping_dog_workshop',parentId:parent.id,requestId:'demo-remix'}),b=Object.values(s.blueprints)[0];assert.equal(b.parentId,parent.id);assert.equal(b.rootId,parent.id);assert.equal(b.parentAuthorName,parent.authorName);assert.equal(b.authorId,s.uid);
 const store=memory();assert.equal(saveGame(store,s).ok,true);s=loadGame(store).state;assert.equal(bp.getBlueprint(s,b.id).artKey,'camping_dog_workshop');assert.equal(bp.getBlueprint(s,b.parentId).authorName,'Kelly');
 assert.equal(reduce(fresh(),{type:'CREATE_BLUEPRINT',sampleId:parent.sampleId,parentId:parent.id,requestId:'same-demo'},NOW).ok,false);
});
test('all four mixed land/platform cells support construction; any plant/building occupancy or missingcell rejects atomically',()=>{
 let {s,id}=own();s.tiles[3].kind='platform';s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});for(const t of s.tiles.filter(t=>t.y<2)){for(const a of [{type:'PLANT',varietyId:'radish',tileId:t.id},{type:'RECLAIM',targetId:t.id},{type:'MOVE_BUILDING',targetId:t.id,x:2,y:0},{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:t.id}]){const r=reduce(s,a,NOW);assert.equal(r.ok,false);assert.equal(r.state,s);}}
 const start=own();for(const bad of [start.s,{...start.s,plants:[{id:'otherplant',varietyId:'radish',tileId:'tile-1-1',plantedAt:NOW,readyAt:NOW+15000}]}]){const r=reduce(bad,{type:'CONSTRUCT_BUILDING',blueprintId:start.id,tileId:bad.plants.length?'tile-0-0':'tile-1-1'},NOW);assert.equal(r.ok,false);assert.equal(r.state,bad);}
});
test('insufficient coins, bad legacy restoration and forbidden demo actions leave state unchanged',()=>{
 let {s,id}=own();const poor={...s,coins:59};assert.equal(reduce(poor,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'},NOW).state,poor);s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});const b=s.buildings[0];for(const type of ['PACK_BUILDING','SELL_BUILDING'])assert.equal(reduce(s,{type,buildingId:b.id,gardenId:'demo'},NOW).ok,false);
 s={...s,lastSeenAt:NOW+15000,buildings:[],buildingBag:[b]};assert.equal(reduce(s,{type:'PACK_BUILDING',buildingId:b.id},NOW).ok,false);const r=reduce(s,{type:'RESTORE_BUILDING',buildingId:b.id,tileId:'tile-1-1'},NOW);assert.equal(r.ok,false);assert.equal(r.state,s);
});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),map};};
test('legacy checksum is checked before optional building defaults and expected disk head stays exact',()=>{
 const s=fresh();for(const key of ['blueprints','buildings','buildingBag','plantBag'])delete s[key];const store=memory();assert.equal(saveGame(store,s,NOW).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store);assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.deepEqual(loaded.state,{...s,plantBag:[],blueprints:{},buildings:[],buildingBag:[]});assert.equal(saveGame(store,loaded.state,NOW,{expectedHead:raw}).ok,true);
});
test('validation rejects malformed/cyclic blueprint credit, coerced/prototype refs and duplicate instance IDs across all containers',()=>{
 let {s,id}=own();s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});const b=s.buildings[0];for(const bad of [null,[],{[id]:{...s.blueprints[id],parentId:id}},{[id]:{...s.blueprints[id],rootId:'missing'}},{[id]:{...s.blueprints[id],sampleId:'constructor'}}])assert.equal(validateState({...s,blueprints:bad}),false);
 for(const blueprintId of ['constructor','__proto__',[id],1])assert.equal(validateState({...s,buildings:[{...b,blueprintId}]}),false);
 for(const key of ['plantBag','buildingBag']){const duplicate=key==='plantBag'?{id:b.id,varietyId:'radish',tileId:'removed',plantedAt:NOW,readyAt:NOW+1000}:{...b,tileId:'removed'};assert.equal(validateState({...s,[key]:[duplicate]}),false);}
 assert.equal(validateState({...s,plants:[{id:'overlap',tileId:'tile-1-1',varietyId:'radish',plantedAt:NOW,readyAt:NOW+1000}]}),false);
});
test('packed building and packed plant IDs remain unique even when neither reserves terrain',()=>{
 const {s,id}=own(),plant={id:'duplicate',tileId:'removed',varietyId:'radish',plantedAt:NOW,readyAt:NOW+1000},building={id:'duplicate',blueprintId:id,tileId:'also-removed'};assert.equal(validateState({...s,plantBag:[plant],buildingBag:[building]}),false);
});
test('valid legacy long identity fields and generated IDs remain save-valid after new building transactions',()=>{
 let s={...fresh(),blueprints:{},uid:'u'.repeat(180),profileName:'名'.repeat(180)};assert.equal(validateState(s),true);s=act(s,{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'long-identity'});const id=Object.keys(s.blueprints)[0];assert.ok(id.length<=180);assert.equal(s.blueprints[id].authorName.length,180);s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});assert.ok(s.buildings[0].id.length<=180);assert.equal(saveGame(memory(),s).ok,true);
});
test('exhausted legacy ID counter rejects blueprint/instance creation atomically before any spending',()=>{
 const base={...fresh(),nextId:10000000};assert.equal(validateState(base),true);assert.equal(reduce(base,{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'exhausted'},NOW).state,base);const {s,id}=own(),full={...s,nextId:10000000};assert.equal(reduce(full,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'},NOW).state,full);
});
test('blueprint display name is always projected from trusted sample, not an extra saved field',()=>{
 const {s,id}=own();s.blueprints[id].name='untrusted override';assert.equal(bp.getBlueprint(s,id).name,'团团猫书屋');
});
test('a schema-valid stale counter cannot overwrite a permanent blueprint or duplicate a packed instance',()=>{
 let {s,id}=own();s={...s,nextId:1};assert.equal(validateState(s),true);s=act(s,{type:'CREATE_BLUEPRINT',sampleId:'camping_dog_workshop',requestId:'stale-counter'});assert.equal(Object.keys(s.blueprints).length,8);assert.equal(s.blueprints[id].sampleId,'calico_reading_den');
 s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});const first=s.buildings[0];s={...s,lastSeenAt:NOW+15000,buildings:[],buildingBag:[first]};s={...s,nextId:Number(first.id.split('-').at(-1))};s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});assert.notEqual(s.buildings[0].id,first.id);
});
