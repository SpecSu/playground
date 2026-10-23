import {isPlayerWalkable,type GridPoint,type Layout} from './layout.ts';
import {findPlayerPath,playerSegmentClear} from './player-navigation.ts';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const v=clamp(n);return v*v*(3-2*v);};
const distance=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export type FeedingPose={phase:'settle'|'offer'|'eat'|'recover'|'done';crouch:number;reach:number;prop:boolean;animal:'suckle'|'eat'|undefined;animalWeight:number};
/** One authoritative 3000ms transaction clock, not independent animation timers. */
export function feedingPoseAt(progressMs:number,food:'milk'|'feed'):FeedingPose{
 const ms=Number.isFinite(progressMs)?Math.max(0,progressMs):0;
 const phase=ms>=3000?'done':ms<300?'settle':ms<950?'offer':ms<2350?'eat':'recover';
 const reach=smooth((ms-300)/650)*(1-smooth((ms-2350)/650));
 const animalWeight=smooth((ms-800)/250)*(1-smooth((ms-2200)/450));
 return {phase,crouch:reach,reach,prop:ms>=450&&ms<2800,animal:animalWeight>0?(food==='milk'?'suckle':'eat'):undefined,animalWeight};
}
/** Side/front contact stations are fractional endpoints joined only by a clear segment. */
export function feedingApproach(layout:Layout,from:GridPoint,animal:GridPoint,occupied:GridPoint[]=[]):{to:GridPoint;path:GridPoint[]}|null{
 const options=[{x:.66,z:.72},{x:-.66,z:.72},{x:.9,z:0},{x:-.9,z:0},{x:0,z:.95},{x:0,z:-.95}];
 const candidates=options.map((offset,index)=>{
  const to={x:animal.x+offset.x,z:animal.z+offset.z},cell={x:Math.round(to.x),z:Math.round(to.z)};
  if(!isPlayerWalkable(layout,cell)||!playerSegmentClear(layout,animal,to)||occupied.some(q=>distance(q,to)<.62))return null;
  const path=findPlayerPath(layout,from,cell);if(!path)return null;
  const end=path.at(-1)??from;if(!playerSegmentClear(layout,end,to))return null;
  const route=[...path];if(distance(end,to)>.001)route.push(to);
  const points=[from,...route],length=route.reduce((sum,q,i)=>sum+distance(points[i],q),0);
  return {to,path:route,score:length+index*.12};
 }).filter((v):v is NonNullable<typeof v>=>v!==null).sort((a,b)=>a.score-b.score);
 return candidates[0]??null;
}
export type GuardianPose={shield:number;pounce:number;bubble:number;scan:number;crouch:number};
/** Discrete look holds, one bounded defensive phrase; no dance or high-rate jitter. */
export function guardianPoseAt(kind:'dog'|'cat'|'frog',action:string|undefined,seconds:number):GuardianPose{
 const t=Math.max(0,Number.isFinite(seconds)?seconds:0),active=!!action&&!['watching','settle'].includes(action),weight=active?smooth(t/.35):0;
 const watch=action==='watching',scan=watch?(t%8<2?-.48:t%8<2.6?-.48+smooth((t%8-2)/.6)*.96:t%8<5?.48:t%8<5.6?.48*(1-smooth((t%8-5)/.6)):0):0;
 const pounce=kind==='cat'&&active?weight*(.35+.65*Math.sin(Math.min(1,t/1.2)*Math.PI)**2):0;
 return {shield:kind==='dog'?weight:0,pounce,bubble:kind==='frog'?weight:0,scan,crouch:kind==='cat'?pounce*.65:kind==='dog'?weight*.25:0};
}
export function wolfPoseAt(status:string,speed:number,distanceTravelled:number){
 const moving=Math.max(0,Math.min(1,speed/1.5)),retreat=['retreating','retreated','carrying'].includes(status),windup=status==='windup'||status==='grabbing';
 return {gait:Math.sin(distanceTravelled/1.1*Math.PI*2)*moving*.5,crouch:windup?.1:0,head:windup?.24:retreat?-.12:speed<.05?.12:.04,tail:retreat?-.6:windup?.12:0,lean:retreat?-.06:windup?.08:0};
}
