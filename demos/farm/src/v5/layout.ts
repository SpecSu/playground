/**
 * All coordinates are integer cell centres; rendering subtracts 5.5 from x/z.
 * Edits are immutable. The owner must persist layout and materialDelta together.
 * commitEdit reserves materials; tickConstruction installs the geometry and pays
 * any dismantling refund. Only supplied online milliseconds advance construction.
 * Doors are exterior queue cells: entry into a reserved shelter is simulated by
 * the guardian module, never by a path through the solid building footprint.
 */
export type GridPoint = {x:number;z:number};
export type Region = 'pen'|'meadow'|'shore'|'home';
export type BuildingKind = 'shelter'|'trough'|'workbench'|'tower'|'factory'|'ramp'|'decor';
export type Rotation = 0|90|180|270;
export type Terrain = 'grass'|'shallow'|'deep';
export interface Door extends GridPoint {id:string;open:boolean;paidCost:number}
export interface Building extends GridPoint {
  id:string;kind:BuildingKind;rotation:Rotation;paidCost:number;doors:Door[];capacity:number;
}
export type LayoutEdit =
  | {type:'place';id:string;kind:BuildingKind;x:number;z:number;rotation?:Rotation}
  | {type:'move';id:string;x:number;z:number;rotation?:Rotation}
  | {type:'remove';id:string}
  | {type:'road';cells:GridPoint[];remove?:boolean}
  | {type:'door';id:string;at:GridPoint}
  | {type:'door-state';id:string;doorId:string;open:boolean}
  | {type:'expand'};
export interface LayoutGeometry {
  owned:GridPoint[];roads:GridPoint[];buildings:Building[];roadPaidCost:Record<string,number>;
}
export interface Construction {
  eventId:string;baseVersion:number;edit:LayoutEdit;reservedCost:number;refund:number;
  durationMs:number;elapsedMs:number;target:LayoutGeometry;footprint:GridPoint[];
}
export interface LayoutHistory extends LayoutGeometry {
  version:number;eventId:string;nextVersion:number;cost:number;refund:number;
}
export interface Layout extends LayoutGeometry {
  version:number;construction?:Construction;history:LayoutHistory[];receipts:string[];
}
export interface LayoutMetrics {
  capacity:number;reachableCapacity:number;maxReachablePath:number;
  unreachable:{id:string;point:GridPoint}[];
  routes:{id:string;path:GridPoint[];buildingId:string;doorId:string}[];
}
export interface LayoutValidation {ok:boolean;reasons:string[];metrics:LayoutMetrics}
export interface PreviewContext {
  materials:number;baseVersion?:number;actors?:GridPoint[];surveyed?:boolean;locked?:boolean;
}
export interface LayoutPreview extends LayoutValidation {
  cost:number;refund:number;durationMs:number;baseVersion:number;after:Layout;beforeMetrics:LayoutMetrics;
}
export interface EditResult {
  ok:boolean;layout:Layout;materialDelta:number;reasons:string[];duplicate?:boolean;completed?:boolean;
}
export interface ShelterEntry extends GridPoint {buildingId:string;doorId:string;capacity:number}

/** Editable experiment constants; workbench is a free fallback, not a sellable asset. */
export const BUILDING_RULES:Record<BuildingKind,{cost:number;width:number;depth:number;capacity:number;durationMs:number}> = {
  shelter:{cost:24,width:3,depth:3,capacity:6,durationMs:30_000},
  trough:{cost:8,width:1,depth:1,capacity:6,durationMs:10_000},
  workbench:{cost:0,width:1,depth:1,capacity:3,durationMs:10_000},
  tower:{cost:12,width:2,depth:2,capacity:1,durationMs:10_000},
  factory:{cost:20,width:2,depth:2,capacity:12,durationMs:10_000},
  ramp:{cost:10,width:1,depth:2,capacity:0,durationMs:10_000},
  decor:{cost:2,width:1,depth:1,capacity:0,durationMs:10_000},
};
export const LAYOUT_RULES = {doorCost:8,expansionCost:30,expansionMs:60_000,roadCellMs:2_000,moveMs:10_000,refundRate:0.8};
export const INITIAL_ACTOR_POINTS:GridPoint[] = [{x:4,z:4},{x:5,z:4},{x:4,z:5}];
export const INITIAL_PLAYER_POINT:GridPoint = {x:5,z:7};
const STEPS:GridPoint[] = [{x:0,z:1},{x:1,z:0},{x:0,z:-1},{x:-1,z:0}];
const key = (p:GridPoint) => `${p.x},${p.z}`;
const same = (a:GridPoint,b:GridPoint) => a.x===b.x&&a.z===b.z;
const cell = (p:GridPoint) => p&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.z);
const neighbors = (p:GridPoint) => STEPS.map(d=>({x:p.x+d.x,z:p.z+d.z}));
const unique = (points:GridPoint[]) => [...new Map(points.map(p=>[key(p),{x:p.x,z:p.z}])).values()];
const clone = <T>(value:T):T => structuredClone(value);
const geometry = (layout:Layout):LayoutGeometry => clone({owned:layout.owned,roads:layout.roads,buildings:layout.buildings,roadPaidCost:layout.roadPaidCost});
const solid = (building:Building) => building.kind!=='ramp';
const dimensions = (building:Pick<Building,'kind'|'rotation'>) => {
  const rule=BUILDING_RULES[building.kind];
  return building.rotation===90||building.rotation===270 ? {width:rule.depth,depth:rule.width} : {width:rule.width,depth:rule.depth};
};
const pointOnBoundary = (building:Building,p:GridPoint) => {
  const footprint=buildingFootprint(building);
  return !footprint.some(c=>same(c,p))&&footprint.some(c=>Math.abs(c.x-p.x)+Math.abs(c.z-p.z)===1);
};
const makeBuilding = (id:string,kind:BuildingKind,x:number,z:number,rotation:Rotation=0,paidCost=0):Building => {
  const building:Building={id,kind,x,z,rotation,paidCost,doors:[],capacity:BUILDING_RULES[kind].capacity};
  if(kind==='shelter') {
    const offsets:Record<Rotation,GridPoint>={0:{x:1,z:3},90:{x:-1,z:1},180:{x:1,z:-1},270:{x:3,z:1}};
    const at=offsets[rotation];
    building.doors=[{id:`${id}-door`,x:x+at.x,z:z+at.z,open:true,paidCost:0}];
  }
  return building;
};

export function regionAt(p:GridPoint):Region {
  return p.z<6 ? (p.x<6?'pen':'meadow') : (p.x<6?'home':'shore');
}

export function terrainAt(p:GridPoint):Terrain {
  if(p.x===11&&p.z>=10&&p.z<=11) return 'deep';
  return p.x>=10&&p.x<=11&&p.z>=8&&p.z<=11 ? 'shallow' : 'grass';
}

export function buildingFootprint(building:Building):GridPoint[] {
  const {width,depth}=dimensions(building),result:GridPoint[]=[];
  for(let x=0;x<width;x++) for(let z=0;z<depth;z++) result.push({x:building.x+x,z:building.z+z});
  return result;
}

export function createLayout():Layout {
  const owned:GridPoint[]=[],roads:GridPoint[]=[];
  for(let x=0;x<12;x++) for(let z=0;z<12;z++) owned.push({x,z});
  for(let x=2;x<=9;x++) roads.push({x,z:4});
  for(let z=4;z<=9;z++) roads.push({x:5,z});
  for(let x=2;x<=9;x++) roads.push({x,z:9});
  roads.push({x:2,z:7},{x:2,z:4},{x:3,z:4});
  const shelter=makeBuilding('initial-shelter','shelter',1,1);
  shelter.doors[0].id='initial-door';
  return {version:1,owned,roads:unique(roads),roadPaidCost:{},buildings:[shelter,
    makeBuilding('initial-trough','trough',5,3),makeBuilding('initial-workbench','workbench',2,8)],history:[],receipts:[]};
}

/** Sheep/LX/guardians share this land graph. Ramps do not grant swimming. */
export function isWalkable(layout:Layout,p:GridPoint):boolean {
  if(!cell(p)||terrainAt(p)!=='grass'||!layout.owned.some(c=>same(c,p))) return false;
  if(layout.buildings.some(b=>solid(b)&&buildingFootprint(b).some(c=>same(c,p)))) return false;
  return !layout.construction?.footprint.some(c=>same(c,p));
}

export function findPath(layout:Layout,from:GridPoint,to:GridPoint):GridPoint[]|null {
  if(!isWalkable(layout,from)||!isWalkable(layout,to)) return null;
  const queue:GridPoint[]=[{x:from.x,z:from.z}],previous=new Map<string,GridPoint|null>([[key(from),null]]);
  for(let cursor=0;cursor<queue.length;cursor++) {
    const current=queue[cursor];
    if(same(current,to)) {
      const route:GridPoint[]=[];
      for(let p:GridPoint|null=current;p;p=previous.get(key(p))??null) route.push(p);
      return route.reverse();
    }
    for(const next of neighbors(current)) if(!previous.has(key(next))&&isWalkable(layout,next)) {
      previous.set(key(next),current);queue.push(next);
    }
  }
  return null;
}

/** Supercover ray: touching the corner of an opaque cell also blocks sight. */
export function lineOfSight(layout:Layout,from:GridPoint,to:GridPoint,range=Infinity):boolean {
  if(![from.x,from.z,to.x,to.z].every(Number.isFinite)||Number.isNaN(range)||range<0||Math.hypot(to.x-from.x,to.z-from.z)>range) return false;
  const occupied=new Set(layout.buildings.filter(solid).flatMap(buildingFootprint).map(key));
  const owned=new Set(layout.owned.map(key));
  const blocked=(x:number,z:number)=>!owned.has(`${x},${z}`)||occupied.has(`${x},${z}`);
  let x=Math.floor(from.x+0.5),z=Math.floor(from.z+0.5);
  const endX=Math.floor(to.x+0.5),endZ=Math.floor(to.z+0.5);
  if(blocked(x,z)||blocked(endX,endZ)) return false;
  const dx=to.x-from.x,dz=to.z-from.z,sx=Math.sign(dx),sz=Math.sign(dz);
  const deltaX=dx===0?Infinity:Math.abs(1/dx),deltaZ=dz===0?Infinity:Math.abs(1/dz);
  let maxX=dx===0?Infinity:(x+(sx>0?0.5:-0.5)-from.x)/dx;
  let maxZ=dz===0?Infinity:(z+(sz>0?0.5:-0.5)-from.z)/dz;
  while(x!==endX||z!==endZ) {
    if(Math.abs(maxX-maxZ)<1e-10) {
      if(blocked(x+sx,z)||blocked(x,z+sz)) return false;
      x+=sx;z+=sz;maxX+=deltaX;maxZ+=deltaZ;
    } else if(maxX<maxZ) {x+=sx;maxX+=deltaX;}
    else {z+=sz;maxZ+=deltaZ;}
    if(blocked(x,z)) return false;
  }
  return true;
}

export function buildingApproaches(layout:Layout,building:Building):GridPoint[] {
  return unique(buildingFootprint(building).flatMap(neighbors)).filter(p=>isWalkable(layout,p));
}

export function shelterEntries(layout:Layout):ShelterEntry[] {
  return layout.buildings.filter(b=>b.kind==='shelter').flatMap(b=>b.doors
    .filter(d=>d.open&&pointOnBoundary(b,d)&&isWalkable(layout,d))
    .map(d=>({buildingId:b.id,doorId:d.id,x:d.x,z:d.z,capacity:b.capacity})));
}

export function validateLayout(layout:Layout,actors:GridPoint[]=INITIAL_ACTOR_POINTS):LayoutValidation {
  const reasons:string[]=[],occupied=new Set<string>(),ids=new Set<string>(),owned=new Set(layout.owned.map(key));
  if(!Number.isSafeInteger(layout.version)||layout.version<1) reasons.push('布局版本无效');
  if(layout.owned.some(p=>!cell(p))||owned.size!==layout.owned.length) reasons.push('土地坐标无效或重复');
  for(const building of layout.buildings) {
    if(ids.has(building.id)||!building.id) reasons.push('设施ID重复或为空');
    ids.add(building.id);
    if(!cell(building)||![0,90,180,270].includes(building.rotation)||!BUILDING_RULES[building.kind]) {reasons.push('设施坐标或类型无效');continue;}
    if(!Number.isSafeInteger(building.paidCost)||building.paidCost<0) reasons.push('已付材料账目无效');
    if(building.capacity!==BUILDING_RULES[building.kind].capacity) reasons.push('设施容量与规则不符');
    const footprint=buildingFootprint(building);
    for(const p of footprint) {
      if(!owned.has(key(p))) reasons.push('设施超出已拥有土地');
      if(terrainAt(p)==='deep'||(building.kind!=='ramp'&&terrainAt(p)!=='grass')) reasons.push('设施地形不适配');
      if(occupied.has(key(p))) reasons.push('设施占地重叠');
      occupied.add(key(p));
    }
    if(building.kind==='ramp'&&(!footprint.some(p=>terrainAt(p)==='grass')||!footprint.some(p=>terrainAt(p)==='shallow'))) reasons.push('坡道必须连接岸与浅水');
    const doorIds=new Set<string>(),doorCells=new Set<string>();
    for(const door of building.doors) {
      if(building.kind!=='shelter'||!cell(door)||!pointOnBoundary(building,door)||!isWalkable(layout,door)) reasons.push('入口须在棚外相邻的合法陆地');
      if(doorIds.has(door.id)||doorCells.has(key(door))) reasons.push('入口重复');
      if(!Number.isSafeInteger(door.paidCost)||door.paidCost<0) reasons.push('入口材料账目无效');
      doorIds.add(door.id);doorCells.add(key(door));
    }
  }
  if(layout.roads.some(p=>!cell(p)||!owned.has(key(p))||terrainAt(p)!=='grass')) reasons.push('道路须在已拥有的陆地');
  const entries=shelterEntries(layout),shelters=layout.buildings.filter(b=>b.kind==='shelter');
  const metrics:LayoutMetrics={capacity:shelters.reduce((sum,b)=>sum+b.capacity,0),
    reachableCapacity:shelters.filter(b=>entries.some(d=>d.buildingId===b.id)).reduce((sum,b)=>sum+b.capacity,0),
    maxReachablePath:0,unreachable:[],routes:[]};
  const sources:{id:string;points:GridPoint[];point:GridPoint}[]=actors.map((p,index)=>({id:`actor-${index}`,points:[p],point:p}));
  for(const b of layout.buildings.filter(b=>b.kind==='trough'||b.kind==='workbench')) sources.push({id:b.id,points:buildingApproaches(layout,b),point:{x:b.x,z:b.z}});
  for(const source of sources) {
    let best:{path:GridPoint[];entry:ShelterEntry}|undefined;
    for(const p of source.points) for(const entry of entries) {
      const path=findPath(layout,p,entry);
      if(path&&(!best||path.length<best.path.length)) best={path,entry};
    }
    if(!best) {metrics.unreachable.push({id:source.id,point:source.point});continue;}
    metrics.maxReachablePath=Math.max(metrics.maxReachablePath,best.path.length-1);
    metrics.routes.push({id:source.id,path:best.path,buildingId:best.entry.buildingId,doorId:best.entry.doorId});
  }
  if(!entries.length) reasons.push('需要至少一座有合法开放入口的保护棚');
  if(metrics.unreachable.length) reasons.push('动物或生活设施没有可达的回棚路线');
  return {ok:reasons.length===0,reasons:[...new Set(reasons)],metrics};
}

function rotateDoors(building:Building,x:number,z:number,rotation:Rotation):Door[] {
  const old=dimensions(building),next=dimensions({...building,rotation});
  const turns=((rotation-building.rotation+360)%360)/90;
  return building.doors.map(door=>{
    let dx=door.x-building.x-(old.width-1)/2,dz=door.z-building.z-(old.depth-1)/2;
    for(let i=0;i<turns;i++) [dx,dz]=[-dz,dx];
    return {...door,x:x+(next.width-1)/2+dx,z:z+(next.depth-1)/2+dz};
  });
}

export function previewEdit(layout:Layout,edit:LayoutEdit,context:PreviewContext):LayoutPreview {
  const after=clone(layout),reasons:string[]=[],actors=context.actors??INITIAL_ACTOR_POINTS;
  const beforeMetrics=validateLayout(layout,actors).metrics;
  let cost=0,refund=0,durationMs=LAYOUT_RULES.moveMs;
  if(context.locked) reasons.push('事件进行中，布局已锁定');
  if(context.baseVersion!==undefined&&context.baseVersion!==layout.version) reasons.push('布局版本已变更，请重新预览');
  if(layout.construction) reasons.push('已有一项工程正在施工');
  if(!Number.isSafeInteger(context.materials)||context.materials<0) reasons.push('材料余额无效');
  const target='id' in edit?after.buildings.find(b=>b.id===edit.id):undefined;
  if(edit.type==='place') {
    if(edit.kind==='factory'&&layout.buildings.some(b=>b.kind==='factory'))reasons.push('当前原型每档仅支持一座饲料厂，请搬迁已有工厂');
    if(!edit.id||after.buildings.some(b=>b.id===edit.id)) reasons.push('设施ID已存在或为空');
    if(!BUILDING_RULES[edit.kind]||!cell(edit)||![0,90,180,270].includes(edit.rotation??0)) reasons.push('设施类型、格点或朝向无效');
    else {
      cost=BUILDING_RULES[edit.kind].cost;durationMs=BUILDING_RULES[edit.kind].durationMs;
      after.buildings.push(makeBuilding(edit.id,edit.kind,edit.x,edit.z,edit.rotation??0,cost));
    }
  } else if(edit.type==='move') {
    if(!target) reasons.push('找不到要搬迁的设施');
    else if(!cell(edit)||![0,90,180,270].includes(edit.rotation??target.rotation)) reasons.push('搬迁格点或朝向无效');
    else {
      target.doors=rotateDoors(target,edit.x,edit.z,edit.rotation??target.rotation);
      target.x=edit.x;target.z=edit.z;target.rotation=edit.rotation??target.rotation;
    }
  } else if(edit.type==='remove') {
    if(!target) reasons.push('找不到要拆除的设施');
    else {
      refund=Math.floor((target.paidCost+target.doors.reduce((sum,d)=>sum+d.paidCost,0))*LAYOUT_RULES.refundRate);
      after.buildings=after.buildings.filter(b=>b.id!==target.id);
    }
  } else if(edit.type==='road') {
    if(!Array.isArray(edit.cells)||!edit.cells.length||edit.cells.some(p=>!cell(p))) reasons.push('请选择有效的道路格点');
    else {
      const cells=unique(edit.cells),keys=new Set(cells.map(key));
      if(edit.remove) {
        const removed=after.roads.filter(p=>keys.has(key(p)));
        refund=Math.floor(removed.reduce((sum,p)=>sum+(after.roadPaidCost[key(p)]??0),0)*LAYOUT_RULES.refundRate);
        after.roads=after.roads.filter(p=>!keys.has(key(p)));
        for(const p of removed) delete after.roadPaidCost[key(p)];
        durationMs=removed.length*LAYOUT_RULES.roadCellMs;
      } else {
        const added=cells.filter(p=>!after.roads.some(road=>same(road,p)));
        if(cells.some(p=>!isWalkable(layout,p))) reasons.push('道路不能穿过水域、设施或未拥有土地');
        cost=added.length;durationMs=added.length*LAYOUT_RULES.roadCellMs;
        for(const p of added) after.roadPaidCost[key(p)]=1;
        after.roads.push(...added);
      }
      if(durationMs===0) reasons.push('道路没有发生变化');
    }
  } else if(edit.type==='door') {
    if(!target||target.kind!=='shelter') reasons.push('只能为保护棚增加入口');
    else if(!cell(edit.at)||!pointOnBoundary(target,edit.at)||!isWalkable(after,edit.at)) reasons.push('入口必须在棚边相邻的通路格');
    else if(target.doors.some(d=>same(d,edit.at))) reasons.push('此处已有入口');
    else if(!after.roads.some(p=>same(p,edit.at))) reasons.push('第二入口需要一条可达道路');
    else {cost=LAYOUT_RULES.doorCost;target.doors.push({...edit.at,id:`${target.id}-door-${key(edit.at)}`,open:true,paidCost:cost});}
  } else if(edit.type==='door-state') {
    const door=target?.doors.find(d=>d.id===edit.doorId);
    if(!door||typeof edit.open!=='boolean') reasons.push('找不到入口或门状态无效');
    else if(door.open===edit.open) reasons.push('入口状态没有变化');
    else {door.open=edit.open;durationMs=0;}
  } else if(edit.type==='expand') {
    const expansion:GridPoint[]=[];
    for(let x=12;x<18;x++) for(let z=0;z<6;z++) expansion.push({x,z});
    if(!context.surveyed) reasons.push('请先在边界完成勘察');
    if(expansion.some(p=>after.owned.some(c=>same(c,p)))) reasons.push('相邻地块已经拥有');
    if(!expansion.some(p=>neighbors(p).some(n=>isWalkable(layout,n)))) reasons.push('拓荒地块缺少合法相邻连接口');
    after.owned.push(...expansion);cost=LAYOUT_RULES.expansionCost;durationMs=LAYOUT_RULES.expansionMs;
  } else reasons.push('未知布局操作');
  const validation=validateLayout(after,actors);
  reasons.push(...validation.reasons);
  if(cost>context.materials) reasons.push('材料不足');
  // During relocation both the old footprint and the future footprint coexist.
  // Verify that this reservation cannot seal the sole existing evacuation route.
  if(!reasons.length&&(edit.type==='place'||edit.type==='move')) {
    const future=after.buildings.find(b=>b.id===edit.id)!;
    if(solid(future)) {
      const staged=clone(layout);
      staged.construction={eventId:'preview',baseVersion:layout.version,edit:clone(edit),reservedCost:cost,refund,
        durationMs,elapsedMs:0,target:geometry(after),footprint:buildingFootprint(future)};
      const during=validateLayout(staged,actors);
      if(!during.ok) reasons.push('施工区会阻断现有回棚路线');
    }
  }
  return {ok:reasons.length===0,reasons:[...new Set(reasons)],cost,refund,durationMs,baseVersion:layout.version,
    after,beforeMetrics,metrics:validation.metrics};
}

const result = (layout:Layout,ok=true,reasons:string[]=[],materialDelta=0):EditResult => ({ok,layout,reasons,materialDelta});

export function commitEdit(layout:Layout,edit:LayoutEdit,context:PreviewContext&{eventId:string}):EditResult {
  if(!context.eventId) return result(layout,false,['操作需要稳定的事件ID']);
  if(layout.receipts.includes(context.eventId)) return {...result(layout),duplicate:true};
  const preview=previewEdit(layout,edit,context);
  if(!preview.ok) return result(layout,false,preview.reasons);
  const next=clone(layout);
  next.receipts.push(context.eventId);
  const future='id' in edit?preview.after.buildings.find(b=>b.id===edit.id):undefined;
  const footprint=(edit.type==='place'||edit.type==='move')&&future&&solid(future)?buildingFootprint(future):[];
  next.construction={eventId:context.eventId,baseVersion:layout.version,edit:clone(edit),reservedCost:preview.cost,
    refund:preview.refund,durationMs:preview.durationMs,elapsedMs:0,target:geometry(preview.after),footprint};
  if(preview.durationMs===0) {
    const installed=tickConstruction(next,0);
    return {...installed,materialDelta:installed.materialDelta-preview.cost};
  }
  return result(next,true,[],preview.cost===0?0:-preview.cost);
}

export function tickConstruction(layout:Layout,onlineMs:number):EditResult {
  if(!Number.isFinite(onlineMs)||onlineMs<0) return result(layout,false,['在线建设时长无效']);
  if(!layout.construction) return {...result(layout),completed:false};
  const next=clone(layout),construction=next.construction!;
  if(construction.baseVersion!==layout.version) return result(layout,false,['施工基准版本已变更']);
  construction.elapsedMs=Math.min(construction.durationMs,construction.elapsedMs+onlineMs);
  if(construction.elapsedMs<construction.durationMs) return {...result(next),completed:false};
  next.history.push({...geometry(layout),version:layout.version,eventId:construction.eventId,nextVersion:layout.version+1,
    cost:construction.reservedCost,refund:construction.refund});
  Object.assign(next,clone(construction.target));
  next.version++;
  delete next.construction;
  return {...result(next,true,[],construction.refund),completed:true};
}

export function cancelConstruction(layout:Layout,eventId:string):EditResult {
  if(!eventId) return result(layout,false,['取消需要稳定的事件ID']);
  if(layout.receipts.includes(eventId)) return {...result(layout),duplicate:true};
  if(!layout.construction) return result(layout);
  const next=clone(layout),refund=next.construction!.reservedCost;
  next.receipts.push(eventId);
  delete next.construction;
  return result(next,true,[],refund);
}
