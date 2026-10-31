import * as THREE from 'three';
import {refreshPose} from '../src/minimal/avatar-pose.ts';
/** Semantic mesh inspection survives same-material batching: select the actual
 * rigid hoof vertices from the skin weights, never an empty marker or AABB. */
export function rigidBoneVertices(root:THREE.Object3D,boneName:string,visit:(position:THREE.Vector3,index:number)=>void){
 refreshPose(root);let count=0;
 root.traverseVisible(node=>{if(!(node instanceof THREE.SkinnedMesh))return;const indices=node.geometry.getAttribute('skinIndex'),weights=node.geometry.getAttribute('skinWeight'),v=new THREE.Vector3();
  for(let i=0;i<indices.count;i++){let influence=0;for(let j=0;j<4;j++)if(node.skeleton.bones[indices.getComponent(i,j)]?.name===boneName)influence+=weights.getComponent(i,j);if(influence>.999){node.getVertexPosition(i,v);visit(v.applyMatrix4(node.matrixWorld),count++);}}
 });
 if(!count)throw new Error(`No actual skinned vertices for ${boneName}`);
 return count;
}
