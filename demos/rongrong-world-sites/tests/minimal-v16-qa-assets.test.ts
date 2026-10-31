import type {LegacySpecies as FarmSpecies} from '../src/minimal/species.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createClubAvatar} from '../src/avatars/club-avatar-rig.ts';
import {FarmAvatarPose,farmLocomotion,refreshPose} from '../src/minimal/avatar-pose.ts';
import {createFarmAnimal,type FarmAnimalPose} from '../src/minimal/animal-art.ts';
import {ANIMAL_ASSETS,ANIMAL_CLIPS,AnimalAssetLibrary} from '../src/minimal/animal-assets.ts';
import {animalScale} from '../src/minimal/animal-growth.ts';
import {vertices,deformedMeshes,penetrationCount} from './v16-qa-geometry.ts';

// Filter explicitly while an asset is under construction. Unfiltered acceptance requires all five.
const selected=(process.env.FARM_QA_SPECIES?.split(',')??['cow','sheep','pig','bunny','duck']) as FarmSpecies[];
const scales=process.env.FARM_QA_DENSE?[.6,.65,.7,.75,.8,.85,.9,.95,1,1.6,2.2]:[.6,1,2.2];
const base:FarmAnimalPose={time:0,speed:0,distance:0,activity:'idle'};
async function asset(url:string,skipTextures=false){
 const bytes=readFileSync(new URL(`../public${url}`,import.meta.url)),loader=new GLTFLoader();
 if(skipTextures)loader.register(()=>({name:'QA_NO_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const library=new AnimalAssetLibrary(url=>asset(url));
async function animal(species:FarmSpecies){
 const art=createFarmAnimal(species,'female',{skeletal:true,assets:library});
 assert.equal(await art.root.userData.animationReady,true,`${species}: loading must succeed, not just retain a playable fallback: ${art.root.userData.animationError}`);
 assert.equal(art.root.userData.animationSource,'blender-skinned');
 return art;
}
async function avatarFixture(){
 const gltf=await asset('/avatars/cast-v1/human-lx.glb',true),avatar=createClubAvatar('human-lx','v16-independent-contact',{template:gltf.scene});await avatar.ready;
 const nav=new THREE.Group();nav.add(avatar.root);avatar.root.scale.setScalar(.65);
 return {avatar,nav,pose:new FarmAvatarPose(avatar.root)};
}
function footSamples(root:THREE.Object3D){
 const feet=new Map<string,{mesh:THREE.SkinnedMesh;index:number}[]>();
 root.traverseVisible(mesh=>{
  if(!(mesh instanceof THREE.SkinnedMesh))return;
  const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
  for(let i=0;i<index.count;i++)for(let j=0;j<4;j++){
   const bone=mesh.skeleton.bones[index.getComponent(i,j)]?.name??'';
   if(/_(?:front_|back_)?[LR]_(?:hoof|paw|foot)$/.test(bone)&&weight.getComponent(i,j)>.35){
    const list=feet.get(bone)??[];list.push({mesh,index:i});feet.set(bone,list);
   }
  }
 });
 return [...feet].map(([name,samples])=>({name,samples}));
}
function footPoints(samples:ReturnType<typeof footSamples>){
 return samples.map(foot=>({name:foot.name,points:foot.samples.map(({mesh,index})=>mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld))}));
}

test('V16 independent genuine asset gate checks delivered bytes, normalized skin and moving limb vertices',async t=>{
 for(const species of selected)await t.test(species,async()=>{
  const bytes=readFileSync(new URL(`../public${ANIMAL_ASSETS[species].url}`,import.meta.url));
  const report=JSON.parse(readFileSync(new URL(`../art-source/${species}-animation/validation-report.json`,import.meta.url),'utf8'));
  const contract=JSON.parse(readFileSync(new URL(`../art-source/${species}-animation/asset-contract.json`,import.meta.url),'utf8'));
  assert.equal(ANIMAL_ASSETS[species].stride,contract.walk_stride_m,`${species}: runtime distance phase must use the actual authored stride`);
  const hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,report.sha256,`${species}: report must describe current delivered GLB`);
  const revision=new URL(ANIMAL_ASSETS[species].url,'https://qa.invalid').searchParams.get('v');assert.ok(revision&&/^[a-f0-9]{8,64}$/.test(revision)&&hash.startsWith(revision),`${species}: original asset request must pin its actual delivered-byte revision`);
  const gltf=await asset(ANIMAL_ASSETS[species].url);assert.deepEqual(gltf.animations.map(a=>a.name).sort(),[...ANIMAL_CLIPS].sort());
  const clips=new Map(gltf.animations.map(clip=>[clip.name,clip]));
  const endpoint=(clip:THREE.AnimationClip,end:boolean)=>new Map(clip.tracks.map(track=>{const n=track.getValueSize(),start=end?track.values.length-n:0;return [track.name,Array.from(track.values.slice(start,start+n))];}));
  const seam=(a:THREE.AnimationClip,b:THREE.AnimationClip)=>{
   const end=endpoint(a,true),start=endpoint(b,false);assert.deepEqual([...end.keys()].sort(),[...start.keys()].sort());
   for(const [track,values] of end){const other=start.get(track)!,direct=Math.hypot(...values.map((v,i)=>v-other[i])),inverse=Math.hypot(...values.map((v,i)=>v+other[i]));assert.ok((track.endsWith('.quaternion')?Math.min(direct,inverse):direct)<.0001,`${species}: authored seam ${a.name}->${b.name} ${track}`);}
  };
  for(const name of ['idle','walk','drink_loop','eat','rest','carried','react'])seam(clips.get(name)!,clips.get(name)!);
  for(const [a,b] of [['idle','drink_enter'],['drink_enter','drink_loop'],['drink_loop','drink_exit'],['drink_exit','idle']])seam(clips.get(a)!,clips.get(b)!);
  let skins=0,weightedVertices=0;
  gltf.scene.traverseVisible(node=>{
   if(!(node instanceof THREE.Mesh))return;
   assert.ok(node instanceof THREE.SkinnedMesh,`${species}: ${node.name} is not genuinely skinned`);skins++;
   const weights=node.geometry.getAttribute('skinWeight'),indices=node.geometry.getAttribute('skinIndex');
   for(let i=0;i<weights.count;i++){
    let sum=0;for(let k=0;k<4;k++){const weight=weights.getComponent(i,k);assert.ok(Number.isFinite(weight)&&weight>=0&&weight<=1);sum+=weight;assert.ok(indices.getComponent(i,k)<node.skeleton.bones.length);}
    assert.ok(Math.abs(sum-1)<.0001,`${species}: normalized vertex ${i}`);weightedVertices++;
   }
  });
  assert.ok(skins>0&&weightedVertices>1000);
  const feet=footSamples(gltf.scene);assert.equal(feet.length,species==='duck'?2:4,`${species}: actual foot-weight groups`);
  const mixer=new THREE.AnimationMixer(gltf.scene),action=mixer.clipAction(gltf.animations.find(a=>a.name==='walk')!);action.play();
  let first:ReturnType<typeof footPoints>|undefined,maxMotion=0;
  for(let i=0;i<=24;i++){
   mixer.setTime(action.getClip().duration*i/24);refreshPose(gltf.scene);const current=footPoints(feet);
   if(!first)first=current;
   current.forEach((foot,f)=>foot.points.forEach((point,v)=>{assert.ok(point.toArray().every(Number.isFinite));maxMotion=Math.max(maxMotion,point.distanceTo(first![f].points[v]));assert.ok(point.y>=-.025,`${species}: walk sole below local ground ${point.y}`);}));
  }
  assert.ok(maxMotion>.045,`${species}: authored gait must deform limb vertices, not only root/bone metadata`);mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
 });
});

test('V16 rabbit and duck fully weighted planted foot vertices cancel scaled forward travel during stance',async t=>{
 for(const species of selected.filter(s=>s==='bunny'||s==='duck'))for(const scale of [.6,1,2.2])await t.test(`${species} ${scale}`,async()=>{
  const art=await animal(species);
  try{
   art.root.scale.setScalar(scale);const feet=footSamples(art.root),windows=new Map<string,THREE.Vector3[]>();let samples=0,maxSlip=0;
   for(let frame=0;frame<=240;frame++){
    const cycle=frame/120;art.root.position.z=cycle*ANIMAL_ASSETS[species].stride*scale;art.update({...base,time:frame/60,activity:'walk',speed:.6,distance:cycle*ANIMAL_ASSETS[species].stride});refreshPose(art.root);
    // This is the authored steady-gait contract. Asset readiness now truthfully
    // initializes idle, so its incoming .2 s blend repositions paws before walk
    // reaches full weight. Discard blend baselines rather than relaxing 6 mm.
    const walkWeight=art.root.getObjectByName(`blender-skinned-${species}`)!.userData.animationWeights.walk;
    if(walkWeight<1-1e-9){windows.clear();continue;}
    footPoints(feet).forEach(foot=>{
     const offset=species==='duck'?(foot.name.includes('_L_')?0:.5):foot.name.includes('_back_')?-.82:-.70;
     const duty=species==='duck'?.62:foot.name.includes('_back_')?.48:.47,unwrapped=cycle+offset,phase=((unwrapped%1)+1)%1;
     if(phase<.05||phase>duty-.05)return;
     const key=`${foot.name}:${Math.floor(unwrapped)}`,before=windows.get(key);if(!before){windows.set(key,foot.points);return;}
     foot.points.forEach((point,i)=>{maxSlip=Math.max(maxSlip,point.distanceTo(before[i])/scale);samples++;});
    });
   }
   t.diagnostic(JSON.stringify({species,scale,steadyStanceLocalMaxSlip:maxSlip,samples}));assert.ok(samples>100,`${species}: genuine planted-foot samples exist`);assert.ok(maxSlip<.006,`${species} ${scale}: actual foot geometry slides ${maxSlip} local metres despite forward travel cancellation`);
  }finally{art.dispose();}
 });
});

test('V16 all genuine rigs keep actual LX skin outside their carried surface through dense growth',async t=>{
 const {avatar,nav,pose}=await avatarFixture();
 try{
  for(const species of selected)for(const scale of scales)await t.test(`${species} ${scale}`,async()=>{
   const art=await animal(species);
   try{
    art.root.scale.setScalar(scale);
    for(const frame of [0,1]){
     const time=frame*.91;nav.position.set(2,.15+frame*.07,-2);nav.rotation.y=frame*.73;avatar.root.position.y=0;
     avatar.update(time,'dance',false,.15,farmLocomotion(nav,2,time*.25));pose.ground(()=>nav.position.y);
     for(let i=0;i<18;i++)art.update({...base,time:time+i/60,carried:true});pose.carry(art.root,nav.rotation.y);
     let headTop=-Infinity;const skin:THREE.Vector3[]=[];
     vertices(avatar.root,(point,node,index)=>{
      if(!(node instanceof THREE.SkinnedMesh))return;skin.push(point.clone());
      const indices=node.geometry.getAttribute('skinIndex'),weights=node.geometry.getAttribute('skinWeight');let headWeight=0;
      for(let k=0;k<4;k++)if(node.skeleton.bones[indices.getComponent(index,k)]?.name==='head')headWeight+=weights.getComponent(index,k);
      if(headWeight>.35)headTop=Math.max(headTop,point.y);
     });
     const support=art.root.getObjectByName('animal-support')!.getWorldPosition(new THREE.Vector3());
     assert.ok(support.y-headTop>=.008&&support.y-headTop<.025,`${species}: support datum gap ${support.y-headTop}`);
     const snapshot=deformedMeshes(art.root);
     try{
      const belly=new THREE.Raycaster(new THREE.Vector3(support.x,headTop-.03,support.z),new THREE.Vector3(0,1,0)).intersectObjects(snapshot.meshes,false)[0];
      assert.ok(belly,`${species}: actual belly must cover support`);
      assert.ok(belly.point.y-headTop>=-.002&&belly.point.y-headTop<.065,`${species}: actual belly gap ${belly.point.y-headTop}`);
      const intersections=penetrationCount(skin,snapshot.meshes);
      assert.equal(intersections.count,0,`${species} scale ${scale} frame ${frame}: ${JSON.stringify(intersections.parts)} contains LX skin; examples ${JSON.stringify(intersections.locations.slice(0,3).map(p=>art.root.worldToLocal(p).toArray()))}`);
     }finally{snapshot.dispose();}
    }
   }finally{art.dispose();}
  });
 }finally{avatar.dispose();}
});

test('V16 genuine feet stay grounded and mouth reaches water after carry, drink transitions and putdown',async t=>{
 for(const species of selected)for(const scale of scales)await t.test(`${species} ${scale}`,async()=>{
  const art=await animal(species);
  try{
   art.root.scale.setScalar(scale);art.root.position.set(3,.045,5);art.root.rotation.y=.63;let clock=0;
   const tick=(pose:Partial<FarmAnimalPose>,frames=24)=>{for(let i=0;i<frames;i++){clock+=1/60;art.update({...base,...pose,time:clock});}refreshPose(art.root);};
   const feet=footSamples(art.root);assert.equal(feet.length,species==='duck'?2:4);
   for(const waterHeight of [.009,.045,.177]){
    tick({});const initial=footPoints(feet),before=art.root.position.clone();tick({carried:true});
    const contact=new THREE.Vector3(0,(waterHeight-art.root.position.y)/scale,ANIMAL_ASSETS[species].muzzleReach);
    tick({activity:'drink',drinkPhase:.5,waterContact:contact},36);
    const expected=art.root.localToWorld(contact.clone()),error=art.mouth.getWorldPosition(new THREE.Vector3()).distanceTo(expected);
    assert.ok(error<.019,`${species} ${scale} water ${waterHeight}: mouth error ${error}`);assert.ok(art.root.position.distanceTo(before)<1e-12);
    footPoints(feet).forEach((foot,f)=>{
     let motion=0,minY=Infinity;foot.points.forEach((p,v)=>{motion=Math.max(motion,p.distanceTo(initial[f].points[v]));minY=Math.min(minY,p.y);});
     assert.ok(motion<.013,`${species} ${scale}: planted ${foot.name} moves ${motion}`);
     assert.ok(minY>=.02&&minY<.10,`${species} ${scale}: ${foot.name} ground gap ${minY-.045}`);
    });
    for(const phase of [.78,.82,.90,.99,1])tick({activity:'drink',drinkPhase:phase,waterContact:contact},6);
    tick({});assert.ok(art.mouth.getWorldPosition(new THREE.Vector3()).y>waterHeight+.1*scale,`${species}: exits drinking upright`);
   }
  }finally{art.dispose();}
 });
});

test('V16 genuine carried growth boundaries do not jump support or reroll instance scale',async()=>{
 const {avatar,nav,pose}=await avatarFixture();
 try{
  avatar.update(0,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);
  const model={bornAt:0,size:'giant' as const,growth:{version:1 as const,scales:[.6,1.2,2.2] as [number,number,number]}};
  for(const species of selected){const art=await animal(species);try{
   for(const boundary of [60_000,120_000]){
    let previous:THREE.Vector3|undefined;
    for(const age of [boundary-1,boundary,boundary+1]){
     art.root.scale.setScalar(animalScale(model,age));art.update({...base,carried:true});pose.carry(art.root,0);
     if(previous)assert.ok(art.root.position.distanceTo(previous)<1e-7,`${species}: carried stage jump ${boundary}`);
     previous=art.root.position.clone();assert.ok(Math.abs(art.root.getObjectByName('animal-support')!.getWorldPosition(new THREE.Vector3()).y-pose.headBounds().max.y-.018)<1e-6);
    }
   }
  }finally{art.dispose();}}
 }finally{avatar.dispose();}
});

test('V16 first carried frame after drink, walk or rest never puts real LX skin inside the animal',async t=>{
 const {avatar,nav,pose}=await avatarFixture();
 try{
  avatar.update(0,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);
  for(const species of selected)for(const scale of [.6,2.2])for(const previous of ['drink','walk','rest','partial-rest'])await t.test(`${species} ${scale} from ${previous}`,async()=>{
   const art=await animal(species);
   try{
    art.root.scale.setScalar(scale);let time=0;
    const initial=previous==='partial-rest'?'walk':previous;
    for(let i=0;i<24;i++){time+=1/60;art.update({...base,time,activity:initial,speed:initial==='walk'?.6:0,distance:.21,drinkPhase:.5});}
    if(previous==='partial-rest'){
     for(let i=0;i<6;i++){time+=1/60;art.update({...base,time,activity:'rest',distance:.21});}
     assert.ok(art.root.getObjectByName(`blender-skinned-${species}`)!.userData.transitionFloorContact,'partial rest setup must exercise grounded blend correction');
    }
    for(const frames of [1,3,8]){
     for(let i=0;i<frames;i++){time+=1/60;art.update({...base,time,carried:true});}
     assert.equal(art.root.getObjectByName(`blender-skinned-${species}`)!.userData.transitionFloorContact,undefined,'incoming carry does not retain a ground-only correction');
     pose.carry(art.root,0);const skin:THREE.Vector3[]=[];vertices(avatar.root,(p,node)=>{if(node instanceof THREE.SkinnedMesh)skin.push(p.clone());});
     const snapshot=deformedMeshes(art.root);try{const intersections=penetrationCount(skin,snapshot.meshes);assert.equal(intersections.count,0,`${species} ${scale} from ${previous} incoming +${frames} frames: ${JSON.stringify(intersections.parts)} contains LX skin`);}finally{snapshot.dispose();}
    }
   }finally{art.dispose();}
  });
 }finally{avatar.dispose();}
});
