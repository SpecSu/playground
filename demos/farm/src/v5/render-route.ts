import {buildingFootprint,type GridPoint,type Layout} from './layout.ts';
import {interpolationRoute} from './estate-scene.ts';
import {findPlayerPath,playerSegmentClear} from './player-navigation.ts';
const distance=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export function routeLength(from:GridPoint,route:GridPoint[]){let length=0;for(const p of route){length+=distance(from,p);from=p;}return length;}
/** Keep already-authorized bends when both authority samples lie on the known route. */
function trimRoute(from:GridPoint,to:GridPoint,route:GridPoint[]):GridPoint[]|undefined{
 // Opening/replay carries the whole route; live navigation carries its tail.
 // Drop only a prefix that demonstrably contains our last authority position.
 let start=0;
 for(let i=0;i<route.length;i++){
  if(distance(from,route[i])<1e-8){start=i+1;break;}
  if(i+1<route.length&&Math.abs(distance(route[i],from)+distance(from,route[i+1])-distance(route[i],route[i+1]))<1e-6){start=i+1;break;}
 }
 route=route.slice(start);
 const result:GridPoint[]=[];let previous=from;
 for(const next of route){
  if(distance(previous,next)<1e-8)continue;
  if(Math.abs(distance(previous,to)+distance(to,next)-distance(previous,next))<1e-6)return [...result,{...to}];
  result.push({...next});previous=next;
 }
 return undefined;
}
export function renderRoute(layout:Layout,from:GridPoint,to:GridPoint,planned:GridPoint[]=[],player=false):GridPoint[]{
 if(distance(from,to)<1e-8)return [];
 const shelter=(p:GridPoint)=>layout.buildings.find(b=>b.kind==='shelter'&&buildingFootprint(b).some(c=>c.x===Math.round(p.x)&&c.z===Math.round(p.z)));
 const source=shelter(from),target=shelter(to);
 const outside=(a:GridPoint,b:GridPoint)=>player
  ?playerSegmentClear(layout,a,b)?[{...b}]:trimRoute(a,b,findPlayerPath(layout,a,b)??[])??[]
  :interpolationRoute(layout,a,b);
 const inside=(a:GridPoint,b:GridPoint)=>[{x:b.x,z:a.z},{...b}].filter((p,i,all)=>distance(p,i?all[i-1]:a)>1e-8);
 if(source||target){
  if(source?.id===target?.id)return inside(from,to);
  let best:GridPoint[]=[],bestLength=Infinity;
  for(const exit of source?source.doors.filter(d=>d.open):[from])for(const entry of target?target.doors.filter(d=>d.open):[to]){
   const between=outside(exit,entry);if(!between.length&&distance(exit,entry)>1e-8)continue;
   const approach=(building:NonNullable<typeof source>,door:GridPoint)=>buildingFootprint(building).sort((a,b)=>distance(a,door)-distance(b,door))[0];
   const before=source?[...inside(from,approach(source,exit)),{x:exit.x,z:exit.z}]:[];
   const after=target?[approach(target,entry),...inside(approach(target,entry),to)]:[];
   const route=[...before,...between,...after],length=routeLength(from,route);
   if(length<bestLength){best=route;bestLength=length;}
  }
  return best;
 }
 return trimRoute(from,to,planned)??outside(from,to);
}
