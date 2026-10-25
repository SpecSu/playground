import * as THREE from 'three';
import {SHARED_CELL_SIZE,GROUND_TOP_Y,TANK_FLOOR_Y} from '../art/physical-contract.js';
import {tankWaterHeight} from '../game/tank-space.js';

/** Whole completed aquarium, never resident/fish bounds or construction cells.
 * Cell edges conservatively include plinth bevel and contact wash. The top
 * includes the rim above the water, not just the swimming volume. */
export function tankBounds(cells,{cellSize=SHARED_CELL_SIZE,groundY=GROUND_TOP_Y,waterHeight=tankWaterHeight(cells??[])}={}){
 if(!cells?.length)return null;
 if(!Number.isFinite(cellSize)||cellSize<=0||!Number.isFinite(groundY)||!Number.isFinite(waterHeight)||waterHeight<=0)throw new RangeError('Invalid aquarium dimensions');
 const bounds=new THREE.Box3();
 const floorY=groundY+TANK_FLOOR_Y-GROUND_TOP_Y;
 for(const cell of cells){
  if(!Number.isFinite(cell.x)||!Number.isFinite(cell.z))throw new RangeError('Invalid completed tank cell');
  bounds.expandByPoint(new THREE.Vector3((cell.x-.5)*cellSize,groundY-1e-6,(cell.z-.5)*cellSize));
  bounds.expandByPoint(new THREE.Vector3((cell.x+.5)*cellSize,floorY+waterHeight+.103,(cell.z+.5)*cellSize));
 }
 return {bounds,centre:bounds.getCenter(new THREE.Vector3())};
}

/** Pure fit for an orthographic camera that will orbit bounds' centre.
 * Preserve camera orientation and existing viewOffset (including tray shift).
 * Pixel padding is inside the visible rectangle above the tray. No lower zoom
 * clamp: a large aquarium must be allowed to fit below player-mode minZoom.
 * A projection pan outside the available rectangle must be reset by the caller.
 */
export function fitTankCamera(camera,bounds,{width,height,trayHeight=0,padding={left:16,right:16,top:80,bottom:12},maxZoom=8}={}){
 if(!camera?.isOrthographicCamera)throw new TypeError('Tank framing requires an orthographic camera');
 if(!bounds||bounds.isEmpty())throw new RangeError('Missing aquarium bounds');
 if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||!Number.isFinite(trayHeight)||trayHeight<0||!Number.isFinite(maxZoom)||maxZoom<=0)throw new RangeError('Invalid tank viewport');
 const pad=typeof padding==='number'?{left:padding,right:padding,top:padding,bottom:padding}:{left:16,right:16,top:80,bottom:12,...padding};
 if(Object.values(pad).some(n=>!Number.isFinite(n)||n<0))throw new RangeError('Invalid tank viewport padding');
 const left=2*pad.left/width-1,right=1-2*pad.right/width;
 const bottom=1-2*(height-trayHeight-pad.bottom)/height,top=1-2*pad.top/height;
 if(left>=right||bottom>=top)throw new RangeError('No visible tank viewport');
 const centre=bounds.getCenter(new THREE.Vector3());
 const axisX=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),axisY=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
 // Projection offsets are not necessarily symmetric. Sampling zoom 1 and 2
 // captures its affine zoom relationship, including non-centred frusta and
 // setViewOffset subviewports, without touching the live camera.
 const probe=camera.clone();probe.zoom=1;probe.updateProjectionMatrix();const p1=probe.projectionMatrix.elements.slice();
 probe.zoom=2;probe.updateProjectionMatrix();const p2=probe.projectionMatrix.elements;
 let lower=0,upper=maxZoom;
 function constrain(slope,intercept,min,max){
  if(Math.abs(slope)<1e-12){if(intercept<min||intercept>max)upper=-1;return;}
  const a=(min-intercept)/slope,b=(max-intercept)/slope;
  lower=Math.max(lower,Math.min(a,b));upper=Math.min(upper,Math.max(a,b));
 }
 for(let i=0;i<8;i++){
  const delta=new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).sub(centre);
  constrain(delta.dot(axisX)*p1[0]+p2[12]-p1[12],2*p1[12]-p2[12],left,right);
  constrain(delta.dot(axisY)*p1[5]+p2[13]-p1[13],2*p1[13]-p2[13],bottom,top);
 }
 if(!Number.isFinite(upper)||upper<=0||upper<lower)throw new RangeError('Tank pivot is outside the available viewport; reset projection pan before fitting');
 return {centre,zoom:upper};
}
