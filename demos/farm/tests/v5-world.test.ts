import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayout,isWalkable,buildingFootprint} from '../src/v5/layout.ts';
import {createLife} from '../src/v5/life.ts';
import {gridToWorld,worldToGrid,interpolationRoute,movementCell,sceneResponse,sceneBuilding} from '../src/v5/estate-scene.ts';
const now=1_800_000_000_000;
test('world uses same continuous grid origin including owned expansion',()=>{
 assert.deepEqual(gridToWorld({x:0,z:0}),{x:-5.5,z:-5.5});assert.deepEqual(gridToWorld({x:17,z:5}),{x:11.5,z:-.5});
 assert.deepEqual(worldToGrid({x:-1.3,z:3.2}),{x:4,z:9});
});
test('saved movement interpolates around solid shelter rather than through it',()=>{
 const layout=createLayout(),route=interpolationRoute(layout,{x:0,z:2},{x:4,z:2});
 assert.ok(route.length>4);for(const p of route)assert.ok(isWalkable(layout,p));
 for(let i=1;i<route.length;i++)assert.ok(Math.abs(route[i].x-route[i-1].x)+Math.abs(route[i].z-route[i-1].z)<=1.001);
 assert.deepEqual(route.at(-1),{x:4,z:2});
});
test('manual controls request legal cardinal cells and do not enter water or facilities',()=>{
 const layout=createLayout();assert.equal(movementCell(layout,{x:4,z:2},{x:-1,z:0}),null);
 assert.equal(movementCell(layout,{x:9,z:10},{x:1,z:0}),null);
 assert.deepEqual(movementCell(layout,{x:5,z:5},{x:1,z:.9}),{x:6,z:5});
});
test('rendered shelter geometry and doors derive from actual occupied cells',()=>{
 const layout=createLayout(),shelter=layout.buildings[0],g=sceneBuilding(shelter);
 assert.equal(g.width,3);assert.equal(g.depth,3);assert.deepEqual(g.center,{x:-3.5,z:-3.5});assert.deepEqual(g.cells,buildingFootprint(shelter));assert.equal(g.doors[0].x,-3.5);assert.equal(g.doors[0].z,-1.5);
});
test('personality drives delayed micro response and distinct copy/remix after a real action',()=>{
 const visual={id:'action1',action:'dance' as const,target:'all',at:now};
 const base={id:'pipi',name:'皮皮',personality:'eager' as const,preference:'dance' as const,color:'#aaa',appearance:'plain' as const,life:createLife(now),position:{x:4,z:4},path:[],following:false};
 assert.equal(sceneResponse(base,visual,now+400).action,'dance');
 const shy={...base,id:'momo',personality:'shy' as const};assert.equal(sceneResponse(shy,visual,now+400).micro,true);assert.equal(sceneResponse(shy,visual,now+1800).action,'dance');
 const independent={...base,id:'doudou',personality:'independent' as const};assert.equal(sceneResponse(independent,visual,now+1800).style,'remix');
 assert.equal(sceneResponse(base,null,now).action,undefined);
});
test('a saved invitation can greet again but an unlearned habit never fabricates one',()=>{
 const life=createLife(now),a={id:'momo',name:'茉茉',personality:'shy' as const,preference:'love' as const,color:'#aaa',appearance:'plain' as const,life,position:{x:4,z:4},path:[],following:false};
 assert.equal(sceneResponse(a,null,now,now).greeting,false);
 life.habits.love={count:3,stage:'invite',lastAt:now-86400000,sessions:['a','b','c'],days:['a','b','c'],imported:false};
 assert.equal(sceneResponse(a,null,now+1800,now).greeting,true);assert.equal(sceneResponse(a,null,now+1800,now).action,'love');
 assert.equal(sceneResponse(a,null,now+20000,now).greeting,false);
});
test('a late greeting never yields negative animation weight',()=>{
 const life=createLife(now,{legacyHabits:{dance:{count:3,stage:'invite',lastAt:now-10000}}}),a={id:'pipi',name:'皮皮',personality:'eager' as const,preference:'dance' as const,color:'#aaa',appearance:'plain' as const,life,position:{x:4,z:4},path:[],following:false};
 assert.ok(sceneResponse(a,null,now+9500,now).weight>=0);
});
test('learned invitations recur only in active online windows, without inventing revisit memories',()=>{
 const life=createLife(now,{legacyHabits:{bounce:{count:3,stage:'invite',lastAt:now-10000}}}),a={id:'pipi',name:'皮皮',personality:'eager' as const,preference:'bounce' as const,color:'#aaa',appearance:'plain' as const,life,position:{x:4,z:4},path:[],following:false};
 const r=sceneResponse(a,null,now+61000,now,61000);assert.equal(r.action,'bounce');assert.equal(r.greeting,false);assert.match(r.text,/邀请/);
 assert.equal(sceneResponse(a,null,now+75000,now,75000).action,undefined);
});
test('private capture records the actual rendered camera rather than an invented viewpoint',async()=>{
 const {PerspectiveCamera}=await import('three');const {cameraCapture}=await import('../src/v5/estate-scene.ts');
 const camera=new PerspectiveCamera();camera.position.set(2,4,8);camera.lookAt(2,4,0);camera.updateMatrixWorld();
 const capture=cameraCapture(camera,8);assert.deepEqual(capture.position,{x:2,y:4,z:8});assert.ok(Math.abs(capture.target.x-2)<.001);assert.ok(Math.abs(capture.target.y-4)<.001);assert.ok(Math.abs(capture.target.z)<.001);
});
