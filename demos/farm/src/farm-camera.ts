import {Vector3,type Camera} from 'three';
import type {ClubCameraMode} from './avatars/club-camera.ts';
const up=new Vector3(0,1,0);
function cameraForward(camera:Camera){
 const forward=camera.getWorldDirection(new Vector3());forward.y=0;
 if(forward.lengthSq()<1e-8)forward.set(0,0,-1);
 return forward.normalize();
}
function movement(forward:Vector3,x:number,z:number){
 const right=new Vector3().crossVectors(forward,up);
 return {x:right.x*x-forward.x*z,z:right.z*x-forward.z*z};
}
/** Match the archived joystick: screen-up follows the camera's ground-plane forward. */
export function screenMovementFromCamera(camera:Camera,x:number,z:number){
 return movement(cameraForward(camera),x,z);
}
/** Keep the archived gesture basis and follow-camera yaw until all manual input stops. */
export class CameraMovementGesture {
 private forward:Vector3|undefined;
 headingLock:number|undefined;
 get active(){return !!this.forward;}
 reset(){this.forward=undefined;this.headingLock=undefined;}
 sample(camera:Camera,mode:ClubCameraMode,x:number,z:number){
  if(!x&&!z){this.reset();return {x:0,z:0};}
  if(!this.forward){
   this.forward=cameraForward(camera);
   this.headingLock=Math.atan2(this.forward.x,this.forward.z)-(mode==='third-person'?Math.PI:0);
  }
  return movement(this.forward,x,z);
 }
}
