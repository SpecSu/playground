/** Fit both the catch and character to the narrow phone frustum, never only its height. */
export function fitFishingCloseup(bounds:{width:number;height:number;depth:number},verticalFovDegrees:number,aspect:number):number{
 const tangent=Math.tan(verticalFovDegrees*Math.PI/360),safeAspect=Math.max(.2,aspect);
 const widthDistance=bounds.width/(2*tangent*safeAspect);
 // The character/catch occupy the central clear portion above the gameplay dock.
 const heightDistance=bounds.height/(2*tangent*.70);
 return Math.max(widthDistance,heightDistance)*1.16+bounds.depth*.5;
}

export type FishingCameraSubject={id:string;position:{x:number;y:number;z:number};height:number;width:number};
type CameraPoint={x:number;y:number;z:number};
export type FishingCameraInput={overviewHull?:readonly CameraPoint[];overviewBounds?:{min:CameraPoint;max:CameraPoint};mode:'overview'|'deck';subject?:FishingCameraSubject;autoReveal?:boolean;catchCenter?:CameraPoint;catchId?:string;catchBounds?:{width:number;height:number;depth:number}};
export const FISHING_CAMERA_LIMITS=Object.freeze({minPitch:.035,maxPitch:1.18,maxDistance:90});
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
/** Project a conservative box onto the orbital right/up/forward axes. Reserving
 * the nearest depth face prevents long fish from cropping when rotated end-on. */
function fitOrbitBounds(bounds:{width:number;height:number;depth:number},fov:number,aspect:number,yaw:number,pitch:number){
 const x=bounds.width/2,y=bounds.height/2,z=bounds.depth/2;
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 const horizontal=Math.abs(cy)*x+Math.abs(sy)*z;
 const vertical=Math.abs(sy*sp)*x+Math.abs(cp)*y+Math.abs(cy*sp)*z;
 const depth=Math.abs(sy*cp)*x+Math.abs(sp)*y+Math.abs(cy*cp)*z;
 const tangent=Math.tan(fov*Math.PI/360);
 return Math.max(horizontal/(tangent*Math.max(.2,aspect)*.88),vertical/(tangent*.66))+depth;
}

/** Measure the real yacht around the approved focus; default overview leaves
 * at least 11% sea each side on portrait screens. This fit does not touch the
 * live yaw/pitch/zoom state and is only a default distance/resize adjustment. */
function fitOverviewBounds(bounds:NonNullable<FishingCameraInput['overviewBounds']>,fov:number,aspect:number,hull?:readonly CameraPoint[]){
 const yaw=.6,pitch=Math.atan2(23,31),sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 const tangent=Math.tan(fov*Math.PI/360);let distance=0;
 const points=hull?.length?hull:[bounds.min.x,bounds.max.x].flatMap(x=>[bounds.min.y,bounds.max.y].flatMap(y=>[bounds.min.z,bounds.max.z].map(z=>({x,y,z}))));
 for(const point of points){
  const {x,z}=point,y=point.y-1,right=cy*x-sy*z,up=-sy*sp*x+cp*y-cy*sp*z,depth=sy*cp*x+sp*y+cy*cp*z;
  distance=Math.max(distance,depth+Math.abs(right)/(tangent*Math.max(.2,aspect)*.78),depth+Math.abs(up)/(tangent*.6));
 }
 return distance;
}

/** The view is a persistent orbit, not an animation that owns the camera every frame.
 * A camera-mode change or a new catch selects a preset exactly once. Following the
 * angler / fitting a resized viewport never discards the user's orbit or zoom. */
export class FishingCameraController {
 private modeKey='';
 private lastCatchId:string|undefined;
 private view:'overview'|'deck'|'catch'='overview';
 get isCatchCloseup(){return this.view==='catch';}
 private yaw=.6;
 private pitch=Math.atan2(23,31);
 private zoomScale=1;
 private baseDistance=Math.hypot(31,23);
 private minDistance=14;
 private maxDistance=68;

 orbit(deltaX:number,deltaY:number){
  const yaw=this.yaw-(Number.isFinite(deltaX)?deltaX:0)*.007;
  this.yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  this.pitch=clamp(this.pitch+(Number.isFinite(deltaY)?deltaY:0)*.0045,FISHING_CAMERA_LIMITS.minPitch,FISHING_CAMERA_LIMITS.maxPitch);
 }
 zoom(factor:number){
  if(!Number.isFinite(factor)||factor<=0)return;
  this.zoomScale=clamp(this.zoomScale*factor,this.minDistance/this.baseDistance,this.maxDistance/this.baseDistance);
 }
 update(input:FishingCameraInput,fov:number,aspect:number){
  const modeKey=`${input.mode}:${input.subject?.id??''}`;
  const modeChanged=modeKey!==this.modeKey;
  const catchChanged=input.catchId!==this.lastCatchId;
  const reset=modeChanged||(catchChanged&&input.autoReveal!==false);
  if(reset){
   // An explicit toggle takes priority over an existing catch. A fresh catch still
   // earns its reveal, including when reconnecting directly into a held catch.
   this.view=input.autoReveal!==false&&input.catchId&&(!this.modeKey||catchChanged)?'catch':input.mode;
   this.zoomScale=1;
   this.modeKey=modeKey;
   this.lastCatchId=input.catchId;
  }
  this.lastCatchId=input.catchId;
  const subject=input.subject;
  let target={x:0,y:1,z:0},yaw=.6,pitch=Math.atan2(23,31);
  this.baseDistance=input.overviewBounds?Math.max(Math.hypot(31,23),fitOverviewBounds(input.overviewBounds,fov,aspect,input.overviewHull)):Math.hypot(31,23);this.minDistance=14;this.maxDistance=Math.min(FISHING_CAMERA_LIMITS.maxDistance,Math.max(68,this.baseDistance*1.65));
  if(subject&&this.view==='catch'&&input.catchId&&input.catchBounds){
   target={x:subject.position.x,y:subject.position.y+subject.height*.48,z:subject.position.z+.45};
   this.baseDistance=Math.max(fitFishingCloseup(input.catchBounds,fov,aspect)*1.04,fitOrbitBounds(input.catchBounds,fov,aspect,.27,.18)*1.2);
   this.minDistance=Math.max(3.8,this.baseDistance*.6);this.maxDistance=Math.min(FISHING_CAMERA_LIMITS.maxDistance,Math.max(30,this.baseDistance*2.8));
   yaw=.27;pitch=.18;
  }else if(subject&&this.view==='deck'){
   target={x:subject.position.x,y:subject.position.y+.75,z:subject.position.z+.1};
   yaw=Math.atan2(-Math.sign(subject.position.x||1)*4.1,6);pitch=.08;
   this.baseDistance=11.5;this.minDistance=6;this.maxDistance=38;
  }
  if(reset){this.yaw=yaw;this.pitch=pitch;}
  if(subject&&this.view!=='overview'&&input.catchId&&input.catchBounds){
   if(input.catchCenter)target={...input.catchCenter};
   this.minDistance=fitOrbitBounds(input.catchBounds,fov,aspect,this.yaw,this.pitch);
   this.maxDistance=Math.max(this.minDistance,Math.min(FISHING_CAMERA_LIMITS.maxDistance,this.baseDistance*2.8));
  }
  const distance=clamp(this.baseDistance*this.zoomScale,this.minDistance,this.maxDistance);
  const horizontal=distance*Math.cos(this.pitch);
  return {position:{x:target.x+Math.sin(this.yaw)*horizontal,y:target.y+Math.sin(this.pitch)*distance,z:target.z+Math.cos(this.yaw)*horizontal},target};
 }
}
