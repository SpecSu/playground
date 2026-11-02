import * as THREE from 'three';
/** Moving along an orthographic view ray changes clipping, never framing or zoom. */
export function ensureWaterViewCoverage(camera,target,waterY){
 camera.updateMatrixWorld();const direction=camera.getWorldDirection(new THREE.Vector3());if(direction.y>=-.02)return;
 let low=Infinity;for(const x of[-1,1])for(const y of[-1,1])low=Math.min(low,new THREE.Vector3(x,y,-1).unproject(camera).y);
 if(low<waterY+.5){const distance=(waterY+.5-low)/-direction.y;camera.position.addScaledVector(direction,-distance);camera.updateMatrixWorld();}
 const range=camera.position.distanceTo(target);if(camera.far<range+300){camera.far=range+300;camera.updateProjectionMatrix();}
}
