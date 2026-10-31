import type {Layout} from './layout.ts';
import type {LookoutPoint,LookoutState} from './lookout.ts';
import {DEFAULT_RENDER_DELAY_MS} from './motion-track.ts';
const point=(s:LookoutState):LookoutPoint=>({...s.position,height:s.height});
const distance=(a:LookoutPoint,b:LookoutPoint)=>Math.hypot(a.x-b.x,a.z-b.z,a.height-b.height);
/** Restrict a visual interval to the motion certified by both snapshots. Frozen
 * simulation clocks must never be extrapolated just because wall time advanced. */
function between(before:LookoutState,after:LookoutState,fraction:number):LookoutState{
 const state=structuredClone(before),start=point(before),end=point(after);
 if(before.phase===after.phase)state.phaseMs=before.phaseMs+(after.phaseMs-before.phaseMs)*fraction;
 if(distance(start,end)<1e-8)return state;
 const changedToDescent=after.phase==='descent'&&before.phase!=='descent';
 const candidates=changedToDescent?[start,...after.path]:[start,...before.path.slice(before.pathIndex),...after.path];
 const route:LookoutPoint[]=[start];let found=false;
 for(const candidate of candidates.slice(1)){
  const last=route.at(-1)!,length=distance(last,candidate);if(length<1e-8)continue;
  // A target lying on this legal stair/ground edge closes the interval.
  if(Math.abs(distance(last,end)+distance(end,candidate)-length)<1e-6){route.push(end);found=true;break;}
  route.push(candidate);
 }
 if(!found)return state; // Keep the last certified position, never shortcut a building.
 let remaining=route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0)*fraction;
 for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],length=distance(a,b);if(remaining<=length){const t=length?remaining/length:1;state.position={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};state.height=a.height+(b.height-a.height)*t;break;}remaining-=length;}
 return state;
}
/** Same authority buffering as ground actors, on the certified 3D route only. */
export class LookoutMotionTrack{
 private frames:{state:LookoutState;at:number}[];private renderedAt:number;
 constructor(_layout:Layout,state:LookoutState,at:number){this.frames=[{state:structuredClone(state),at}];this.renderedAt=at;}
 push(state:LookoutState,at:number,_layout?:Layout):boolean{if(at<=this.frames.at(-1)!.at)return false;this.frames.push({state:structuredClone(state),at});if(this.frames.length>100)this.frames.shift();return true;}
 sample(now:number):LookoutState{
  const first=this.frames[0],last=this.frames.at(-1)!,at=Math.max(this.renderedAt,first.at,Math.min(now-DEFAULT_RENDER_DELAY_MS,last.at));this.renderedAt=at;
  if(at>=last.at)return structuredClone(last.state);
  for(let i=1;i<this.frames.length;i++)if(at<this.frames[i].at){const frame=this.frames[i-1],next=this.frames[i];return between(frame.state,next.state,(at-frame.at)/(next.at-frame.at));}
  return structuredClone(first.state);
 }
}
