import {occupiedTileIds,plantAtTile} from './footprints.js';
import {containsPoint,tileRoute} from './navigation.js';
/** Interaction-only path. Other plants stay soft terrain; the selected plant is not traversed. */
export function plantApproachRoute({tiles,worldTiles=tiles,plants=[],varieties={},plantId,position,route=tileRoute}){
 const target=plants.find(p=>p.id===plantId);if(!target)return null;const world={tiles:worldTiles,plants},blocked=new Set(occupiedTileIds(world,target,varieties[target.varietyId])),cells=worldTiles.filter(t=>blocked.has(t.id));
 const start=tiles.filter(t=>containsPoint(t,position)).sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y))[0];if(!start)return null;
 // A published save may already be inside this plant: retain just that support so
 // the first segment exits naturally, never jumping or walking through its other cells.
 const inside=blocked.has(start.id),safe=tiles.filter(t=>!blocked.has(t.id)||t.id===start.id),choices=[];
 for(const tile of safe){if(blocked.has(tile.id)||plantAtTile(world,tile.id,varieties)||!cells.some(c=>Math.abs(c.x-tile.x)+Math.abs(c.y-tile.y)===1))continue;const path=route(safe,start.id,tile.id);if(!path.length)continue;const points=inside?path.slice(1):path;let previous=position,cost=0;for(const p of points){cost+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;}choices.push({stand:{x:tile.x,y:tile.y},standTile:tile,path,originInside:inside,cost});}
 choices.sort((a,b)=>a.cost-b.cost||a.path.length-b.path.length);return choices[0]??null;
}
