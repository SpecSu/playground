export type LunarFlatPoint={x:number;z:number};
export type LunarClearance=(point:LunarFlatPoint)=>boolean;
export function lunarSegmentSafe(a:LunarFlatPoint,b:LunarFlatPoint,safe:LunarClearance):boolean{
 if(![a.x,a.z,b.x,b.z].every(Number.isFinite))return false;const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));
 for(let i=0;i<=steps;i++)if(!safe({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps}))return false;return true;
}
/** Small bounded half-metre lattice; safe() tests the whole current/reserved body,
 * not a root-only point. No serialized routes or external random source. */
export function lunarPath(from:LunarFlatPoint,to:LunarFlatPoint,safe:LunarClearance):LunarFlatPoint[]{
 if(!safe(from)||!safe(to)||![from.x,from.z,to.x,to.z].every(Number.isFinite))return [];
 if(lunarSegmentSafe(from,to,safe))return [{...to}];
 const key=(p:LunarFlatPoint)=>`${p.x},${p.z}`,point=(k:string)=>{const [x,z]=k.split(',').map(Number);return {x,z};},start={x:Math.round(from.x*2)/2,z:Math.round(from.z*2)/2};
 if(!lunarSegmentSafe(from,start,safe))return [];
 const startKey=key(start),open=new Set([startKey]),cost=new Map([[startKey,0]]),previous=new Map<string,string>();let found:string|undefined;
 for(let count=0;open.size&&count<625;count++){
  let current='';let best=Infinity;for(const k of open){const p=point(k),score=cost.get(k)!+Math.hypot(p.x-to.x,p.z-to.z);if(score<best){best=score;current=k;}}
  open.delete(current);const p=point(current);if(Math.hypot(p.x-to.x,p.z-to.z)<.76&&lunarSegmentSafe(p,to,safe)){found=current;break;}
  for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5]){if(!dx&&!dz)continue;const next={x:p.x+dx,z:p.z+dz};if(next.x< -3||next.x>7||next.z< -3||next.z>7||!lunarSegmentSafe(p,next,safe))continue;const k=key(next),g=cost.get(current)!+Math.hypot(dx,dz);if(g<(cost.get(k)??Infinity)-1e-8){cost.set(k,g);previous.set(k,current);open.add(k);}}
 }
 if(!found)return [];const reversed:LunarFlatPoint[]=[{...to}];for(let k:string|undefined=found;k;k=previous.get(k))reversed.push(point(k));const path=reversed.reverse(),result:LunarFlatPoint[]=[];let anchor=from;
 for(let i=0;i<path.length;){let last=i;while(last+1<path.length&&lunarSegmentSafe(anchor,path[last+1],safe))last++;result.push(path[last]);anchor=path[last];i=last+1;}return result;
}
