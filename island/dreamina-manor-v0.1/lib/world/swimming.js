import {SHARED_CELL_SIZE} from '../art/physical-contract.js';
function hash(text){let n=2166136261;for(const c of String(text))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
function insideLoop(p,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function safeSwimPoint(point,radius,outline,edges){let inside=false;for(const loop of outline)if(insideLoop(point,loop.points))inside=!inside;return inside&&edges.every(e=>segmentDistance(point,e.a,e.b)>=radius+.015);}
export function createSwimmer({id,cells,outline,edges,floorY,surfaceY,radius,halfHeight,cellSize=SHARED_CELL_SIZE}){
 let seed=hash(id),phase=seed/4294967296*Math.PI*2;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const safe=p=>safeSwimPoint(p,radius,outline,edges),centres=cells.map(c=>({x:c.x*cellSize,z:c.z*cellSize})).filter(safe);if(!centres.length)throw new Error('No safe swim centre for approved fish envelope');
 let position={...centres[Math.floor(random()*centres.length)]},yaw=random()*Math.PI*2,route=[],pause=random(),age=0;
 const heightLow=floorY+halfHeight+.08,heightHigh=surfaceY-halfHeight-.08;if(heightLow>heightHigh)throw new Error('Approved fish exceeds aquarium water height');
 const lineSafe=(a,b)=>{const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.12);for(let i=0;i<=n;i++)if(!safe({x:a.x+(b.x-a.x)*i/Math.max(1,n),z:a.z+(b.z-a.z)*i/Math.max(1,n)}))return false;return true;};
 function choose(){const centre=centres[Math.floor(random()*centres.length)],span=Math.max(0,cellSize/2-.24-radius);let target=centre;for(let i=0;i<24;i++){const p={x:centre.x+(random()*2-1)*span,z:centre.z+(random()*2-1)*span};if(safe(p)){target=p;break;}}
  if(lineSafe(position,target)){route=[target];return;}
  let start=0,end=0;for(let i=0;i<centres.length;i++){if(Math.hypot(position.x-centres[i].x,position.z-centres[i].z)<Math.hypot(position.x-centres[start].x,position.z-centres[start].z))start=i;if(Math.hypot(target.x-centres[i].x,target.z-centres[i].z)<Math.hypot(target.x-centres[end].x,target.z-centres[end].z))end=i;}
  const q=[start],previous=new Map([[start,null]]);while(q.length){const i=q.shift();if(i===end)break;for(let j=0;j<centres.length;j++)if(!previous.has(j)&&Math.abs(Math.hypot(centres[i].x-centres[j].x,centres[i].z-centres[j].z)-cellSize)<.001&&lineSafe(centres[i],centres[j])){previous.set(j,i);q.push(j);}}
  if(!previous.has(end)){route=[centres[start]];return;}const path=[];for(let p=end;p!==null;p=previous.get(p))path.unshift(centres[p]);route=[...path,target];
 }
 return {get position(){return {...position,y:heightLow+(heightHigh-heightLow)*(.5+.42*Math.sin(age*.27+phase))};},get yaw(){return yaw;},step(dt){age+=dt;let velocity={x:0,z:0};if(pause>0){pause-=dt;return {position:this.position,yaw,velocity};}if(!route.length)choose();const to=route[0],dx=to.x-position.x,dz=to.z-position.z,distance=Math.hypot(dx,dz);if(distance<.025){route.shift();if(!route.length)pause=.25+random()*1.3;return {position:this.position,yaw,velocity};}
   const wanted=Math.atan2(-dz,dx),angle=Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw));yaw+=Math.sign(angle)*Math.min(Math.abs(angle),dt*(1.2+radius*.25));
   // Turn in place before advancing: no persistent side-slip / all-heads-one-way drift.
   if(Math.abs(angle)<.12){const speed=(.22+radius*.28)*( .9+.2*Math.sin(phase)),travel=Math.min(distance,speed*dt);const next={x:position.x+dx/distance*travel,z:position.z+dz/distance*travel};if(safe(next)){velocity={x:(next.x-position.x)/dt,z:(next.z-position.z)/dt};position=next;}else route=[];}
   return {position:this.position,yaw,velocity};
 }};
}
