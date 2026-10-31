import type {SolidFootTriangleLiftWorld} from './animal-limb-contact.ts';
import {selectedLocalAnimal} from './local-animal-models.ts';
import {getHunyuanMainResource,assertHunyuanMainInspectionContext,invalidateHunyuanMainInspection,type AlpacaInspectionContext} from './alpaca-inspection.ts';
import * as THREE from 'three';
import {hatchPoseAt} from './hatch-choreography.ts';
import {createSkeletalAnimalController} from './animal-animation.ts';
import {animalAssetLibrary,animalAssetProfile,type AnimalAssetInstance,type AnimalAssetLibrary} from './animal-assets.ts';
import {createAnimalFeedback,drinkingPoseAt} from './animal-feedback.ts';
export {drinkingPoseAt} from './animal-feedback.ts';

import {isLegacySpecies,type Species,type LegacySpecies} from './species.ts';
import {alpacaProvider} from './alpaca-provider.ts';
import {penguinProvider} from './penguin-provider.ts';
export type FarmSpecies=Species;
export type FarmSex='male'|'female';
export type FarmAnimalPose={time:number;speed:number;distance:number;activity:string;carried?:boolean;hatch?:number;selected?:boolean;/** Optional normalized timeline for a finite accepted greeting. */reactProgress?:number;drinkPhase?:number;/** Contact in animal root-local coordinates, supplied by the terrain surface. */waterContact?:{x:number;y:number;z:number};/** New descriptor species only: actual posed foot/bank triangle overlap in WORLD coordinates. Water is not solid ground. */solidFootTriangleLiftWorld?:SolidFootTriangleLiftWorld};
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
/** Small animals curl their legs away from the support beneath the belly.
 * Adult widths already straddle a head, while baby widths need a wider fold. */
export const smallAnimalCarryFold=(scale:number)=>ease((1-scale)/.4);
function dispose(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
/** Never traverse the shared actor root: it can also own feedback or a real skin. */
function bodyDisposer(body:THREE.Group,ground?:THREE.Object3D){let disposed=false;return ()=>{if(disposed)return;disposed=true;body.removeFromParent();ground?.removeFromParent();dispose(body);body.clear();};}
function material(color:string,roughness=.72){return new THREE.MeshStandardMaterial({color,roughness,metalness:0});}
function ellipsoid(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,segments=18){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,segments,12),mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function capsule(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,radius:number,length:number){const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,6,12),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function curveTube(parent:THREE.Object3D,mat:THREE.Material,points:THREE.Vector3[],radius:number){const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,radius,7,false),mat);mesh.castShadow=true;parent.add(mesh);return mesh;}
/** Shared articulated action layer. Only the head/neck bend; planted legs never sink. */
function createDrinkAction(body:THREE.Group,head:THREE.Group,mouth:THREE.Object3D,neck:THREE.Mesh,baseHead:THREE.Vector3,baseNeck:THREE.Vector3,neckScale:THREE.Vector3){
 const temp=new THREE.Vector3(),target=new THREE.Vector3(),offset=new THREE.Vector3(),inverse=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
 return (p:FarmAnimalPose)=>{
  const grazing=p.activity==='graze',enabled=(p.activity==='drink'||grazing)&&!p.carried&&p.speed<.1,action=grazing?{lower:1,sipping:false,sip:Math.sin(p.time*5)*.5,sipPhase:0}:drinkingPoseAt(p.drinkPhase??.5),weight=enabled?action.lower:0;
  neck.position.copy(baseNeck);neck.scale.copy(neckScale);neck.quaternion.identity();
  if(!weight)return;
  const contact=(!grazing&&p.waterContact)||{x:0,y:grazing?.07:.045,z:.72};
  target.set(contact.x,contact.y+.008*action.sip,contact.z);
  head.rotation.set(1.05*weight,head.rotation.y*(1-weight),0);
  // Convert root-local water into the head parent's coordinates, including hatch scale.
  body.updateMatrix();inverse.copy(body.matrix).invert();temp.copy(target).applyMatrix4(inverse);
  offset.copy(mouth.position).applyEuler(head.rotation);temp.sub(offset);
  head.position.copy(baseHead).lerp(temp,weight);
  // Keep the throat visibly attached instead of translating a floating face.
  temp.copy(head.position).add(new THREE.Vector3(0,-.04,-.075));
  const shoulder=baseNeck.clone().add(new THREE.Vector3(0,.015,-.06));
  offset.copy(temp).sub(shoulder);neck.position.copy(shoulder).lerp(temp,.5);
  neck.scale.set(neckScale.x*.88,Math.max(neckScale.y,offset.length()*.62),neckScale.z*.85);
  neck.quaternion.setFromUnitVectors(up,offset.normalize());
 };
}
/** Pigment lives on the skin vertices, not separate floating patch meshes. */
function cowSkin(mesh:THREE.Mesh,patches:{direction:THREE.Vector3;radius:number}[]){
 const base=new THREE.Color('#FFF2DA'),spot=new THREE.Color('#725044');
 const p=mesh.geometry.attributes.position,colors=new Float32Array(p.count*3),v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i).normalize();
  let coverage=0;
  for(const patch of patches){const d=v.distanceTo(patch.direction);const edge=patch.radius*(1+.09*Math.sin(v.y*15+v.z*9));coverage=Math.max(coverage,1-ease((d-edge+.025)/.05));}
  const c=base.clone().lerp(spot,coverage);colors.set([c.r,c.g,c.b],i*3);
 }
 mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 mesh.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82});
}
/** Four grounded hooves, connected shoulders and a rounded muzzle; +Z is forward. */
function createPlushCow(sex:FarmSex){
 const root=new THREE.Group();root.name='farm-cow';
 const body=new THREE.Group();body.name='cow-body-rig';root.add(body);
 const cream=material('#FFF2DA',.82),hoofMat=material('#624A40',.85),pink=material('#DFAEA0',.83),inner=material('#DDA199'),black=material('#302C29',.42),white=material('#FFFFFF',.3),hornMat=material('#E6D3AC');
 const torso=ellipsoid(body,cream,0,.65,-.09,.355,.315,.47,40);torso.name='cow-torso';
 cowSkin(torso,[{direction:new THREE.Vector3(.95,.12,-.25).normalize(),radius:.62},{direction:new THREE.Vector3(-.95,.2,.2).normalize(),radius:.58},{direction:new THREE.Vector3(.1,.8,-.6).normalize(),radius:.5}]);
 const neck=ellipsoid(body,cream,0,.73,.27,.24,.29,.24,28);neck.name='cow-shoulders';
 const head=new THREE.Group();head.name='cow-head';head.position.set(0,.94,.36);body.add(head);
 const face=ellipsoid(head,cream,0,0,0,.265,.265,.245,36);face.name='cow-face';
 cowSkin(face,[{direction:new THREE.Vector3(-.55,.6,.55).normalize(),radius:.38}]);
 const muzzle=ellipsoid(head,pink,0,-.125,.19,.225,.135,.135,32);muzzle.name='cow-muzzle';
 const mouth=new THREE.Object3D();mouth.name='feeding-mouth';mouth.position.set(0,-.17,.325);head.add(mouth);
 curveTube(head,hoofMat,[new THREE.Vector3(-.065,-.185,.309),new THREE.Vector3(0,-.2,.319),new THREE.Vector3(.065,-.185,.309)],.006);
 const eyes:THREE.Mesh[]=[],ears:THREE.Group[]=[];
 for(const side of [-1,1]){
  const eye=ellipsoid(head,black,side*.145,.015,.205,.031,.043,.022,20);eye.rotation.y=side*.25;eyes.push(eye);
  ellipsoid(eye,white,-.2,.3,.85,.26,.24,.19,12);
  ellipsoid(head,hoofMat,side*.086,-.109,.313,.025,.016,.009,16);
  const ear=new THREE.Group();ear.position.set(side*.23,.09,-.025);ear.rotation.z=-side*.22;head.add(ear);ears.push(ear);
  ellipsoid(ear,cream,side*.075,0,0,.125,.065,.07,24);
  ellipsoid(ear,inner,side*.08,-.005,.049,.078,.035,.018,20);
  // Short rounded horns grow out of the crown instead of floating sharp cones.
  curveTube(head,hornMat,[new THREE.Vector3(side*.155,.19,-.065),new THREE.Vector3(side*.19,.27,-.07),new THREE.Vector3(side*.18,.32,-.055)],.035);
  ellipsoid(head,hornMat,side*.18,.32,-.055,.034,.035,.034,16);
 }
 const legs:THREE.Group[]=[];
 for(let i=0;i<4;i++){
  const leg=new THREE.Group();leg.name=`cow-leg-${i}`;leg.position.set(i%2?.225:-.225,.45,i<2?-.35:.22);body.add(leg);legs.push(leg);
  const limb=capsule(leg,cream,0,-.175,0,.078,.23);limb.name=`cow-limb-${i}`;
  const hoof=ellipsoid(leg,hoofMat,0,-.375,.02,.09,.075,.105,24);hoof.name=`cow-hoof-${i}`;
  // A shallow cleft on the front of each hoof gives anatomy without detached toes.
  curveTube(leg,material('#44372F'),[new THREE.Vector3(0,-.4,.119),new THREE.Vector3(0,-.355,.119)],.004);
 }
 const tail=new THREE.Group();tail.name='cow-tail';tail.position.set(0,.74,-.51);body.add(tail);
 curveTube(tail,cream,[new THREE.Vector3(),new THREE.Vector3(.045,-.12,-.06),new THREE.Vector3(.065,-.3,-.07)],.024);
 ellipsoid(tail,hoofMat,.065,-.32,-.07,.047,.075,.042,20);
 const ribbon=material(sex==='female'?'#C87F87':'#6DAB98');
 // Small front pendant is attached to the chest, no disconnected torso ring.
 const tag=ellipsoid(body,ribbon,0,.65,.488,.035,.045,.013,20);tag.name='cow-pendant';
 if(sex==='female')for(const side of [-1,1]){const bow=ellipsoid(head,ribbon,side*.043,.225,.1,.05,.027,.024,20);bow.rotation.z=side*.35;}
 const anchors={ground:new THREE.Object3D(),support:new THREE.Object3D(),head:new THREE.Object3D()};
 anchors.ground.name='animal-ground';root.add(anchors.ground);
 anchors.support.name='animal-support';anchors.support.position.set(0,.335,-.06);body.add(anchors.support);
 anchors.head.name='animal-head';head.add(anchors.head);
 const drinkAction=createDrinkAction(body,head,mouth,neck,head.position.clone(),neck.position.clone(),neck.scale.clone());
 const height=1.31,worldScale=new THREE.Vector3();
 return {root,mouth,height,anchors,
  update(p:FarmAnimalPose){
   const t=p.time,walk=clamp(p.speed/.8),phase=p.distance/.7*Math.PI*2,carried=!!p.carried;
   const carryFold=carried?smallAnimalCarryFold(root.getWorldScale(worldScale).x):0;
   const rest=p.activity==='rest'&&!carried,feeding=['eat','graze'].includes(p.activity)&&!carried;
   const bounce=hatchPoseAt(p.hatch??1).lift;
   // Feet remain at the ground datum. Breathing expands the torso, not all joints.
   body.position.y=bounce+(rest?-.08:0);
   torso.scale.y=.315*(1+Math.sin(t*2)*.008);
   anchors.support.position.set(0,.65-torso.scale.y*Math.sqrt(1-(.03/.47)**2),-.06);
   head.rotation.set(feeding?.32+Math.sin(t*4)*.025:Math.sin(t*1.5)*.018,Math.sin(t*.8)*.025,carried?Math.sin(t*1.7)*.025:0);
   head.position.set(0,.94+(feeding?-.035:0),.36);
   legs.forEach((leg,i)=>{
    const stride=Math.sin(phase+(i===0||i===3?0:Math.PI));
    leg.rotation.x=carried?THREE.MathUtils.lerp(i<2?-.22:.25,i<2?1.3:-1.3,carryFold):rest?(i<2?-.65:.6):stride*.32*walk;
    leg.rotation.z=carried?(i%2?1:-1)*.35*carryFold:0;
    leg.position.y=.45+(carried||rest?0:Math.max(0,stride)*.045*walk);
   });
   ears.forEach((ear,i)=>ear.rotation.z=(i===0?1:-1)*.22+Math.sin(t*2+i)*.025);
   tail.rotation.y=Math.sin(t*2.4)*.16;
   eyes.forEach(eye=>eye.scale.y=.043*((t%4.7)>4.54?.16:1));
   drinkAction(p);
  },dispose:bodyDisposer(body,anchors.ground)};
}

export type FarmAnimalOptions={alpacaInspection?:AlpacaInspectionContext;skeletal?:boolean;/** Compatibility with earlier callers. */skeletalCow?:boolean;assets?:AnimalAssetLibrary;onLoadError?:(species:FarmSpecies,error:string)=>void;onLoadStateChange?:()=>void};
type AnimalAnchors={ground:THREE.Object3D;support:THREE.Object3D;head:THREE.Object3D};
type ProceduralAnimalArt={root:THREE.Group;mouth:THREE.Object3D;height:number;anchors?:AnimalAnchors;update:(pose:FarmAnimalPose)=>void;dispose:()=>void};
export type FarmAnimalArt={root:THREE.Group;mouth:THREE.Object3D;height:number;anchors?:AnimalAnchors;update:(pose:FarmAnimalPose)=>void;dispose:()=>void;retryAnimation:()=>Promise<boolean>};
/** Procedural geometry remains a truthful offline fallback until a verified skin is ready. */
export function createFarmAnimal(species:FarmSpecies,sex:FarmSex,options:FarmAnimalOptions={}):FarmAnimalArt{
 if(options.alpacaInspection!=null)assertHunyuanMainInspectionContext(options.alpacaInspection);
 // Only this nullable owner retains procedural pose/disposal closures. Do not copy
 // either closure onto art: readiness must make the entire old body collectible.
 let fallback:ProceduralAnimalArt|undefined=!isLegacySpecies(species)?undefined:species==='cow'?createPlushCow(sex):species==='duck'?createDuckFallback(sex):createClassicAnimal(species,sex);
 const selectedModel=isLegacySpecies(species)?selectedLocalAnimal(species):null;if(selectedModel)for(const child of fallback!.root.children)child.visible=false;
 const base=fallback??createUnavailableAnimal(species),feedback=createAnimalFeedback(base.root,species);
 // These empty unavailable anchors are not anatomy. Retire them only after the
 // actual new-species skin is initialized, so name-based World lookups find its bones.
 const unavailableAnchors=!isLegacySpecies(species)?[base.mouth,...Object.values(base.anchors??{})]:[];
 let disposed=false,controller:ReturnType<typeof createSkeletalAnimalController>|undefined,asset:AnimalAssetInstance|undefined,pending:Promise<boolean>|undefined,lastPose:FarmAnimalPose|undefined;
 const art:FarmAnimalArt={root:base.root,mouth:base.mouth,height:base.height,...(base.anchors?{anchors:base.anchors}:{}),
  update(p){if(disposed)return;lastPose=p;feedback.update(p);if(controller)controller.update(p);else fallback?.update(p);},
  dispose(){if(disposed)return;disposed=true;controller?.dispose();controller=undefined;asset?.release();asset=undefined;fallback?.dispose();fallback=undefined;feedback.dispose();lastPose=undefined;art.root.clear();art.root.userData.animationStatus='disposed';},
  retryAnimation:()=>Promise.resolve(false),
 };
 art.root.userData.animationSource=!isLegacySpecies(species)?'unavailable':'procedural-fallback';art.root.userData.animationStatus=!isLegacySpecies(species)?'unavailable':'fallback';
 if(isLegacySpecies(species)||getHunyuanMainResource(species,options.alpacaInspection))art.root.userData.muzzleReach=animalAssetProfile(species,options.alpacaInspection).muzzleReach;
 if(selectedModel)art.root.userData.modelIdentity={species,sha256:selectedModel.sha256,bytes:selectedModel.bytes,url:selectedModel.url,profileSource:'immutable-selected-local-deployment'};
 if(selectedModel||!isLegacySpecies(species)||options.skeletal||(species==='cow'&&options.skeletalCow)){
  const loadAnimation=(retry=false)=>{
   if(disposed)return Promise.resolve(false);if(controller)return Promise.resolve(true);if(pending)return pending;
   let candidateSha=!isLegacySpecies(species)?getHunyuanMainResource(species,options.alpacaInspection)?.sha256:undefined;
   art.root.userData.animationStatus='loading';delete art.root.userData.animationError;options.onLoadStateChange?.();
   pending=(options.assets??animalAssetLibrary).instantiate(species,{retry,alpacaInspection:options.alpacaInspection}).then(instance=>{
    if(disposed){instance.release();return false;}
    if(!isLegacySpecies(species))candidateSha=getHunyuanMainResource(species,options.alpacaInspection)?.sha256;
    let next:ReturnType<typeof createSkeletalAnimalController>|undefined,assetHeight:number;
    try{
     next=createSkeletalAnimalController(instance.scene,instance.animations,species,art.root,undefined,options.alpacaInspection);
     // A candidate needs the real parent transform for contact IK and bounds, but
     // it is not ready until initialization and the latest pose both succeed.
     art.root.add(instance.scene);next.update(lastPose??{time:0,speed:0,distance:0,activity:'idle'});instance.scene.updateWorldMatrix(true,true);
     instance.scene.traverse(node=>{if(!node.matrixWorld.elements.every(Number.isFinite))throw new Error(`${species} animation produced a non-finite pose`);});
     assetHeight=new THREE.Box3().setFromObject(instance.scene,true).getSize(new THREE.Vector3()).y/art.root.scale.y;
     if(!Number.isFinite(assetHeight)||assetHeight<=0)throw new Error(`${species} animation produced invalid bounds`);
    }catch(error){next?.dispose();instance.release();throw error;}
    if(disposed){next.dispose();instance.release();return false;}
    instance.scene.name=`blender-skinned-${species}`;asset=instance;controller=next;art.mouth=next.mouth;art.height=Math.max(art.height,assetHeight,!isLegacySpecies(species)?getHunyuanMainResource(species,options.alpacaInspection)?.profile.height??0:0);art.root.visible=true;art.root.userData.muzzleReach=animalAssetProfile(species,options.alpacaInspection).muzzleReach;
    if(art.anchors){art.anchors.ground=instance.scene.getObjectByName('animal-ground')!;art.anchors.support=next.support;art.anchors.head=instance.scene.getObjectByName('animal-head')!;}
    fallback?.dispose();fallback=undefined;if(unavailableAnchors.length){art.root.remove(...unavailableAnchors);unavailableAnchors.length=0;}
    art.root.userData.animationSource=!isLegacySpecies(species)?'hunyuan-skinned':'blender-skinned';if(!isLegacySpecies(species)){art.root.userData.assetVariant=`hunyuan:${species}`;art.root.userData.candidateSha256=candidateSha;if(options.alpacaInspection!=null)art.root.userData.resourcePurpose='inspection-only';}art.root.userData.animationStatus='ready';art.root.userData.animationClips=instance.animations.map(c=>c.name);
    return true;
   }).catch(error=>{const message=error instanceof Error?error.message:String(error);if(!disposed){if(!isLegacySpecies(species)){art.root.visible=false;if(options.alpacaInspection!=null)invalidateHunyuanMainInspection(options.alpacaInspection,message);else if(candidateSha)(species==='alpaca'?alpacaProvider:penguinProvider).reportRuntimeFailure(candidateSha,message);}art.root.userData.animationStatus='failed';art.root.userData.animationError=message;if(selectedModel){fallback?.dispose();fallback=undefined;art.root.userData.animationSource='selected-unavailable';}options.onLoadError?.(species,message);}return false;}).finally(()=>{pending=undefined;if(!disposed)options.onLoadStateChange?.();});
   art.root.userData.animationReady=pending;return pending;
  };
  art.retryAnimation=()=>loadAnimation(true);void loadAnimation();
 }
 return art;
}
/** No animal-shaped fallback: retain only invisible semantic anchors while unavailable. */
function createUnavailableAnimal(species:FarmSpecies):ProceduralAnimalArt{
 const root=new THREE.Group();root.name=`farm-${species}`;root.visible=false;
 const mouth=new THREE.Object3D(),ground=new THREE.Object3D(),support=new THREE.Object3D(),head=new THREE.Object3D();
 mouth.name='feeding-mouth';ground.name='animal-ground';support.name='animal-support';head.name='animal-head';root.add(mouth,ground,support,head);
 return {root,mouth,height:0,anchors:{ground,support,head},update(){},dispose(){root.removeFromParent();root.clear();}};
}
/** Deliberately avian fallback: two webbed feet, side wings and a broad orange bill. */
function createDuckFallback(sex:FarmSex){
 const root=new THREE.Group();root.name='farm-duck';const body=new THREE.Group();body.name='duck-body-rig';root.add(body);
 const cream=material('#F7E8B2'),wingMat=material('#E4D092'),orange=material('#E8A14F'),black=material('#343B2F'),white=material('#FFFFFF');
 const belly=ellipsoid(body,cream,0,.38,-.06,.26,.25,.35,24);belly.name='duck-belly';
 const head=new THREE.Group();head.name='duck-head';head.position.set(0,.72,.22);body.add(head);
 ellipsoid(head,cream,0,0,0,.21,.22,.205,24);ellipsoid(head,orange,0,-.065,.225,.165,.055,.135,24).name='duck-bill';
 for(const side of [-1,1]){const eye=ellipsoid(head,black,side*.15,.025,.145,.028,.036,.022,16);ellipsoid(eye,white,-.15,.3,.85,.23,.23,.17,12);}
 const neck=ellipsoid(body,cream,0,.55,.15,.15,.22,.17,24);neck.name='duck-neck';
 const mouth=new THREE.Object3D();mouth.name='feeding-mouth';mouth.position.set(0,-.08,.35);head.add(mouth);
 const wings=[-1,1].map(side=>{const wing=ellipsoid(body,wingMat,side*.25,.41,-.06,.065,.16,.24,20);wing.name=`duck-wing-${side<0?'L':'R'}`;wing.rotation.z=side*.12;return wing;});
 const legs=[-1,1].map(side=>{const leg=new THREE.Group();leg.name=`duck-leg-${side<0?'L':'R'}`;leg.position.set(side*.125,.16,-.03);body.add(leg);capsule(leg,orange,0,-.045,0,.033,.08);const foot=ellipsoid(leg,orange,0,-.13,.065,.09,.03,.14,18);foot.name=`duck-webbed-foot-${side<0?'L':'R'}`;return leg;});
 ellipsoid(body,wingMat,0,.46,-.38,.13,.11,.15,20).rotation.x=-.3;
 const tag=ellipsoid(body,material(sex==='female'?'#D88D8F':'#82AF9C'),0,.56,.31,.033,.035,.015,16);tag.name='duck-pendant';
 const support=new THREE.Object3D();support.name='animal-support';support.position.set(0,.13,-.06);body.add(support);
 const ground=new THREE.Object3D();ground.name='animal-ground';root.add(ground);const headAnchor=new THREE.Object3D();headAnchor.name='animal-head';head.add(headAnchor);
 const drink=createDrinkAction(body,head,mouth,neck,head.position.clone(),neck.position.clone(),neck.scale.clone());
 return {root,mouth,height:.95,update(p:FarmAnimalPose){
  const walk=clamp(p.speed/.65),phase=p.distance/.32*Math.PI*2,rest=p.activity==='rest'&&!p.carried;
  body.position.y=(rest?-.065:0)+hatchPoseAt(p.hatch??1).lift;body.rotation.z=p.carried?0:Math.sin(phase)*.045*walk;
  belly.scale.y=.25*(1+Math.sin(p.time*2)*.009);support.position.y=.38-belly.scale.y;
  head.position.set(0,.72,.22);head.rotation.set((p.activity==='eat'||p.activity==='graze')?.3:rest?.15:Math.sin(p.time)*.018,0,0);
  legs.forEach((leg,i)=>{const step=Math.sin(phase+i*Math.PI);leg.rotation.set(p.carried?-1.3:rest?-.7:step*.3*walk,0,p.carried?(i?1:-1)*.75:0);leg.position.y=.16+Math.max(0,step)*.04*walk;});
  wings.forEach((wing,i)=>wing.rotation.z=(i?1:-1)*(.12+(p.activity==='love'?.25*Math.abs(Math.sin(p.time*8)):0)));
  drink(p);
 },dispose:bodyDisposer(body,ground)};
}
function createClassicAnimal(species:LegacySpecies,sex:FarmSex){
 const root=new THREE.Group();root.name=`farm-${species}`;
 const body=new THREE.Group(),head=new THREE.Group(),legs:THREE.Group[]=[],ears:THREE.Group[]=[],eyes:THREE.Mesh[]=[];root.add(body);body.add(head);body.name=`${species}-body-rig`;head.name=`${species}-head`;
 const cream=material('#FFF4DD'),ivory=material('#F5EAD8'),dark=material('#493C35'),black=material('#27342C',.38),white=material('#FFFFFF',.28),pink=material('#ECA6A7'),blush=material('#E9A899');
 const main=species==='pig'?material('#F1B9AA'):species==='bunny'?material('#E6C9AA'):cream;
 const bodyY=species==='bunny'?.43:.48;
 const belly=ellipsoid(body,main,0,bodyY,-.06,species==='cow'?.36:.33,species==='bunny'?.34:.31,species==='bunny'?.32:.43);
 ellipsoid(body,ivory,0,bodyY-.06,.25,.23,.22,.2);
 head.position.set(0,species==='bunny'?.76:.7,species==='bunny'?.19:.33);
 ellipsoid(head,main,0,0,0,.29,.27,.275);
 const muzzleColor=species==='pig'?pink:species==='cow'?material('#E5BAAA'):ivory;
 ellipsoid(head,muzzleColor,0,-.11,.205,species==='pig'?.19:.205,species==='pig'?.125:.135,.115);
 const neck=ellipsoid(body,main,0,.53,.22,.19,.21,.19);neck.name=`${species}-neck`;
 const mouth=new THREE.Object3D();mouth.name='feeding-mouth';mouth.position.set(0,-.15,.33);head.add(mouth);
 for(const side of [-1,1]){
  const eye=ellipsoid(head,black,side*.135,.015,.241,.036,.046,.025);eyes.push(eye);
  ellipsoid(eye,white,-.2,.32,.76,.27,.24,.2,10);
  ellipsoid(head,blush,side*.22,-.085,.17,.053,.026,.023,12);
  if(species==='pig')ellipsoid(head,dark,side*.075,-.11,.307,.022,.03,.012,12);
  else if(species==='cow')ellipsoid(head,dark,side*.09,-.095,.308,.023,.017,.011,12);
 }
 if(species!=='pig'&&species!=='cow'){
  ellipsoid(head,pink,0,-.085,.315,.035,.025,.018,12);
  for(const side of [-1,1])curveTube(head,dark,[new THREE.Vector3(0,-.112,.313),new THREE.Vector3(side*.025,-.145,.314),new THREE.Vector3(side*.06,-.13,.3)],.006);
 }
 const legMat=species==='sheep'?material('#A78B72'):main;
 for(let i=0;i<4;i++){
  const leg=new THREE.Group();leg.name=`${species}-leg-${i}`;leg.position.set(i%2?.22:-.22,.3,i<2?-.3:.25);body.add(leg);legs.push(leg);
  capsule(leg,legMat,0,-.11,0,species==='bunny'?.085:.075,.1);
  ellipsoid(leg,species==='cow'?dark:ivory,0,-.22,.025,.095,.065,species==='bunny'?.15:.105).name=`${species}-hoof-${i}`;
 }
 for(const side of [-1,1]){
  const ear=new THREE.Group();ear.position.set(side*.225,.15,-.015);head.add(ear);ears.push(ear);
  if(species==='bunny'){
   ear.rotation.z=-side*.12;capsule(ear,main,0,.19,0,.086,.32);capsule(ear,pink,0,.2,.069,.043,.26);
  }else if(species==='pig'){
   ear.rotation.z=-side*.42;ellipsoid(ear,main,side*.035,.085,0,.115,.15,.052);ellipsoid(ear,pink,side*.035,.09,.045,.07,.1,.015);
  }else{
   ear.rotation.z=-side*.66;ellipsoid(ear,main,side*.04,.045,0,.135,.065,.055);ellipsoid(ear,pink,side*.04,.045,.042,.084,.037,.018);
  }
 }
 let tail:THREE.Object3D;
 if(species==='sheep'){
  const fleece=material('#FFFAEA');
  // Distinct clumps, not a single smooth body sphere. Distribution stays outside joints.
  for(let ring=0;ring<4;ring++)for(let j=0;j<8;j++){
   const theta=j*Math.PI/4+(ring%2)*.22,z=-.32+ring*.18;
   const r=.14+(Math.sin(ring*7+j*3)+1)*.014;
   ellipsoid(body,fleece,Math.cos(theta)*.285,.49+Math.sin(theta)*.25,z,r,r*.96,r*1.08,12).name=`sheep-fleece-${ring}-${j}`;
  }
  for(let j=0;j<7;j++)ellipsoid(head,fleece,(j%3-1)*.11,.18+Math.floor(j/3)*.055,-.035+(j%2)*.09,.105,.1,.095,12);
  tail=ellipsoid(body,fleece,0,.5,-.51,.105,.12,.115,12);
 }else if(species==='cow'){
  const spot=material('#6A5044');
  for(const side of [-1,1]){
   const patch=ellipsoid(body,spot,side*.345,.51,-.17,.038,.14,.17,14);patch.rotation.z=side*.2;
   ellipsoid(body,spot,side*.24,.68,.14,.11,.035,.095,14);
   const horn=new THREE.Mesh(new THREE.ConeGeometry(.047,.18,12),ivory);horn.position.set(side*.17,.285,-.05);horn.rotation.z=-side*.25;head.add(horn);horn.castShadow=true;
  }
  ellipsoid(head,spot,-.1,.12,.18,.1,.09,.065,14);
  tail=new THREE.Group();tail.position.set(0,.55,-.45);body.add(tail);curveTube(tail,dark,[new THREE.Vector3(),new THREE.Vector3(.08,-.12,-.08),new THREE.Vector3(.04,-.29,-.12)],.024);ellipsoid(tail,dark,.04,-.31,-.12,.055,.075,.045,12);
 }else if(species==='pig'){
  const points=Array.from({length:28},(_,i)=>{const t=i/27*Math.PI*3.5;return new THREE.Vector3(Math.cos(t)*.065,.49+Math.sin(t)*.065,-.47-i/27*.13);});tail=curveTube(body,pink,points,.018);
 }else tail=ellipsoid(body,cream,0,.48,-.39,.13,.135,.13,14);
 // Small accessory distinguishes sex without turning it into a stat billboard.
 const ribbon=material(sex==='female'?'#D88D8F':'#82AF9C');
 const collar=new THREE.Mesh(new THREE.TorusGeometry(.235,.018,6,24),ribbon);collar.rotation.x=Math.PI/2;collar.position.set(0,.59,.24);body.add(collar);
 const tag=ellipsoid(body,ribbon,0,.49,.35,.045,.055,.02,12);tag.rotation.z=.16;
 if(sex==='female')for(const side of [-1,1]){const bow=ellipsoid(head,ribbon,side*.055,.245,.08,.064,.035,.025,12);bow.rotation.z=side*.45;}
 // Sample the real fleece surface directly under the support point, not its global AABB.
 body.updateMatrixWorld(true);
 const fleeceMeshes=body.children.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh);
 const supportZ=species==='sheep'?.04:-.06;
 const fleeceRay=new THREE.Raycaster(new THREE.Vector3(0,-2,supportZ),new THREE.Vector3(0,1,0));
 const fleeceBottom=fleeceRay.intersectObjects(fleeceMeshes,false)[0]?.point.y??bodyY-belly.scale.y;
 const support=new THREE.Object3D();support.name='animal-support';support.position.set(0,species==='sheep'?fleeceBottom:bodyY-belly.scale.y,supportZ);body.add(support);
 const originalEarRot=ears.map(e=>e.rotation.z);const tailBase=tail.rotation.y;
 const drinkAction=createDrinkAction(body,head,mouth,neck,head.position.clone(),neck.position.clone(),neck.scale.clone());
 const height=species==='bunny'?1.36:species==='cow'?1.18:1.08,worldScale=new THREE.Vector3();
 return {root,mouth,height,
  update(p:FarmAnimalPose){
   const walk=clamp(p.speed/.8),phase=p.distance/.62*Math.PI*2,t=p.time;
   const carryFold=p.carried?smallAnimalCarryFold(root.getWorldScale(worldScale).x):0;
   const resting=p.activity==='rest'&&!p.carried,feeding=(p.activity==='graze'||p.activity==='eat')&&!p.carried;
   const reveal=p.hatch===undefined?1:clamp(p.hatch);
   const bounce=hatchPoseAt(reveal).lift,squash=1;
   body.position.y=(resting?-.13:0)+(p.carried?-.08:0)+bounce+(p.carried?Math.sin(t*2)*.015:(species==='bunny'?Math.max(0,Math.sin(phase))*.09:Math.abs(Math.sin(phase))*.018)*walk);
   body.scale.set(1+(1-squash)*.45,squash*(1+Math.sin(t*2.1)*.008),1+(1-squash)*.22);
   belly.scale.y=(species==='bunny'?.34:.31)*(1+Math.sin(t*2)*.014);
   // Fleece is the sheep's physical underside; other bellies use their breathing radius.
   support.position.set(0,species==='sheep'?fleeceBottom:bodyY-belly.scale.y,supportZ);
   head.rotation.x=feeding?.38+Math.sin(t*4)*.045:resting?.13:Math.sin(t*1.5)*.035;
   head.rotation.y=walk>.15?0:Math.sin(t*.8)*.055;
   head.position.set(0,(species==='bunny'?.76:.7)+(feeding?-.08:0),species==='bunny'?.19:.33);
   legs.forEach((leg,i)=>{leg.rotation.x=p.carried?THREE.MathUtils.lerp(i<2?-.62:.62,i<2?1.3:-1.3,carryFold):resting?(i<2?-.85:.8):Math.sin(phase+(species==='bunny'?(i<2?Math.PI*.4:0):(i===0||i===3?0:Math.PI)))*.45*walk;leg.rotation.z=p.carried?(i%2?1:-1)*THREE.MathUtils.lerp(.14,.35,carryFold):0;});
   ears.forEach((ear,i)=>{ear.rotation.z=originalEarRot[i]+Math.sin(t*2.7+i)*.045+(species==='bunny'?Math.sin(phase+i)*walk*.055:0);});
   tail.rotation.y=tailBase+Math.sin(t*3)*.12;
   const blink=(t%4.3)>4.13?.14:1;eyes.forEach(eye=>eye.scale.y=.046*blink);
   drinkAction(p);
  },dispose:bodyDisposer(body)};
}

/** A textured ceramic egg with separated shell halves, ready for deterministic reveal playback. */
export function createFarmEgg(tint='#F5DCA4'){
 const root=new THREE.Group(),shell=new THREE.Group(),top=new THREE.Group(),bottom=new THREE.Group(),sparkles=new THREE.Group();root.add(shell,sparkles);shell.add(top,bottom);
 const shellMat=material('#FFF5DC',.54),insideMat=material('#E9D5B4'),spotMat=material(tint,.67),gold=material('#E4B969',.38);
 const eggGeometry=new THREE.SphereGeometry(1,28,20);const pos=eggGeometry.attributes.position;
 for(let i=0;i<pos.count;i++){const y=pos.getY(i);const taper=1-.18*(y+1)/2;pos.setXYZ(i,pos.getX(i)*.34*taper,(y+1)*.43,pos.getZ(i)*.34*taper);}eggGeometry.computeVertexNormals();
 // Each hemisphere uses the same analytic shape so splitting creates a clear shell edge.
 const half=(upper:boolean)=>{const geo=new THREE.SphereGeometry(1,28,12,0,Math.PI*2,upper?0:Math.PI/2,Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),taper=1-.18*(y+1)/2;p.setXYZ(i,p.getX(i)*.34*taper,(y+1)*.43,p.getZ(i)*.34*taper);}geo.computeVertexNormals();const m=new THREE.Mesh(geo,shellMat);m.castShadow=true;m.receiveShadow=true;return m;};
 top.add(half(true));bottom.add(half(false));eggGeometry.dispose();
 for(let i=0;i<9;i++){const angle=i*2.399,yy=.2+(i%3)*.2,rad=.3*(1-.18*yy/.86),s=.035+(i%2)*.014;const group=yy>.43?top:bottom;const dot=ellipsoid(group,spotMat,Math.cos(angle)*rad,yy,Math.sin(angle)*rad,s,s*1.3,.015,12);dot.lookAt(Math.cos(angle)*2,yy,Math.sin(angle)*2);}
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.306,.015,6,28),insideMat);rim.rotation.x=Math.PI/2;rim.position.y=.43;bottom.add(rim);rim.visible=false;
 const crack=new THREE.Group();shell.add(crack);const crackMat=material('#B49A76');
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=(i+.5)/12*Math.PI*2,c=(i+1)/12*Math.PI*2;curveTube(crack,crackMat,[new THREE.Vector3(Math.cos(a)*.309,.43,Math.sin(a)*.309),new THREE.Vector3(Math.cos(b)*.31,.43+(i%2?.055:-.055),Math.sin(b)*.31),new THREE.Vector3(Math.cos(c)*.309,.43,Math.sin(c)*.309)],.008);}crack.visible=false;
 const stars:THREE.Mesh[]=[];for(let i=0;i<3;i++){const star=new THREE.Mesh(new THREE.OctahedronGeometry(.025+(i%2)*.008),gold);sparkles.add(star);stars.push(star);}sparkles.visible=false;
 const nest=new THREE.Group();root.add(nest);for(let i=0;i<14;i++){const a=i/14*Math.PI*2;const straw=capsule(nest,material(i%2?'#CAB17C':'#DDC793'),Math.cos(a)*.28,.025,Math.sin(a)*.28,.018,.25);straw.rotation.set(Math.PI/2,a+.45,0);}nest.name='egg-nest';
 const fadingMaterials=new Set<THREE.Material>();shell.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>fadingMaterials.add(m));});nest.traverse(o=>{if(o instanceof THREE.Mesh)fadingMaterials.add(o.material as THREE.Material);});
 return {root,shell,
  update(progress:number,time:number,reveal?:number,reducedMotion=false){
   const ready=progress>=1,r=reveal===undefined?0:clamp(reveal),pose=hatchPoseAt(r,reducedMotion);
   const anticipation=reveal===undefined?1:1-ease(r/.30);
   shell.rotation.z=reducedMotion?0:(ready?Math.sin(time*7)*.04:Math.sin(time*1.8)*.015)*anticipation;
   shell.position.y=ready&&!reducedMotion?Math.abs(Math.sin(time*3.5))*.008*anticipation:0;
   crack.visible=reveal===undefined?ready:r>.12&&r<.50;rim.visible=reveal!==undefined&&pose.open>0;
   const opening=reveal===undefined?0:pose.open;
   top.position.set(-opening*.32,Math.sin(opening*Math.PI)*.08+opening*.04,-opening*.12);top.rotation.z=-opening*.75;
   bottom.position.set(opening*.10,0,opening*.06);bottom.rotation.z=opening*.16;
   shell.visible=pose.shellAlpha>.001;sparkles.visible=reveal!==undefined&&pose.glint>.001;
   for(const m of fadingMaterials){m.transparent=true;m.opacity=reveal===undefined?1:pose.shellAlpha;}
   gold.transparent=true;gold.opacity=pose.glint*.65;
   stars.forEach((star,i)=>{const a=(i/3+.1)*Math.PI*2,spread=.24+pose.glint*.06;star.position.set(Math.cos(a)*spread,.48+pose.glint*.10+i*.035,Math.sin(a)*spread);star.rotation.set(0,0,i*.6);star.scale.setScalar(pose.glint);});
   nest.visible=reveal===undefined||pose.shellAlpha>.001;
  },dispose:()=>dispose(root)};
}
