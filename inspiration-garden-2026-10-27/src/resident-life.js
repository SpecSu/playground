import {createTileWalker} from './visual-walk.js';
import {walkableTerrain,tileRoute,containsPoint} from './navigation.js';
import {plantAtTile} from './footprints.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Independent scene-only host routes. Never changes authored residents or player state. */
export function createResidentLife({clock=Date.now,random=Math.random}={}){
 let sceneId=null,world=null,varieties={},active=true,entries=new Map();const rand=()=>Math.max(0,Math.min(.999999,Number(random())||0)),rest=()=>3500+rand()*3500;
 const safe=()=>walkableTerrain(world?.tiles??[],world?.exhibits??[],clock());
 function setWorld(next,vars,at){const changed=sceneId!==next.id;sceneId=next.id;world=next;varieties=vars;if(changed)entries.clear();const ids=new Set((next.residents??[]).map(r=>r.id));for(const id of entries.keys())if(!ids.has(id))entries.delete(id);
  for(const r of next.residents??[]){let e=entries.get(r.id);if(!e){const walker=createTileWalker({clock,stepMs:380}),spawn=safe().slice().sort((a,b)=>distance(a,r)-distance(b,r))[0];walker.reset(next.tiles,spawn?.id,[],{},next.exhibits);e={data:{...r},walker,nextMove:at+rest(),wasMoving:false,holdUntil:0,selected:false,last:null};entries.set(r.id,e);}else{e.data={...r};e.walker.revalidate(next.tiles,next.exhibits??[],at);}}
 }
 function poses(at){return [...entries.values()].map(e=>({...e.data,...e.walker.sample(at)})).filter(p=>Number.isFinite(p.x));}
 function tick(at){if(!world)return [];for(const e of entries.values()){let actor=e.walker.sample(at);if(!active)continue;if(e.selected||e.holdUntil>at)continue;if(e.wasMoving&&!actor.moving)e.nextMove=at+rest();e.wasMoving=actor.moving;if(actor.moving||at<e.nextMove)continue;
   const tiles=safe(),start=tiles.filter(t=>containsPoint(t,actor)).sort((a,b)=>distance(a,actor)-distance(b,actor))[0];if(!start){e.nextMove=at+rest();continue;}
   const choices=tiles.filter(t=>t.id!==start.id&&t.id!==e.last).map(t=>({tile:t,route:tileRoute(tiles,start.id,t.id)})).filter(c=>c.route.length>1&&c.route.length<=4),empty=choices.filter(c=>!plantAtTile(world,c.tile.id,varieties)),pool=empty.length?empty:choices,chosen=pool[Math.floor(rand()*pool.length)];e.nextMove=at+rest();if(chosen){e.last=chosen.tile.id;e.walker.go(world.tiles,chosen.tile.id,at,world.plants,varieties,world.exhibits);e.wasMoving=e.walker.sample(at).moving;}
  }return poses(at);}
 return {setWorld,tick,poses,select(id,value,at,face){const e=entries.get(id);if(!e)return null;e.walker.cancel(at);e.selected=!!value;e.holdUntil=0;e.nextMove=at+rest();e.wasMoving=false;if(face)e.walker.face(face);return {...e.data,...e.walker.sample(at)};},setActive(value,at){if(active===!!value)return;for(const e of entries.values()){e.walker.cancel(at);e.holdUntil=0;e.selected=false;e.wasMoving=false;e.nextMove=at+rest();}active=!!value;},hold(id,until,at,face){const e=entries.get(id);if(!e)return;e.walker.cancel(at);e.walker.face(face);e.holdUntil=until;e.nextMove=until+rest();e.wasMoving=false;},release(at){for(const e of entries.values())if(e.holdUntil){e.holdUntil=0;e.nextMove=at+rest();}},clear(){entries.clear();world=null;sceneId=null;}};
}
