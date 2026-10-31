import {prepareActiveMainAnimalModel} from './farm-model-recovery.ts';
import {AnimalModelLoadBudget} from './animal-model-load-budget.ts';
import {getHunyuanMainResource,assertHunyuanMainInspectionContext,type AlpacaInspectionContext} from './alpaca-inspection.ts';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {ANIMAL_ASSET_REVISIONS} from './animal-asset-revisions.ts';
import {registerAnimalPickCache} from './animal-pick-cache.ts';
import {selectedLocalAnimal,selectedLocalAnimalTemplate} from './local-animal-models.ts';
import {animalMotionProfile,ANIMAL_MOTION_PROFILES} from './animal-motion.ts';
import type {FarmSpecies} from './animal-art.ts';
import {isLegacySpecies,type LegacySpecies} from './species.ts';
import {alpacaProvider} from './alpaca-provider.ts';
import {penguinProvider} from './penguin-provider.ts';
import {HUNYUAN_DESCRIPTORS} from './hunyuan-promotion.ts';
import {validateHunyuanMainLoadedAsset} from './hunyuan-alpaca-contract.ts';

export const ANIMAL_CLIPS=['idle','walk','drink_enter','drink_loop','drink_exit','eat','rest','carried','react'] as const;
export type AnimalClip=typeof ANIMAL_CLIPS[number];
export const ANIMAL_ASSETS:Record<LegacySpecies,{url:string;stride:number;muzzleReach:number;head:string}>={
 cow:{url:`/models/farm/cow-animated.glb?v=${ANIMAL_ASSET_REVISIONS.cow}`,...ANIMAL_MOTION_PROFILES.cow,head:'cow_head'},
 sheep:{url:`/models/farm/sheep-animated.glb?v=${ANIMAL_ASSET_REVISIONS.sheep}`,...ANIMAL_MOTION_PROFILES.sheep,head:'sheep_head'},
 pig:{url:`/models/farm/pig-animated.glb?v=${ANIMAL_ASSET_REVISIONS.pig}`,...ANIMAL_MOTION_PROFILES.pig,head:'pig_head'},
 bunny:{url:`/models/farm/bunny-animated.glb?v=${ANIMAL_ASSET_REVISIONS.bunny}`,...ANIMAL_MOTION_PROFILES.bunny,head:'bunny_head'},
 duck:{url:`/models/farm/duck-animated.glb?v=${ANIMAL_ASSET_REVISIONS.duck}`,...ANIMAL_MOTION_PROFILES.duck,head:'duck_head'},
};
export function resolvedAnimalAsset(species:LegacySpecies){const selected=selectedLocalAnimal(species);return {...ANIMAL_ASSETS[species],...animalMotionProfile(species),url:selected?.url??ANIMAL_ASSETS[species].url,drinkDatum:selected?.profile.drinkDatum??{x:0,y:.045,z:ANIMAL_ASSETS[species].muzzleReach},candidateSha256:selected?.sha256??null};}
export function animalAssetProfile(species:FarmSpecies,alpacaInspection?:AlpacaInspectionContext){
 if(isLegacySpecies(species)){const profile=resolvedAnimalAsset(species);return {...profile,drinkDatum:profile.drinkDatum,neckChain:[`${species}_neck_01`,`${species}_neck_02`,profile.head],footChains:undefined};}
 const provider=getHunyuanMainResource(species,alpacaInspection);if(!provider)throw new Error('Alpaca resources unavailable; verified provider or explicit inspection resource required');
 return {url:provider.url,stride:provider.profile.motion.stride,muzzleReach:provider.profile.motion.muzzleReach,head:HUNYUAN_DESCRIPTORS[species].neckChain[2],drinkDatum:provider.profile.drinkDatum,neckChain:HUNYUAN_DESCRIPTORS[species].neckChain,footChains:HUNYUAN_DESCRIPTORS[species].footChains};
}
export function validateAnimalAsset(scene:THREE.Object3D,clips:THREE.AnimationClip[],species:FarmSpecies){
 if(!isLegacySpecies(species)){validateHunyuanMainLoadedAsset({scene,animations:clips} as GLTF,species);return;}
 const bones=new Map<string,THREE.Bone>();let skins=0;
 scene.traverse(o=>{
  if(o instanceof THREE.Bone)bones.set(o.name,o);
  if(o instanceof THREE.Mesh){
   if(!(o instanceof THREE.SkinnedMesh))throw new Error(`${species} asset has detached unskinned mesh ${o.name}`);
   const positions=o.geometry.getAttribute('position'),weights=o.geometry.getAttribute('skinWeight'),indices=o.geometry.getAttribute('skinIndex');
   if(!positions?.count||weights?.count!==positions.count||indices?.count!==positions.count||!o.skeleton.bones.length)throw new Error(`${species} asset has incomplete skin ${o.name}`);
   skins++;
  }
 });
 if(!skins)throw new Error(`${species} asset has no real skinned meshes`);
 const feet=species==='duck'?['duck_L_foot','duck_R_foot']:['front_L','front_R','back_L','back_R'].map(side=>`${species}_${side}_${species==='bunny'?'paw':'hoof'}`);
 for(const name of ['feeding-mouth','animal-support','animal-head','animal-ground',ANIMAL_ASSETS[species].head,...feet])if(!bones.has(name))throw new Error(`${species} asset missing anchor ${name}`);
 const neck1=bones.get(`${species}_neck_01`),neck2=bones.get(`${species}_neck_02`),head=bones.get(ANIMAL_ASSETS[species].head);
 if(!neck1||!neck2||neck2.parent!==neck1||head?.parent!==neck2)throw new Error(`${species} asset has an invalid contact neck chain`);
 for(const name of ANIMAL_CLIPS){
  const clip=clips.find(c=>c.name===name);if(!clip?.tracks.length||!(clip.duration>0))throw new Error(`${species} asset missing animation ${name}`);
  let deforms=false;
  for(const track of clip.tracks){const target=THREE.PropertyBinding.parseTrackName(track.name).nodeName;if(!bones.has(target))throw new Error(`${species} animation ${name} has unbound bone target ${target}`);if(target.startsWith(`${species}_`)&&!target.endsWith('_root'))deforms=true;}
  if(!deforms)throw new Error(`${species} animation ${name} has no deforming bone tracks`);
 }
}
export type AnimalAssetInstance={scene:THREE.Group;animations:THREE.AnimationClip[];release:()=>void};
/** Templates are never animated or attached to a World. Only cloned bones/materials are mutable.
 * The five tiny template geometries stay cached for the page lifetime, not one fetch per animal. */
export class AnimalAssetLibrary{
 private templates=new Map<FarmSpecies,Promise<GLTF>>();
 private attempts=new Map<FarmSpecies,number>();
 private load:(url:string)=>Promise<GLTF>;
 private loadBudget=new AnimalModelLoadBudget();
 constructor(load:(url:string)=>Promise<GLTF>=url=>new GLTFLoader().loadAsync(url)){this.load=load;}
 private template(species:FarmSpecies,retry=false,alpacaInspection?:AlpacaInspectionContext){
  if(!isLegacySpecies(species))return this.loadBudget.run(async()=>{const registry=species==='alpaca'?alpacaProvider:penguinProvider;if(!alpacaInspection&&!getHunyuanMainResource(species))await prepareActiveMainAnimalModel(species,{retry});const provider=getHunyuanMainResource(species,alpacaInspection);if(!provider)throw new Error(alpacaInspection?`${species} inspection resource unavailable`:registry.status().error??`${species} resources unavailable; no verified deployment`);validateAnimalAsset(provider.template.scene,provider.template.animations,species);return provider.template;});
  let pending=this.templates.get(species);
  if(!pending){const attemptNumber=this.attempts.get(species)??0;this.attempts.set(species,attemptNumber+1);const profile=resolvedAnimalAsset(species),url=profile.url+(attemptNumber?`&retry=${attemptNumber}`:'');const selectedTemplate=selectedLocalAnimalTemplate(species);pending=this.loadBudget.run(async()=>{const asset=selectedTemplate??await this.load(url);validateAnimalAsset(asset.scene,asset.animations,species);await registerAnimalPickCache(species,asset);return asset;});this.templates.set(species,pending);const attempt=pending;void pending.catch(()=>{if(this.templates.get(species)===attempt)this.templates.delete(species);});}
  return pending;
 }
 preload(species:FarmSpecies[]){return Promise.all(species.map(async name=>{try{await this.template(name);return {species:name,ready:true,error:null};}catch(error){return {species:name,ready:false,error:error instanceof Error?error.message:String(error)};}}));}
 async instantiate(species:FarmSpecies,options:{retry?:boolean;alpacaInspection?:AlpacaInspectionContext}={}):Promise<AnimalAssetInstance>{
  if(options.alpacaInspection!=null)assertHunyuanMainInspectionContext(options.alpacaInspection);
  const template=await this.template(species,options.retry,options.alpacaInspection),scene=cloneSkeleton(template.scene) as THREE.Group;
  const materials=new Map<THREE.Material,THREE.Material>(),skeletons=new Set<THREE.Skeleton>();
  const own=(source:THREE.Material)=>{let cloned=materials.get(source);if(!cloned){cloned=source.clone();materials.set(source,cloned);}return cloned;};
  scene.traverse(o=>{if(o instanceof THREE.Mesh){o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);o.castShadow=true;o.receiveShadow=true;if(o instanceof THREE.SkinnedMesh){o.frustumCulled=false;const same=[...skeletons].find(s=>s.bones.length===o.skeleton.bones.length&&s.bones.every((bone,i)=>bone===o.skeleton.bones[i]&&s.boneInverses[i].equals(o.skeleton.boneInverses[i])));if(same){o.skeleton.dispose();o.skeleton=same;}else skeletons.add(o.skeleton);}}});
  let released=false;return {scene,animations:template.animations,release(){if(released)return;released=true;scene.removeFromParent();materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());}};
 }
}
export const animalAssetLibrary=new AnimalAssetLibrary();
