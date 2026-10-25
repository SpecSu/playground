import * as THREE from'three';
/** Orbit pivot and screen composition are independent. Pan changes projection,
 * never a destination or an authority coordinate. */
export function createCharacterFraming(camera,target){
 let owner=null,lastPivot=null,width=1,height=1,tray=0;const pan=new THREE.Vector2();
 const project=()=>{camera.setViewOffset(width,height,pan.x*width/2,Math.max(0,(tray-80)/2)+pan.y*height/2,width,height);camera.updateProjectionMatrix();};
 return{
  enter(uid){if(uid===owner)return false;owner=uid;lastPivot=null;return true;},
  suspend(){lastPivot=null;},beginGesture(){},endGesture(){},
  resize(w,h,t=tray){width=w;height=h;tray=t;project();},
  setOffset(value){pan.copy(value);lastPivot=null;project();},
  panPixels(dx,dy,w=width,h=height){pan.x-=2*dx/w;pan.y-=2*dy/h;project();},
  step(point){
   if(lastPivot){const delta=target.clone().sub(lastPivot);if(delta.lengthSq()>1e-16){camera.updateMatrixWorld(true);const m=camera.matrixWorld.elements,p=camera.projectionMatrix.elements;pan.x+=(delta.x*m[0]+delta.y*m[1]+delta.z*m[2])*p[0];pan.y-=(delta.x*m[4]+delta.y*m[5]+delta.z*m[6])*p[5];project();}}
   const delta=point.clone().sub(target);camera.position.add(delta);target.copy(point);lastPivot=point.clone();camera.updateMatrixWorld(true);return delta;
  },offset:()=>pan.clone()
 };
}
