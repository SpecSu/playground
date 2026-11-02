/** Fixed logical coordinates. Rendering supplies a constant world-units-per-cell;
 * buying a cell never changes old positions or this coordinate system. */
export const INITIAL_LAND=Object.freeze([{x:0,z:0},{x:1,z:0},{x:0,z:1},{x:1,z:1}].map(Object.freeze));
export const DIRECTIONS=Object.freeze([{x:0,z:-1},{x:1,z:0},{x:0,z:1},{x:-1,z:0}].map(Object.freeze));
export const cellKey=p=>`${p.x},${p.z}`;
export const validCell=p=>!!p&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.z)&&Math.abs(p.x)<=1024&&Math.abs(p.z)<=1024;
const same=(a,b)=>a.x===b.x&&a.z===b.z;
const contains=(cells,p)=>cells.some(c=>same(c,p));
const neighbours=p=>DIRECTIONS.map(d=>({x:p.x+d.x,z:p.z+d.z}));
const unique=cells=>[...new Map(cells.map(c=>[cellKey(c),{x:c.x,z:c.z}])).values()].sort((a,b)=>a.z-b.z||a.x-b.x);
export function dockWaterFacing(land,docks,cell,preferred=null){const free=d=>!contains(land,{x:cell.x+d.x,z:cell.z+d.z})&&!contains(docks,{x:cell.x+d.x,z:cell.z+d.z});return preferred&&free(preferred)?preferred:[{x:0,z:1},{x:1,z:0},{x:0,z:-1},{x:-1,z:0}].find(free)??null;}
export function docksHaveWater(land,docks){return docks.every(c=>dockWaterFacing(land,docks,c));}
export function landCandidates(land,docks=[]){return unique(land.flatMap(neighbours).filter(p=>validCell(p)&&!contains(land,p)&&!contains(docks,p)&&docksHaveWater([...land,p],docks)));}
export function dockCandidates(land,docks=[]){return unique([...land,...docks].flatMap(neighbours).filter(p=>validCell(p)&&!contains(land,p)&&!contains(docks,p)&&docksHaveWater(land,[...docks,p])));}
export function canExtendTank(land,tank,p){return validCell(p)&&contains(land,p)&&!contains(tank,p)&&(!tank.length||neighbours(p).some(n=>contains(tank,n)));}

/** Cell perimeters form safe circulation routes. The centre is a production/
 * display footprint; an internal tank join is water, never a hidden walkway.
 * Node IDs use doubled integer coordinates, while positions use logical units. */
export function walkGraph(land,docks=[],tank=[]){
 const graph=new Map(),r=.76;
 const key=p=>`${Math.round(p.x*10000)/10000},${Math.round(p.z*10000)/10000}`;
 const node=p=>{const id=key(p);if(!graph.has(id))graph.set(id,{position:{x:p.x/2,z:p.z/2},links:new Set()});return id;};
 const link=(a,b)=>{const ka=node(a),kb=node(b);graph.get(ka).links.add(kb);graph.get(kb).links.add(ka);};
 const dry=land.filter(c=>!contains(tank,c));
 for(const c of dry){
  const x=c.x*2,z=c.z*2,ring=[{x:x-r,z:z-r},{x,z:z-r},{x:x+r,z:z-r},{x:x+r,z},{x:x+r,z:z+r},{x,z:z+r},{x:x-r,z:z+r},{x:x-r,z}];
  for(let i=0;i<8;i++)link(ring[i],ring[(i+1)%8]);
  for(const d of DIRECTIONS){const n={x:c.x+d.x,z:c.z+d.z};if(contains(dry,n))link({x:x+d.x*r,z:z+d.z*r},{x:n.x*2-d.x*r,z:n.z*2-d.z*r});}
 }
 for(const c of docks)for(const d of DIRECTIONS){const n={x:c.x+d.x,z:c.z+d.z};if(contains(docks,n))link({x:c.x*2,z:c.z*2},{x:n.x*2,z:n.z*2});else if(contains(dry,n))link({x:c.x*2,z:c.z*2},{x:n.x*2-d.x*r,z:n.z*2-d.z*r});}
 return graph;
}
function targetKeys(graph,land,docks,target){
 if(!target?.cell||!validCell(target.cell))return [];const c=target.cell,r=.76;
 const key=p=>`${Math.round(p.x*10000)/10000},${Math.round(p.z*10000)/10000}`;
 if(target.type==='dock')return contains(docks,c)?[key({x:c.x*2,z:c.z*2})].filter(k=>graph.has(k)):[];
 if(target.type!=='land'||!contains(land,c))return [];
 if(target.workSide){const own=DIRECTIONS.map(d=>key({x:c.x*2+d.x*r,z:c.z*2+d.z*r})).filter(k=>graph.has(k));if(own.length)return own;}
 // Tank cells have no walkable edges of their own. Reach them only from dry neighbours.
 return DIRECTIONS.flatMap(d=>[key({x:c.x*2+d.x*r,z:c.z*2+d.z*r}),key({x:c.x*2+d.x*(2-r),z:c.z*2+d.z*(2-r)})]).filter(k=>graph.has(k));
}
function planNetworkWalk(land,docks,tank,from,target){
 const graph=walkGraph(land,docks,tank),targets=new Set(targetKeys(graph,land,docks,target));
 if(!targets.size||!Number.isFinite(from?.x)||!Number.isFinite(from?.z))return null;
 let start=null,distance=Infinity;
 for(const [id,node]of graph){const d=Math.hypot(node.position.x-from.x,node.position.z-from.z);if(d<distance){distance=d;start=id;}}
 if(start===null)return null;
 // The caller's position is a projection on this network, not a free teleport.
 // A distant/stale position must be recovered explicitly by the state layer.
 if(distance>1)return null;
 const frontier=[start],previous=new Map([[start,null]]),cost=new Map([[start,0]]);
 while(frontier.length){
  frontier.sort((a,b)=>cost.get(a)-cost.get(b));const current=frontier.shift();
  if(targets.has(current)){
   const path=[];for(let p=current;p!==null;p=previous.get(p))path.push({...graph.get(p).position});path.reverse();
   if(Math.hypot(path[0].x-from.x,path[0].z-from.z)>1e-8)path.unshift({...from});
   return path;
  }
  const a=graph.get(current);
  for(const next of a.links){const b=graph.get(next),v=cost.get(current)+Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z);if(v<(cost.get(next)??Infinity)){cost.set(next,v);previous.set(next,current);if(!frontier.includes(next))frontier.push(next);}}
 }
 return null;
}
export const pathDistance=path=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);
export function allLandReachable(land,docks,tank,from){return land.filter(c=>!contains(tank,c)).every(cell=>!!planWalk(land,docks,tank,from,{type:'land',cell}))&&(!tank.length||tank.some(cell=>!!planWalk(land,docks,tank,from,{type:'land',cell})))&&docks.every(cell=>!!planWalk(land,docks,tank,from,{type:'dock',cell}));}
export function nearestDryPosition(land,docks,tank,position){let best=null,distance=Infinity;for(const node of walkGraph(land,docks,tank).values()){const d=Math.hypot(node.position.x-position.x,node.position.z-position.z);if(d<distance){distance=d;best=node.position;}}return best?{...best}:null;}

/** A segment stays on the union of dry cells and outside real occupied footprints. */
export function clearWalkSegment(island,a,b,{targetCell=null}={}){
 const cells=[...island.land,...island.docks],distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.035));
 const pendingTank=(island.constructions??[]).filter(c=>c.kind==='tank').flatMap(c=>c.cells);
 const occupied=[...(island.jobs??[]).filter(j=>j.target.kind==='land').map(j=>j.target.cell),...(island.items??[]).filter(i=>i.location.kind==='land').map(i=>i.location.cell),...(targetCell?[targetCell]:[])];
 for(let i=0;i<=steps;i++){const t=i/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  if(!cells.some(c=>Math.abs(c.x-p.x)<=.5&&Math.abs(c.z-p.z)<=.5))return false;
  if([...island.tank,...pendingTank].some(c=>Math.abs(c.x-p.x)<.55&&Math.abs(c.z-p.z)<.55))return false;
  if(occupied.some(c=>Math.hypot(c.x-a.x,c.z-a.z)>.31&&Math.hypot(c.x-p.x,c.z-p.z)<.30))return false;
 }return true;
}
export function simplifyWalkPath(island,path,options={}){if(!path)return null;const out=[path[0]];for(let i=0;i<path.length-1;){let j=path.length-1;while(j>i+1&&!clearWalkSegment(island,path[i],path[j],options))j--;if(!clearWalkSegment(island,path[i],path[j],options))return null;out.push(path[j]);i=j;}return out;}
export function planWalk(land,docks,tank,from,target,source=null){tank=[...tank,...(source?.constructions??[]).filter(c=>c.kind==='tank').flatMap(c=>c.cells)];const island=source?{...source,tank}: {land,docks,tank},options={targetCell:target.workSide?target.cell:null};
 const graph=walkGraph(land,docks,tank),ends=targetKeys(graph,land,docks,target).map(k=>graph.get(k).position);
 const direct=ends.filter(end=>clearWalkSegment(island,from,end,options)).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z));
 if(direct.length)return [{...from},{...direct[0]}];
 return simplifyWalkPath(island,planNetworkWalk(land,docks,tank,from,target),options);
}
