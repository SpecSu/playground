import test from 'node:test';
import assert from 'node:assert/strict';
import {findTilePath,createTileWalker} from '../src/visual-walk.js';
const tiles=[[0,0],[1,0],[2,0],[2,1],[2,2],[1,2],[0,2]].map(([x,y],i)=>({id:String(i),x,y,kind:i%2?'platform':'land'}));
const onIsland=p=>tiles.some(t=>Math.abs(p.x-t.x)<=.5001&&Math.abs(p.y-t.y)<=.5001);
test('BFS follows connected land/platform around a water pocket with adjacent route steps only',()=>{
 const path=findTilePath(tiles,'0','6');assert.deepEqual(path.map(t=>t.id),['0','1','2','3','4','5','6']);
 for(let i=1;i<path.length;i++)assert.equal(Math.abs(path[i].x-path[i-1].x)+Math.abs(path[i].y-path[i-1].y),1);
 assert.deepEqual(findTilePath([...tiles,{id:'orphan',x:9,y:9,kind:'land'}],'0','orphan'),[]);
});
test('sampled walking never cuts open water and reaches the destination without blocking any action state',()=>{
 const w=createTileWalker({stepMs:125});w.reset(tiles,'0');assert.equal(w.go(tiles,'6',0),true);
 for(let t=0;t<=1000;t+=10)assert.equal(onIsland(w.sample(t)),true,`water at ${t}`);
 const end=w.sample(1000);assert.equal(end.moving,false);assert.equal(end.tileId,'6');assert.equal(end.x,0);assert.equal(end.y,2);
});
test('new clicks replace the visual route mid-stride and cancellation leaves no old destination queue',()=>{
 const w=createTileWalker({stepMs:125});w.reset(tiles,'0');w.go(tiles,'6',0);const mid=w.sample(55);assert.ok(mid.x>0&&mid.x<1);
 w.go(tiles,'2',55);for(let t=55;t<600;t+=10)assert.equal(onIsland(w.sample(t)),true);
 const end=w.sample(600);assert.equal(end.tileId,'2');assert.equal(end.x,2);assert.equal(end.y,0);
 w.go(tiles,'6',600);const before=w.sample(660);w.cancel(660);const later=w.sample(2000);assert.equal(later.x,before.x);assert.equal(later.y,before.y);assert.equal(later.moving,false);
});
test('occupied destination uses an in-cell beside-crop standpoint and island switches reset safely',()=>{
 const w=createTileWalker({stepMs:100});w.reset(tiles,'0');w.go(tiles,'2',0,[{tileId:'2'}]);const end=w.sample(1000);
 assert.equal(end.tileId,'2');assert.equal(end.x,2.32);assert.equal(end.y,-.32);assert.equal(onIsland(end),true);
 w.reset([{id:'new',x:8,y:8,kind:'land'}],'new');assert.deepEqual(w.sample(2000),{x:8,y:8,moving:false,tileId:'new',direction:'front',mirror:false});
});
test('adding a connected cell replans mid-walk without snapping to the distant destination',()=>{
 const w=createTileWalker({stepMs:125});w.reset(tiles,'0');w.go(tiles,'6',0);const before=w.sample(70),expanded=[...tiles,{id:'extra',x:3,y:0,kind:'platform'}];
 w.go(expanded,'extra',70);const same=w.sample(70);assert.equal(same.x,before.x);assert.equal(same.y,before.y);assert.equal(same.moving,true);assert.equal(w.sample(1000).tileId,'extra');
});
test('default walking is a natural 380ms step with gentle route start and stop',()=>{
 const line=[0,1,2,3].map(x=>({id:String(x),x,y:0,kind:'land'})),w=createTileWalker();w.reset(line,'0');w.go(line,'3',0);
 assert.equal(w.sample(380).moving,true);const afterOne=w.sample(380);assert.ok(afterOne.x>.75&&afterOne.x<1.2);
 const middle=w.sample(570);assert.ok(middle.x>1.4&&middle.x<1.6);assert.equal(w.sample(1139).moving,true);assert.equal(w.sample(1140).moving,false);
 w.reset(line,'0');w.go(line,'3',0);const initial=w.sample(30).x,middleX=w.sample(570).x,steady=w.sample(600).x-middleX;assert.ok(initial<steady*.5);
 w.reset(line,'0');w.go(line,'3',0);const before=w.sample(1110).x,nearEnd=w.sample(1140).x;assert.ok(nearEnd-before<steady*.5);
});
test('route easing is continuous through intermediate cells rather than stopping on each tile',()=>{
 const line=[0,1,2,3,4].map(x=>({id:String(x),x,y:0,kind:'land'})),w=createTileWalker();w.reset(line,'0');w.go(line,'4',0);
 let previous=w.sample(200).x;for(let t=210;t<=1300;t+=10){const next=w.sample(t).x;assert.ok(next-previous>.015,`paused or jumped backward at ${t}`);previous=next;}
});
test('audited illustrated sprite facing maps all4 iso screen diagonals, not a blanket mirror inversion',async()=>{
 const module=await import('../src/visual-walk.js');assert.equal(typeof module.walkingFacing,'function');for(const [to,expected]of [[{x:1,y:0},{direction:'front',mirror:true}],[{x:0,y:1},{direction:'front',mirror:false}],[{x:-1,y:0},{direction:'back',mirror:true}],[{x:0,y:-1},{direction:'back',mirror:false}]])assert.deepEqual(module.walkingFacing({x:0,y:0},to),expected);
});
test('tiny horizontal beside-plot step keeps previous front/back view and zero movement never flips',async()=>{
 const {walkingFacing}=await import('../src/visual-walk.js');assert.equal(typeof walkingFacing,'function');const previous={direction:'back',mirror:true};assert.deepEqual(walkingFacing({x:0,y:0},{x:.32,y:-.32},previous),{direction:'back',mirror:false});assert.deepEqual(walkingFacing({x:1,y:1},{x:1,y:1},previous),previous);
});
test('fractional whole-building beside route reaches a terminal standing state despite accumulated float rounding',()=>{
 const tiles=[[0,0],[1,0],[0,1],[1,1],[2,1]].map(([x,y])=>({id:`${x}:${y}`,x,y,kind:'land'})),walker=createTileWalker();walker.reset(tiles,'2:1');walker.go(tiles,'0:0',100,[],{},[{id:'b',x:0,y:0,footprint:[2,2]}]);assert.equal(walker.sample(2500).moving,false);
});
