import test from 'node:test';
import assert from 'node:assert/strict';
import {isoPoint,isoCell,placementCells,edgeAtPoint,animationSample,fitZoom} from '../src/scene-math.js';
import {createTapGate} from '../src/gesture.js';
test('isometric mapping returns same grid cell through arbitrary pan and zoom',()=>{
 const camera={x:178,y:310,zoom:1.25};const p=isoPoint(2,-1,camera);assert.deepEqual(isoCell(p.x,p.y,camera),{x:2,y:-1});
 assert.deepEqual(isoCell(178,310,camera),{x:0,y:0});
});
test('placement exposes only connected empty neighbor cells and never duplicate coordinates',()=>{
 const cells=placementCells([{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}]);
 assert.equal(cells.length,8);assert.ok(cells.some(t=>t.x===2&&t.y===1));assert.equal(cells.some(t=>t.x===0&&t.y===0),false);
});
test('nearest diamond edge uses same screen geometry as drawing',()=>{
 assert.equal(edgeAtPoint(20,-10),'north');assert.equal(edgeAtPoint(20,10),'east');assert.equal(edgeAtPoint(-20,10),'south');assert.equal(edgeAtPoint(-20,-10),'west');
});
test('local animation is bounded, starts and ends at rest, with distinct tactile variants',()=>{
 const rest=animationSample('puff',0);assert.equal(rest.sx,1);assert.equal(animationSample('puff',1).sx,1);
 assert.ok(animationSample('puff',.25).sx>1);assert.ok(animationSample('drum',.2).dy<0);
 assert.notDeepEqual(animationSample('wave',.3),animationSample('sleep',.3));
});
test('tap gate rejects drags, multitouch, and cancellation then recovers for a new tap',()=>{
 const gate=createTapGate();const e={pointerId:1,clientX:20,clientY:20,pointerType:'touch'};
 gate.down(e);gate.move({...e,clientX:28});gate.up(e);assert.equal(gate.consume(),false);
 gate.down(e);gate.down({...e,pointerId:2});gate.up(e);gate.up({...e,pointerId:2});assert.equal(gate.consume(),false);
 gate.down(e);gate.cancel();gate.up(e);assert.equal(gate.consume(),false);
 gate.down(e);gate.up(e);assert.equal(gate.consume(),true);assert.equal(gate.consume(),false);
});
test('fitting keeps larger authored gardens visible above shallow mobile trays',()=>{
 const small=fitZoom([{x:0,y:0},{x:1,y:1}],360,420),large=fitZoom([{x:-2,y:-2},{x:3,y:3}],360,420);
 assert.ok(small>large);assert.ok(large>=.45);assert.ok(small<=1.35);
});
import {avatarStandPoint} from '../src/scene-math.js';
test('avatar stands beside an occupied crop instead of covering its growth or face',()=>{
 const tile={id:'land',x:0,y:0};assert.deepEqual(avatarStandPoint(tile,[]),{x:0,y:0});
 const beside=avatarStandPoint(tile,[{tileId:'land'}]),screen=isoPoint(beside.x,beside.y);
 assert.ok(screen.x>=30);assert.ok(Math.abs(screen.y)<=4);assert.ok(Math.abs(beside.x)<=.5&&Math.abs(beside.y)<=.5);
});
import {stableSceneZoom} from '../src/scene-math.js';
test('opening shallow trays preserves island scale and shifts framing instead of shrinking the toy',()=>{
 const tiles=[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}];
 assert.equal(stableSceneZoom(tiles,390,780,340),stableSceneZoom(tiles,390,780,90));
 assert.ok(stableSceneZoom(tiles,390,780,340)>=1.1);
});
import {distanceToSegment} from '../src/scene-math.js';
test('edge hit testing follows the thin visible rail instead of swallowing a full tile rectangle',()=>{
 assert.equal(distanceToSegment({x:10,y:5},{x:0,y:0},{x:20,y:0}),5);
 assert.equal(distanceToSegment({x:25,y:0},{x:0,y:0},{x:20,y:0}),5);
 assert.equal(distanceToSegment({x:10,y:0},{x:0,y:0},{x:20,y:0}),0);
});
import {keyboardInset} from '../src/scene-math.js';
test('mobile keyboard clearance derives from actual visual viewport without modifying viewport or persistent game state',()=>{
 assert.equal(keyboardInset(780,{height:480,offsetTop:0}),300);assert.equal(keyboardInset(780,{height:780,offsetTop:0}),0);assert.equal(keyboardInset(780,null),0);
});
import {coversAvatarHead} from '../src/scene-math.js';
test('foreground plants fade only for meaningful head coverage, not a shoulder or leg overlap',()=>{
 const avatar={x:100,y:150};assert.equal(coversAvatarHead({x:90,y:88,w:20,h:30},avatar,1),true);
 assert.equal(coversAvatarHead({x:109,y:90,w:40,h:30},avatar,1),false);assert.equal(coversAvatarHead({x:80,y:130,w:40,h:25},avatar,1),false);
});
import {minimalVerticalOffset} from '../src/scene-math.js';
test('context clearance leaves an unobscured resident fixed and shifts an obscured one only the necessary pixels',()=>{
 assert.equal(minimalVerticalOffset({y:220,h:95},125,525),0);assert.equal(minimalVerticalOffset({y:500,h:40},125,525),-23);assert.equal(minimalVerticalOffset({y:100,h:40},125,525),33);
});
test('new land/platform candidates attach to completed terrain, never pending-only neighbors or reserved cells',async()=>{
 const m=await import('../src/scene-math.js');assert.equal(typeof m.buildPlacementCells,'function');const now=1000,tiles=[{id:'done',x:0,y:0,kind:'land'},{id:'pending',x:1,y:0,kind:'land',startedAt:now,readyAt:now+3000}];const before=m.buildPlacementCells(tiles,now+2999);assert.equal(before.some(c=>c.x===2&&c.y===0),false);assert.equal(before.some(c=>c.x===1&&c.y===0),false);assert.equal(before.some(c=>c.x===0&&c.y===1),true);assert.equal(m.buildPlacementCells(tiles,now+3000).some(c=>c.x===2&&c.y===0),true);
});
