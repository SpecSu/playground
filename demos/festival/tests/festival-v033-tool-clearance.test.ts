import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { createFestivalBuilderAvatar } from '../lib/festival-builder-avatar.ts';
import { UPLOADED_CAST, uploadedTemplate } from './helpers/uploaded-avatar.ts';
const directions=[new THREE.Vector3(.989,.137,.061).normalize(),new THREE.Vector3(.127,.971,.191).normalize(),new THREE.Vector3(.073,.173,.982).normalize()];
const ray=new THREE.Raycaster();
function insideBody(point:THREE.Vector3,meshes:THREE.SkinnedMesh[]){
 let votes=0;
 for(const direction of directions){ray.set(point,direction);const hits=ray.intersectObjects(meshes,false).filter((hit,i,all)=>i===0||Math.abs(hit.distance-all[i-1].distance)>.0001);if(hits.length%2===1)votes++;}
 return votes>=2;
}
for(const kind of UPLOADED_CAST)test(`${kind}: construction hammer head and upper handle stay outside actual body skin`,async()=>{
 const avatar=createClubAvatar(kind,`tool:${kind}`,{mode:'desert',template:await uploadedTemplate(kind)}),builder=createFestivalBuilderAvatar(avatar);avatar.root.scale.setScalar(4);
 try{for(const t of [.9,1,1.25,1.5]){
  avatar.update(t,'dance',false,0);builder.update(t);avatar.root.updateMatrixWorld(true);
  const bodies:THREE.SkinnedMesh[]=[];
  avatar.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh){node.skeleton.update();node.computeBoundingBox();node.computeBoundingSphere();for(const mat of Array.isArray(node.material)?node.material:[node.material])mat.side=THREE.DoubleSide;bodies.push(node);}});
  const head=avatar.root.getObjectByName('festival-builder-hammer-head') as THREE.Mesh,hammer=head.parent!,length=head.position.y/.84;
  const samples=[head.getWorldPosition(new THREE.Vector3()),...Array.from({length:8},(_,i)=>head.localToWorld(new THREE.Vector3(i&1?length*.285:-length*.285,i&2?length*.12:-length*.12,i&4?length*.135:-length*.135))),... [.35,.55,.75].map(f=>hammer.localToWorld(new THREE.Vector3(0,length*f,0)))];
  samples.forEach((point,i)=>assert.equal(insideBody(point,bodies),false,`${kind}/${t}: tool sample ${i} enters body at ${point.toArray()}`));
 }}finally{builder.dispose();avatar.dispose();}
});

test('sword-shield dog keeps its original blade separate from the added construction hammer head',async()=>{
 const avatar=createClubAvatar('sword-shield-dog','separate-tools',{mode:'desert',template:await uploadedTemplate('sword-shield-dog')}),builder=createFestivalBuilderAvatar(avatar);avatar.root.scale.setScalar(4);
 try{for(const t of [1,1.6]){
  avatar.update(t,'dance',false,0);builder.update(t);avatar.root.updateMatrixWorld(true);const bodies:THREE.SkinnedMesh[]=[];
  avatar.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh){node.skeleton.update();node.computeBoundingBox();node.computeBoundingSphere();for(const mat of Array.isArray(node.material)?node.material:[node.material])mat.side=THREE.DoubleSide;bodies.push(node);}});
  const head=avatar.root.getObjectByName('festival-builder-hammer-head') as THREE.Mesh,length=head.position.y/.84;
  const corners=Array.from({length:8},(_,i)=>head.localToWorld(new THREE.Vector3(i&1?length*.285:-length*.285,i&2?length*.12:-length*.12,i&4?length*.135:-length*.135)));
  for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)if([1,2,4].includes(a^b)){
   const delta=new THREE.Vector3().subVectors(corners[b],corners[a]);ray.set(corners[a],delta.clone().normalize());ray.near=.0001;ray.far=delta.length()-.0001;
   assert.equal(ray.intersectObjects(bodies,false).length,0,`dog/${t}: blade crosses hammer-head edge ${a}-${b}`);
  }
 }}finally{ray.near=0;ray.far=Infinity;builder.dispose();avatar.dispose();}
});
