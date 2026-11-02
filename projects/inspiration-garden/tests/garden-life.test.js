import test from 'node:test';import assert from 'node:assert/strict';
import {createGardenLife,resolveLifeTarget} from '../src/garden-life.js';
const NOW=100000,tiles=Array.from({length:8},(_,i)=>({id:`t${i}`,x:i%4,y:Math.floor(i/4),kind:'land'})),varieties={radish:{artKey:'radish',interaction:'drum'},giant:{artKey:'giant_moon_mushroom',interaction:'moon'}};
const world=()=>({id:'a',lastSeenAt:NOW,tiles,edges:[],plants:[{id:'p',tileId:'t3',varietyId:'radish',plantedAt:0,readyAt:1}],exhibits:[],avatarTileId:'t0'});
const life=()=>{const l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(world(),varieties,0);return l;};
test('owner approaches target through completed terrain and faces center only after arriving; released approach emits readiness not play',()=>{
 const l=life(),before=l.sample(0);assert.equal(l.approach('plant','p',0).ready,false);assert.deepEqual(l.tick(100,{allowed:true}).events,[]);const result=l.tick(4000,{allowed:true});assert.equal(result.events[0].type,'owner-ready');assert.equal(result.events[0].id,'p');assert.equal(result.actor.moving,false);assert.equal(result.actor.direction,'front');assert.equal(result.actor.mirror,true);assert.notDeepEqual(result.actor,before);
});
test('owner input freezes exact visual position and ordinary sameworld renders never snap it back to saved tile',()=>{
 const l=life();l.approach('plant','p',0);const position=l.sample(250);l.activity(250);l.setWorld(world(),varieties,251);const stopped=l.sample(1000);assert.ok(Math.abs(stopped.x-position.x)<1e-9);assert.ok(Math.abs(stopped.y-position.y)<1e-9);assert.equal(stopped.moving,false);assert.deepEqual(l.tick(5000,{allowed:true}).events,[]);
});
test('removed moved or scene-replaced targets cancel pending arrival without a stale readiness event',()=>{
 for(const change of [w=>({...w,plants:[]}),w=>({...w,plants:w.plants.map(p=>({...p,tileId:'t2'}))}),w=>({...w,id:'b'})]){const l=life();l.approach('plant','p',0);l.setWorld(change(world()),varieties,100);assert.deepEqual(l.tick(4000,{allowed:true}).events,[]);}
});
test('exact10second idle starts only with eligibility, blocked intervals reset it and autonomous activity never mutates world',()=>{
 const w=world(),copy=structuredClone(w),l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(w,varieties,0);assert.deepEqual(l.tick(9999,{allowed:true}).events,[]);const at=l.tick(10000,{allowed:true});assert.equal(at.actor.moving,true);l.tick(10500,{allowed:false});assert.equal(l.sample(12000).moving,false);assert.deepEqual(l.tick(20499,{allowed:true}).events,[]);assert.equal(l.tick(20500,{allowed:true}).actor.moving,true);assert.deepEqual(w,copy);
});
test('giant and building approach centers use full footprint, and unfinished supports are never idle destinations',()=>{
 const w={...world(),plants:[{id:'g',varietyId:'giant',tileId:'t1',plantedAt:0,readyAt:1}],exhibits:[{id:'b',x:0,y:0,footprint:[2,2]}]};assert.deepEqual(resolveLifeTarget(w,varieties,'plant','g',NOW).center,{x:1.5,y:.5});assert.deepEqual(resolveLifeTarget(w,varieties,'exhibit','b',NOW).center,{x:.5,y:.5});
 const l=createGardenLife({clock:()=>NOW,random:()=>0}),pending={...world(),plants:[],tiles:tiles.map(t=>t.id==='t1'?{...t,startedAt:NOW,readyAt:NOW+3000}:t)};l.setWorld(pending,varieties,0);l.tick(10000,{allowed:true});for(let t=10000;t<20000;t+=50){const a=l.tick(t,{allowed:true}).actor;assert.equal(Math.abs(a.x-1)<=.5&&Math.abs(a.y)<=.5,false);}
});
test('idle plant and completed-house responses are cosmetic only and target real mature/finished residents',()=>{
 for(const kind of ['plant','exhibit']){
  const w={id:kind,tiles:tiles.slice(0,2).concat(tiles.slice(4,6),[tiles[2]]),plants:kind==='plant'?[{id:'g',varietyId:'giant',tileId:'t0',plantedAt:0,readyAt:1}]:[],exhibits:kind==='exhibit'?[{id:'house',x:0,y:0,footprint:[2,2]}]:[],avatarTileId:'t2'},copy=structuredClone(w),l=createGardenLife({clock:()=>NOW,random:()=>.99});l.setWorld(w,varieties,0);const event=l.tick(10000,{allowed:true}).events[0];assert.equal(event.type,'ambient');assert.equal(event.kind,kind);assert.deepEqual(w,copy);
 }
});
test('nearby authored resident conversation has two turns, no overlapping event and immediate owner cancellation',()=>{
 const w={id:'music',theme:'music',tiles:[tiles[0]],plants:[],exhibits:[],residents:[{id:'kelly',x:.3,y:.3}],avatarTileId:'t0'},l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(w,{},0);l.tick(10000,{allowed:true});const first=l.tick(18000,{allowed:true});assert.equal(first.events[0].type,'encounter');assert.match(first.bubble.text,/海浪/);const second=l.tick(22000,{allowed:true});assert.equal(second.bubble.residentId,'kelly');assert.equal(second.actor.moving,false);assert.deepEqual(second.events,[]);l.activity(22001);assert.equal(l.tick(22002,{allowed:true}).bubble,null);assert.deepEqual(l.tick(30000,{allowed:true}).events,[]);
});
test('unrelated foundation completion does not reset the semantic inactivity clock or snap an idle route',()=>{
 let wall=NOW;const w={...world(),plants:[],tiles:[...tiles,{id:'new',x:4,y:0,kind:'land',startedAt:NOW,readyAt:NOW+3000}]},l=createGardenLife({clock:()=>wall,random:()=>0});l.setWorld(w,varieties,0);wall+=3000;l.setWorld(w,varieties,9000);assert.equal(l.tick(10000,{allowed:true}).actor.moving,true);const before=l.sample(10100);l.setWorld(w,varieties,10100);assert.deepEqual(l.sample(10100),before);
});
test('view-only contact cleanup preserves idle route but drops a previous owner approach without restarting the clock',()=>{
 const l=life();l.tick(10000,{allowed:true});const before=l.sample(10100);l.cancelApproach(10100);assert.equal(l.sample(10200).moving,true);assert.notDeepEqual(l.sample(10200),before);
 const owner=life();owner.approach('plant','p',0);owner.cancelApproach(200);assert.deepEqual(owner.tick(4000,{allowed:true}).events,[]);assert.equal(owner.tick(10000,{allowed:true}).actor.moving,true);
});

test('authored host independently wanders while owner is active, preserving immutable scene input and current pose across renders',()=>{
 const w={...world(),plants:[],residents:[{id:'kelly',avatarKey:'human-kelly',x:3,y:1}]},copy=structuredClone(w),l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(w,{},0);const first=l.tick(0,{allowed:false});assert.ok(Array.isArray(first.residents));const start=first.residents[0];let moved=false;
 for(let at=100;at<=15000;at+=100){l.activity(at);const result=l.tick(at,{allowed:false});const host=result.residents[0];if(Math.hypot(host.x-start.x,host.y-start.y)>.1)moved=true;assert.ok(tiles.some(t=>Math.abs(t.x-host.x)<=.5001&&Math.abs(t.y-host.y)<=.5001));if(at===4500){l.setWorld(structuredClone(w),{},at);assert.deepEqual(l.tick(at,{allowed:false}).residents[0],host);}}
 assert.equal(moved,true);assert.deepEqual(w,copy);
});
test('host motion uses safe footprint routes and visibility stops without catch-up, then visit resets host and dialogue',()=>{
 const w={...world(),plants:[],residents:[{id:'kelly',avatarKey:'human-kelly',x:3,y:1}],exhibits:[{id:'house',x:0,y:0,footprint:[2,2]}]},l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(w,{},0);assert.equal(typeof l.setSceneActive,'function');
 let before;for(let at=0;at<=4500;at+=100){before=l.tick(at,{allowed:false}).residents[0];assert.equal(before.x<1.5&&before.y<1.5,false);}
 l.setSceneActive(false,4500);const stopped=l.tick(4500,{allowed:false}).residents[0];l.tick(100000,{allowed:false});l.setSceneActive(true,100000);assert.deepEqual(l.tick(100000,{allowed:false}).residents[0],stopped);l.setWorld({...w,id:'home',residents:[]},{},100001);assert.deepEqual(l.tick(100002).residents,[]);l.setWorld(w,{},100003);const fresh=l.tick(100003,{allowed:false});assert.equal(fresh.bubble,null);assert.equal(fresh.residents[0].x,3);assert.equal(fresh.residents[0].y,1);
});
test('two sampled characters pause face each other for a nonrepeating exchange; owner command clears it without restarting host spawn',()=>{
 const w={id:'music',theme:'music',tiles:[tiles[0]],plants:[],exhibits:[],residents:[{id:'kelly',avatarKey:'human-kelly',x:0,y:0}],avatarTileId:'t0'},l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(w,{},0);l.tick(10000);const first=l.tick(18000);assert.equal(first.events[0].type,'encounter');assert.equal(first.residents[0].moving,false);const response=l.tick(21000);assert.equal(response.bubble.residentId,'kelly');l.activity(22000);assert.equal(l.tick(22001).bubble,null);assert.equal(l.tick(50000).events.filter(e=>e.type==='encounter').length,0);const second=l.tick(70000);assert.equal(second.events[0].type,'encounter');assert.notEqual(second.bubble.text,first.bubble.text);
});
test('a house blocking queued approach segments cancels pending readiness instead of activating from afar',()=>{
 const ts=Array.from({length:15},(_,i)=>({id:`p${i%5}:${Math.floor(i/5)}`,x:i%5,y:Math.floor(i/5),kind:'land'})),w={id:'blocked-approach',tiles:ts,edges:[],plants:[{id:'target',tileId:'p4:0',varietyId:'radish',plantedAt:0,readyAt:0}],exhibits:[],avatarTileId:'p0:0'},l=createGardenLife({clock:()=>NOW,random:()=>0});l.setWorld(w,varieties,0);assert.equal(l.approach('plant','target',0).possible,true);l.tick(50);l.setWorld({...w,exhibits:[{id:'blocking',x:1,y:0,footprint:[2,2]}]},varieties,50);assert.equal(l.pending,null);assert.deepEqual(l.tick(60).events,[]);assert.ok(l.sample(60).x<.1);
});
