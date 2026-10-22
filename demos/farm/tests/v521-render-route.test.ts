import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayout} from '../src/v5/layout.ts';
import {interpolationRoute} from '../src/v5/estate-scene.ts';

test('fractional forward progress never rounds backward or overshoots the authoritative endpoint',()=>{
 assert.deepEqual(interpolationRoute(createLayout(),{x:6.4,z:4},{x:6.9,z:4}),[{x:6.9,z:4}]);
});
test('fractional reverse progress is a single continuous segment',()=>{
 assert.deepEqual(interpolationRoute(createLayout(),{x:6.9,z:4},{x:6.4,z:4}),[{x:6.4,z:4}]);
});
test('a fractional corner retains the grid bend without rounding the destination past it',()=>{
 assert.deepEqual(interpolationRoute(createLayout(),{x:5.8,z:4},{x:6,z:4.3}),[{x:6,z:4},{x:6,z:4.3}]);
});

test('shelter admission and release use the open doorway rather than crossing a side wall',async()=>{
 const {renderRoute}=await import('../src/v5/render-route.ts');const layout=createLayout();
 const shelter=layout.buildings.find(b=>b.kind==='shelter')!,door=shelter.doors[0],bed={x:shelter.x,z:shelter.z};
 const outside={x:4,z:2};
 for(const [from,to] of [[outside,bed],[bed,outside]]){
  const route=renderRoute(layout,from,to);
  assert.ok(route.some(p=>p.x===door.x&&p.z===door.z));
  assert.deepEqual(route.at(-1),to);
  let previous=from;for(const p of route){assert.ok(p.x===previous.x||p.z===previous.z);previous=p;}
 }
 shelter.doors.forEach(d=>d.open=false);
 assert.deepEqual(renderRoute(layout,outside,bed),[]);
});
test('rendering a fractional route around a shelter retains the legal corner',async()=>{
 const {renderRoute}=await import('../src/v5/render-route.ts');const {isWalkable}=await import('../src/v5/layout.ts');
 const layout=createLayout(),from={x:0,z:2.2},to={x:4,z:2};const route=renderRoute(layout,from,to);
 assert.deepEqual(route.at(-1),to);let previous=from;
 for(const p of route){
  for(let i=0;i<=20;i++)assert.ok(isWalkable(layout,{x:Math.round(previous.x+(p.x-previous.x)*i/20),z:Math.round(previous.z+(p.z-previous.z)*i/20)}));
  previous=p;
 }
});
