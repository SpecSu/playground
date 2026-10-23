import test from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_LAND,cellKey,landCandidates,dockCandidates,canExtendTank,walkGraph,planWalk,allLandReachable,dockWaterFacing,docksHaveWater} from '../lib/game/grid.js';

test('the start is exactly four connected fixed-coordinate cells',()=>{
 assert.deepEqual(INITIAL_LAND,[{x:0,z:0},{x:1,z:0},{x:0,z:1},{x:1,z:1}]);
 assert.equal(new Set(INITIAL_LAND.map(cellKey)).size,4);
});
test('only edge-neighbours are buyable; no diagonal, automatic rectangle or dock overlap',()=>{
 const before=JSON.stringify(INITIAL_LAND),next=landCandidates(INITIAL_LAND,[{x:2,z:0}]);
 assert.equal(next.length,7);assert.ok(next.some(p=>p.x===-1&&p.z===0));assert.ok(!next.some(p=>p.x===-1&&p.z===-1));assert.ok(!next.some(p=>p.x===2&&p.z===0));assert.equal(JSON.stringify(INITIAL_LAND),before);
 const l=[...INITIAL_LAND,{x:-1,z:0}];assert.equal(l.length,5);assert.deepEqual(l.slice(0,4),INITIAL_LAND);
});
test('dock growth has one actual water cell per segment and remains reachable',()=>{
 const docks=[{x:2,z:0}];assert.ok(dockCandidates(INITIAL_LAND,docks).some(p=>p.x===3&&p.z===0));assert.ok(!dockCandidates(INITIAL_LAND,docks).some(p=>p.x===1&&p.z===0));
 const path=planWalk(INITIAL_LAND,docks,[],{x:0,z:-.5},{type:'dock',cell:{x:2,z:0}});assert.ok(path);assert.deepEqual(path.at(-1),{x:2,z:0});
});
test('a second tank is impossible; expansion must share an edge on owned land',()=>{
 assert.equal(canExtendTank(INITIAL_LAND,[],{x:0,z:0}),true);
 assert.equal(canExtendTank(INITIAL_LAND,[{x:0,z:0}],{x:1,z:1}),false);
 assert.equal(canExtendTank(INITIAL_LAND,[{x:0,z:0}],{x:1,z:0}),true);
 assert.equal(canExtendTank(INITIAL_LAND,[{x:0,z:0}],{x:-1,z:0}),false);
});
test('production centres are not walk paths, all four edge targets are accessible',()=>{
 const g=walkGraph(INITIAL_LAND,[],[]);assert.ok(!g.has('0,0'));
 for(const cell of INITIAL_LAND){const path=planWalk(INITIAL_LAND,[],[],{x:0,z:-.5},{type:'land',cell});assert.ok(path);assert.ok(path.every(p=>!(Number.isInteger(p.x)&&Number.isInteger(p.z))));}
 assert.equal(allLandReachable(INITIAL_LAND,[],[],{x:0,z:-.5}),true);
});
test('tank internal joins have water, not invisible walkways',()=>{
 const tank=[{x:0,z:0},{x:1,z:0}];const graph=walkGraph(INITIAL_LAND,[],tank);
 assert.ok(!graph.has('1,0'));assert.equal(allLandReachable(INITIAL_LAND,[],tank,{x:.5,z:.65}),true);
});
test('invalid or unreachable targets never fabricate a straight-line path',()=>{
 assert.equal(planWalk(INITIAL_LAND,[],[],{x:0,z:-.5},{type:'land',cell:{x:9,z:9}}),null);
 assert.equal(planWalk(INITIAL_LAND,[],[],{x:0,z:-.5},{type:'dock',cell:{x:9,z:9}}),null);
});
test('production approach stops at nearest reachable side rather than the plant root',()=>{const path=planWalk(INITIAL_LAND,[],[],{x:.5,z:.65},{type:'land',cell:{x:0,z:0},workSide:true});assert.deepEqual(path.at(-1),{x:0,z:.38});assert.ok(Math.hypot(path.at(-1).x,path.at(-1).z)>.35);});

test('a new segment turns an existing station toward remaining water without changing its cell',()=>{const land=[...INITIAL_LAND],docks=[{x:1,z:2}],cell=docks[0],old=dockWaterFacing(land,docks,cell);assert.deepEqual(old,{x:0,z:1});const next=[...docks,{x:1,z:3}];assert.deepEqual(dockWaterFacing(land,next,cell,old),{x:1,z:0});assert.deepEqual(cell,{x:1,z:2});assert.ok(docksHaveWater(land,next));});
test('a last water edge cannot be bought as land or dock',()=>{const land=[{x:0,z:0},{x:1,z:0},{x:-1,z:0},{x:1,z:1},{x:-1,z:1}],docks=[{x:0,z:1}];const blocked={x:0,z:2};assert.ok(!landCandidates(land,docks).some(c=>cellKey(c)===cellKey(blocked)));assert.ok(!dockCandidates(land,docks).some(c=>cellKey(c)===cellKey(blocked)));});
