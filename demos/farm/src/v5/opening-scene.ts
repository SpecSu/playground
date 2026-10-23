/**
 * Camera/actor staging is a projection, never a world command. In particular a
 * replay gets a disposable tutorial threat and cannot settle care or rewards.
 */
import type {EstateSnapshot, Profile} from './estate.ts';
import {openingPresentation, openingWolfPresentation, type OpeningState} from './opening.ts';
import {buildingApproaches, findPath, isWalkable, shelterEntries, type GridPoint, type Layout} from './layout.ts';
import {createThreat, ensureOpeningThreat, guardianCommand, type GuardianKind, type ThreatState} from './threat.ts';

export type OpeningSceneOptions={replay?:boolean;retreatProgress?:number};

const point = (p:GridPoint):GridPoint => ({x:p.x,z:p.z});
const cell = (p:GridPoint):GridPoint => ({x:Math.round(p.x),z:Math.round(p.z)});
const distance = (a:GridPoint,b:GridPoint) => Math.hypot(a.x-b.x,a.z-b.z);
const key = (p:GridPoint) => `${p.x},${p.z}`;
const clamp = (n:number) => Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const neighbours = (p:GridPoint) => [{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}];

/** Sampling the cardinal route preserves its bends; it never lerps through walls. */
function routePoint(path:GridPoint[],progress:number):GridPoint {
  if(!path.length)return {x:0,z:0};
  let travel=path.slice(1).reduce((n,p,i)=>n+distance(path[i],p),0)*clamp(progress);
  for(let i=1;i<path.length;i++) {
    const from=path[i-1],to=path[i],length=distance(from,to);
    if(travel<length)return {x:from.x+(to.x-from.x)*travel/length,z:from.z+(to.z-from.z)*travel/length};
    travel-=length;
  }
  return point(path.at(-1)!);
}

function nearestLegal(layout:Layout,p:GridPoint):GridPoint|undefined {
  const rounded=cell(p);
  if(isWalkable(layout,rounded))return rounded;
  return layout.owned.filter(q=>isWalkable(layout,q)).sort((a,b)=>distance(a,p)-distance(b,p)||a.x-b.x||a.z-b.z)[0];
}

function boundaryRoute(layout:Layout,to:GridPoint):GridPoint[] {
  const owned=new Set(layout.owned.map(key));
  const routes=layout.owned.filter(p=>isWalkable(layout,p)&&distance(p,to)>=3&&neighbours(p).some(n=>!owned.has(key(n))))
    .map(p=>findPath(layout,p,cell(to))).filter((p):p is GridPoint[]=>!!p&&p.length>=4);
  // Four steps make the approach readable without crossing an unowned tile.
  routes.sort((a,b)=>Math.abs(a.length-5)-Math.abs(b.length-5)||a[0].x-b[0].x||a[0].z-b[0].z);
  return routes[0]??[point(to)];
}

function homeRoute(p:Profile,to:GridPoint):GridPoint[] {
  const routes=p.layout.buildings.filter(b=>b.kind==='workbench')
    .flatMap(b=>buildingApproaches(p.layout,b))
    .map(from=>findPath(p.layout,from,cell(to))).filter((route):route is GridPoint[]=>!!route)
    .sort((a,b)=>a.length-b.length||a[0].x-b[0].x||a[0].z-b[0].z);
  return routes[0]??[point(to)];
}

function replayThreat(p:Profile,guardian:GuardianKind|null):ThreatState|null {
  const actors=p.animals.filter(a=>!a.memorial).slice(0,12).flatMap(a=>{
    const position=nearestLegal(p.layout,a.position);
    return position?[{id:a.id,position}]:[];
  });
  const start=nearestLegal(p.layout,p.guardianAt);
  if(!actors.length||!start)return null;
  const event=createThreat({id:`${p.id}-opening-replay`,seed:17,mode:'tutorial',actors,guardianPosition:start},p.layout);
  return guardian&&event.phase==='choosing'?guardianCommand(event,p.layout,{kind:'select',guardian}).state:event;
}

function stageAnimals(p:Profile,opening:OpeningState):void {
  const door=shelterEntries(p.layout)[0];
  if(!door)return;
  const progress=opening.stage==='startle'?openingPresentation(opening).progress
    :['choose','arrival'].includes(opening.stage)?1:0;
  const used=new Set<string>();
  const saved=p.animals.filter(a=>!a.memorial).map(a=>({id:a.id,position:cell(a.position)}));
  const wolfRoutes=p.threat?.wolves.flatMap(w=>w.opening?.entryPath??[w.position])??[];
  for(const animal of p.animals) {
    if(animal.memorial)continue;
    const target=cell(animal.position);
    if(!isWalkable(p.layout,target))continue;
    // Saved spawn positions already form the assembly beside the first shelter.
    // Begin a step farther out, then retreat to those exact saved endpoints.
    const outward=neighbours(target).filter(q=>isWalkable(p.layout,q)&&!used.has(key(q))
      &&saved.every(other=>other.id===animal.id||distance(other.position,q)>=.9)
      &&wolfRoutes.every(w=>distance(w,q)>=1.1)&&distance(q,door)>distance(target,door))
      .map(q=>findPath(p.layout,q,target)).find((route):route is GridPoint[]=>!!route);
    const route=outward??[target];used.add(key(route[0]));
    animal.position=routePoint(route,progress);animal.path=route.map(point);
    const actor=p.threat?.actors.find(a=>a.id===animal.id);
    if(actor){actor.position=point(animal.position);actor.path=route.map(point);actor.pathIndex=0;actor.status='waiting';}
  }
}

function showReplayDefense(p:Profile,opening:OpeningState):void {
  const event=p.threat,g=event?.guardian;
  if(!event||!g)return;
  p.guardian=g.kind;
  const elapsed=Number.isFinite(opening.elapsed)?Math.max(0,opening.elapsed):0;
  event.elapsed=elapsed;event.phase=elapsed>=8?'complete':'active';
  event.notice='本地开场回放 · 仅演出，不产生照料、损失或奖励结算';
  // In the replay dog visibly moves to one intercept point; cat/frog stay with
  // the animals. This is explicitly a presentation cue, not battle telemetry.
  if(g.kind==='dog'&&event.wolves[0]) {
    const routes=neighbours(cell(event.wolves[0].position)).filter(q=>isWalkable(p.layout,q))
      .map(q=>findPath(p.layout,cell(g.position),q)).filter((route):route is GridPoint[]=>!!route)
      .sort((a,b)=>a.length-b.length||a.at(-1)!.x-b.at(-1)!.x||a.at(-1)!.z-b.at(-1)!.z);
    const route=routes[0];
    if(route){g.position=routePoint(route,elapsed/1.5);g.path=route.map(point);g.pathIndex=0;}
  }
  g.behavior='emergency';g.ability=elapsed>=1.5&&elapsed<8?(g.kind==='dog'?'block':g.kind==='cat'?'gather':'calm'):null;
  g.abilityStartedAt=1.5;g.abilityUntil=8;g.abilityPosition=point(g.position);
  if(g.ability==='calm')g.calmWindows=[{from:1.5,until:8,position:point(g.position)}];
  p.guardianAt=point(g.position);
  for(const wolf of event.wolves) {
    const retreat=wolf.opening?.entryPath.map(point).reverse()??boundaryRoute(p.layout,wolf.position).reverse();
    wolf.position=routePoint(retreat,(elapsed-4)/4);wolf.path=retreat;wolf.pathIndex=0;
    wolf.status=elapsed>=8?'retreated':'approach';
    if(g.ability==='block')wolf.blockedUntil=8;
  }
}

export function deriveOpeningScene(snapshot:EstateSnapshot,opening:OpeningState,options:OpeningSceneOptions={}):EstateSnapshot {
  if(opening.stage==='done'&&options.replay)return deriveOpeningScene(snapshot,{...opening,stage:'defend',elapsed:8},options);
  const scene=structuredClone(snapshot),p=scene.profile;
  if(!options.replay&&options.retreatProgress!==undefined&&p.threat?.phase==='complete'
    &&['defend','done'].includes(opening.stage)) {
    const progress=clamp(options.retreatProgress);
    for(const wolf of p.threat.wolves) {
      const from=point(wolf.position),route=boundaryRoute(p.layout,from).reverse();
      // A finished simulation may stop midway along an edge. Keep that exact
      // endpoint; never snap back to its rounded cell before retreating.
      if(distance(route[0],from)>1e-8) {
        const next=route[1];
        if(next&&Math.abs(distance(route[0],from)+distance(from,next)-distance(route[0],next))<1e-8)route[0]=from;
        else route.unshift(from);
      }
      wolf.position=routePoint(route,progress);wolf.status=progress>=1?'retreated':'approach';
      // Keep recorded paths, event clocks, actors and facts exactly as saved.
    }
    return scene;
  }
  // The real event takes control immediately after the arrival endpoint.
  if(opening.stage==='done'||(opening.stage==='defend'&&!options.replay))return scene;
  if(options.replay) {
    p.threat=replayThreat(p,['arrival','defend'].includes(opening.stage)?opening.guardian:null);
    for(const actor of p.threat?.actors??[]) {
      const animal=p.animals.find(a=>a.id===actor.id);if(animal)animal.position=point(actor.position);
    }
  }
  if(opening.stage==='defend'){showReplayDefense(p,opening);return scene;}
  if(p.threat)p.threat=ensureOpeningThreat(p.threat,p.layout);
  stageAnimals(p,opening);
  const event=p.threat;
  if(event) {
    event.phase='choosing';event.elapsed=0;
    if(['establish','rustle'].includes(opening.stage))event.wolves=[];
    else for(const [index,wolf] of event.wolves.entries()) {
      const cue=openingWolfPresentation(opening,index),route=wolf.opening?.entryPath??[point(wolf.position)];
      wolf.position=routePoint(route,cue.progress);
      wolf.path=route.map(point);wolf.pathIndex=0;wolf.status='approach';
      if(wolf.opening){wolf.opening.visible=cue.visible;wolf.opening.phase=wolf.opening.waitingReason?'waiting':cue.phase;}
    }
  }
  if(opening.stage==='arrival'&&opening.guardian) {
    p.guardian=opening.guardian;
    if(event&&!event.guardian)event.guardian=guardianCommand({...event,phase:'choosing'},p.layout,{kind:'select',guardian:opening.guardian}).state.guardian;
    const target=event?.guardian?.position??p.guardianAt;
    const route=homeRoute(p,target),position=routePoint(route,openingPresentation(opening).progress);
    p.guardianAt=point(position);p.guardianPath=route.map(point);
    if(event?.guardian){event.guardian.position=point(position);event.guardian.path=route.map(point);event.guardian.pathIndex=0;event.guardian.ability=null;}
  } else {
    p.guardian=null;if(event)event.guardian=null;
  }
  return scene;
}

/** World-grid focus only: the fixed camera owns its angles and smooth panning. */
export function openingAttention(snapshot:EstateSnapshot,opening:OpeningState,options:OpeningSceneOptions={}):GridPoint|null {
  if(opening.stage==='done')return null;
  const p=deriveOpeningScene(snapshot,opening,options).profile,door=shelterEntries(p.layout)[0];
  const average=(points:GridPoint[]):GridPoint=>points.length?{
    x:points.reduce((n,q)=>n+q.x,0)/points.length,z:points.reduce((n,q)=>n+q.z,0)/points.length,
  }:point(p.position);
  if(opening.stage==='arrival')return point(p.threat?.guardian?.position??p.guardianAt);
  if(opening.stage==='approach')return average(p.threat?.wolves.filter(w=>w.opening?.visible!==false).map(w=>w.position)??[]);
  if(opening.stage==='rustle')return point(snapshot.profile.threat?.wolves[0]?.spawn??p.position);
  if(opening.stage==='startle')return average(p.animals.filter(a=>!a.memorial).map(a=>a.position));
  if(opening.stage==='defend')return door?{x:door.x,z:door.z}:point(p.position);
  return average([p.position,...p.animals.filter(a=>!a.memorial).map(a=>a.position)]);
}

