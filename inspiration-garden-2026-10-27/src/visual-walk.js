import {buildingSample} from './blueprints.js';
import {plantApproachRoute} from './plant-approach.js';
import {walkableTerrain,tileRoute,containsPoint,safeActorPoint} from './navigation.js';
import {buildingCells,buildingAtTile,occupiedTileIds} from './footprints.js';
import {avatarStandPoint} from './scene-math.js';
export function findTilePath(tiles,startId,goalId,now=Date.now(),buildings=[]){return tileRoute(walkableTerrain(tiles,buildings,now),startId,goalId);}
/** Prefer landscaped clear routes, but never turn an existing full farm into a wall. */
export function preferredTileRoute(tiles,startId,goalId,plants=[],varieties={}){const occupied=new Set(plants.flatMap(p=>occupiedTileIds({tiles,plants},p,varieties[p.varietyId]))),clear=tiles.filter(t=>t.id===startId||t.id===goalId||!occupied.has(t.id)),route=tileRoute(clear,startId,goalId);return route.length?route:tileRoute(tiles,startId,goalId);}
/** Current illustrated fronts natively face down-left; backs face up-right (all12 audited). */
export function walkingFacing(from,to,previous={direction:'front',mirror:false}){
 const dx=(to.x-from.x)-(to.y-from.y),dy=(to.x-from.x)+(to.y-from.y);if(Math.abs(dx)+Math.abs(dy)<1e-7)return previous;
 const direction=Math.abs(dy)<1e-7?previous.direction:dy<0?'back':'front',mirror=Math.abs(dx)<1e-7?previous.mirror:direction==='front'?dx>0:dx<0;return {direction,mirror};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Presentation-only walker: destinations replace a route, never queue or gate game transactions. */
export function createTileWalker({stepMs=380,clock=Date.now}={}){
 let map=new Map(),position={x:0,y:0},tileId=null,segment=null,queue=[],direction='front',mirror=false,destination=null,routeAt=0,routeDuration=0;
 const begin=at=>{
  segment=null;
  while(queue.length){const to=queue.shift(),length=distance(position,to);if(length<.001){position={x:to.x,y:to.y};tileId=to.tileId;continue;}
   segment={from:{...position},to,at,duration:Math.max(60,stepMs*length)};
   const facing=walkingFacing(position,to,{direction,mirror});direction=facing.direction;mirror=facing.mirror;break;
  }
 };
 const sample=realAt=>{
  const u=routeDuration?Math.max(0,Math.min(1,(realAt-routeAt)/routeDuration)):1,r=routeDuration?Math.min(.18,90/routeDuration):.18;
  // Integrate a trapezoidal speed curve once for the whole route, not once per tile.
  const eased=u<r?u*u/(2*r*(1-r)):u>1-r?1-(1-u)*(1-u)/(2*r*(1-r)):(u-r/2)/(1-r);
  const at=routeDuration?routeAt+eased*routeDuration:realAt;
  while(segment&&at+1e-7>=segment.at+segment.duration){const end=segment.at+segment.duration;position={x:segment.to.x,y:segment.to.y};tileId=segment.to.tileId;begin(end);}
  if(segment){const u=Math.max(0,Math.min(1,(at-segment.at)/segment.duration));position={x:segment.from.x+(segment.to.x-segment.from.x)*u,y:segment.from.y+(segment.to.y-segment.from.y)*u};}
  return {...position,moving:!!segment,tileId,direction,mirror};
 };
 const nearestAnchor=()=>{
  const candidates=[map.get(tileId),map.get(segment?.to.tileId)].filter(Boolean);return candidates.sort((a,b)=>distance(position,a)-distance(position,b))[0]??[...map.values()].sort((a,b)=>distance(position,a)-distance(position,b))[0];
 };
 return {
  reset(tiles,spawnId,plants=[],varieties={},buildings=[]){const original=tiles,requested=tiles.find(t=>t.id===spawnId);tiles=walkableTerrain(tiles,buildings,clock());map=new Map(tiles.map(t=>[t.id,t]));const tile=map.get(spawnId)??tiles.slice().sort((a,b)=>distance(a,requested??{x:0,y:0})-distance(b,requested??{x:0,y:0}))[0];if(!tile){position={x:null,y:null};tileId=null;segment=null;queue=[];destination=null;routeDuration=0;return;}position=avatarStandPoint(tile,plants,tiles,varieties,[]);if(!safeActorPoint(original,buildings,position,clock()))position={x:tile.x,y:tile.y};tileId=tiles.find(t=>Math.abs(t.x-position.x)<=.5&&Math.abs(t.y-position.y)<=.5)?.id??tile.id;segment=null;queue=[];direction='front';mirror=false;destination={tileId,...position};routeDuration=0;},
  go(tiles,targetId,at,plants=[],varieties={},buildings=[],options={}){
   sample(at);if(!Number.isFinite(position.x)||!Number.isFinite(position.y))return false;
   const original=tiles,requested=tiles.find(t=>t.id===targetId);if(!requested)return false;tiles=walkableTerrain(tiles,buildings,clock());
   const containing=tiles.filter(t=>containsPoint(t,position)),anchor=containing.slice().sort((a,b)=>distance(position,a)-distance(position,b))[0];if(!anchor)return false;
   const building=buildingAtTile({tiles:original,exhibits:buildings},targetId);let stand,path,standTile;
   let originInside=false;if(options.approachPlantId){const plan=plantApproachRoute({tiles,worldTiles:original,plants,varieties,plantId:options.approachPlantId,position,route:(map,start,goal)=>preferredTileRoute(map,start,goal,plants,varieties)});if(!plan)return false;({stand,path,standTile,originInside}=plan);}
   else if(building){const cells=buildingCells({tiles:original},building),sample=buildingSample(building.sampleId??building.artKey),offset=sample?.id==='camping_tarp_pavilion'?sample.preferredApproachCellOffset:null,preferred=offset?{x:Math.min(...cells.map(c=>c.x))+offset[0],y:Math.min(...cells.map(c=>c.y))+offset[1]}:null,occupied=new Set(plants.flatMap(p=>occupiedTileIds({tiles:original,plants},p,varieties[p.varietyId]))),choices=tiles.filter(t=>cells.some(c=>Math.abs(c.x-t.x)+Math.abs(c.y-t.y)===1)&&(sample?.id!=='camping_tarp_pavilion'||!occupied.has(t.id))).map(t=>({tile:t,preferred:preferred?.x===t.x&&preferred?.y===t.y&&!occupied.has(t.id),path:preferredTileRoute(tiles,anchor.id,t.id,plants,varieties)})).filter(c=>c.path.length).sort((a,b)=>Number(b.preferred)-Number(a.preferred)||a.path.length-b.path.length||distance(position,a.tile)-distance(position,b.tile));if(!choices.length)return false;standTile=choices[0].tile;path=choices[0].path;stand={x:standTile.x,y:standTile.y};}
   else{const target=tiles.find(t=>t.id===targetId);if(!target)return false;stand=avatarStandPoint(target,plants,tiles,varieties,[]);if(!safeActorPoint(original,buildings,stand,clock()))stand={x:target.x,y:target.y};standTile=tiles.find(t=>containsPoint(t,stand))??target;path=preferredTileRoute(tiles,anchor.id,standTile.id,plants,varieties);if(!path.length)return false;}
   queue=(originInside?path.slice(1):path).map(t=>({tileId:t.id,x:t.x,y:t.y}));if(distance(queue.at(-1),stand)>.001)queue.push({tileId:standTile.id,...stand});destination={tileId:targetId,...stand};routeAt=at;let previous=position;routeDuration=queue.reduce((sum,p)=>{const d=distance(previous,p);previous=p;return sum+(d<.001?0:Math.max(60,stepMs*d));},0);
   map=new Map(tiles.map(t=>[t.id,t]));tileId=anchor.id;segment=null;begin(at);return true;
  },
  revalidate(tiles,buildings,at){sample(at);const safe=walkableTerrain(tiles,buildings,clock()),same=id=>{const a=map.get(id),b=safe.find(t=>t.id===id);return !!a&&!!b&&a.x===b.x&&a.y===b.y;},valid=safeActorPoint(tiles,buildings,position,clock())&&[...(segment?[segment.to]:[]),...queue].every(p=>same(p.tileId)&&safeActorPoint(tiles,buildings,p,clock()));if(!valid){this.cancel(at);if(!safeActorPoint(tiles,buildings,position,clock())){position={x:null,y:null};tileId=null;}}map=new Map(safe.map(t=>[t.id,t]));return valid;},

  sample,
  face(point){const next=walkingFacing(position,point,{direction,mirror});direction=next.direction;mirror=next.mirror;},
  cancel(at){sample(at);const anchor=nearestAnchor();if(anchor)tileId=anchor.id;segment=null;queue=[];destination={tileId,...position};routeDuration=0;},
  get destination(){return destination;},
 };
}
