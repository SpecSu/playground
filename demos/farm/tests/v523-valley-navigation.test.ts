import test from 'node:test';
import assert from 'node:assert/strict';
import * as spatial from '../src/v5/layout.ts';
import {advancePlayer,findPlayerPath,playerSegmentClear} from '../src/v5/player-navigation.ts';

const landmarks=[{x:-3,z:4},{x:14,z:4},{x:7,z:14}];

test('LX can leave the owned home on foot, reach each valley landmark and return on a real route',()=>{
 const layout=spatial.createLayout(),home={x:5,z:7};
 for(const destination of landmarks){
  const outward=findPlayerPath(layout,home,destination);
  assert.ok(outward,`walk to ${destination.x},${destination.z} should be reachable`);
  assert.deepEqual(outward.at(-1),destination);
  let previous=home;
  for(const point of outward){assert.ok(playerSegmentClear(layout,previous,point));previous=point;}
  const back=findPlayerPath(layout,destination,home);
  assert.ok(back);assert.deepEqual(back.at(-1),home);
 }
 const end=advancePlayer(layout,{x:0,z:6},{x:-1,z:0},3);
 assert.ok(end.x< -2.9,'ownership boundary must not be a physical wall');
 assert.equal(layout.owned.length,144,'walking must not grant building rights');
});

test('exploration does not grant animal routes or allow unpaid construction beyond owned land',()=>{
 const layout=spatial.createLayout();
 assert.ok(findPlayerPath(layout,{x:5,z:7},{x:14,z:4}));
 assert.equal(spatial.findPath(layout,{x:5,z:7},{x:14,z:4}),null);
 for(const type of ['place','road'] as const){
  const edit=type==='place'?{type,id:'wild-trough',kind:'trough' as const,x:14,z:4}:{type,cells:[{x:14,z:4}]};
  assert.equal(spatial.previewEdit(layout,edit,{materials:60,surveyed:true}).ok,false);
 }
 assert.equal(spatial.previewEdit(layout,{type:'expand'},{materials:60,surveyed:false}).ok,false);
 const expand=spatial.commitEdit(layout,{type:'expand'},{materials:60,surveyed:true,eventId:'valley-expansion'});
 assert.equal(expand.materialDelta,-30);assert.equal(expand.ok,true);
 const expanded=spatial.tickConstruction(expand.layout,60_000).layout;
 assert.equal(expanded.owned.length,180);
 assert.ok(spatial.findPath(expanded,{x:5,z:7},{x:14,z:4}));
 assert.equal(spatial.previewEdit(expanded,{type:'place',id:'claimed-trough',kind:'trough',x:14,z:4},{materials:30}).ok,true);
});

test('explorable graph remains finite and cannot walk through water, buildings or unfinished construction',()=>{
 const layout=spatial.createLayout();
 assert.equal(findPlayerPath(layout,{x:5,z:7},{x:100,z:100}),null);
 assert.equal(findPlayerPath(layout,{x:5,z:7},{x:2,z:2}),null);
 assert.equal(findPlayerPath(layout,{x:5,z:7},{x:11,z:11}),null);
 assert.equal(findPlayerPath(layout,{x:5,z:7},{x:-6,z:6}),null);
 const edge=advancePlayer(layout,{x:-5,z:6},{x:-1,z:0},3);
 assert.ok(edge.x>=-5.34&&edge.x< -5,'world edge permits a physical approach without crossing water');
 const started=spatial.commitEdit(layout,{type:'place',id:'site',kind:'tower',x:7,z:6},{materials:60,eventId:'valley-site'});
 assert.equal(started.ok,true);
 assert.equal(findPlayerPath(started.layout,{x:5,z:7},{x:7,z:6}),null);
});

test('valley terrain rendering and ownership APIs agree with player navigation',()=>{
 assert.equal(typeof spatial.worldCells,'function','world renderer needs the same finite extent as navigation');
 assert.equal(typeof spatial.layoutWorldBounds,'function');
 assert.equal(typeof spatial.isPlayerWalkable,'function');
 assert.equal(typeof spatial.isOwned,'function');
 const layout=spatial.createLayout(),bounds=spatial.layoutWorldBounds(),cells=spatial.worldCells();
 assert.deepEqual(bounds,{minX:-6,maxX:23,minZ:-6,maxZ:17});
 assert.equal(cells.length,(bounds.maxX-bounds.minX+1)*(bounds.maxZ-bounds.minZ+1));
 assert.equal(new Set(cells.map(p=>`${p.x},${p.z}`)).size,cells.length);
 for(const p of cells){
  const boundary=p.x===bounds.minX||p.x===bounds.maxX||p.z===bounds.minZ||p.z===bounds.maxZ;
  if(boundary){assert.equal(spatial.terrainAt(p),'deep');assert.equal(spatial.isPlayerWalkable(layout,p),false);}
 }
 for(const p of landmarks){assert.equal(spatial.isOwned(layout,p),false);assert.equal(spatial.isPlayerWalkable(layout,p),true);}
 assert.equal(spatial.isOwned(layout,{x:5,z:7}),true);
 assert.equal(spatial.isPlayerWalkable(layout,{x:NaN,z:2}),false);
 assert.equal(spatial.isPlayerWalkable(layout,{x:5.5,z:7}),false);
 assert.equal(spatial.terrainAt({x:10,z:8}),'shallow');
 assert.equal(spatial.terrainAt({x:11,z:11}),'deep');
});

test('temporary owned-cell masks still prevent animal danger shortcuts and sealed escape routes',()=>{
 const original=spatial.createLayout();
 const masked={...original,owned:original.owned.filter(p=>p.x!==6)};
 assert.equal(spatial.findPath(masked,{x:4,z:4},{x:8,z:4}),null,'threat avoidance mask remains authoritative for animal routes');
 const narrowed={...original,owned:original.owned.filter(p=>p.x!==6||p.z===5)};
 const blocked=spatial.previewEdit(narrowed,{type:'place',id:'barrier',kind:'trough',x:6,z:5},{materials:60,actors:[{x:8,z:4}]});
 assert.equal(blocked.ok,false);assert.ok(blocked.metrics.unreachable.length>0);
});
