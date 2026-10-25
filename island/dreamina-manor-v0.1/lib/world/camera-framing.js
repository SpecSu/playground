import * as THREE from 'three';

// An orthographic screen-space deadzone: only the out-of-bounds portion moves
// the framing centre. Both camera and pivot translate, never yaw/zoom.
export function deadzoneTranslation(camera,point,half=.5){
 camera.updateMatrixWorld(true);
 const screen=point.clone().project(camera),ex=screen.x-THREE.MathUtils.clamp(screen.x,-half,half),ey=screen.y-THREE.MathUtils.clamp(screen.y,-half,half);
 if(Math.abs(ex)+Math.abs(ey)<1e-10)return new THREE.Vector3();
 const m=camera.matrixWorld.elements,p=camera.projectionMatrix.elements;
 const rx=m[0],rz=m[2],ux=m[4],uz=m[6],det=rx*uz-rz*ux;
 if(Math.abs(det)<1e-6)return new THREE.Vector3();
 const sx=ex/p[0],sy=ey/p[5];
 return new THREE.Vector3((sx*uz-rz*sy)/det,0,(rx*sy-sx*ux)/det);
}
export function islandFramingCentre(cells,cellSize=3.2){
 if(!cells.length)return new THREE.Vector3(0,.75,0);
 const xs=cells.map(c=>c.x),zs=cells.map(c=>c.z);
 return new THREE.Vector3((Math.min(...xs)+Math.max(...xs))*cellSize/2,.75,(Math.min(...zs)+Math.max(...zs))*cellSize/2);
}
export function createIslandFraming(camera,target){
 let owner=null,manual=false,resumeAt=-Infinity;
 const translate=d=>{camera.position.add(d);target.add(d);camera.updateMatrixWorld(true);};
 return {
  enter(uid,cells,cellSize=3.2){if(uid===owner)return false;owner=uid;manual=false;resumeAt=-Infinity;translate(islandFramingCentre(cells,cellSize).sub(target));return true;},
  beginGesture(){manual=true;},
  endGesture(now){manual=false;resumeAt=now+180;},
  step(point,dt,now){if(manual||now<resumeAt)return new THREE.Vector3();const ramp=Math.min(1,Math.max(0,(now-resumeAt)/500)),alpha=(1-Math.exp(-Math.max(0,dt)*4))*ramp,d=deadzoneTranslation(camera,point).multiplyScalar(alpha);translate(d);return d;}
 };
}
