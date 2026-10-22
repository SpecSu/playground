import {isPlayerWalkable,type GridPoint,type Layout} from './layout.ts';
const cell=(p:GridPoint)=>({x:Math.round(p.x),z:Math.round(p.z)});
const key=(p:GridPoint)=>`${p.x},${p.z}`;
const length=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
/** A small physical footprint; navigation, collision and the visible path share this check. */
export function playerSegmentClear(layout:Layout,from:GridPoint,to:GridPoint):boolean{
 const steps=Math.max(1,Math.ceil(length(from,to)/.08));
 for(let i=0;i<=steps;i++){
  const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;
  for(const [dx,dz] of [[0,0],[.16,.16],[.16,-.16],[-.16,.16],[-.16,-.16]])if(!isPlayerWalkable(layout,cell({x:x+dx,z:z+dz})))return false;
 }
 return true;
}
export function advancePlayer(layout:Layout,position:GridPoint,direction:GridPoint,distance:number):GridPoint{
 const magnitude=Math.hypot(direction.x,direction.z);if(!magnitude||!Number.isFinite(magnitude)||!Number.isFinite(distance)||distance<=0)return {...position};
 const steps=Math.ceil(Math.min(distance,4)/.05),step=Math.min(distance,4)/steps;
 let p={...position};for(let i=0;i<steps;i++){const next={x:p.x+direction.x/magnitude*step,z:p.z+direction.z/magnitude*step};if(!playerSegmentClear(layout,p,next))break;p=next;}return p;
}
/** Eight-way shortest path, with blocked-corner checks. Animal routes retain their own cardinal graph. */
export function findPlayerPath(layout:Layout,from:GridPoint,to:GridPoint):GridPoint[]|null{
 const start=cell(from),goal=cell(to);if(!isPlayerWalkable(layout,start)||!isPlayerWalkable(layout,goal))return null;
 const open=[start],cost=new Map([[key(start),0]]),previous=new Map<string,GridPoint>(),visited=new Set<string>();
 while(open.length){open.sort((a,b)=>cost.get(key(a))!+length(a,goal)-cost.get(key(b))!-length(b,goal));const p=open.shift()!,k=key(p);if(visited.has(k))continue;visited.add(k);
  if(k===key(goal)){
   const path=[goal];let node=goal;while(key(node)!==key(start)){node=previous.get(key(node))!;path.unshift(node);}
   if(path.length>1&&playerSegmentClear(layout,from,path[1]))path.shift();
   else if(path.length===1&&length(from,goal)<.001)return [];
   return path;
  }
  for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const next={x:p.x+dx,z:p.z+dz},nk=key(next);if(visited.has(nk)||!playerSegmentClear(layout,p,next))continue;
   const score=cost.get(k)!+Math.hypot(dx,dz);if(score<(cost.get(nk)??Infinity)){cost.set(nk,score);previous.set(nk,p);open.push(next);}
  }
 }
 return null;
}
