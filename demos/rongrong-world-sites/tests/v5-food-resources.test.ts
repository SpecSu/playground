import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayout, previewEdit, terrainAt, type Building} from '../src/v5/layout.ts';
import {foodSiteRating, resourcesAt, FOOD_RESOURCE_PATCHES, type FoodResourcePatch} from '../src/v5/food-resources.ts';

const factory=(x:number,z:number):Building=>({id:'food',kind:'factory',x,z,rotation:0,paidCost:20,capacity:12,doors:[]});

test('natural resources are explicit patches, not all grass or the outer sea',()=>{
  assert.equal(terrainAt({x:6,z:0}),'grass');
  assert.deepEqual(resourcesAt({x:6,z:0}),[]);
  assert.deepEqual(resourcesAt({x:8,z:6}),['grassland']);
  assert.deepEqual(resourcesAt({x:7,z:7}),['forest']);
  assert.deepEqual(resourcesAt({x:10,z:8}),['freshwater']);
  assert.deepEqual(resourcesAt({x:11,z:11}),['freshwater']);
  assert.deepEqual(resourcesAt({x:-6,z:0}),[]);
  assert.deepEqual(resourcesAt({x:23,z:8}),[]);
  assert.deepEqual(resourcesAt({x:8.5,z:6}),[]);
  assert.deepEqual(resourcesAt({x:NaN,z:6}),[]);
});

test('viable sites produce distinct zero, one, two and three star ratings',()=>{
  const layout=createLayout();
  for(const [x,z,stars,intervalMs,quality,nutrition] of [
    [6,0,0,60_000,'plain',30], [8,9,1,50_000,'plain',30],
    [7,5,2,40_000,'fresh',36], [8,7,3,30_000,'rich',42],
  ] as const){
    const preview=previewEdit(layout,{type:'place',id:'food',kind:'factory',x,z},{materials:100});
    assert.equal(preview.ok,true,preview.reasons.join('; '));
    const rating=foodSiteRating(factory(x,z),layout);
    assert.equal(rating.stars,stars,`${x},${z}`);
    assert.deepEqual(rating.production,{batchSize:3,intervalMs,quality,nutrition});
  }
});

test('whole footprint uses four edge adjacency, excluding corners and interior',()=>{
  const patches:FoodResourcePatch[]=[
    {id:'interior',kind:'grassland',cells:[{x:1,z:1}]},
    {id:'diagonal',kind:'forest',cells:[{x:3,z:3}]},
    {id:'far-edge',kind:'pond',cells:[{x:3,z:2}]},
  ];
  const rating=foodSiteRating(factory(1,1),undefined,patches);
  assert.deepEqual(rating.resources,['freshwater']);
  assert.equal(rating.stars,1);
  assert.equal(rating.border.length,8);
  assert.equal(rating.border.some(p=>p.x===3&&p.z===2),true);
  assert.equal(rating.border.some(p=>p.x===3&&p.z===3),false);
});

test('ponds, rivers and repeated natural patches never stack their category',()=>{
  const patches:FoodResourcePatch[]=[
    {id:'pond',kind:'pond',cells:[{x:0,z:1},{x:0,z:2}]},
    {id:'river',kind:'river',cells:[{x:3,z:1}]},
  ];
  assert.deepEqual(resourcesAt({x:3,z:1},patches),['freshwater']);
  assert.equal(foodSiteRating(factory(1,1),undefined,patches).stars,1);
  patches.push({id:'grass',kind:'grassland',cells:[{x:1,z:0},{x:2,z:0}]},
    {id:'trees',kind:'forest',cells:[{x:1,z:3},{x:2,z:3}]});
  assert.equal(foodSiteRating(factory(1,1),undefined,patches).stars,3);
});

test('decorations do not create resources and covering a natural patch removes its bonus',()=>{
  const layout=createLayout();
  layout.buildings.push({...factory(5,0),id:'decor',kind:'decor',capacity:0,paidCost:2});
  assert.equal(foodSiteRating(factory(6,0),layout).stars,0);
  layout.buildings.push({...factory(7,7),id:'cover-a',kind:'decor',capacity:0,paidCost:2},
    {...factory(7,8),id:'cover-b',kind:'decor',capacity:0,paidCost:2});
  assert.deepEqual(foodSiteRating(factory(8,7),layout).resources,['grassland','freshwater']);
});

test('rating cannot mutate exported map or layout and patch contents match renderer lookup',()=>{
  const layout=createLayout(),before=structuredClone(layout);
  const rating=foodSiteRating(factory(8,7),layout);
  rating.resources.length=0;
  rating.production.intervalMs=1;
  assert.equal(foodSiteRating(factory(8,7),layout).production.intervalMs,30_000);
  assert.deepEqual(layout,before);
  for(const patch of FOOD_RESOURCE_PATCHES) for(const cell of patch.cells) {
    assert.equal(resourcesAt(cell).includes(patch.kind==='pond'||patch.kind==='river'?'freshwater':patch.kind),true);
  }
});

test('moving a factory with the same ID ignores its vacated old footprint',()=>{
  const layout=createLayout();
  // Old factory covered the forest. Rating the move must free those cells.
  layout.buildings.push(factory(6,7));
  const rating=foodSiteRating(factory(8,7),layout);
  assert.equal(rating.stars,3);
  assert.deepEqual(rating.resources,['grassland','freshwater','forest']);
  assert.equal(layout.buildings.at(-1)?.x,6);
});
