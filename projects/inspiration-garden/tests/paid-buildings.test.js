import test from 'node:test';import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';import {validateState,saveGame,loadGame,SAVE_KEY} from '../src/storage.js';
const NOW=Date.UTC(2026,9,26,5),DONE=NOW+15000;
const act=(s,a,t=DONE)=>{const r=reduce(s,a,t);assert.equal(r.ok,true,r.message);assert.equal(validateState(r.state),true);return r.state;};
function house(){let s=createState(NOW,'paid-builder');s=act(s,{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'paid'},NOW);const blueprintId=Object.keys(s.blueprints)[0];s.tiles.push({id:'tile-2-0',x:2,y:0,kind:'platform'},{id:'tile-2-1',x:2,y:1,kind:'land'});s.tiles.push({id:'outside',x:0,y:2,kind:'land'},{id:'bottom-1',x:1,y:2,kind:'land'},{id:'bottom-2',x:2,y:2,kind:'land'});s.avatarTileId='outside';s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId,tileId:'tile-0-0'},NOW);return {s,b:structuredClone(s.buildings[0]),blueprintId};}
const reject=(s,a,t=DONE)=>{const before=structuredClone(s),r=reduce(s,a,t);assert.equal(r.ok,false,JSON.stringify(a));assert.equal(r.state,s);assert.deepEqual(s,before);};
test('paid relocation allows overlap with only its own fourcells, preserves exact instance/timing and charges20once',()=>{
 let {s,b,blueprintId}=house();s=act(s,{type:'RELOCATE_BUILDING',buildingId:b.id,tileId:'tile-1-0'});assert.equal(s.coins,40);assert.equal(s.crystals,2);assert.deepEqual(s.buildings,[{...b,tileId:'tile-1-0'}]);assert.ok(s.blueprints[blueprintId]);assert.equal(s.buildingBag.length,0);
 reject(s,{type:'RELOCATE_BUILDING',buildingId:b.id,tileId:'tile-1-0'});s=act(s,{type:'RELOCATE_BUILDING',buildingId:b.id,tileId:'tile-0-0'});assert.equal(s.coins,20);assert.deepEqual(s.buildings,[b]);
});
test('relocation rejects same destination missingcell plant anotherhouse pending support insufficient funds and demos atomically',()=>{
 const {s,b,blueprintId}=house(),a={type:'RELOCATE_BUILDING',buildingId:b.id,tileId:'tile-1-0'};
 for(const [state,action] of [[s,{...a,tileId:b.tileId}],[s,{...a,tileId:'tile-2-0'}],[s,{...a,tileId:'missing'}],[{...s,coins:19},a],[s,{...a,gardenId:'demo'}],[s,{...a,buildingId:'demo-house'}],[{...s,plants:[{id:'block',varietyId:'radish',tileId:'tile-2-1',plantedAt:NOW,readyAt:DONE}]},a],[{...s,buildings:[...s.buildings,{id:'other',blueprintId,tileId:'tile-2-0'}]},a],[{...s,tiles:s.tiles.map(t=>t.id==='tile-2-1'?{...t,startedAt:NOW,readyAt:NOW+3000}:t)},a]])reject(state,action,state.tiles.some(t=>t.readyAt)?NOW+2999:DONE);
 reject(s,a,DONE-1);assert.equal(reduce({...s,lastSeenAt:DONE},a,NOW).ok,true,'observed completion is monotonic');
});
test('demolition deducts50 once without refund, preserves blueprint/supports and rejects pending poor/demo/missing',()=>{
 let {s,b,blueprintId}=house();for(const state of [{...s,coins:49},s])if(state.coins===49)reject(state,{type:'DEMOLISH_BUILDING',buildingId:b.id});
 reject(s,{type:'DEMOLISH_BUILDING',buildingId:b.id},DONE-1);reject(s,{type:'DEMOLISH_BUILDING',buildingId:b.id,gardenId:'demo'});const tiles=structuredClone(s.tiles);s=act(s,{type:'DEMOLISH_BUILDING',buildingId:b.id});assert.equal(s.coins,10);assert.equal(s.crystals,2);assert.deepEqual(s.tiles,tiles);assert.deepEqual(s.buildings,[]);assert.ok(s.blueprints[blueprintId]);reject(s,{type:'DEMOLISH_BUILDING',buildingId:b.id});
});
test('old pack/sale transactions can never create a bag entry or mint a refund',()=>{
 const {s,b}=house();for(const type of ['PACK_BUILDING','SELL_BUILDING'])reject(s,{type,buildingId:b.id});
});
test('already-packed legacy building loads with exact rawhead, returns free once and cannot repack or duplicate',()=>{
 const {s,b,blueprintId}=house(),legacy={...s,lastSeenAt:DONE,buildings:[],buildingBag:[b]},map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.equal(saveGame(store,legacy,DONE).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store,DONE+1);assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.deepEqual(loaded.state,legacy);
 let restored=act(loaded.state,{type:'RESTORE_BUILDING',buildingId:b.id,tileId:'tile-1-0'});assert.deepEqual(restored.buildings,[{...b,tileId:'tile-1-0'}]);assert.deepEqual(restored.buildingBag,[]);assert.equal(restored.coins,60);assert.equal(restored.crystals,2);assert.ok(restored.blueprints[blueprintId]);
 for(const type of ['RESTORE_BUILDING','PACK_BUILDING','SELL_BUILDING'])reject(restored,{type,buildingId:b.id,tileId:'tile-0-0'});assert.equal(saveGame(store,restored,DONE,{expectedHead:raw}).ok,true);assert.deepEqual(loadGame(store).state,restored);
});
