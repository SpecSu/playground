import test from 'node:test';import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';import {validateState,saveGame,loadGame} from '../src/storage.js';import {findTilePath,createTileWalker} from '../src/visual-walk.js';import * as work from '../src/construction.js';
const NOW=Date.UTC(2026,9,26,4),fresh=()=>createState(NOW,'worksite');
const act=(s,a,t=NOW)=>{const r=reduce(s,a,t);assert.equal(r.ok,true,r.message);assert.equal(validateState(r.state),true);return r.state;};
const reject=(s,a,t)=>{const r=reduce(s,a,t);assert.equal(r.ok,false,JSON.stringify(a));assert.equal(r.state,s);};
function blueprint(){let s=act(fresh(),{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'work-blueprint'});s.tiles.push({id:'outside',x:0,y:2,kind:'land'},{id:'bottom-1',x:1,y:2,kind:'land'},{id:'bottom-2',x:2,y:2,kind:'land'});s.avatarTileId='outside';return {s,id:Object.keys(s.blueprints)[0]};}
test('new foundation reserves and charges once but cannot support planting walking edges or chained tiles until exact3s boundary',()=>{
 let s=act(fresh(),{type:'BUILD',kind:'land',x:2,y:0}),tile=s.tiles.at(-1);assert.equal(tile.startedAt,NOW);assert.equal(tile.readyAt,NOW+3000);assert.equal(s.coins,95);
 for(const a of [{type:'BUILD',kind:'land',x:2,y:0},{type:'BUILD',kind:'land',x:3,y:0},{type:'PLANT',tileId:tile.id,varietyId:'radish'},{type:'TRAVEL',tileId:tile.id},{type:'BUILD',kind:'fence',tileId:tile.id,edge:'north'},{type:'RECLAIM',targetId:tile.id},{type:'MOVE_BUILDING',targetId:tile.id,x:2,y:1}])reject(s,a,NOW+2999);
 s=act(s,{type:'TRAVEL',tileId:tile.id},NOW+3000);s=act(s,{type:'PLANT',tileId:tile.id,varietyId:'radish'},NOW+3000);assert.equal(s.coins,95);
});
test('unfinished edge cannot be moved/reclaimed directly or carried/refunded with its support tile',()=>{
 let s=act(fresh(),{type:'BUILD',kind:'fence',tileId:'tile-0-0',edge:'north'}),edge=s.edges[0];assert.equal(edge.readyAt,NOW+3000);
 for(const a of [{type:'RECLAIM',targetId:edge.id},{type:'MOVE_BUILDING',targetId:edge.id,tileId:'tile-1-0',edge:'north'},{type:'RECLAIM',targetId:'tile-0-0'},{type:'MOVE_BUILDING',targetId:'tile-0-0',x:2,y:1}])reject(s,a,NOW+2999);
 s=act(s,{type:'RECLAIM',targetId:edge.id},NOW+3000);assert.equal(s.coins,116);
});
test('personal worksite reserves4cells for15s and cannot relocate/demolish early; finished move keeps exact timing',()=>{
 let {s,id}=blueprint();s.tiles.push({id:'tile-2-0',x:2,y:0,kind:'land'},{id:'tile-2-1',x:2,y:1,kind:'platform'});s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});const b=structuredClone(s.buildings[0]);assert.equal(b.startedAt,NOW);assert.equal(b.readyAt,NOW+15000);assert.equal(s.coins,60);
 for(const a of [{type:'RELOCATE_BUILDING',buildingId:b.id,tileId:'tile-1-0'},{type:'DEMOLISH_BUILDING',buildingId:b.id},{type:'PACK_BUILDING',buildingId:b.id},{type:'SELL_BUILDING',buildingId:b.id},{type:'PLANT',varietyId:'radish',tileId:'tile-1-1'},{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'}])reject(s,a,NOW+14999);
 s=act(s,{type:'RELOCATE_BUILDING',buildingId:b.id,tileId:'tile-1-0'},NOW+15000);assert.deepEqual(s.buildings[0],{...b,tileId:'tile-1-0'});assert.equal(s.coins,40);reject(s,{type:'DEMOLISH_BUILDING',buildingId:b.id},NOW+20000);
});
test('mixed completed/pending supports reject construction until both new foundations finish',()=>{
 let {s,id}=blueprint();s=act(s,{type:'BUILD',kind:'platform',x:2,y:0});s=act(s,{type:'BUILD',kind:'land',x:2,y:1});reject(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-1-0'},NOW+2999);s=act(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-1-0'},NOW+3000);assert.equal(s.buildings[0].readyAt,NOW+18000);
});
test('move/reclaim may not disconnect completed walking terrain through an unfinished bridge',()=>{
 const s=fresh();s.tiles=[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]].map(([x,y])=>({id:`t-${x}-${y}`,x,y,kind:'land',...(y===1?{startedAt:NOW,readyAt:NOW+3000}:{})}));s.avatarTileId='t-0-0';assert.equal(validateState(s),true);
 reject(s,{type:'RECLAIM',targetId:'t-1-0'},NOW+2999);reject(s,{type:'MOVE_BUILDING',targetId:'t-1-0',x:3,y:0},NOW+2999);assert.equal(reduce(s,{type:'RECLAIM',targetId:'t-1-0'},NOW+3000).ok,true);
});
test('old timingless construction is finished and saved pending progress reloads without writes, rewards or new charge',()=>{
 assert.equal(typeof work.isBuilt,'function');assert.equal(work.isBuilt({id:'legacy'},NOW),true);let s=act(fresh(),{type:'BUILD',kind:'platform',x:2,y:0});const map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};saveGame(store,s,NOW);const bytes=[...map],loaded=loadGame(store,NOW+9000);assert.deepEqual([...map],bytes);assert.deepEqual(loaded.state,s);assert.equal(work.constructionProgress(s.tiles.at(-1),NOW+1500),.5);assert.equal(work.constructionProgress(s.tiles.at(-1),NOW+3000),1);assert.equal(loaded.state.coins,102);
});
test('partial/coerced/wrong-duration timestamps and pending packed building are rejected deterministically',()=>{
 const s=fresh();for(const timing of [{startedAt:NOW},{readyAt:NOW+3000},{startedAt:NOW,readyAt:'later'},{startedAt:NOW,readyAt:NOW+2999},{startedAt:Infinity,readyAt:Infinity}])assert.equal(validateState({...s,tiles:s.tiles.map((t,i)=>i? t:{...t,...timing})}),false);
 let {s:house,id}=blueprint();house=act(house,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'});assert.equal(validateState({...house,buildings:[],buildingBag:house.buildings}),false);assert.equal(reduce({...house,buildings:[],buildingBag:house.buildings},{type:'RESTORE_BUILDING',buildingId:house.buildings[0].id,tileId:'tile-0-0'},NOW+14999).ok,false);
});
test('walker excludes pending foundations with the same exact completion boundary and supports a frozen wallclock',()=>{
 const tiles=[{id:'a',x:0,y:0,kind:'land'},{id:'b',x:1,y:0,kind:'platform',startedAt:NOW,readyAt:NOW+3000}];assert.deepEqual(findTilePath(tiles,'a','b',NOW+2999),[]);assert.equal(findTilePath(tiles,'a','b',NOW+3000).length,2);let clock=NOW+2999;const walker=createTileWalker({clock:()=>clock});walker.reset(tiles,'a');assert.equal(walker.go(tiles,'b',0),false);clock++;assert.equal(walker.go(tiles,'b',0),true);assert.equal(walker.sample(1000).tileId,'b');
});
test('backward wallclock never undoes monotonic transaction completion or charges twice',()=>{
 let s=act(fresh(),{type:'BUILD',kind:'land',x:2,y:0});s=act(s,{type:'TRAVEL',tileId:s.tiles.at(-1).id},NOW+3000);s=act(s,{type:'PLANT',tileId:s.tiles.at(-1).id,varietyId:'radish'},NOW);assert.equal(s.coins,95);assert.equal(s.lastSeenAt,NOW+3000);
});
test('unrepresentable legacy future clock cannot debit a new worksite into an unsaveable timestamp pair',()=>{
 const future={...fresh(),lastSeenAt:Number.MAX_VALUE};assert.equal(validateState(future),true);reject(future,{type:'BUILD',kind:'land',x:2,y:0},NOW);let {s,id}=blueprint();s={...s,lastSeenAt:Number.MAX_VALUE};assert.equal(validateState(s),true);reject(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'},NOW);
});
test('staggered pending foundations preserve connected walking at every future completion frontier',()=>{
 let s=act(fresh(),{type:'BUILD',kind:'land',x:2,y:0});s=act(s,{type:'BUILD',kind:'land',x:2,y:1},NOW+1000);reject(s,{type:'RECLAIM',targetId:'tile-1-0'},NOW+1000);reject(s,{type:'MOVE_BUILDING',targetId:'tile-1-0',x:1,y:2},NOW+1000);
 assert.equal(validateState({...s,tiles:s.tiles.filter(t=>t.id!=='tile-1-0')}),false);s=act(s,{type:'SET_MUTED',value:true},NOW+3000);assert.equal(validateState(s),true);assert.equal(reduce(s,{type:'RECLAIM',targetId:'tile-1-0'},NOW+4000).ok,true);
});
test('reclaim records actual safe actor support regardless of saved tile array ordering',()=>{
 let s=act(fresh(),{type:'BUILD',kind:'land',x:2,y:0});s.tiles=[s.tiles.at(-1),...s.tiles.slice(0,-1)];s.avatarTileId='tile-0-0';assert.equal(validateState(s),true);s=act(s,{type:'RECLAIM',targetId:'tile-0-0',actorPosition:{x:1,y:1}},NOW+1000);assert.notEqual(s.avatarTileId,'tile-2-0');assert.equal(validateState(s),true);
});
