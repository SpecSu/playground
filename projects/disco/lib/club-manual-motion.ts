import { CLUB_BOOTH_BOUNDS, CLUB_WALK_BOUNDS, type ClubMotionState } from './club-scene-motion.ts';
import { MOVEMENT_BODY_RADIUS, MOVEMENT_PEER_RADIUS, MOVEMENT_EXTRAPOLATE_MS, MOVEMENT_SPEED_LIMIT, type MovementMode } from './room-movement.ts';
import { CLUB_AVATAR_SCALE } from './club-avatar-scale.ts';

/** Local-only cancellation stamp; absent stamps belong to the initial generation. */
export interface ClickTargetRequest extends ManualPoint { sequence: number; cancelGeneration?: number }
export interface ClubManualControl { x: number; y: number; active: boolean; enabled: boolean; autoRequest: number; reconcileRequest?: number; reconcileStop?: boolean; targetRequest?: ClickTargetRequest | null; targetSequence?: number; cancelRequest?: number }
export interface ClubMovementSample { mode: MovementMode; x: number; z: number; heading: number; vx: number; vz: number; reason: 'start' | 'move' | 'stop' | 'auto' }
export interface ManualPoint { x: number; z: number }
export interface ManualBlocker extends ManualPoint { radius?: number }
export interface ManualIntent { vx: number; vz: number; active: boolean; enabled?: boolean; autoRequest?: number; reconcileRequest?: number; reconcileStop?: boolean; targetRequest?: ClickTargetRequest | null; targetSequence?: number; cancelRequest?: number }
const EPS = 1e-5;
const safeRadius = (radius: number) => Number.isFinite(radius) ? Math.max(MOVEMENT_BODY_RADIUS, Math.min(CLUB_AVATAR_SCALE, radius)) : MOVEMENT_BODY_RADIUS;
const boothAtRadius = (radius: number) => {
 const padding = safeRadius(radius) + .02;
 return { minU: CLUB_BOOTH_BOUNDS.minU-padding, maxU: CLUB_BOOTH_BOUNDS.maxU+padding, minV: CLUB_BOOTH_BOUNDS.minV-padding, maxV: CLUB_BOOTH_BOUNDS.maxV+padding };
};
const booth = boothAtRadius(MOVEMENT_BODY_RADIUS);
/** Peer foot-space is independent of full-sized physical scenery clearance. */
export function manualPeerClearance(otherRadius = MOVEMENT_PEER_RADIUS, ownRadius = MOVEMENT_PEER_RADIUS): number {
 const radius = (value: number) => Number.isFinite(value) ? Math.max(MOVEMENT_PEER_RADIUS, Math.min(CLUB_AVATAR_SCALE, value)) : MOVEMENT_PEER_RADIUS;
 return radius(ownRadius) + radius(otherRadius) + .025;
}
const uv = (p: ManualPoint) => ({u:(p.x-p.z)*Math.SQRT1_2,v:(p.x+p.z)*Math.SQRT1_2});
const world = (u: number,v: number): ManualPoint => ({x:(u+v)*Math.SQRT1_2,z:(v-u)*Math.SQRT1_2});
const finite = (n: number) => Number.isFinite(n) ? n : 0;
const gap = (a: ManualPoint,b: ManualPoint) => Math.hypot(a.x-b.x,a.z-b.z);

export function isManualWalkable(p: ManualPoint): boolean {
 if(!Number.isFinite(p.x+p.z))return false;
 const q=uv(p),f=CLUB_WALK_BOUNDS;
 return q.u>=f.minU-EPS&&q.u<=f.maxU+EPS&&q.v>=f.minV-EPS&&q.v<=f.maxV+EPS&&(q.u<=booth.minU+EPS||q.u>=booth.maxU-EPS||q.v<=booth.minV+EPS||q.v>=booth.maxV-EPS);
}
export function constrainManualPosition(p: ManualPoint, bodyRadius = MOVEMENT_BODY_RADIUS): ManualPoint {
 const booth = boothAtRadius(bodyRadius);
 const f=CLUB_WALK_BOUNDS,q=uv({x:finite(p.x),z:finite(p.z)});
 q.u=Math.max(f.minU,Math.min(f.maxU,q.u));q.v=Math.max(f.minV,Math.min(f.maxV,q.v));
 if(q.u>booth.minU&&q.u<booth.maxU&&q.v>booth.minV&&q.v<booth.maxV){
  const faces=[{d:q.u-booth.minU,u:booth.minU-EPS,v:q.v},{d:booth.maxU-q.u,u:booth.maxU+EPS,v:q.v},{d:q.v-booth.minV,u:q.u,v:booth.minV-EPS},{d:booth.maxV-q.v,u:q.u,v:booth.maxV+EPS}].sort((a,b)=>a.d-b.d);
  q.u=faces[0].u;q.v=faces[0].v;
 }
 return world(q.u,q.v);
}
interface Hit { t: number; nx: number; nz: number; peer?: boolean }
function boothHit(a: ManualPoint,d: ManualPoint, bodyRadius = MOVEMENT_BODY_RADIUS): Hit | null {
 const booth = boothAtRadius(bodyRadius);
 const p=uv(a),v=uv(d);let enter=-Infinity,exit=Infinity,normal={u:0,v:0};
 for(const axis of ['u','v'] as const){
  const low=axis==='u'?booth.minU:booth.minV,high=axis==='u'?booth.maxU:booth.maxV;
  if(Math.abs(v[axis])<1e-10){if(p[axis]<=low||p[axis]>=high)return null;continue;}
  const t1=(low-p[axis])/v[axis],t2=(high-p[axis])/v[axis],near=Math.min(t1,t2);
  if(near>enter){enter=near;normal={u:0,v:0};normal[axis]=v[axis]>0?-1:1;}
  exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return null;
 }
 if(enter < -EPS||enter>1||exit<=EPS)return null;
 const n=world(normal.u,normal.v);return {t:Math.max(0,enter),nx:n.x,nz:n.z};
}
function firstHit(a:ManualPoint,d:ManualPoint,blockers:readonly ManualBlocker[],bodyRadius:number,peerRadius:number): Hit|null {
 let hit=boothHit(a,d,bodyRadius);const q=uv(a),v=uv(d),f=CLUB_WALK_BOUNDS;
 const add=(t:number,n:ManualPoint,peer=false)=>{if(t>=-EPS&&t<=1&&(!hit||t<hit.t))hit={t:Math.max(0,t),nx:n.x,nz:n.z,peer};};
 if(v.u>1e-10)add((f.maxU-q.u)/v.u,world(-1,0));else if(v.u< -1e-10)add((f.minU-q.u)/v.u,world(1,0));
 if(v.v>1e-10)add((f.maxV-q.v)/v.v,world(0,-1));else if(v.v< -1e-10)add((f.minV-q.v)/v.v,world(0,1));
 const aa=d.x*d.x+d.z*d.z;
 if(aa>1e-12)for(const b of blockers){
  const rx=a.x-b.x,rz=a.z-b.z,r=manualPeerClearance(b.radius,peerRadius);
  const bb=rx*d.x+rz*d.z,c=rx*rx+rz*rz-r*r;
  if(bb>=0)continue;
  const disc=bb*bb-aa*c;if(disc<0)continue;
  const t=c<=0?0:(-bb-Math.sqrt(disc))/aa;
  const hx=rx+d.x*t,hz=rz+d.z*t,len=Math.hypot(hx,hz)||1;add(t,{x:hx/len,z:hz/len},true);
 }
 return hit;
}
/** Swept circle movement, with at most four contact slides. No frame-sized tunnelling. */
function sweepPosition(start:ManualPoint,displacement:ManualPoint,blockers:readonly ManualBlocker[],bodyRadius:number,peerRadius:number): ManualPoint {
 let p=constrainManualPosition(start,bodyRadius),d={x:finite(displacement.x),z:finite(displacement.z)};
 for(let i=0;i<4;i++){
  if(Math.hypot(d.x,d.z)<1e-8)break;
  const h=firstHit(p,d,blockers,bodyRadius,peerRadius);if(!h){p={x:p.x+d.x,z:p.z+d.z};break;}
  const t=Math.max(0,h.t-EPS/Math.max(EPS,Math.hypot(d.x,d.z)));
  p={x:p.x+d.x*t,z:p.z+d.z*t};d={x:d.x*(1-t),z:d.z*(1-t)};
  const inward=d.x*h.nx+d.z*h.nz;if(inward<0){d.x-=h.nx*inward;d.z-=h.nz*inward;}
 }
 return constrainManualPosition(p,bodyRadius);
}
/** Keep full scenery sweeps; only dancer-to-dancer clearance is relaxed.
 * If a tiny foot core is exactly head-on, take a bounded side-step instead of
 * deadlocking a held joystick. Every candidate still sweeps the booth/walls. */
export function sweepManualPosition(start:ManualPoint,displacement:ManualPoint,blockers:readonly ManualBlocker[]=[],bodyRadius=MOVEMENT_BODY_RADIUS,peerRadius=bodyRadius>MOVEMENT_BODY_RADIUS?bodyRadius:MOVEMENT_PEER_RADIUS): ManualPoint {
 const next=sweepPosition(start,displacement,blockers,bodyRadius,peerRadius);
 const length=Math.hypot(displacement.x,displacement.z);
 if(peerRadius!==MOVEMENT_PEER_RADIUS||!Number.isFinite(length)||length<1e-8||gap(start,next)>=length*.25)return next;
 if(!firstHit(constrainManualPosition(start,bodyRadius),displacement,blockers,bodyRadius,peerRadius)?.peer)return next;
 let best=next,score=gap(start,next);
 for(const angle of [.65,-.65,1.1,-1.1]){
  const c=Math.cos(angle),s=Math.sin(angle),candidate=sweepPosition(start,{x:displacement.x*c-displacement.z*s,z:displacement.x*s+displacement.z*c},blockers,bodyRadius,peerRadius);
  const dx=candidate.x-start.x,dz=candidate.z-start.z,forward=(dx*displacement.x+dz*displacement.z)/length;
  const value=Math.hypot(dx,dz)+forward*.25;
  if(forward>=-EPS&&value>score+EPS){best=candidate;score=value;}
 }
 return best;
}
function visible(a:ManualPoint,b:ManualPoint){return !boothHit(a,{x:b.x-a.x,z:b.z-a.z});}
/** Four booth corners form a tiny visibility graph, avoiding chord-through-booth corrections. */
export function manualWaypoint(start:ManualPoint,destination:ManualPoint):ManualPoint{
 const target=constrainManualPosition(destination);if(visible(start,target))return target;
 const margin=.035;
 const nodes=[start,target,world(booth.minU-margin,booth.minV-margin),world(booth.minU-margin,booth.maxV+margin),world(booth.maxU+margin,booth.minV-margin),world(booth.maxU+margin,booth.maxV+margin)];
 const distance=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),seen=new Set<number>();distance[0]=0;
 for(let i=0;i<nodes.length;i++){
  let at=-1;for(let j=0;j<nodes.length;j++)if(!seen.has(j)&&(at<0||distance[j]<distance[at]))at=j;
  if(at<0||!Number.isFinite(distance[at]))break;seen.add(at);
  for(let j=0;j<nodes.length;j++)if(j!==at&&visible(nodes[at],nodes[j])){const next=distance[at]+gap(nodes[at],nodes[j]);if(next<distance[j]){distance[j]=next;previous[j]=at;}}
 }
 let next=1;while(previous[next]>0)next=previous[next];return previous[next]>=0?nodes[next]:start;
}
export function approachManualTarget(start:ManualPoint,target:ManualPoint,deltaSeconds:number,blockers:readonly ManualBlocker[]=[]):ManualPoint{
 const waypoint=manualWaypoint(start,target),dx=waypoint.x-start.x,dz=waypoint.z-start.z;
 const dt=Math.max(0,Math.min(.1,finite(deltaSeconds))),distance=Math.hypot(dx,dz);
 const step=Math.min(distance,Math.max(.06,distance*9)*dt,MOVEMENT_SPEED_LIMIT*2*dt),scale=distance>0?step/distance:0;
 return sweepManualPosition(start,{x:dx*scale,z:dz*scale},blockers);
}
export function remoteManualTarget(sample:ManualPoint&{vx:number;vz:number;acceptedAt:number},now:number):ManualPoint{
 const seconds=Math.max(0,Math.min(MOVEMENT_EXTRAPOLATE_MS,now-sample.acceptedAt))/1000;
 return sweepManualPosition(sample,{x:sample.vx*seconds,z:sample.vz*seconds});
}
export function movementVectorFromCamera(x:number,y:number,forward:ManualPoint):ManualPoint{
 const magnitude=Math.min(1,Math.hypot(finite(x),finite(y)));if(magnitude<.12)return {x:0,z:0};
 const len=Math.hypot(forward.x,forward.z)||1,fx=forward.x/len,fz=forward.z/len;
 const input=Math.hypot(x,y),speed=MOVEMENT_SPEED_LIMIT*(magnitude-.12)/.88;
 return {x:(-fz*x+fx*y)/input*speed,z:(fx*x+fz*y)/input*speed};
}
export class ManualWalkTrail {
 private points: {x:number;z:number;heading:number;distance:number}[];
 distance=0;
 constructor(origin:ManualPoint,heading:number,distance=0){this.distance=distance;this.points=[{...origin,heading,distance}];}
 get size(){return this.points.length;}
 append(point:ManualPoint,heading:number){const last=this.points.at(-1)!;const length=gap(last,point);this.distance+=length;if(length>.00001)this.points.push({...point,heading,distance:this.distance});else last.heading=heading;while(this.points.length>96||(this.points.length>2&&this.distance-this.points[1].distance>3))this.points.shift();}
 sampleAtDistance=(distance:number):Pick<ClubMotionState,'x'|'z'|'heading'>=>{
  const first=this.points[0],last=this.points.at(-1)!;
  if(distance<=first.distance)return {...first,x:first.x+Math.sin(first.heading)*(distance-first.distance),z:first.z+Math.cos(first.heading)*(distance-first.distance)};
  if(distance>=last.distance)return {...last,x:last.x+Math.sin(last.heading)*(distance-last.distance),z:last.z+Math.cos(last.heading)*(distance-last.distance)};
  const index=this.points.findIndex(p=>p.distance>=distance),a=this.points[index-1],b=this.points[index],t=(distance-a.distance)/(b.distance-a.distance);
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,heading:a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t};
 };
 motion(slot:number,point:ManualPoint,heading:number,speed:number,action:ClubMotionState['action']='dance'):ClubMotionState{return {slot,...point,heading,speed,distance:this.distance,walkBlend:Math.min(1,speed/.18),action,sampleAtDistance:this.sampleAtDistance};}
}

/** Required stop barriers always reach the transport, which knows whether a stop was sendable. */
export function shouldEmitMovementSample(previous:ClubMovementSample|undefined,next:ClubMovementSample,generationChanged:boolean):boolean{
 if(!previous||generationChanged||next.reason==='start'||next.reason==='auto'||next.reason==='stop')return true;
 return previous.mode!==next.mode||previous.vx!==next.vx||previous.vz!==next.vz||previous.x!==next.x||previous.z!==next.z||previous.heading!==next.heading;
}

export function shouldStopMovementSample(sample:ClubMovementSample|undefined,sameGeneration:boolean):boolean{
 return Boolean(sameGeneration&&sample?.mode==='manual'&&(sample.vx||sample.vz));
}

/** Invalidate both active and queued click travel without touching the network epoch. */
export function cancelClickMovement(control: ClubManualControl) {
 control.targetRequest = null;
 control.cancelRequest = (control.cancelRequest ?? 0) + 1;
}
