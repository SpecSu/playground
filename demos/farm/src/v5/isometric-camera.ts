import {MathUtils,OrthographicCamera,Vector3,type Camera} from 'three';

export type EstateCameraMode='third-person'|'overview';
export interface EstateCameraOptions{
 /** Active frame duration in seconds. Background time must not be passed here. */
 dt:number;
 aspect:number;
 mode:EstateCameraMode;
 position:{x:number;y?:number;z:number};
 bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
 /** Interaction framing only: it never supplies an orbit or body heading. */
 attention?:{x:number;z:number;zoom?:number};
}

const YAW=Math.PI/4,PITCH=MathUtils.degToRad(52),DISTANCE=32,FOCUS_HEIGHT=.6;
const OFFSET=new Vector3(Math.sin(YAW)*Math.cos(PITCH),Math.sin(PITCH),Math.cos(YAW)*Math.cos(PITCH)).multiplyScalar(DISTANCE);
const finite=(value:number|undefined,fallback:number)=>Number.isFinite(value)?value!:fallback;
function clampFocus(value:number,min:number,max:number){
 const low=Math.min(min,max),high=Math.max(min,max),margin=Math.min(1.5,(high-low)/4);
 return MathUtils.clamp(value,low+margin,high-margin);
}

/** A fixed farm view. Only the focus and orthographic extent can move.
 * It is independent of rigs, obstacles, renderer lifecycle and player heading.
 */
export class EstateCameraController{
 readonly camera=new OrthographicCamera(-5,5,5,-5,.08,160);
 private focus=new Vector3();
 private span=10;
 private initialized=false;

 reset(){this.initialized=false;}

 update(options:EstateCameraOptions):OrthographicCamera{
  const aspect=MathUtils.clamp(finite(options.aspect,390/844),.1,10);
  const position=new Vector3(finite(options.position.x,0),finite(options.position.y,0)+FOCUS_HEIGHT,finite(options.position.z,0));
  const target=position.clone();
  if(options.attention){
   const attention=new Vector3(finite(options.attention.x,position.x)-position.x,0,finite(options.attention.z,position.z)-position.z);
   attention.multiplyScalar(.35).clampLength(0,2.5);target.add(attention);
  }
  const {bounds}=options;
  const minX=finite(bounds.minX,-5.5),maxX=finite(bounds.maxX,5.5),minZ=finite(bounds.minZ,-5.5),maxZ=finite(bounds.maxZ,5.5);
  target.x=clampFocus(target.x,minX,maxX);target.z=clampFocus(target.z,minZ,maxZ);
  const zoom=MathUtils.clamp(finite(options.attention?.zoom,1),.85,1.2);
  const span=(options.mode==='overview'?14:10)/zoom;
  const alpha=this.initialized?1-Math.exp(-8*MathUtils.clamp(finite(options.dt,0),0,.1)):1;
  this.focus.lerp(target,alpha);this.span+=(span-this.span)*alpha;
  // Bounds can shrink after a layout change; never leave the current focus outside them.
  this.focus.x=clampFocus(this.focus.x,minX,maxX);this.focus.z=clampFocus(this.focus.z,minZ,maxZ);
  const camera=this.camera;
  camera.left=-this.span/2;camera.right=this.span/2;camera.top=this.span/aspect/2;camera.bottom=-camera.top;
  camera.position.copy(this.focus).add(OFFSET);camera.lookAt(this.focus);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();this.initialized=true;
  return camera;
 }
}

/** Joystick convention: dx+ is screen-right, dz+ is screen-down.
 * Diagonals retain the same ground speed as cardinal input.
 */
export function screenMovement(camera:Camera,dx:number,dz:number):{x:number;z:number}{
 const x=finite(dx,0),z=finite(dz,0);if(!x&&!z)return {x:0,z:0};
 const forward=camera.getWorldDirection(new Vector3()),foreshortening=Math.max(.1,Math.abs(forward.y));forward.y=0;
 if(forward.lengthSq()<1e-8)forward.set(-Math.SQRT1_2,0,-Math.SQRT1_2);
 forward.normalize();const right=new Vector3(-forward.z,0,forward.x);
 const movement=right.multiplyScalar(x).addScaledVector(forward,-z/foreshortening).normalize();
 return {x:movement.x,z:movement.z};
}
