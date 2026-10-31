/** Explicit manually reviewed corridor bounds, not an inferred splat navmesh.
 * Source is rotated 180° about X (native Y down -> world Y up). */
export const PYRAMID_WALK_BOUNDS=Object.freeze({minX:-3.2,maxX:3.2,minZ:-.2,maxZ:.2});
export const PYRAMID_CAMERA_BOUNDS=Object.freeze({minX:-4,maxX:4,minZ:-.65,maxZ:.65});
export type PyramidPose={x:number;y:number;z:number;yaw:number;pitch:number};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export class PyramidInteriorMotion{
 private pose:PyramidPose={x:0,y:0,z:0,yaw:-Math.PI/2,pitch:0};
 snapshot():PyramidPose{return {...this.pose};}
 reset(){this.pose={x:0,y:0,z:0,yaw:-Math.PI/2,pitch:0};}
 look(yaw:number,pitch:number){if(!Number.isFinite(yaw)||!Number.isFinite(pitch))return;this.pose.yaw=(this.pose.yaw+yaw)%(Math.PI*2);this.pose.pitch=clamp(this.pose.pitch+pitch,-Math.PI*.38,Math.PI*.38);}
 move(forward:number,strafe:number,dt:number){if(![forward,strafe,dt].every(Number.isFinite)||dt<=0||dt>.1)return;const n=Math.max(1,Math.hypot(forward,strafe)),s=1.4*dt/n,{yaw}=this.pose;this.pose.x=clamp(this.pose.x+(-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*s,PYRAMID_WALK_BOUNDS.minX,PYRAMID_WALK_BOUNDS.maxX);this.pose.z=clamp(this.pose.z+(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*s,PYRAMID_WALK_BOUNDS.minZ,PYRAMID_WALK_BOUNDS.maxZ);}
}

/** Manual center-floor levels from actual splat medians at x=-4..4, not a reconstructed mesh. */
const floorLevels=[1.807,1.778,1.758,1.782,1.813,1.824,1.834,1.873,1.931];
export function pyramidFloorHeight(x:number){const p=clamp(x+4,0,8),i=Math.min(7,Math.floor(p));return -(floorLevels[i]+(floorLevels[i+1]-floorLevels[i])*(p-i));}
export function pyramidThirdPersonCamera(p:PyramidPose){
 const dx=Math.sin(p.yaw),dz=Math.cos(p.yaw),b=PYRAMID_CAMERA_BOUNDS;let distance=2.2;
 for(const [origin,direction,min,max]of [[p.x,dx,b.minX,b.maxX],[p.z,dz,b.minZ,b.maxZ]])if(Math.abs(direction)>1e-8)distance=Math.min(distance,(direction>0?max-origin:min-origin)/direction);
 const floor=pyramidFloorHeight(p.x),near=Math.max(0,1-distance)/.55;
 return {x:p.x+dx*distance,y:floor+1.65+near*.4,z:p.z+dz*distance,target:{x:p.x,y:floor+.66+clamp(p.pitch,-.6,.6)*.25,z:p.z},distance};
}
