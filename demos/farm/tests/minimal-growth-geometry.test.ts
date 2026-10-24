import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createClubAvatar} from '../src/avatars/club-avatar-rig.ts';
import {FarmAvatarPose,farmLocomotion,refreshPose} from '../src/minimal/avatar-pose.ts';
import {createFarmAnimal,type FarmSpecies} from '../src/minimal/animal-art.ts';
import {animalScale,createAnimalGrowth,animalGrowthStage} from '../src/minimal/animal-growth.ts';

const scales=process.env.FARM_QA_DENSE?[.6,.65,.7,.75,.8,.85,.9,.95,1,1.6,2.2]:process.env.FARM_QA_QUICK?[.6]:[.6,.75,.8,1,1.6,2.2];
const species:FarmSpecies[]=process.env.FARM_QA_QUICK||process.env.FARM_QA_COW_ONLY?['cow']:['cow','sheep','pig','bunny'];
const idle={time:0,speed:0,distance:0,activity:'idle'};
async function glb(path:string,skipTextures=false){
 const bytes=readFileSync(new URL(path,import.meta.url));
 const loader=new GLTFLoader();
 if(skipTextures)loader.register(()=>({name:'NO_QA_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
async function avatarFixture(){
 const gltf=await glb('../public/avatars/cast-v1/human-lx.glb',true);
 const avatar=createClubAvatar('human-lx','growth-contact-qa',{template:gltf.scene});await avatar.ready;
 const nav=new THREE.Group();nav.add(avatar.root);avatar.root.scale.setScalar(.65);
 return {avatar,nav,pose:new FarmAvatarPose(avatar.root)};
}
async function animalFixture(animal:FarmSpecies,skeletal:boolean){
 const original=GLTFLoader.prototype.loadAsync;
 GLTFLoader.prototype.loadAsync=async()=>glb('../public/models/farm/cow-animated.glb');
 try{
  const art=createFarmAnimal(animal,'female',{skeletalCow:skeletal});
  if(skeletal)assert.equal(await art.root.userData.animationReady,true,'the real authored cow must load');
  return art;
 }finally{GLTFLoader.prototype.loadAsync=original;}
}
/** Inspect every posed vertex, not Box3's bind-pose approximation or runtime contact probes. */
function vertices(root:THREE.Object3D,visit:(v:THREE.Vector3,node:THREE.Mesh,index:number)=>void){
 refreshPose(root);
 root.traverseVisible(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const v=new THREE.Vector3();
  for(let i=0;i<node.geometry.getAttribute('position').count;i++){
   node.getVertexPosition(i,v);visit(v.applyMatrix4(node.matrixWorld),node,i);
  }
 });
}
/** A static snapshot of deformed triangles lets the independent oracle raycast real skin. */
function deformedMeshes(root:THREE.Object3D){
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes:THREE.Mesh[]=[];
 refreshPose(root);
 root.traverseVisible(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(node.geometry.getAttribute('position').count*3),v=new THREE.Vector3();
  for(let i=0;i<positions.length/3;i++){node.getVertexPosition(i,v);v.applyMatrix4(node.matrixWorld).toArray(positions,i*3);}
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  if(node.geometry.index)geometry.setIndex(node.geometry.index.clone());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=node.name;meshes.push(mesh);
 });
 return {meshes,dispose(){meshes.forEach(m=>m.geometry.dispose());material.dispose();}};
}
/** Spatially binned +Y crossings inspect actual triangles without a vertex × triangle scan. */
function penetrationCount(points:THREE.Vector3[],meshes:THREE.Mesh[]){
 type Triangle={ax:number;az:number;ay:number;bx:number;bz:number;by:number;cx:number;cz:number;cy:number;inverse:number};
 const partitions=meshes.map(mesh=>{
  const bounds=mesh.geometry.boundingBox!,positions=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
  const width=Math.max(1e-6,bounds.max.x-bounds.min.x),depth=Math.max(1e-6,bounds.max.z-bounds.min.z),cells=32;
  const column=(x:number)=>Math.max(0,Math.min(cells-1,Math.floor((x-bounds.min.x)/width*cells)));
  const row=(z:number)=>Math.max(0,Math.min(cells-1,Math.floor((z-bounds.min.z)/depth*cells)));
  const bins:Array<Triangle[]>=Array.from({length:cells*cells},()=>[]);
  for(let i=0;i<(index?.count??positions.count);i+=3){
   const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2;
   const ax=positions.getX(ai),az=positions.getZ(ai),ay=positions.getY(ai),bx=positions.getX(bi)-ax,bz=positions.getZ(bi)-az,by=positions.getY(bi)-ay,cx=positions.getX(ci)-ax,cz=positions.getZ(ci)-az,cy=positions.getY(ci)-ay;
   const denominator=bx*cz-cx*bz;if(Math.abs(denominator)<1e-12)continue;
   const triangle={ax,az,ay,bx,bz,by,cx,cz,cy,inverse:1/denominator};
   const lowX=column(Math.min(ax,ax+bx,ax+cx)),highX=column(Math.max(ax,ax+bx,ax+cx)),lowZ=row(Math.min(az,az+bz,az+cz)),highZ=row(Math.max(az,az+bz,az+cz));
   for(let x=lowX;x<=highX;x++)for(let z=lowZ;z<=highZ;z++)bins[x+z*cells].push(triangle);
  }
  return {name:mesh.name,bounds,column,row,cells,bins,source:mesh};
 });
 const ray=new THREE.Raycaster(),direction=new THREE.Vector3(.8347,.3921,.3869).normalize();
 let count=0;const parts=new Map<string,number>(),locations:THREE.Vector3[]=[];
 for(const point of points)for(const mesh of partitions){
  if(!mesh.bounds.containsPoint(point))continue;
  const distances:number[]=[];
  for(const q of mesh.bins[mesh.column(point.x)+mesh.row(point.z)*mesh.cells]){
   const x=point.x-q.ax,z=point.z-q.az,u=(x*q.cz-q.cx*z)*q.inverse,v=(q.bx*z-x*q.bz)*q.inverse;
   if(u< -1e-10||v< -1e-10||u+v>1+1e-10)continue;
   const distance=q.ay+u*q.by+v*q.cy-point.y;if(distance>=0)distances.push(distance);
  }
  distances.sort((a,b)=>a-b);
  const unique=distances.filter((d,i,all)=>i===0||Math.abs(d-all[i-1])>1e-5);
  if(unique.length%2===1&&unique[0]>.003){
   // Independently confirm candidates on a non-axis ray to reject projection seam artifacts.
   ray.set(point,direction);const hits=ray.intersectObject(mesh.source,false);
   const other=hits.map(hit=>hit.distance).filter((d,i,all)=>i===0||Math.abs(d-all[i-1])>1e-5);
   if(other.length%2!==1||other[0]<=.003)continue;
   count++;locations.push(point.clone());parts.set(mesh.name,(parts.get(mesh.name)??0)+1);break;
  }
 }
 return {count,parts:Object.fromEntries(parts),locations};
}

test('growth-size carrying keeps actual belly contact and all deformed LX skin outside animal geometry',async t=>{
 const {avatar,nav,pose}=await avatarFixture();
 try{
  for(const animal of species)for(const skeletal of animal==='cow'?[false,true]:[false])for(const scale of scales){
   await t.test(`${skeletal?'skinned ':''}${animal} scale ${scale}`,async()=>{
    const art=await animalFixture(animal,skeletal);
    try{
     art.root.scale.setScalar(scale);
     for(const frame of [0,1]){
      const time=frame*.9;nav.position.set(2,.15+frame*.07,-2);nav.rotation.y=frame*.73;avatar.root.position.y=0;
      avatar.update(time,'dance',false,.15,farmLocomotion(nav,2,time*.25));pose.ground(()=>nav.position.y);
      for(let i=0;i<15;i++)art.update({...idle,time:time+i/60,carried:true});
      pose.carry(art.root,nav.rotation.y);
      let headTop=-Infinity;const skin:THREE.Vector3[]=[];
      vertices(avatar.root,(v,node,index)=>{
       if(!(node instanceof THREE.SkinnedMesh))return;skin.push(v.clone());
       const indices=node.geometry.getAttribute('skinIndex'),weights=node.geometry.getAttribute('skinWeight');
       let headWeight=0;for(let k=0;k<4;k++)if(node.skeleton.bones[indices.getComponent(index,k)]?.name==='head')headWeight+=weights.getComponent(index,k);
       if(headWeight>.35)headTop=Math.max(headTop,v.y);
      });
      const support=art.root.getObjectByName('animal-support')!.getWorldPosition(new THREE.Vector3());
      assert.ok(support.y-headTop>=.008&&support.y-headTop<.025,`support contact gap ${support.y-headTop}`);
      const snapshot=deformedMeshes(art.root);
      try{
       const ray=new THREE.Raycaster(new THREE.Vector3(support.x,headTop-.03,support.z),new THREE.Vector3(0,1,0));
       const belly=ray.intersectObjects(snapshot.meshes,false)[0];
       assert.ok(belly,'an actual belly surface is present above LX');
       assert.ok(belly.point.y-headTop>=-.002&&belly.point.y-headTop<.065,`actual belly contact gap ${belly.point.y-headTop}`);
       const penetrating=penetrationCount(skin,snapshot.meshes);
       assert.equal(penetrating.count,0,`frame ${frame}: actual animal mesh contains ${penetrating.count} LX vertices: ${JSON.stringify(penetrating.parts)}, local examples ${JSON.stringify(penetrating.locations.slice(0,3).map(p=>art.root.worldToLocal(p).toArray()))}`);
      }finally{snapshot.dispose();}
     }
    }finally{art.dispose();}
   });
  }
 }finally{avatar.dispose();}
});

test('growth-size drink contacts pond and bowl water without moving the root or planted hooves',async t=>{
 for(const animal of species)for(const skeletal of animal==='cow'?[false,true]:[false])for(const scale of scales){
  await t.test(`${skeletal?'skinned ':''}${animal} scale ${scale}`,async()=>{
   const art=await animalFixture(animal,skeletal);
   try{
    art.root.scale.setScalar(scale);art.root.position.set(3,.045,5);art.root.rotation.y=.63;
    for(const waterHeight of [.009,.045,.177]){
     // Production getDrinkSpot scales authored reach, so local Z remains .72 at every size.
     const contact=new THREE.Vector3(0,(waterHeight-art.root.position.y)/scale,.72);
     const before=art.root.position.clone();art.update({...idle,time:0});refreshPose(art.root);
     const hoofNames=skeletal?['cloven_hoof_back_L','cloven_hoof_back_R','cloven_hoof_front_L','cloven_hoof_front_R']:Array.from({length:4},(_,i)=>`${animal}-hoof-${i}`);
     const hoofBefore=hoofNames.map(name=>{const list:THREE.Vector3[]=[];vertices(art.root.getObjectByName(name)!,p=>list.push(p.clone()));return list;});
     // Putdown must remove the smaller carried-leg correction before drinking.
     for(let i=0;i<15;i++)art.update({...idle,time:i/60,carried:true});
     for(let i=0;i<30;i++)art.update({...idle,time:.3+i/60,activity:'drink',drinkPhase:.5,waterContact:contact});
     refreshPose(art.root);
     const expected=art.root.localToWorld(contact.clone()),error=art.mouth.getWorldPosition(new THREE.Vector3()).distanceTo(expected);
     assert.ok(error<.019,`water ${waterHeight}, real mouth error ${error}`);
     assert.ok(art.root.position.distanceTo(before)<1e-12,'drinking cannot jump the animal root');
     for(let index=0;index<hoofNames.length;index++){
      let maxMotion=0,minY=Infinity;
      vertices(art.root.getObjectByName(hoofNames[index])!,(v,_node,i)=>{maxMotion=Math.max(maxMotion,v.distanceTo(hoofBefore[index][i]));minY=Math.min(minY,v.y);});
      assert.ok(maxMotion<.013,`hoof ${index} moves ${maxMotion}`);
      assert.ok(minY>=.025&&minY<.10,`hoof ${index} below/far from floor: ${minY}`);
     }
    }
   }finally{art.dispose();}
  });
 }
});

test('independent deterministic growth sweep covers finite monotone endpoints and seamless stage boundaries',()=>{
 for(const size of ['normal','large','giant'] as const)for(let seed=0;seed<1000;seed++){
  const profile=createAnimalGrowth(`qa-${seed}`,size),a={bornAt:1_000_000,size,growth:profile},before=structuredClone(profile);
  assert.deepEqual(createAnimalGrowth(`qa-${seed}`,size),profile,'a reload must never reroll the same individual');
  assert.ok(profile.scales.every(Number.isFinite));
  assert.ok(profile.scales[0]>=.6&&profile.scales[0]<1&&profile.scales[0]<=profile.scales[1]&&profile.scales[1]<=profile.scales[2]&&profile.scales[2]<=2.2);
  let previous=0;
  for(let age=0;age<=130_000;age+=7919){const value=animalScale(a,a.bornAt+age);assert.ok(value>=previous);previous=value;}
  for(const boundary of [60_000,120_000])assert.ok(Math.abs(animalScale(a,a.bornAt+boundary)-animalScale(a,a.bornAt+boundary-1))<1e-8,'growth must not snap at the stage boundary');
  assert.equal(animalGrowthStage(a,a.bornAt+59_999),'baby');assert.equal(animalGrowthStage(a,a.bornAt+60_000),'juvenile');assert.equal(animalGrowthStage(a,a.bornAt+120_000),'adult');
  assert.equal(animalScale(a,a.bornAt+86400_000),profile.scales[2]);
  assert.deepEqual(profile,before,'rendering is read-only');
 }
});

test('continuous growth boundaries do not jump carried roots or float their support',async()=>{
 const {avatar,nav,pose}=await avatarFixture();
 try{
  avatar.update(0,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);
  const a={bornAt:0,size:'giant' as const,growth:{version:1 as const,scales:[.6,1.2,2.2] as [number,number,number]}};
  for(const animal of species)for(const skeletal of animal==='cow'?[false,true]:[false]){
   const art=await animalFixture(animal,skeletal);
   try{
    for(const boundary of [60_000,120_000]){
     let previous:THREE.Vector3|undefined;
     for(const age of [boundary-1,boundary,boundary+1]){
      art.root.scale.setScalar(animalScale(a,age));art.update({...idle,carried:true});pose.carry(art.root,0);
      if(previous)assert.ok(art.root.position.distanceTo(previous)<1e-7,`${animal} carried root jumps at ${boundary}`);
      previous=art.root.position.clone();
      assert.ok(Math.abs(art.root.getObjectByName('animal-support')!.getWorldPosition(new THREE.Vector3()).y-pose.headBounds().max.y-.018)<1e-6);
     }
    }
   }finally{art.dispose();}
  }
 }finally{avatar.dispose();}
});
