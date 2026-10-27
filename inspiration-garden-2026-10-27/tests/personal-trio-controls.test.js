import test from 'node:test';import assert from 'node:assert/strict';
import {createExhibitControl,stepExhibitControl,exhibitHint} from '../src/exhibit-controls.js';
import {gestureSoundPlan} from '../src/interactions.js';
import {createGardenLife} from '../src/garden-life.js';
import {buildingCells} from '../src/footprints.js';
const kinds=['shutter','shell-glow','canopy'],event=(at,type='start')=>({at,type,x:.5,y:.5});
test('new trio starts one finite local response and coalesces repeated presses while it plays',()=>{
 for(const kind of kinds){const first=createExhibitControl(kind,event(100));assert.deepEqual(first.events,[{type:kind}],kind);assert.equal(first.state.reactionAt,100);const second=createExhibitControl(kind,event(150),first.state);assert.deepEqual(second.events,[]);assert.equal(second.state.reactionAt,100);const ended=stepExhibitControl(first.state,event(200,'end'));assert.equal(ended.state.reactionAt,100);const cancelled=stepExhibitControl(first.state,event(250,'cancel'));assert.equal(cancelled.state.reactionAt,-Infinity);assert.equal(gestureSoundPlan({type:kind}).length>0,true);assert.doesNotMatch(exhibitHint(kind),/里面的小日常|坐下|拍摄|保存照片/);}
});
test('new trio reactions have finite bounded samples and reduced motion never moves cloth or rib light',async()=>{
 const mod=await import('../src/personal-exhibit-reactions.js').catch(()=>({}));assert.equal(typeof mod.personalExhibitReactionSample,'function');
 for(const kind of kinds){const sample=at=>mod.personalExhibitReactionSample(kind,at),ground=sample(-1);assert.equal(ground.active,false);assert.deepEqual(sample(Infinity),ground);assert.deepEqual(sample(3000),ground);for(let at=0;at<1800;at+=50){const normal=sample(at),reduced=mod.personalExhibitReactionSample(kind,at,true);assert.ok(normal.glow>=0&&normal.glow<=1);assert.ok(Math.abs(normal.sway)<=2);assert.equal(reduced.sway,0);assert.equal(reduced.progress,.5);}}
});
test('canopy remains a hard 2×2 obstacle and approach stops only on reachable adjacent ground',()=>{
 const tiles=Array.from({length:12},(_,i)=>({id:`t${i%4}-${Math.floor(i/4)}`,x:i%4,y:Math.floor(i/4),kind:'land'})),canopy={id:'canopy',artKey:'camping_tarp_pavilion',sampleId:'camping_tarp_pavilion',x:1,y:0,tileId:'t1-0'},world={id:'canopy-garden',tiles,exhibits:[canopy],plants:[],avatarTileId:'t0-2'},life=createGardenLife({clock:()=>1000,random:()=>0});life.setWorld(world,{},0);const request=life.approach('exhibit','canopy',100);assert.equal(request.possible,true);const occupied=buildingCells(world,canopy);assert.equal(occupied.length,4);
 for(let t=100;t<=4000;t+=20){const a=life.tick(t,{allowed:false}).actor;assert.ok(!occupied.some(c=>Math.abs(c.x-a.x)<.5&&Math.abs(c.y-a.y)<.5));}
 const actor=life.sample(4000);assert.ok(tiles.some(t=>t.x===actor.x&&t.y===actor.y));assert.ok(occupied.some(c=>Math.abs(c.x-actor.x)+Math.abs(c.y-actor.y)===1));
 const blocked={...world,id:'blocked',tiles:[{id:'t0-2',x:0,y:2,kind:'land'},...occupied.map(c=>({id:`t${c.x}-${c.y}`,...c,kind:'land'}))]};life.setWorld(blocked,{},5000);assert.equal(life.approach('exhibit','canopy',5100).possible,false);life.dispose();
});
test('canopy alone prefers its authored outside overhang cell only when completed free and reachable',()=>{
 for(const condition of ['clear','missing','pending','plant','unreachable']){
  let tiles=Array.from({length:20},(_,i)=>({id:`t${i%5}-${Math.floor(i/5)}`,x:i%5,y:Math.floor(i/5),kind:'land'}));if(condition==='unreachable')tiles=tiles.filter(t=>!['t1-2','t3-2','t2-3'].includes(t.id));if(condition==='missing')tiles=tiles.filter(t=>t.id!=='t2-2');if(condition==='pending')tiles=tiles.map(t=>t.id==='t2-2'?{...t,startedAt:1000,readyAt:5000}:t);
  const world={id:condition,tiles,plants:condition==='plant'?[{id:'occupied',tileId:'t2-2',varietyId:'radish'}]:[],exhibits:[{id:'canopy',artKey:'camping_tarp_pavilion',sampleId:'camping_tarp_pavilion',tileId:'t1-0',x:1,y:0}],avatarTileId:'t0-0'},life=createGardenLife({clock:()=>2000,random:()=>0});life.setWorld(world,{radish:{footprint:[1,1]}},0);assert.equal(life.approach('exhibit','canopy',100).possible,true);const actor=life.tick(6000,{allowed:false}).actor;if(condition==='clear')assert.deepEqual({x:actor.x,y:actor.y},{x:2,y:2});else assert.notDeepEqual({x:actor.x,y:actor.y},{x:2,y:2});assert.ok(!buildingCells(world,world.exhibits[0]).some(c=>c.x===actor.x&&c.y===actor.y));life.dispose();
 }
});
test('canopy fallback never stands in a plant and declines when every reachable neighboring cell is planted',()=>{
 for(const freeAlternate of [true,false]){
  const tiles=Array.from({length:30},(_,i)=>({id:`t${i%6}-${Math.floor(i/6)}`,x:i%6,y:Math.floor(i/6),kind:'land'})),canopy={id:'canopy',artKey:'camping_tarp_pavilion',sampleId:'camping_tarp_pavilion',tileId:'t1-1',x:1,y:1},cells=buildingCells({tiles},canopy),neighbors=tiles.filter(t=>!cells.some(c=>c.x===t.x&&c.y===t.y)&&cells.some(c=>Math.abs(c.x-t.x)+Math.abs(c.y-t.y)===1)),plants=neighbors.filter(t=>!freeAlternate||t.id!=='t3-1').map(t=>({id:'p-'+t.id,tileId:t.id,varietyId:'radish'})),world={id:'plants-'+freeAlternate,tiles,exhibits:[canopy],plants,avatarTileId:'t0-1'},life=createGardenLife({clock:()=>2000,random:()=>0});life.setWorld(world,{radish:{footprint:[1,1]}},0);const response=life.approach('exhibit','canopy',100);assert.equal(response.possible,freeAlternate);if(freeAlternate){const actor=life.tick(8000,{allowed:false}).actor;assert.deepEqual({x:actor.x,y:actor.y},{x:3,y:1});}life.dispose();
 }
});
