/** Logical grid cells per second. Shared by saved simulation and the rendered avatar. */
// One tuning source for simulation, rendering and the distance-driven gait blend.
export const MAX_PLAYER_SPEED=.5;
/** Existing V17 saves may contain the former cruise speed; validation is not tuning. */
export const MAX_SAVED_PLAYER_SPEED=.9;
// Preserve the 0.187s ease-in while making travel 1.79 times faster.
export const PLAYER_ACCELERATION=MAX_PLAYER_SPEED/.187;
type Point={x:number;z:number};
export type PlayerMotionStep={speed:number;distance:number};
const length=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
/** Advances a route with gentle starts and braking at its final destination.
 * Mutates the supplied point/path exactly like the model's ordinary route integrator.
 * Small internal steps keep 250ms simulation ticks and animation frames in agreement.
 */
export function advancePlayerMotion(position:Point,path:Point[],dt:number,speed=0):PlayerMotionStep{
 if(!Number.isFinite(dt)||dt<=0)return {speed:path.length?Math.max(0,Math.min(MAX_PLAYER_SPEED,speed||0)):0,distance:0};
 let velocity=Math.max(0,Math.min(MAX_PLAYER_SPEED,Number.isFinite(speed)?speed:0)),distance=0;
 for(let time=Math.min(dt,2);time>1e-9&&path.length;){
  const stepTime=Math.min(time,1/120);time-=stepTime;
  let remaining=length(position,path[0]);for(let i=1;i<path.length;i++)remaining+=length(path[i-1],path[i]);
  const target=Math.min(MAX_PLAYER_SPEED,Math.sqrt(2*PLAYER_ACCELERATION*remaining));
  const nextVelocity=velocity+Math.max(-PLAYER_ACCELERATION*stepTime,Math.min(PLAYER_ACCELERATION*stepTime,target-velocity));
  let travel=Math.min(remaining,(velocity+nextVelocity)*.5*stepTime);velocity=nextVelocity;
  while(path.length){
   const next=path[0],d=length(position,next);
   if(d<1e-10){position.x=next.x;position.z=next.z;path.shift();continue;}
   if(travel<=0)break;
   const moved=Math.min(d,travel);position.x+=(next.x-position.x)*moved/d;position.z+=(next.z-position.z)*moved/d;travel-=moved;distance+=moved;
   if(moved===d){position.x=next.x;position.z=next.z;path.shift();}
  }
 }
 return {speed:path.length?velocity:0,distance};
}

export type PlayerMotionSnapshot={position:Point;path:Point[];speed:number};
/** The rendered route is authoritative while a live scene exists. Other simulation
 * fields still advance normally; this only prevents a 250ms save tick outrunning LX.
 */
export function withRenderedPlayer<T extends {player:Point;playerPath:Point[];playerSpeed?:number}>(state:T,snapshot:PlayerMotionSnapshot|undefined):T{
 return snapshot?{...state,player:{...snapshot.position},playerPath:snapshot.path.map(p=>({...p})),playerSpeed:snapshot.speed}:state;
}

/** Keep only velocity directed along a replacement route. Reversals brake to rest. */
export function retargetPlayerSpeed(position:Point,previous:Point[],next:Point[],speed=0):number{
 const oldTarget=previous.find(p=>length(position,p)>1e-7),newTarget=next.find(p=>length(position,p)>1e-7);
 if(!oldTarget||!newTarget)return 0;
 const ax=oldTarget.x-position.x,az=oldTarget.z-position.z,bx=newTarget.x-position.x,bz=newTarget.z-position.z;
 const alignment=(ax*bx+az*bz)/(Math.hypot(ax,az)*Math.hypot(bx,bz));
 return Math.min(MAX_PLAYER_SPEED,Math.max(0,Number.isFinite(speed)?speed:0))*Math.max(0,Math.min(1,alignment));
}
