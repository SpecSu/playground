import {SHARED_CELL_SIZE,TANK_OUTER_EDGE_INSET} from '../art/physical-contract.js';
function hash(text){let n=2166136261;for(const c of String(text))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
function insideLoop(p,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function safeSwimPoint(point,radius,outline,edges){let inside=false;for(const loop of outline)if(insideLoop(point,loop.points))inside=!inside;return inside&&edges.every(e=>segmentDistance(point,e.a,e.b)>=radius+.015);}
/** Full connected water domain, not the clearance left inside one original tile.
 * A large fish may turn safely across shared cell boundaries even when no tile centre is safe.
 */
export function swimDomain({outline,edges,radius,spacing=.30}){
 const points=outline.flatMap(l=>l.points),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
 const minX=Math.min(...xs)+radius+.02,maxX=Math.max(...xs)-radius-.02,minZ=Math.min(...zs)+radius+.02,maxZ=Math.max(...zs)-radius-.02;
 const nx=Math.max(1,Math.ceil((maxX-minX)/spacing)),nz=Math.max(1,Math.ceil((maxZ-minZ)/spacing)),nodes=[],map=new Map();
 for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){const p={x:minX+(maxX-minX)*ix/nx,z:minZ+(maxZ-minZ)*iz/nz,ix,iz};if(safeSwimPoint(p,radius,outline,edges)){map.set(`${ix},${iz}`,nodes.length);nodes.push(p);}}
 return {nodes,map,minX,maxX,minZ,maxZ};
}
const lane=index=>[.12,.88,.5,.31,.69][index%5];
export function createSwimmer({id,cells,outline,edges,floorY,surfaceY,getSurfaceY=()=>surfaceY,radius,halfHeight,space,schoolSlot=0,schoolSize=1,peers=()=>[],cellSize=SHARED_CELL_SIZE}){
 if(space?.restricted&&space.rectangle)return createRestrictedSwimmer({id,space,floorY,surfaceY,getSurfaceY,cellSize,schoolSlot,schoolSize});
 let seed=hash(id);seed=Math.imul(seed^(seed>>>16),0x7feb352d);seed=Math.imul(seed^(seed>>>15),0x846ca68b);seed=(seed^(seed>>>16))>>>0;
 const phase=seed/4294967296*Math.PI*2,random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const safe=p=>safeSwimPoint(p,radius,outline,edges),domain=swimDomain({outline,edges,radius}),{nodes,map}=domain;
 if(!nodes.length)throw new Error('No safe swim centre for approved fish envelope');
 const heightLow=floorY+halfHeight+.08;
 let position=null,yaw=0,route=[],pause=0,age=0;
 const y=()=>{const heightRange=Math.max(0,getSurfaceY()-halfHeight-.08-heightLow),heightCentre=heightLow+heightRange*(schoolSize>1?lane(schoolSlot):.5),bob=schoolSize>1?Math.min(.12,heightRange*.075):heightRange*.32;return heightCentre+bob*Math.sin(age*.31+phase);};
 const lineSafe=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.08));for(let i=0;i<=n;i++)if(!safe({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;return true;};
 function score(p){let separation=5;for(const other of peers()){if(other.id===id)continue;const q=other.position;if(!position&&Math.hypot(p.x-q.x,p.z-q.z)<.10)return -100;separation=Math.min(separation,Math.hypot((p.x-q.x)/(radius+other.radius),(p.z-q.z)/(radius+other.radius),(y()-q.y)/(halfHeight+other.halfHeight)));}return separation+(position?Math.min(2,Math.hypot(p.x-position.x,p.z-position.z))*.35:0);}
 const cx=(domain.minX+domain.maxX)/2,cz=(domain.minZ+domain.maxZ)/2,quadrant=[[-1,-1],[1,-1],[-1,1],[1,1]][Math.max(0,schoolSlot-2)%4],assigned=schoolSize>2&&schoolSlot>=2?nodes.filter(p=>(p.x-cx)*quadrant[0]>=(domain.maxX-domain.minX)*.18&&(p.z-cz)*quadrant[1]>=(domain.maxZ-domain.minZ)*.18):nodes,pool=assigned.length>=3?assigned:nodes;
 function select(){let best=null,bestScore=-Infinity;for(let i=0;i<48;i++){const p=pool[Math.floor(random()*pool.length)],v=score(p)+random()*.12;if(v>bestScore){best=p;bestScore=v;}}return {x:best.x,z:best.z};}
 position=select();
 function choose(){const target=select();if(lineSafe(position,target)){route=[target];return;}
  const nearest=p=>{let n=0,d=Infinity;for(let i=0;i<nodes.length;i++){const v=Math.hypot(p.x-nodes[i].x,p.z-nodes[i].z);if(v<d&&lineSafe(p,nodes[i])){n=i;d=v;}}return n;};
  const start=nearest(position),end=nearest(target),queue=[start],previous=new Map([[start,null]]);
  for(let qi=0;qi<queue.length;qi++){const i=queue[qi];if(i===end)break;const p=nodes[i];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(!dx&&!dz)continue;const j=map.get(`${p.ix+dx},${p.iz+dz}`);if(j!==undefined&&!previous.has(j)&&lineSafe(p,nodes[j])){previous.set(j,i);queue.push(j);}}}
  if(!previous.has(end)){route=[];pause=.2;return;}const path=[];for(let n=end;n!==null;n=previous.get(n))path.unshift(nodes[n]);route=[...path,target];
 }
 choose();if(route.length)yaw=Math.atan2(-(route[0].z-position.z),route[0].x-position.x);
 return {get position(){return {...position,y:y()};},get yaw(){return yaw;},step(dt){age+=dt;let velocity={x:0,z:0};if(pause>0){pause-=dt;return {position:this.position,yaw,velocity};}if(!route.length)choose();if(!route.length)return {position:this.position,yaw,velocity};const to=route[0],dx=to.x-position.x,dz=to.z-position.z,distance=Math.hypot(dx,dz);if(distance<.025){route.shift();if(!route.length)pause=.2+random()*.6;return {position:this.position,yaw,velocity};}
   const wanted=Math.atan2(-dz,dx),angle=Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw));yaw+=Math.sign(angle)*Math.min(Math.abs(angle),dt*(1.4+radius*.25));
   // Turn before advancing; each fish keeps its route, phase and vertical lane across snapshots.
   if(Math.abs(angle)<.12){const speed=(.25+radius*.28)*(.9+.2*Math.sin(phase)),travel=Math.min(distance,speed*dt);const next={x:position.x+dx/distance*travel,z:position.z+dz/distance*travel};if(safe(next)){velocity={x:(next.x-position.x)/dt,z:(next.z-position.z)/dt};position=next;}else route=[];}
   return {position:this.position,yaw,velocity};
 }};
}

/** In a long narrow tank, keep the actual unscaled fish in a bounded long-axis hover.
 * No impossible 180-degree turn: only a gentle finite yaw, fin motion and small water drift.
 */
function createRestrictedSwimmer({id,space,floorY,surfaceY,getSurfaceY=()=>surfaceY,cellSize,schoolSlot=0,schoolSize=1}){
 const r=space.rectangle,phase=hash(id)/4294967296*Math.PI*2,axis=r.rotated?Math.PI/2:0,base=axis+(hash(id+'facing')%2?Math.PI:0);
 const xHalf=r.width*cellSize/2-TANK_OUTER_EDGE_INSET-.0175,zHalf=r.depth*cellSize/2-TANK_OUTER_EDGE_INSET-.0175;
 const ex=r.rotated?space.turnZ:space.turnX,ez=r.rotated?space.turnX:space.turnZ;
 const sx=xHalf-ex-.035,sz=zHalf-ez-.035;if(sx<0||sz<0)throw new Error('No safe rectangular swim envelope');
 const low=floorY+space.halfHeight+.08;
 const cx=(r.x+(r.width-1)/2)*cellSize,cz=(r.z+(r.depth-1)/2)*cellSize,ax=Math.min(r.rotated?.07:.40,sx*.7),az=Math.min(r.rotated?.40:.07,sz*.7);
 let age=0;const mid=schoolSize>1?lane(schoolSlot):.5,bob=schoolSize>1?.045:.42;const pose=()=>({x:cx+ax*Math.sin(age*.35+phase),z:cz+az*Math.sin(age*.31+phase*.7),y:low+Math.max(0,getSurfaceY()-space.halfHeight-.08-low)*(mid+bob*Math.sin(age*.27+phase))});
 return {get position(){return pose();},get yaw(){return base+.10*Math.sin(age*.17+phase);},step(dt){const before=pose();age+=dt;const after=pose();return {position:after,yaw:this.yaw,velocity:{x:(after.x-before.x)/dt,z:(after.z-before.z)/dt}};}};
}
