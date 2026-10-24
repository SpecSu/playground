import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import * as THREE from 'three';
import {createClubAvatar} from '../src/avatars/club-avatar-rig.ts';import {FarmAvatarPose,farmLocomotion,refreshPose} from '../src/minimal/avatar-pose.ts';import {createFarmAnimal} from '../src/minimal/animal-art.ts';
async function fixture(){const bytes=readFileSync(new URL('../public/avatars/cast-v1/human-lx.glb',import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:'NO_TEST_IMAGE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const avatar=createClubAvatar('human-lx','minimal-player',{template:gltf.scene});await avatar.ready;const nav=new THREE.Group();nav.add(avatar.root);avatar.root.scale.setScalar(.65);return {avatar,nav,pose:new FarmAvatarPose(avatar.root)};}
/** Independent mesh-vertex inspection. Deliberately does not use the helper's cached feet/head/bounds. */
function vertices(root:THREE.Object3D,visit:(v:THREE.Vector3,node:THREE.Mesh,index:number)=>void){root.updateMatrixWorld(true);root.traverseVisible(o=>{if(!(o instanceof THREE.Mesh))return;if(o instanceof THREE.SkinnedMesh)o.skeleton.update();const v=new THREE.Vector3();for(let i=0;i<o.geometry.getAttribute('position').count;i++){o.getVertexPosition(i,v);visit(v.applyMatrix4(o.matrixWorld),o,i);}});}
test('all species rest their belly on the head, with small-scale folded legs clear of LX skin',async()=>{
 const {avatar,nav,pose}=await fixture();
 try{for(const species of ['cow','sheep','pig','bunny'] as const)for(const scale of [.6,.75]){
  const art=createFarmAnimal(species,'female');art.root.scale.setScalar(scale);
  try{for(let i=0;i<2;i++){
   nav.position.set(2,.15+i*.07,-2);nav.rotation.y=i*.8;avatar.root.position.y=0;
   avatar.update(i*.3,'dance',false,.15,farmLocomotion(nav,2,i*.07));pose.ground(()=>nav.position.y);
   const hands=['L','R'].map(side=>avatar.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3()));
   art.update({time:i,speed:0,distance:0,activity:'idle',carried:true});pose.carry(art.root,nav.rotation.y);
   let headTop=-Infinity;const skin:THREE.Vector3[]=[];
   vertices(avatar.root,(v,node,index)=>{if(!(node instanceof THREE.SkinnedMesh))return;skin.push(v.clone());const si=node.geometry.getAttribute('skinIndex'),sw=node.geometry.getAttribute('skinWeight');let weight=0;for(let k=0;k<4;k++)if(node.skeleton.bones[si.getComponent(index,k)]?.name==='head')weight+=sw.getComponent(index,k);if(weight>.35)headTop=Math.max(headTop,v.y);});
   const anchor=art.root.getObjectByName('animal-support');assert.ok(anchor,`${species} requires anatomical support`);
   const gap=anchor.getWorldPosition(new THREE.Vector3()).y-headTop;
   assert.ok(gap>=.008&&gap<.025,`${species} ${scale} belly contact gap ${gap}`);
   const support=anchor.getWorldPosition(new THREE.Vector3()),meshes:THREE.Mesh[]=[];art.root.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});const ray=new THREE.Raycaster(new THREE.Vector3(support.x,headTop-.01,support.z),new THREE.Vector3(0,1,0));const underside=ray.intersectObjects(meshes,false)[0];assert.ok(underside,`${species} has real belly above support`);assert.ok(underside.point.y-headTop>=-.002&&underside.point.y-headTop<.065,`${species} ${scale} actual belly gap ${underside.point.y-headTop}`);
   // Test each actual ellipsoid/capsule volume against independent deformed LX skin.
   // Legs may overlap the head's AABB but must stay outside the head/arm/torso surface.
   art.root.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;const g=node.geometry;if(!(g instanceof THREE.SphereGeometry)&&!(g instanceof THREE.CapsuleGeometry))return;const inverse=node.matrixWorld.clone().invert(),v=new THREE.Vector3();let penetrating=0;for(const point of skin){v.copy(point).applyMatrix4(inverse);if(g instanceof THREE.CapsuleGeometry)v.y-=THREE.MathUtils.clamp(v.y,-g.parameters.height/2,g.parameters.height/2);if(v.length()<g.parameters.radius*.97)penetrating++;}assert.equal(penetrating,0,`${species} ${scale} ${node.name||g.type} penetrates ${penetrating} LX skin vertices`);});
   for(let side=0;side<2;side++){const hand=avatar.root.getObjectByName(`hand_${side?'R':'L'}`)!.getWorldPosition(new THREE.Vector3());assert.ok(hand.y>hands[side].y+.15,'both hands visibly raised');}
  }}finally{art.dispose();}
 }}finally{avatar.dispose();}
});

test('real baby cow folds its skinned hooves above the head support and restores grounded hooves on release',async()=>{
 const original=GLTFLoader.prototype.loadAsync;
 GLTFLoader.prototype.loadAsync=async()=>{const bytes=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
 const art=createFarmAnimal('cow','female',{skeletalCow:true});
 try{
  assert.equal(await art.root.userData.animationReady,true);art.root.scale.setScalar(.6);
  const idle={time:0,speed:0,distance:0,activity:'idle'};
  art.update(idle);refreshPose(art.root);const grounded=new Map<string,THREE.Vector3[]>();
  const hooves=['front_L','front_R','back_L','back_R'].map(tag=>art.root.getObjectByName(`cloven_hoof_${tag}`)!);
  for(const hoof of hooves){const points:THREE.Vector3[]=[];vertices(hoof,v=>points.push(v.clone()));grounded.set(hoof.name,points);}
  for(let i=0;i<20;i++)art.update({...idle,time:i/60,activity:'drink',drinkPhase:.5});
  art.update({...idle,time:20/60,carried:true});refreshPose(art.root);
  const support=art.root.getObjectByName('animal-support')!.getWorldPosition(new THREE.Vector3());
  for(const hoof of hooves){let minY=Infinity;vertices(hoof,v=>minY=Math.min(minY,v.y));assert.ok(minY>support.y,`${hoof.name} must curl clear of the support plane: ${minY} <= ${support.y}`);}
  for(let i=21;i<50;i++)art.update({...idle,time:i/60});refreshPose(art.root);
  for(const hoof of hooves)vertices(hoof,(v,_mesh,i)=>assert.ok(v.distanceTo(grounded.get(hoof.name)![i])<1e-6,'release restores authored planted hooves, without accumulating carry rotation'));
 }finally{art.dispose();GLTFLoader.prototype.loadAsync=original;}
});
