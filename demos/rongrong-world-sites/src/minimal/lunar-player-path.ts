import {isPlayerWalkRouteSafe,playerWalkRoute,type MinimalState,type Point} from './model.ts';
export type LunarPlayerObstacle=Readonly<{x:number;z:number;radius:number}>;
const world=(p:Point)=>({x:(p.x-1.5)*2,z:(p.z-1.5)*2});
const grid=(p:Point)=>({x:p.x/2+1.5,z:p.z/2+1.5});
/** Visitor-only moving bodies, in world metres. Never serialize these as whole
 * blocked tiles: a giant touching a tile does not occupy all of its free ground. */
function clear(state:MinimalState,from:Point,to:Point,obstacles:readonly LunarPlayerObstacle[]){
 if(!isPlayerWalkRouteSafe(state,from,[to]))return false;
 const a=world(from),b=world(to),dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
 return obstacles.every(o=>{if(![o.x,o.z,o.radius].every(Number.isFinite)||o.radius<=0)return false;const t=length?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.z-a.z)*dz)/length)):0;return Math.hypot(a.x+dx*t-o.x,a.z+dz*t-o.z)>=o.radius+.36;});
}
export function lunarPlayerRouteSafe(state:MinimalState,from:Point,path:readonly Point[],obstacles:readonly LunarPlayerObstacle[]){return path.every((p,i)=>clear(state,i?path[i-1]:from,p,obstacles));}
/** Exact segment checks plus a bounded 0.5m visibility lattice. The canonical
 * player terrain/prop/egg rule remains authoritative for every candidate edge. */
export function lunarPlayerRoute(state:MinimalState,from:Point,to:Point,obstacles:readonly LunarPlayerObstacle[]):Point[]|null{
 const ordinary=playerWalkRoute(state,from,to);if(!ordinary||!clear(state,to,to,obstacles)||!clear(state,from,from,obstacles))return null;
 if(lunarPlayerRouteSafe(state,from,ordinary,obstacles))return ordinary;
 const a=world(from),b=world(to),nodes:Point[]=[a,b];
 for(let x=-3.5;x<=7.5;x+=.5)for(let z=-3.5;z<=7.5;z+=.5){const p={x,z};if(clear(state,grid(p),grid(p),obstacles))nodes.push(p);}
 const open=new Set([0]),cost=new Map([[0,0]]),previous=new Map<number,number>(),done=new Set<number>();let found=false;
 const segment=(i:number,j:number)=>clear(state,grid(nodes[i]),grid(nodes[j]),obstacles);
 while(open.size){let current=-1,best=Infinity;for(const i of open){const score=cost.get(i)!+Math.hypot(nodes[i].x-b.x,nodes[i].z-b.z);if(score<best){best=score;current=i;}}open.delete(current);if(current===1){found=true;break;}done.add(current);
  for(let next=1;next<nodes.length;next++){if(done.has(next)||next===current)continue;const distance=Math.hypot(nodes[next].x-nodes[current].x,nodes[next].z-nodes[current].z);if(next!==1&&distance>(current===0?.8:.71)||!segment(current,next))continue;const candidate=cost.get(current)!+distance;if(candidate<(cost.get(next)??Infinity)){cost.set(next,candidate);previous.set(next,current);open.add(next);}}
 }
 if(!found)return null;const indices:number[]=[];for(let i=1;i!==0;i=previous.get(i)!)indices.push(i);indices.reverse();const route:Point[]=[];let anchor=0;
 for(let i=0;i<indices.length;){let last=indices.length-1;while(last>i&&!segment(anchor,indices[last]))last--;anchor=indices[last];route.push(grid(nodes[anchor]));i=last+1;}return route;
}
