import test from 'node:test';import assert from 'node:assert/strict';
import {findTilePath,createTileWalker} from '../src/visual-walk.js';
import {createState,reduce} from '../src/state.js';import {saveGame,loadGame,SAVE_KEY,validateState} from '../src/storage.js';
const NOW=100000,grid=(w=4,h=3)=>Array.from({length:w*h},(_,i)=>({id:`t${i%w}:${Math.floor(i/w)}`,x:i%w,y:Math.floor(i/w),kind:'land'}));
const house={id:'house',x:1,y:0,footprint:[2,2],startedAt:NOW,readyAt:NOW+15000};
const inside=(p,b=house)=>p.x>b.x-.5&&p.x<b.x+1.5&&p.y>b.y-.5&&p.y<b.y+1.5;
function owned(){let s=createState(NOW,'solid-house');s.tiles=grid();s.avatarTileId='t3:2';s=reduce(s,{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'solid'},NOW).state;return {s,id:Object.keys(s.blueprints)[0]};}
test('manual pathfinder and walker exclude all four reserved building cells and detour along real supports',()=>{
 const ts=grid(),path=findTilePath(ts,'t0:0','t3:0',NOW,[house]);assert.ok(path.length);assert.ok(path.every(p=>!inside(p)));const w=createTileWalker({clock:()=>NOW});w.reset(ts,'t0:0',[],{},[house]);assert.equal(w.go(ts,'t3:0',0,[],{},[house]),true);for(let at=0;at<=5000;at+=10)assert.equal(inside(w.sample(at)),false,`entered footprint at${at}`);assert.equal(w.sample(5000).tileId,'t3:0');
});
test('building approach finishes at a reachable actual outside cell and unreachable route never changes position',()=>{
 const ts=grid(),w=createTileWalker({clock:()=>NOW});w.reset(ts,'t0:0',[],{},[house]);assert.equal(w.go(ts,'t1:0',0,[],{},[house]),true);const end=w.sample(5000);assert.equal(inside(end),false);assert.ok(ts.some(t=>t.x===end.x&&t.y===end.y));
 const split=grid(4,2),before=w.sample(5000);assert.equal(w.go(split,'t3:0',5000,[],{},[house]),false);assert.deepEqual(w.sample(5000),before);
});
test('an obstacle added across a queued segment cancels a route before crossing without snapping the current legal point',()=>{
 const ts=grid(),w=createTileWalker({clock:()=>NOW});w.reset(ts,'t0:0');w.go(ts,'t3:0',0);const before=w.sample(50);assert.equal(typeof w.revalidate,'function');assert.equal(w.revalidate(ts,[house],50),false);assert.equal(w.sample(3000).x,before.x);assert.equal(w.sample(3000).y,before.y);assert.equal(w.sample(3000).moving,false);
});
test('new building commands leave safe ground and reject the actual transient actor footprint atomically',()=>{
 const {s,id}=owned(),action={type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'t0:0',actorPosition:{x:0,y:0}};assert.equal(reduce(s,action,NOW).ok,false);assert.equal(reduce(s,action,NOW).state,s);
 const full={...s,tiles:grid(2,2),avatarTileId:'t0:1'};assert.equal(reduce(full,{...action,actorPosition:undefined},NOW).ok,false);assert.equal(full.coins,120);
 const result=reduce(s,{...action,actorPosition:{x:3,y:2}},NOW);assert.equal(result.ok,true);assert.equal(result.state.coins,60);
});
test('legacy full-house saves keep exact raw head and assets while visual recovery has no unsafe actor',()=>{
 const {s,id}=owned(),legacy={...s,tiles:grid(2,2),avatarTileId:'t0:1',buildings:[{id:'legacy-house',tileId:'t0:0',blueprintId:id}]},map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};assert.equal(validateState(legacy),true);assert.equal(saveGame(store,legacy,NOW).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store);assert.equal(loaded.head,raw);assert.deepEqual(loaded.state,legacy);assert.equal(store.getItem(SAVE_KEY),raw);
 const w=createTileWalker({clock:()=>NOW});w.reset(legacy.tiles,legacy.avatarTileId,[],{},legacy.buildings);assert.equal(Number.isFinite(w.sample(0).x),false);assert.equal(w.go(legacy.tiles,'t0:0',0,[],{},legacy.buildings),false);assert.deepEqual(loaded.state,legacy);
 const expanded=[...legacy.tiles,{id:'safe',x:2,y:0,kind:'platform'}];w.reset(expanded,legacy.avatarTileId,[],{},legacy.buildings);assert.equal(w.sample(0).tileId,'safe');assert.equal(w.sample(0).x,2);
});
test('travel into reserved building cells is rejected before currency or position mutation',()=>{
 const {s,id}=owned(),state={...s,buildings:[{id:'b',tileId:'t0:0',blueprintId:id,startedAt:NOW,readyAt:NOW+15000}]};const result=reduce(state,{type:'TRAVEL',tileId:'t1:1',actorPosition:{x:3,y:2}},NOW);assert.equal(result.ok,false);assert.equal(result.state,state);
});
test('reclaim or terrain move cannot remove the sole outside support or carry the actual avatar into a blocked floor',()=>{
 const {s,id}=owned(),one={...s,tiles:[...grid(2,2),{id:'outside',x:2,y:0,kind:'land'}],avatarTileId:'outside',buildings:[{id:'b',tileId:'t0:0',blueprintId:id}]};assert.equal(validateState(one),true);for(const action of [{type:'RECLAIM',targetId:'outside'},{type:'MOVE_BUILDING',targetId:'outside',x:2,y:1}]){const result=reduce(one,action,NOW);assert.equal(result.ok,false);assert.equal(result.state,one);}
});
test('new house reserves cannot cut a completed corridor or a staggered future walking frontier',()=>{
 const {s,id}=owned(),shape={...s,tiles:grid(4,2),avatarTileId:'t0:0'},action={type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'t1:0'};assert.equal(reduce(shape,action,NOW).state,shape);
 const future={...s,tiles:[...grid(3,3),{id:'future',x:3,y:0,kind:'land',startedAt:NOW,readyAt:NOW+3000}],avatarTileId:'t0:2'};assert.equal(reduce(future,{...action,tileId:'t1:0'},NOW).state,future);
});
test('explicit legacy rescue removes only the selected finished owned house once, with no fee reward or lost blueprint',()=>{
 const {s,id}=owned(),legacy={...s,coins:0,tiles:grid(2,2),avatarTileId:'t0:1',buildings:[{id:'rescue',tileId:'t0:0',blueprintId:id}]},before=structuredClone(legacy),action={type:'RECOVER_LEGACY_BUILDING',buildingId:'rescue'};assert.equal(validateState(legacy),true);const r=reduce(legacy,action,NOW);assert.equal(r.ok,true);assert.equal(r.state.coins,0);assert.equal(r.state.crystals,legacy.crystals);assert.deepEqual(r.state.blueprints,legacy.blueprints);assert.deepEqual(r.state.tiles,legacy.tiles);assert.equal(r.state.buildings.length,0);assert.equal(validateState(r.state),true);assert.equal(reduce(r.state,action,NOW).state,r.state);assert.deepEqual(legacy,before);
 for(const bad of [{...legacy,coins:18},{...legacy,tiles:[...legacy.tiles,{id:'free',x:2,y:0,kind:'land'}]},{...legacy,buildings:[{...legacy.buildings[0],startedAt:NOW,readyAt:NOW+15000}]}])assert.equal(reduce(bad,action,NOW).state,bad);assert.equal(reduce(legacy,{...action,gardenId:'demo'},NOW).state,legacy);assert.equal(reduce(legacy,{...action,buildingId:'missing'},NOW).state,legacy);
});
