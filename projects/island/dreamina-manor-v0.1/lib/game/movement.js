import {walkGraph,cellKey,pathDistance,clearWalkSegment,simplifyWalkPath} from './grid.js';
/** Project a ground tap onto the same fixed safe walking network used by work. */
export function planFreeWalk(island,from,point){
 island={...island,tank:[...island.tank,...(island.constructions??[]).filter(c=>c.kind==='tank').flatMap(c=>c.cells)]};
 if(!point||![point.x,point.z,from?.x,from?.z].every(Number.isFinite))return null;
 const cell={x:Math.round(point.x),z:Math.round(point.z)};
 if(![...island.land,...island.docks].some(c=>c.x===cell.x&&c.z===cell.z)||island.tank.some(c=>c.x===cell.x&&c.z===cell.z))return null;
 if(clearWalkSegment(island,from,point))return [{...from},{...point}];
 const graph=walkGraph(island.land,island.docks,island.tank);let start=null,end=null,sd=Infinity,ed=Infinity;
 for(const [key,node]of graph){let d=Math.hypot(from.x-node.position.x,from.z-node.position.z);if(d<sd){sd=d;start=key;}d=Math.hypot(point.x-node.position.x,point.z-node.position.z);if(d<ed){ed=d;end=key;}}
 if(!start||!end||sd>1||ed>1)return null;
 const frontier=[start],cost=new Map([[start,0]]),previous=new Map([[start,null]]);
 while(frontier.length){frontier.sort((a,b)=>cost.get(a)-cost.get(b));const key=frontier.shift();if(key===end){const path=[];for(let at=end;at!==null;at=previous.get(at))path.push({...graph.get(at).position});path.reverse();if(Math.hypot(path[0].x-from.x,path[0].z-from.z)>.00001)path.unshift({...from});const safe=simplifyWalkPath(island,path);if(safe&&clearWalkSegment(island,safe.at(-1),point))safe.push({...point});return safe;}
  for(const next of graph.get(key).links){const a=graph.get(key).position,b=graph.get(next).position,n=cost.get(key)+Math.hypot(a.x-b.x,a.z-b.z);if(n<(cost.get(next)??Infinity)){cost.set(next,n);previous.set(next,key);if(!frontier.includes(next))frontier.push(next);}}
 }
 return null;
}
