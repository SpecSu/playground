import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createLayout, findPath, isWalkable, lineOfSight, regionAt, terrainAt,
  validateLayout, previewEdit, commitEdit, tickConstruction, cancelConstruction,
  buildingFootprint, buildingApproaches, shelterEntries, INITIAL_ACTOR_POINTS,
  type GridPoint, type Layout, type LayoutEdit,
} from '../src/v5/layout.ts';

const context = {materials:60, actors:INITIAL_ACTOR_POINTS, surveyed:true};
const complete = (layout:Layout, edit:LayoutEdit, eventId:string, materials=60) => {
  const committed=commitEdit(layout,edit,{...context,materials,eventId});
  assert.equal(committed.ok,true,committed.reasons.join('; '));
  return {...tickConstruction(committed.layout,120_000),reserved:committed.materialDelta};
};

test('initial estate has connected regions, a safe six-slot gift and land-only navigation',()=>{
  const layout=createLayout();
  assert.equal(layout.owned.length,144);
  assert.equal(layout.version,1);
  assert.deepEqual(new Set(layout.owned.map(regionAt)),new Set(['pen','meadow','shore','home']));
  const shelter=layout.buildings.find(b=>b.kind==='shelter')!;
  assert.equal(shelter.capacity,6);
  assert.equal(shelter.doors.length,1);
  assert.equal(shelter.paidCost,0);
  assert.equal(layout.buildings.find(b=>b.kind==='trough')!.capacity,6);
  assert.equal(buildingFootprint(shelter).length,9);
  assert.equal(validateLayout(layout,INITIAL_ACTOR_POINTS).ok,true);
  assert.equal(validateLayout(layout,INITIAL_ACTOR_POINTS).metrics.capacity,6);
  for(const p of INITIAL_ACTOR_POINTS) assert.ok(findPath(layout,p,shelterEntries(layout)[0]));
  assert.equal(terrainAt({x:10,z:8}),'shallow');
  assert.equal(terrainAt({x:11,z:11}),'deep');
  assert.equal(isWalkable(layout,{x:10,z:8}),false);
  assert.equal(isWalkable(layout,{x:11,z:11}),false);
  assert.equal(isWalkable(layout,{x:2,z:2}),false);
  assert.ok(findPath(layout,{x:5,z:4},{x:8,z:9}));
});

test('paths use legal cardinal edges and reject obstacles, outside land and disconnected targets',()=>{
  const layout=createLayout();
  const route=findPath(layout,{x:0,z:0},{x:5,z:5})!;
  assert.deepEqual(route[0],{x:0,z:0});
  assert.deepEqual(route.at(-1),{x:5,z:5});
  route.forEach((p,i)=>{
    assert.equal(isWalkable(layout,p),true);
    if(i) assert.equal(Math.abs(p.x-route[i-1].x)+Math.abs(p.z-route[i-1].z),1);
  });
  assert.equal(findPath(layout,{x:0,z:0},{x:-1,z:0}),null);
  assert.equal(findPath(layout,{x:0,z:0},{x:2,z:2}),null);
  assert.deepEqual(findPath(layout,{x:0,z:0},{x:0,z:0}),[{x:0,z:0}]);
  const isolated={...layout,owned:[{x:0,z:0},{x:1,z:1}]};
  assert.equal(findPath(isolated,{x:0,z:0},{x:1,z:1}),null);
  assert.equal(findPath(layout,{x:0.5,z:0},{x:0,z:0}),null);
});

test('line of sight obeys range and building occlusion including corner contacts',()=>{
  const layout=createLayout();
  assert.equal(lineOfSight(layout,{x:0,z:2},{x:5,z:2}),false);
  assert.equal(lineOfSight(layout,{x:5,z:5},{x:9,z:5},4),true);
  assert.equal(lineOfSight(layout,{x:5,z:5},{x:9,z:5},3.9),false);
  assert.equal(lineOfSight(layout,{x:0,z:1},{x:1,z:0}),false);
  assert.equal(lineOfSight(layout,{x:5,z:5},{x:9,z:5}),true);
});

test('preview is immutable and rejects footprint, terrain, budget, stale and event-locked edits',()=>{
  const layout=createLayout(), before=JSON.stringify(layout);
  const edit:LayoutEdit={type:'place',id:'new-trough',kind:'trough',x:8,z:3};
  const green=previewEdit(layout,edit,context);
  assert.equal(green.ok,true,green.reasons.join('; '));
  assert.equal(green.cost,8);
  assert.equal(green.durationMs,10_000);
  assert.equal(JSON.stringify(layout),before);
  for(const [bad,ctx] of [
    [{...edit,x:2,z:2},context],
    [{...edit,x:10,z:8},context],
    [{...edit,x:12,z:2},context],
    [edit,{...context,materials:7}],
    [edit,{...context,baseVersion:0}],
    [edit,{...context,locked:true}],
  ] as const) assert.equal(previewEdit(layout,bad,ctx).ok,false);
  assert.equal(previewEdit(layout,{type:'place',id:'initial-shelter',kind:'decor',x:8,z:3},context).ok,false);
  assert.equal(previewEdit(layout,{type:'place',id:'bad',kind:'decor',x:8.5,z:3},context).ok,false);
});

test('one construction reserves once, advances only supplied online time and installs one new version',()=>{
  const layout=createLayout(), edit:LayoutEdit={type:'place',id:'paid-shelter',kind:'shelter',x:7,z:0};
  const started=commitEdit(layout,edit,{...context,eventId:'build-1'});
  assert.equal(started.ok,true,started.reasons.join('; '));
  assert.equal(started.materialDelta,-24);
  assert.equal(started.layout.version,1);
  assert.equal(started.layout.buildings.some(b=>b.id==='paid-shelter'),false);
  assert.equal(isWalkable(started.layout,{x:8,z:1}),false);
  assert.equal(commitEdit(started.layout,edit,{...context,eventId:'build-1'}).materialDelta,0);
  assert.equal(commitEdit(started.layout,{type:'road',cells:[{x:8,z:4}]},{...context,eventId:'other'}).ok,false);
  const paused=tickConstruction(started.layout,0);
  assert.equal(paused.layout.construction!.elapsedMs,0);
  const partial=tickConstruction(paused.layout,29_999);
  assert.equal(partial.completed,false);
  const done=tickConstruction(partial.layout,1);
  assert.equal(done.completed,true);
  assert.equal(done.layout.version,2);
  assert.equal(done.layout.buildings.find(b=>b.id==='paid-shelter')!.paidCost,24);
  assert.equal(done.layout.construction,undefined);
  assert.equal(done.layout.history.length,1);
  assert.equal(tickConstruction(done.layout,30_000).materialDelta,0);
});

test('cancel refunds only the reserved payment and cannot be repeated or replayed',()=>{
  const edit:LayoutEdit={type:'place',id:'tower',kind:'tower',x:8,z:1};
  const started=commitEdit(createLayout(),edit,{...context,eventId:'cancel-build'});
  assert.equal(started.materialDelta,-12);
  const cancelled=cancelConstruction(started.layout,'cancel-command');
  assert.equal(cancelled.materialDelta,12);
  assert.equal(cancelled.layout.version,1);
  assert.equal(cancelConstruction(cancelled.layout,'cancel-command').materialDelta,0);
  assert.equal(cancelConstruction(cancelled.layout,'other-cancel').materialDelta,0);
  assert.equal(commitEdit(cancelled.layout,edit,{...context,eventId:'cancel-build'}).materialDelta,0);
});

test('free moves preserve paid basis and dismantling gifts or bought facilities never yields profit',()=>{
  const gift=complete(createLayout(),{type:'remove',id:'initial-trough'},'remove-gift');
  assert.equal(gift.reserved,0);
  assert.equal(gift.materialDelta,0);
  const placed=complete(gift.layout,{type:'place',id:'paid-trough',kind:'trough',x:8,z:3},'place-trough');
  assert.equal(placed.reserved,-8);
  const moved=complete(placed.layout,{type:'move',id:'paid-trough',x:8,z:4},'move-trough');
  assert.equal(moved.reserved,0);
  assert.equal(moved.layout.buildings.find(b=>b.id==='paid-trough')!.paidCost,8);
  const removed=complete(moved.layout,{type:'remove',id:'paid-trough'},'remove-trough');
  assert.equal(removed.materialDelta,6);
  assert.equal(commitEdit(removed.layout,{type:'remove',id:'paid-trough'},{...context,eventId:'remove-trough'}).materialDelta,0);
  assert.equal(previewEdit(removed.layout,{type:'remove',id:'paid-trough'},context).ok,false);
});

test('doors add independent reachable entry points without adding capacity and closing the final entry is rejected',()=>{
  const layout=createLayout();
  assert.equal(previewEdit(layout,{type:'door-state',id:'initial-shelter',doorId:'initial-door',open:false},context).ok,false);
  assert.equal(previewEdit(layout,{type:'door',id:'initial-shelter',at:{x:3,z:4}},context).ok,true);
  const done=complete(layout,{type:'door',id:'initial-shelter',at:{x:3,z:4}},'second-door');
  assert.equal(done.reserved,-8);
  assert.equal(shelterEntries(done.layout).length,2);
  assert.equal(validateLayout(done.layout,INITIAL_ACTOR_POINTS).metrics.capacity,6);
  const closed=complete(done.layout,{type:'door-state',id:'initial-shelter',doorId:'initial-door',open:false},'close-first');
  assert.equal(shelterEntries(closed.layout).length,1);
  assert.equal(previewEdit(layout,{type:'door',id:'initial-shelter',at:{x:2,z:2}},context).ok,false);
});

test('route preservation rejects trapping actors, facilities, entry cells or the last shelter',()=>{
  const layout=createLayout();
  assert.equal(previewEdit(layout,{type:'place',id:'trap',kind:'trough',x:4,z:4},context).ok,false);
  assert.equal(previewEdit(layout,{type:'remove',id:'initial-shelter'},context).ok,false);
  assert.equal(previewEdit(layout,{type:'place',id:'door-block',kind:'trough',x:2,z:4},context).ok,false);
  const narrowed={...layout,owned:layout.owned.filter(p=>p.x!==6||p.z===5)};
  assert.ok(findPath(narrowed,{x:8,z:4},{x:2,z:4}));
  const blocked=previewEdit(narrowed,{type:'place',id:'bridge-block',kind:'trough',x:6,z:5},{...context,actors:[{x:8,z:4}]});
  assert.equal(blocked.ok,false);
  assert.ok(blocked.metrics.unreachable.length>0);
});

test('eastward expansion requires survey and costs thirty for exactly thirty-six connected cells',()=>{
  const layout=createLayout();
  assert.equal(previewEdit(layout,{type:'expand'},{...context,surveyed:false}).ok,false);
  const preview=previewEdit(layout,{type:'expand'},context);
  assert.equal(preview.cost,30);
  assert.equal(preview.durationMs,60_000);
  const done=complete(layout,{type:'expand'},'expand');
  assert.equal(done.reserved,-30);
  assert.equal(done.layout.owned.length,180);
  assert.ok(findPath(done.layout,{x:5,z:5},{x:17,z:5}));
  assert.equal(previewEdit(done.layout,{type:'expand'},context).ok,false);
});

test('roads charge only new cells, prohibit water, and preserve paid refund basis',()=>{
  const layout=createLayout();
  const cells:GridPoint[]=[{x:8,z:2},{x:8,z:3},{x:8,z:3}];
  const preview=previewEdit(layout,{type:'road',cells},context);
  assert.equal(preview.cost,2);
  assert.equal(preview.durationMs,4_000);
  const built=complete(layout,{type:'road',cells},'road');
  assert.equal(built.reserved,-2);
  const remove=complete(built.layout,{type:'road',cells,remove:true},'unroad');
  assert.equal(remove.materialDelta,1);
  assert.equal(previewEdit(layout,{type:'road',cells:[{x:10,z:8}]},context).ok,false);
  assert.equal(previewEdit(layout,{type:'road',cells:[{x:11,z:11}]},context).ok,false);
  assert.ok(buildingApproaches(layout,layout.buildings.find(b=>b.kind==='workbench')!).length>0);
});

test('rotated ramp footprint is legal at shore but never makes water walkable for LX or sheep',()=>{
  const layout=createLayout();
  const ramp:LayoutEdit={type:'place',id:'shore-ramp',kind:'ramp',x:9,z:8,rotation:90};
  const preview=previewEdit(layout,ramp,context);
  assert.equal(preview.ok,true,preview.reasons.join('; '));
  assert.equal(preview.cost,10);
  const done=complete(layout,ramp,'ramp');
  assert.equal(buildingFootprint(done.layout.buildings.find(b=>b.id==='shore-ramp')!).length,2);
  assert.equal(isWalkable(done.layout,{x:10,z:8}),false);
});

test('construction cannot use an unfinished new shelter to justify sealing the current escape route',()=>{
  const initial=createLayout();
  const layout={...initial,owned:initial.owned.filter(p=>p.x!==6||(p.z>=4&&p.z<=6))};
  layout.roads=layout.roads.filter(p=>layout.owned.some(c=>p.x===c.x&&p.z===c.z));
  const context={materials:60,actors:[{x:9,z:4}]};
  const preview=previewEdit(layout,{type:'place',id:'bridge-shelter',kind:'shelter',x:6,z:4},context);
  assert.equal(preview.metrics.unreachable.length,0,'completed shelter would provide a route');
  assert.equal(preview.ok,false,'unfinished shelter does not protect a stranded animal');
  assert.ok(preview.reasons.some(reason=>reason.includes('施工区')));
});

test('document budget alternatives use actual paid edits to leave twenty-two or sixteen materials',()=>{
  const scenario=(edits:LayoutEdit[])=>{
    let layout=createLayout(),materials=60;
    edits.forEach((edit,i)=>{
      const done=complete(layout,edit,`budget-${i}`,materials);
      materials+=done.reserved+done.materialDelta;layout=done.layout;
    });
    return {layout,materials};
  };
  const roadA=Array.from({length:6},(_,z)=>({x:10,z}));
  const a=scenario([{type:'place',id:'factory',kind:'factory',x:7,z:7},
    {type:'place',id:'tower',kind:'tower',x:7,z:0},{type:'road',cells:roadA}]);
  assert.equal(a.materials,22);
  const b=scenario([{type:'expand'},{type:'place',id:'far-trough',kind:'trough',x:14,z:2},
    {type:'road',cells:Array.from({length:6},(_,z)=>({x:12,z}))}]);
  assert.equal(b.materials,16);
  assert.equal(b.layout.owned.length,180);
  assert.equal(previewEdit(b.layout,{type:'place',id:'far-shelter',kind:'shelter',x:15,z:3},{...context,materials:b.materials}).ok,false);
});

test('construction rejects clock corruption and rotating a shelter carries its actual entry with it',()=>{
  const layout=createLayout();
  const rotated=complete(layout,{type:'move',id:'initial-shelter',x:1,z:1,rotation:90},'rotate');
  assert.deepEqual(shelterEntries(rotated.layout).map(({x,z})=>({x,z})),[{x:0,z:2}]);
  assert.equal(rotated.layout.buildings[0].paidCost,0);
  const started=commitEdit(layout,{type:'place',id:'decor',kind:'decor',x:8,z:6},{...context,eventId:'clock'});
  for(const dt of [-1,NaN,Infinity]) assert.equal(tickConstruction(started.layout,dt).ok,false);
  assert.equal(started.layout.construction!.elapsedMs,0);
  assert.equal(tickConstruction({...started.layout,version:2},10000).ok,false);
});

test('single-factory prototype rejects spending materials on a second inactive production slot',()=>{let layout=createLayout();const first=commitEdit(layout,{type:'place',id:'factory-one',kind:'factory',x:7,z:6},{materials:60,eventId:'factory-first'});assert.equal(first.ok,true);layout=tickConstruction(first.layout,10000).layout;const second=previewEdit(layout,{type:'place',id:'factory-two',kind:'factory',x:7,z:0},{materials:40});assert.equal(second.ok,false);assert.match(second.reasons.join(' '),/饲料厂|工厂/);});
