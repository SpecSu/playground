import {completedTerrain,isBuilt} from './construction.js';
import {buildingCells,canPlaceBuilding} from './footprints.js';
export const containsPoint=(tile,p)=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Math.abs(tile.x-p.x)<=.50001&&Math.abs(tile.y-p.y)<=.50001;
export function walkableTerrain(tiles,buildings=[],time=Date.now()){
 const blocked=new Set(buildings.flatMap(b=>buildingCells({tiles},b)).map(c=>`${c.x}:${c.y}`));return completedTerrain(tiles,time).filter(t=>!blocked.has(`${t.x}:${t.y}`));
}
export function tileRoute(tiles,startId,goalId){
 const start=tiles.find(t=>t.id===startId),goal=tiles.find(t=>t.id===goalId);if(!start||!goal)return [];const queue=[start],previous=new Map([[start.id,null]]);
 for(let i=0;i<queue.length;i++){const current=queue[i];if(current.id===goalId)break;for(const tile of tiles)if(!previous.has(tile.id)&&Math.abs(current.x-tile.x)+Math.abs(current.y-tile.y)===1){previous.set(tile.id,current.id);queue.push(tile);}}
 if(!previous.has(goalId))return [];const path=[];let id=goalId;while(id!==null){path.push(tiles.find(t=>t.id===id));id=previous.get(id);}return path.reverse();
}
export function safeActorPoint(tiles,buildings,point,time){
 const safe=walkableTerrain(tiles,buildings,time);return safe.some(t=>containsPoint(t,point))&&!buildings.some(b=>buildingCells({tiles},b).some(t=>containsPoint(t,point)));
}
export function canReserveBuilding(world,tileId,varieties=world.varieties??{},exceptId=null,time=world.lastSeenAt??Date.now(),point=null,candidate=null){
 if(!canPlaceBuilding(world,tileId,varieties,exceptId,time,candidate))return false;const before=world.buildings??world.exhibits??[],actor=point??world.tiles.find(t=>t.id===world.avatarTileId);if(!safeActorPoint(world.tiles,before,actor,time))return false;
 const after=[...before.filter(b=>b.id!==exceptId),{...(candidate??before.find(b=>b.id===exceptId)??{}),id:exceptId??'candidate',tileId}];return safeActorPoint(world.tiles,after,actor,time)&&stableWalkGraph(world.tiles,after,time);
}

export function stableWalkGraph(tiles,buildings,time){
 const frontiers=[time,...tiles.filter(t=>Number.isFinite(t.readyAt)&&t.readyAt>time).map(t=>t.readyAt)];return frontiers.every(at=>{const free=walkableTerrain(tiles,buildings,at);return !!free.length&&free.every(t=>tileRoute(free,free[0].id,t.id).length);});
}
export function legacyRecoveryEligible(state,time=Math.max(Date.now(),state.lastSeenAt??0)){
 return state.coins<18&&completedTerrain(state.tiles,time).length>0&&walkableTerrain(state.tiles,state.buildings??[],time).length===0&&(state.buildings??[]).some(b=>isBuilt(b,time)&&Object.hasOwn(state.blueprints??{},b.blueprintId));
}
