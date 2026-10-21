import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { createFestivalBuilderAvatar } from '../lib/festival-builder-avatar.ts';
import { createFestivalCelebrationAvatar } from '../src/desert/celebration-avatar.ts';
import { UPLOADED_CAST, uploadedTemplate } from './helpers/uploaded-avatar.ts';
async function anchorModule(){const result=await import('../src/desert/avatar-head-anchor.ts').catch(()=>null);assert.ok(result,'festival real-head anchor exists');return result;}
for(const kind of UPLOADED_CAST)test(`${kind}: doubled cast label follows real head and keeps a fixed world gap`,async()=>{
 const {createFestivalAvatarHeadAnchor}=await anchorModule();
 const avatar=createClubAvatar(kind,'head-anchor',{mode:'desert',template:await uploadedTemplate(kind)});avatar.root.scale.setScalar(4);avatar.root.position.set(12,0,-16);
 const anchor=createFestivalAvatarHeadAnchor(avatar),builder=createFestivalBuilderAvatar(avatar),cheer=createFestivalCelebrationAvatar(avatar,kind),point=new THREE.Vector3();
 try{for(const pose of ['idle','walk','build','cheer','wave'] as const){
  builder.update(null);cheer.update(null);avatar.update(2.4,pose==='wave'?'wave':'dance',false,pose==='wave'?.55:0,pose==='walk'?{slot:0,x:12,z:-16,heading:.8,speed:21,distance:1.7,walkBlend:1,action:'dance',sampleAtDistance:d=>({x:12+Math.sin(.8)*(d-1.7),z:-16+Math.cos(.8)*(d-1.7),heading:.8})}:undefined);
  if(pose==='build')builder.update(1);if(pose==='cheer')cheer.update(2.4);const target=anchor.update(new THREE.Vector3());let top=-Infinity;
  avatar.root.traverse(node=>{if(!(node instanceof THREE.SkinnedMesh))return;node.skeleton.update();const ids=node.geometry.attributes.skinIndex,w=node.geometry.attributes.skinWeight;
   for(let i=0;i<w.count;i++){let head=0;for(let c=0;c<4;c++)if(['head','neck'].includes(node.skeleton.bones[ids.getComponent(i,c)].name))head+=w.getComponent(i,c);if(head<.5)continue;node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);top=Math.max(top,point.y);}
  });
  const head=avatar.root.getObjectByName('head')!.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(target.x-head.x)<1e-6&&Math.abs(target.z-head.z)<1e-6,'follows actual head in horizontal space');
  assert.ok(target.y>=top+.349,`${pose}: no head overlap; gap=${target.y-top}`);assert.ok(target.y<top+1.25,`${pose}: avoids oversized estimated-head padding; gap=${target.y-top}`);
  if(pose==='idle')assert.ok(Math.abs(target.y-top-.35)<.02,`constant rest head gap ${target.y-top}`);
 }}finally{cheer.dispose();builder.dispose();avatar.dispose();}
});

test('a late cow initializes its real head envelope after loading instead of retaining fallback height',async()=>{
 const {createFestivalAvatarHeadAnchor}=await anchorModule();const source=await uploadedTemplate('niulai');let resolve!:(value:THREE.Group)=>void;
 const late=createClubAvatar('niulai','late-head',{mode:'desert',template:new Promise<THREE.Group>(done=>resolve=done)}),ready=createClubAvatar('niulai','late-head',{mode:'desert',template:source});
 const anchors=[late,ready].map(createFestivalAvatarHeadAnchor);[late,ready].forEach(a=>{a.root.scale.setScalar(4);a.root.position.set(12,0,-16);});
 const fallback=anchors[0].update(new THREE.Vector3());assert.ok(fallback.toArray().every(Number.isFinite));resolve(source);await late.ready;
 [late,ready].forEach(a=>a.update(2,'wave',false,.55));assert.ok(anchors[0].update(new THREE.Vector3()).distanceTo(anchors[1].update(new THREE.Vector3()))<1e-8);late.dispose();ready.dispose();
});
