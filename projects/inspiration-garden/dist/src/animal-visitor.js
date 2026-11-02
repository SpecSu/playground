import {completedTerrain} from './construction.js';
import {buildingCells,plantAtTile} from './footprints.js';
import {tileRoute,containsPoint} from './navigation.js';
import {createTileWalker} from './visual-walk.js';
import {distanceToSegment} from './scene-math.js';

const DEMO_IDS=new Set(['demo-kelly-music','demo-bear-moon','demo-frog-sea','demo-lx-tech']);
const ANIMALS=['milk-frog','niulai','feidudu','miaocuijiao','banana-cat','sword-shield-dog'];
const eligible=world=>DEMO_IDS.has(world?.id)&&Array.isArray(world.animalVisitorSpawns)&&world.animalVisitorSpawns.length>0;

/** One presentation-only guest. It never writes to a garden or player save.
 * Method times share the scene's animation clock; clock() checks construction wall time.
 * The caller supplies live player/host poses and controls visibility with setActive().
 */
export function createAnimalVisitor({clock=Date.now,random=Math.random}={}){
 let world=null,varieties={},visitor=null,nextArrival=Infinity,serial=0,active=true,disposed=false;
 const rand=()=>Math.max(0,Math.min(.999999,Number(random())||0));
 const initialDelay=()=>45000+rand()*45000;
 const rest=()=>3500+rand()*3000;
 const signature=tiles=>tiles.map(t=>`${t.id}:${t.x}:${t.y}`).sort().join('|');
 function depart(at){visitor=null;nextArrival=at+60000+rand()*60000;}
 function setWorld(next,vars={},at=clock()){
  if(disposed)return;
  const changed=world?.id!==next?.id;world=next;varieties=vars;
  if(changed||!eligible(world)||(active&&nextArrival===Infinity)){visitor=null;nextArrival=active&&eligible(world)?at+initialDelay():Infinity;}
 }
 function clearTiles(){
  const blocked=new Set([...(world.buildings??[]),...(world.exhibits??[])].flatMap(b=>buildingCells(world,b)).map(t=>`${t.x}:${t.y}`));
  return completedTerrain(world.tiles,clock()).filter(t=>['land','platform'].includes(t.kind)&&!blocked.has(`${t.x}:${t.y}`)&&!plantAtTile({...world,plants:world.plants??[]},t.id,varieties));
 }
 function occupiedPoses(occupied=[]){return [world.tiles.find(t=>t.id===world.spawnTileId),world.tiles.find(t=>t.id===world.avatarTileId),world.ownerPosition,...(world.residents??[]),...occupied].filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y));}
 const awayFrom=(tile,occupied)=>occupied.every(p=>Math.hypot(p.x-tile.x,p.y-tile.y)>=.8);
 // Approved LX bays have one terminal leaf; only splitting larger route regions is a bottleneck.
 function keepsPassage(tiles,tile){
  let remaining=tiles.filter(t=>t.id!==tile.id),regions=0;
  while(remaining.length){const group=remaining.filter(t=>tileRoute(remaining,remaining[0].id,t.id).length);if(group.length>1&&++regions>1)return false;const ids=new Set(group.map(t=>t.id));remaining=remaining.filter(t=>!ids.has(t.id));}
  return true;
 }
 function arrivalStops(tiles,occupied){
  const arrival=tiles.find(t=>t.id===(world.spawnTileId??world.avatarTileId));if(!arrival)return [];
  const connected=tiles.filter(t=>tileRoute(tiles,arrival.id,t.id).length);
  return world.animalVisitorSpawns.filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)).map(p=>connected.find(t=>t.x===p.x&&t.y===p.y)).filter(t=>t&&awayFrom(t,occupied)&&keepsPassage(connected,t));
 }
 function clearRoute(route,actors){return route.every((p,i)=>awayFrom(p,actors)&&(!i||actors.every(a=>distanceToSegment(a,route[i-1],p)>=.8)));}
 function pose(){const {x,y,direction,mirror,moving}=visitor.walker.sample(visitor.sampleAt);return {id:visitor.id,avatarKey:visitor.avatarKey,x,y,direction,mirror,moving,interactive:false,kind:'animal-visitor'};}
 function wander(tiles,actors,at){
  const current=pose(),free=tiles.filter(t=>awayFrom(t,actors)),start=free.find(t=>containsPoint(t,current));if(!start)return;
  const choices=free.filter(t=>t.id!==start.id&&Math.abs(t.x-visitor.origin.x)+Math.abs(t.y-visitor.origin.y)<=2&&keepsPassage(tiles,t))
   .map(tile=>({tile,route:tileRoute(free,start.id,tile.id)})).filter(c=>c.route.length>1&&c.route.length<=3&&clearRoute([current,...c.route],actors)).sort((a,b)=>a.route.length-b.route.length);
  const chosen=choices[Math.floor(rand()*choices.length)];visitor.nextMove=at+rest();
  if(chosen&&visitor.walker.go(free,chosen.tile.id,at)){visitor.route=[current,...chosen.route];visitor.moves++;visitor.wasMoving=true;}
 }
 function tick(at=clock(),{occupied=[]}={}){
  if(disposed||!active||!eligible(world))return null;
  if(!visitor&&at<nextArrival)return null;
  const actors=occupiedPoses(occupied),tiles=clearTiles();
  if(visitor&&(at>=visitor.expiresAt||visitor.signature!==signature(tiles)||!clearRoute(visitor.route,actors))){depart(at);return null;}
  if(!visitor&&at>=nextArrival){
   const stops=arrivalStops(tiles,actors),stop=stops[Math.floor(rand()*stops.length)];
   if(!stop){nextArrival=at+initialDelay();return null;}
   const walker=createTileWalker({stepMs:650,clock});walker.reset(tiles,stop.id);
   visitor={id:`animal-visitor-${++serial}`,avatarKey:ANIMALS[Math.floor(rand()*ANIMALS.length)],walker,sampleAt:at,expiresAt:at+20000+rand()*15000,signature:signature(tiles),origin:stop,route:[stop],moves:0,wasMoving:false,nextMove:at+rest()};
  }
  if(!visitor)return null;
  visitor.sampleAt=at;const current=pose();
  if(visitor.wasMoving&&!current.moving){visitor.wasMoving=false;visitor.route=[current];visitor.nextMove=at+rest();}
  if(!current.moving&&visitor.moves<3&&at>=visitor.nextMove)wander(tiles,actors,at);
  return pose();
 }
 function setActive(value,at=clock()){
  if(disposed||active===!!value)return;
  active=!!value;visitor=null;nextArrival=active&&eligible(world)?at+initialDelay():Infinity;
 }
 function clear(){world=null;varieties={};visitor=null;nextArrival=Infinity;}
 function dispose(){clear();active=false;disposed=true;}
 return {setWorld,setActive,tick,clear,dispose};
}
