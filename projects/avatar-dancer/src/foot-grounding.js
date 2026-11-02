import * as THREE from 'three';

// A bounded sample of actual skinned shoe/foot vertices, not a hard-coded ankle
// height. Apply after horizontal root locking; it only lifts penetrations and
// leaves authored jumps and root/hip rotations intact.
export function createFootGrounding(root,{floor=.003,maxSamplesPerMesh=1024}={}){
 const samples=[],point=new THREE.Vector3();let lastLift=0,maxLift=0;
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  if(!indices||!weights)return;
  const footBones=new Set(mesh.skeleton.bones.map((bone,index)=>/Foot$|ToeBase$|Toes$/i.test(bone.name)?index:-1).filter(i=>i>=0));
  const candidates=[];
  for(let vertex=0;vertex<indices.count;vertex++){
   let weight=0;for(let slot=0;slot<4;slot++)if(footBones.has(indices.getComponent(vertex,slot)))weight+=weights.getComponent(vertex,slot);
   if(weight>.45)candidates.push(vertex);
  }
  const stride=Math.max(1,Math.ceil(candidates.length/maxSamplesPerMesh));
  const selected=candidates.filter((_,i)=>i%stride===0);if(selected.length)samples.push({mesh,vertices:selected});
 });
 return {apply(){
  lastLift=0;if(!samples.length)return;
  root.updateMatrixWorld(true);let minimum=Infinity;
  for(const {mesh,vertices} of samples){mesh.skeleton.update();for(const vertex of vertices){mesh.getVertexPosition(vertex,point);point.applyMatrix4(mesh.matrixWorld);minimum=Math.min(minimum,point.y);}}
  if(minimum<floor){lastLift=Math.min(.18,floor-minimum);root.position.y+=lastLift;root.updateMatrixWorld(true);maxLift=Math.max(maxLift,lastLift);}
 },getDiagnostics(){return {samples:samples.reduce((sum,x)=>sum+x.vertices.length,0),lastLift,maxLift}}};
}
