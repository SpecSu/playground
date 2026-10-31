import * as THREE from 'three';
/** Exact low skinned vertices only (not every full mesh each frame). The set is
 * selected once from the actual posed sole band; full-skin transition tests
 * independently prove it bounds each admitted clip/transition. No bone changes. */
export function createLunarFloorContact(root:THREE.Group,scale:number){
 const probes:{mesh:THREE.SkinnedMesh;index:number}[]=[],point=new THREE.Vector3(),meshes=new Map<string,THREE.SkinnedMesh>();root.updateMatrixWorld(true);
 root.traverse(mesh=>{if(!(mesh instanceof THREE.SkinnedMesh))return;meshes.set(mesh.name,mesh);for(let index=0;index<mesh.geometry.getAttribute('position').count;index++){mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);if(point.y-root.position.y<=.04*scale)probes.push({mesh,index});}});
 if(!probes.length||probes.length>5000)throw new Error('Lunar sole contact budget unavailable');
 return {probeCount:probes.length,correct(ground:(p:THREE.Vector3)=>number,extra?:{mesh:string;vertices:readonly number[]}){root.updateMatrixWorld(true);let lift=0;for(const {mesh,index}of probes){mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);lift=Math.max(lift,ground(point)-point.y);}if(extra){const mesh=meshes.get(extra.mesh);if(mesh)for(const index of extra.vertices){mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);lift=Math.max(lift,ground(point)-point.y);}}if(lift>0){root.position.y+=lift;root.updateMatrixWorld(true);}return lift;}};
}
