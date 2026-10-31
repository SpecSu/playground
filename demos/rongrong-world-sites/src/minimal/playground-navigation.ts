import {advancePlayerMotion,retargetPlayerSpeed} from './player-motion.ts';
export type SchoolPoint={x:number;z:number};
export type SchoolRect={minX:number;maxX:number;minZ:number;maxZ:number};
export type SchoolCircle=SchoolPoint&{radius:number};
export const SCHOOL_PLAYER_RADIUS=.42;
export const SCHOOL_PLAYER_SPAWN=Object.freeze({x:0,z:2});
const distance=(a:SchoolPoint,b:SchoolPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
function intersects(a:SchoolPoint,b:SchoolPoint,r:SchoolRect,padding:number){let low=0,high=1;for(const [start,delta,min,max]of [[a.x,b.x-a.x,r.minX-padding,r.maxX+padding],[a.z,b.z-a.z,r.minZ-padding,r.maxZ+padding]]){if(Math.abs(delta)<1e-10){if(start<=min||start>=max)return false;}else{const one=(min-start)/delta,two=(max-start)/delta;low=Math.max(low,Math.min(one,two));high=Math.min(high,Math.max(one,two));if(low>=high)return false;}}return low<high&&high>0&&low<1;}
export function schoolCircleClear(a:SchoolPoint,b:SchoolPoint,c:SchoolCircle,radius=SCHOOL_PLAYER_RADIUS){const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.z-a.z)*dz)/length)):0;return Math.hypot(a.x+dx*t-c.x,a.z+dz*t-c.z)>=radius+c.radius-1e-8;}
/** Individual solid footprints only. Never a whole prop-group/model/track box. */
export class PlaygroundNavigation{
 readonly obstacles:readonly SchoolRect[];readonly radius:number;
 constructor(obstacles:readonly SchoolRect[],radius=SCHOOL_PLAYER_RADIUS){this.obstacles=obstacles;this.radius=radius;}
 clear(a:SchoolPoint,b:SchoolPoint,circles:readonly SchoolCircle[]){return [a,b].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=15&&Math.abs(p.z)<=11.25)&&!this.obstacles.some(r=>intersects(a,b,r,this.radius))&&circles.every(c=>schoolCircleClear(a,b,c,this.radius));}
 routeSafe(from:SchoolPoint,path:readonly SchoolPoint[],circles:readonly SchoolCircle[]){return path.every((p,i)=>this.clear(i?path[i-1]:from,p,circles));}
 route(from:SchoolPoint,to:SchoolPoint,circles:readonly SchoolCircle[]):SchoolPoint[]|null{
  if(!this.clear(from,from,circles)||!this.clear(to,to,circles))return null;if(this.clear(from,to,circles))return [{...to}];
  const cols=61,rows=45,point=(i:number)=>({x:i%cols*.5-15,z:Math.floor(i/cols)*.5-11}),index=(x:number,z:number)=>z*cols+x,valid=new Map<number,boolean>(),clear=(i:number)=>{let value=valid.get(i);if(value===undefined){const p=point(i);value=this.clear(p,p,circles);valid.set(i,value);}return value;};
  const costs=new Map<number,number>(),prev=new Map<number,number>(),heap:{i:number;score:number}[]=[],done=new Set<number>();
  const push=(v:{i:number;score:number})=>{heap.push(v);let n=heap.length-1;while(n){const p=(n-1)>>1;if(heap[p].score<=v.score)break;heap[n]=heap[p];n=p;}heap[n]=v;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let n=0;while(n*2+1<heap.length){let child=n*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[n]=heap[child];n=child;}heap[n]=last;}return first.i;};
  const sx=Math.round((from.x+15)*2),sz=Math.round((from.z+11)*2);
  for(let x=Math.max(0,sx-2);x<=Math.min(cols-1,sx+2);x++)for(let z=Math.max(0,sz-2);z<=Math.min(rows-1,sz+2);z++){const i=index(x,z),p=point(i);if(clear(i)&&this.clear(from,p,circles)){const g=distance(from,p);costs.set(i,g);prev.set(i,-1);push({i,score:g+distance(p,to)});}}
  let end=-1;while(heap.length){const i=pop();if(done.has(i))continue;done.add(i);const p=point(i);if(this.clear(p,to,circles)){end=i;break;}const x=i%cols,z=Math.floor(i/cols);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(!dx&&!dz||x+dx<0||x+dx>=cols||z+dz<0||z+dz>=rows)continue;const j=index(x+dx,z+dz),q=point(j);if(done.has(j)||!clear(j)||!this.clear(p,q,circles))continue;const cost=costs.get(i)!+distance(p,q);if(cost<(costs.get(j)??Infinity)){costs.set(j,cost);prev.set(j,i);push({i:j,score:cost+distance(q,to)});}}}
  if(end<0)return null;const path:SchoolPoint[]=[{...to}];for(let i=end;i!==-1;i=prev.get(i)!)path.push(point(i));path.reverse();const compact:SchoolPoint[]=[];let anchor=from;for(let i=0;i<path.length;){let last=path.length-1;while(last>i&&!this.clear(anchor,path[last],circles))last--;anchor=path[last];compact.push(anchor);i=last+1;}return compact;
 }
}
/** Original logical-cell integrator, scaled by the same2m/cell as ordinary farms. */
export class SchoolPlayerMotion{
 private position:SchoolPoint={...SCHOOL_PLAYER_SPAWN};private path:SchoolPoint[]=[];private speed=0;private destination:SchoolPoint|null=null;private travelled=0;
 readonly navigation:PlaygroundNavigation;
 constructor(navigation:PlaygroundNavigation){this.navigation=navigation;}
 snapshot(){return {position:{...this.position},path:this.path.map(p=>({...p})),speed:this.speed*2,distance:this.travelled,destination:this.destination?{...this.destination}:null};}
 move(to:SchoolPoint,circles:readonly SchoolCircle[]){const next=this.navigation.route(this.position,to,circles);if(!next)return false;const grid=(p:SchoolPoint)=>({x:p.x/2,z:p.z/2});this.speed=retargetPlayerSpeed(grid(this.position),this.path.map(grid),next.map(grid),this.speed);this.path=next;this.destination={...to};return true;}
 tick(dt:number,circles:readonly SchoolCircle[]){if(!Number.isFinite(dt)||dt<=0||dt>.25||!this.path.length)return 0;const target=this.path[0],d=distance(this.position,target),step=Math.min(1,d),near={x:this.position.x+(target.x-this.position.x)*step/(d||1),z:this.position.z+(target.z-this.position.z)*step/(d||1)};
  if(!this.navigation.clear(this.position,near,circles)){const next=this.destination&&this.navigation.route(this.position,this.destination,circles);this.speed=0;if(!next)return 0;this.path=next;}
  const p={x:this.position.x/2,z:this.position.z/2},path=this.path.map(v=>({x:v.x/2,z:v.z/2})),result=advancePlayerMotion(p,path,dt,this.speed),next={x:p.x*2,z:p.z*2};if(!this.navigation.clear(this.position,next,circles)){this.speed=0;return 0;}this.position=next;this.path=path.map(v=>({x:v.x*2,z:v.z*2}));this.speed=result.speed;this.travelled+=result.distance*2;if(!this.path.length)this.destination=null;return result.distance*2;
 }
 cancel(){this.path=[];this.speed=0;this.destination=null;}
}
export function schoolGroundHeight(p:SchoolPoint){const d=Math.hypot(Math.max(0,Math.abs(p.x)-6),p.z);let h=d>=3.9&&d<=8.1?.012:0;if([-1.4,0,1.4].some(o=>Math.abs(d-(6+o))<=.025))h=.019;if(Math.abs(p.x)<=8.7&&Math.abs(p.z)<=3.15)h=Math.max(h,.018);if(Math.abs(p.z)<=3&&(Math.abs(p.x)<=.0175||Math.abs(Math.abs(p.x)-8.6)<=.0175)||Math.abs(p.x)<=8.6&&Math.abs(Math.abs(p.z)-3)<=.0175)h=Math.max(h,.03);const r=Math.hypot(p.x,p.z);if(r>=1.45&&r<=1.48)h=Math.max(h,.031);return h;}
