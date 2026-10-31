import type {LegacySpecies as FarmSpecies} from '../src/minimal/species.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createClubAvatar} from '../src/avatars/club-avatar-rig.ts';
import {FarmAvatarPose,farmLocomotion,refreshPose} from '../src/minimal/avatar-pose.ts';
import {createFarmAnimal} from '../src/minimal/animal-art.ts';
import {ANIMAL_ASSETS,AnimalAssetLibrary} from '../src/minimal/animal-assets.ts';
import {vertices,deformedMeshes} from './v16-qa-geometry.ts';
import {firstPenetration} from './v16-qa-clearance.ts';

async function asset(url:string,skipTextures=false){const bytes=readFileSync(new URL(`../public${url}`,import.meta.url)),loader=new GLTFLoader();if(skipTextures)loader.register(()=>({name:'QA_SKIP_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const species=(process.env.FARM_QA_SPECIES?.split(',')??['cow','sheep','pig','bunny','duck']) as FarmSpecies[];
const scales=process.env.FARM_QA_SCALE?[Number(process.env.FARM_QA_SCALE)]:[.6,.75,1,2.2];
const waters=process.env.FARM_QA_WATER?[Number(process.env.FARM_QA_WATER)]:[.177,.009];
const frameStep=1/(Number(process.env.FARM_QA_HZ)||60),lastFrame=Math.ceil(.2/frameStep)+1;
const library=new AnimalAssetLibrary(url=>asset(url));
const worldPosition=(node:THREE.Object3D)=>node.getWorldPosition(new THREE.Vector3());

test('V16 active ground-zero water IK releases into genuine carry without LX skin penetration or a neck snap',async t=>{
 const gltf=await asset('/avatars/cast-v1/human-lx.glb',true),avatar=createClubAvatar('human-lx','qa-explicit-water-carry',{template:gltf.scene});await avatar.ready;
 const nav=new THREE.Group();nav.add(avatar.root);avatar.root.scale.setScalar(.65);const pose=new FarmAvatarPose(avatar.root);
 let maximumFirstMouthStep=0,maximumFirstNeckAngle=0,geometrySamples=0;
 try{
  for(const kind of species)for(const scale of scales)for(const waterY of waters)await t.test(`${kind} ${scale} ${waterY===.177?'bowl':'pond'}`,async()=>{
   const art=createFarmAnimal(kind,'female',{skeletal:true,assets:library});
   try{
    assert.equal(await art.root.userData.animationReady,true);assert.equal(art.root.userData.animationSource,'blender-skinned');art.root.scale.setScalar(scale);art.root.position.set(0,0,0);
    const waterContact={x:0,y:waterY/scale,z:ANIMAL_ASSETS[kind].muzzleReach+Number(process.env.FARM_QA_CONTACT_OFFSET??0)};let time=0;
    for(let frame=0;frame<75;frame++){time+=1/60;art.update({time,speed:0,distance:0,activity:'drink',drinkPhase:.5,waterContact});}
    refreshPose(art.root);const scene=art.root.getObjectByName(`blender-skinned-${kind}`)!;assert.equal(scene.userData.contactIK?.reachable,true,'the setup must really exercise active rotational water IK');
    assert.equal(art.root.position.y,0,'water contact must not be faked by raising the animal root');const target=art.root.localToWorld(new THREE.Vector3(waterContact.x,waterContact.y,waterContact.z));assert.ok(worldPosition(art.mouth).distanceTo(target)<.015);
    const bones=['neck_01','neck_02','head'].map(name=>art.root.getObjectByName(`${kind}_${name}`)!);assert.ok(bones.every(Boolean));
    const originalLengths=[worldPosition(bones[0]).distanceTo(worldPosition(bones[1])),worldPosition(bones[1]).distanceTo(worldPosition(bones[2]))];
    const originalScales=new Map<string,THREE.Vector3>();art.root.traverse(node=>{if(node instanceof THREE.Bone)originalScales.set(node.uuid,node.scale.clone());});
    const beforeMouth=art.root.worldToLocal(worldPosition(art.mouth)),beforeRotations=bones.map(b=>b.quaternion.clone());
    art.update({time,speed:0,distance:0,activity:'carried',carried:true});refreshPose(art.root);
    assert.ok(art.root.worldToLocal(worldPosition(art.mouth)).distanceTo(beforeMouth)<1e-6,'the zero-time action boundary preserves the solved mouth exactly, rather than teleporting to the low-water authored pose');
    const collisions:unknown[]=[];
    for(let frame=0;frame<=lastFrame;frame++){
     if(frame>0){time+=frameStep;art.update({time,speed:0,distance:0,activity:'carried',carried:true});refreshPose(art.root);}
     if(frame===1){
      const mouthStep=art.root.worldToLocal(worldPosition(art.mouth)).distanceTo(beforeMouth)*scale;maximumFirstMouthStep=Math.max(maximumFirstMouthStep,mouthStep);
      bones.forEach((bone,i)=>{const angle=THREE.MathUtils.radToDeg(bone.quaternion.angleTo(beforeRotations[i]));maximumFirstNeckAngle=Math.max(maximumFirstNeckAngle,angle);assert.ok(angle<3,`${kind}: first neck step ${angle} degrees`);});
     }
     // Exported float32 limb-scale tracks differ from one by up to 8e-7; preserve
     // a numerical tolerance, not a fictitious exact-one requirement on authored clips.
     art.root.traverse(node=>{if(!(node instanceof THREE.Bone))return;assert.ok([...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()].every(Number.isFinite));assert.ok(node.scale.distanceTo(originalScales.get(node.uuid)!)<3e-6,'the interruption cannot stretch bone scales');});
     const lengths=[worldPosition(bones[0]).distanceTo(worldPosition(bones[1])),worldPosition(bones[1]).distanceTo(worldPosition(bones[2]))];lengths.forEach((length,i)=>assert.ok(Math.abs(length-originalLengths[i])<1e-6,`${kind}: neck segment length changed`));
     avatar.update(time,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);pose.carry(art.root,0);
     const support=worldPosition(art.root.getObjectByName('animal-support')!),headTop=pose.headBounds().max.y;assert.ok(Math.abs(support.y-headTop-.018)<1e-6,'support is on the actual posed LX head');
     // The exact boundary, first 60-Hz frame, middle and end of the additive fade
     // use every real LX vertex. Dense mode additionally checks every fade frame.
     if(!process.env.FARM_QA_DENSE&&frame!==0&&frame!==1&&frame!==Math.floor(lastFrame/2)&&frame!==lastFrame)continue;
     const points:THREE.Vector3[]=[];vertices(avatar.root,(p,node)=>{if(node instanceof THREE.SkinnedMesh)points.push(p.clone());});assert.ok(points.length>1000);
     const snapshot=deformedMeshes(art.root);
     try{
      const hit=firstPenetration(points,snapshot.meshes);if(hit.count)collisions.push({frame,elapsedMs:frame*frameStep*1000,parts:hit.parts,localPoints:hit.locations.map(p=>art.root.worldToLocal(p.clone()).toArray())});
      const belly=new THREE.Raycaster(new THREE.Vector3(support.x,headTop-.03,support.z),new THREE.Vector3(0,1,0)).intersectObjects(snapshot.meshes,false)[0];assert.ok(belly,'actual deformed belly must cover the support datum');assert.ok(belly.point.y-headTop>=-.002&&belly.point.y-headTop<.065,`${kind}: visible belly gap ${belly.point.y-headTop}`);geometrySamples++;
     }finally{snapshot.dispose();}
    }
    assert.deepEqual(collisions,[],`${kind}/${scale}/${waterY}: real LX skin enters the animal during incoming carry: ${JSON.stringify(collisions)}`);
    assert.equal(scene.userData.contactIK,undefined,'released pose does not retain a false active-water-contact claim');
   }finally{art.dispose();}
  });
  t.diagnostic(JSON.stringify({geometrySamples,maximumFirstMouthStep,maximumFirstNeckAngle}));
 }finally{avatar.dispose();}
});
