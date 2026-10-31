import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {creativeModelReady,creativeTemplate,creativeEggProgress,type CreativeAsset,type CreativeTemplate} from './creative-assets.ts';
import type {Point} from './model.ts';

export type CreativeSceneStatus='loading'|'ready'|'failed'|'unavailable';
export type CreativeModel={scene:THREE.Group;scenes?:THREE.Group[]};
export type CreativeSceneOptions={
 /** View clock only; hatching is always checked by the authority. */
 now?:()=>number;
 groundHeight?:(position:Point)=>number;
 /** Trusted catalogue models only. The loader transfers ownership of each returned model. */
 loadModel?:(url:string)=>Promise<CreativeModel>;
 /** Maximum dimension in world units. Defaults to .85 for creatures and 1.25 for props. */
 sizeForAsset?:(asset:CreativeAsset,template:CreativeTemplate)=>number;
};
export type CreativeScenePose={animalId:string;position:{x:number;y:number;z:number};scale:number;heading:number;carried:boolean};
type Entry={asset:CreativeAsset;pose?:CreativeScenePose;fingerprint:string;status:CreativeSceneStatus;cacheKey?:string;root?:THREE.Group;release?:()=>void;baseHeight:number};
type TemplateLoad={alive:boolean;status:'loading'|'ready'|'failed';model?:CreativeModel;release?:()=>void};

/** Dispose unique GPU resources once, including unused scenes in an imported GLB. */
function ownModels(scenes:THREE.Object3D[]):()=>void{
 let released=false;
 return ()=>{
  if(released)return;released=true;
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
  for(const scene of scenes){scene.removeFromParent();scene.traverse(object=>{
   if(!(object instanceof THREE.Mesh))return;
   geometries.add(object.geometry);
   if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);
   for(const material of Array.isArray(object.material)?object.material:[object.material]){
    materials.add(material);
    for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
   }
  });}
  skeletons.forEach(resource=>resource.dispose());geometries.forEach(resource=>resource.dispose());materials.forEach(resource=>resource.dispose());textures.forEach(resource=>resource.dispose());
  const images=new Set([...textures].map(texture=>texture.source.data as unknown));
  for(const image of images)if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();
 };
}
function cloneModel(source:THREE.Group):{scene:THREE.Group;release:()=>void}{
 const scene=cloneSkeleton(source) as THREE.Group,materials=new Map<THREE.Material,THREE.Material>(),skeletons=new Set<THREE.Skeleton>();
 const own=(material:THREE.Material)=>{let value=materials.get(material);if(!value){value=material.clone();materials.set(material,value);}return value;};
 scene.traverse(object=>{if(object instanceof THREE.Mesh){object.material=Array.isArray(object.material)?object.material.map(own):own(object.material);object.castShadow=true;object.receiveShadow=true;if(object instanceof THREE.SkinnedMesh){skeletons.add(object.skeleton);object.frustumCulled=false;}}});
 let released=false;return {scene,release(){if(released)return;released=true;scene.removeFromParent();materials.forEach(material=>material.dispose());skeletons.forEach(skeleton=>skeleton.dispose());}};
}
function modelBounds(scene:THREE.Object3D):THREE.Box3{
 scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(scene,true),size=bounds.getSize(new THREE.Vector3());
 if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||Math.max(size.x,size.y,size.z)<=1e-6)throw new Error('Creative model has no finite visible bounds');
 return bounds;
}
function authoredEgg(){
 const scene=new THREE.Group();scene.name='authored-demo-creative-egg';
 const points=[new THREE.Vector2(0,0),new THREE.Vector2(.13,.025),new THREE.Vector2(.195,.14),new THREE.Vector2(.17,.29),new THREE.Vector2(.095,.4),new THREE.Vector2(0,.45)];
 const shell=new THREE.Mesh(new THREE.LatheGeometry(points,16),new THREE.MeshStandardMaterial({color:'#d9c7ec',roughness:.65}));shell.castShadow=true;scene.add(shell);
 const band=new THREE.Mesh(new THREE.TorusGeometry(.19,.014,5,24),new THREE.MeshStandardMaterial({color:'#e4bc69',roughness:.48}));band.rotation.x=Math.PI/2;band.position.y=.14;scene.add(band);
 const track=new THREE.Mesh(new THREE.RingGeometry(.25,.29,32),new THREE.MeshBasicMaterial({color:'#665976',side:THREE.DoubleSide}));track.rotation.x=-Math.PI/2;track.position.y=.008;scene.add(track);
 const progress=new THREE.Mesh(new THREE.RingGeometry(.25,.29,32,1,0,.001),new THREE.MeshBasicMaterial({color:'#f3ce77',side:THREE.DoubleSide}));progress.name='creative-egg-progress';progress.rotation.x=-Math.PI/2;progress.position.y=.012;scene.add(progress);
 return {scene,release:ownModels([scene])};
}

/** View-only adapter: never chooses legal positions, changes inventory, or invents a generated model.
 * Models are statically posed. tick() adds a tiny optional whole-root idle bob, not skeletal motion.
 * Each adapter owns its loader resources. Call dispose() when its World/account is replaced.
 */
export class CreativeScene{
 private readonly parent:THREE.Object3D;
 private readonly catalog:readonly CreativeTemplate[];
 private readonly options:CreativeSceneOptions;
 private readonly load:(url:string)=>Promise<CreativeModel>;
 private readonly entries=new Map<string,Entry>();
 private readonly templates=new Map<string,TemplateLoad>();
 private readonly attempts=new Map<string,number>();
 private disposed=false;
 constructor(parent:THREE.Scene|THREE.Group,catalog:readonly CreativeTemplate[],options:CreativeSceneOptions={}){
  this.parent=parent;this.catalog=catalog;this.options=options;this.load=options.loadModel??(url=>new GLTFLoader().loadAsync(url));
 }
 status(assetId:string):CreativeSceneStatus|undefined{return this.entries.get(assetId)?.status;}
 rootForAsset(assetId:string):THREE.Group|undefined{return this.entries.get(assetId)?.root;}
 update(assets:readonly CreativeAsset[],poses:ReadonlyMap<string,CreativeScenePose>=new Map()):void{
  if(this.disposed)return;
  const wanted=new Set<string>();
  for(const input of assets){
   if(input.location!=='ground'||!input.position||!Number.isFinite(input.position.x)||!Number.isFinite(input.position.z)||wanted.has(input.id))continue;
   wanted.add(input.id);const asset={...input,position:{...input.position}},template=creativeTemplate(this.catalog,asset.templateId);
   const compatible=asset.kind==='custom-egg'?!!template:template?.kind===(asset.kind==='prop'?'prop':'creature');
   const ready=compatible&&creativeModelReady(template);
   const cacheKey=ready&&template?.model.status==='ready'?`${template.model.url}:${template.model.sha256}`:undefined;
   const fingerprint=`${asset.kind}:${asset.templateId}:${cacheKey??'unavailable'}`;
   let entry=this.entries.get(asset.id);
   if(entry&&entry.fingerprint!==fingerprint){this.remove(entry);this.entries.delete(asset.id);entry=undefined;}
   if(!entry){
    entry={asset,fingerprint,status:'unavailable',baseHeight:0};this.entries.set(asset.id,entry);
    if(ready&&template){
     if(asset.kind==='custom-egg'){const egg=authoredEgg();this.attach(entry,egg,template,'authored-demo');}
     else if(cacheKey){entry.cacheKey=cacheKey;const cached=this.templates.get(cacheKey)??this.startLoad(cacheKey,template);entry.status=cached.status;if(cached.status==='ready')this.instantiate(entry,cached,template);}
    }
   }
   entry.asset=asset;entry.pose=poses.get(asset.id);this.position(entry);this.eggProgress(entry);
  }
  for(const [id,entry] of this.entries)if(!wanted.has(id)){this.remove(entry);this.entries.delete(id);}
  this.prune();
 }
 private position(entry:Entry){
  if(!entry.root||!entry.asset.position)return;
  const pose=entry.pose;
  const height=pose?.position.y??this.options.groundHeight?.(entry.asset.position)??0;entry.baseHeight=Number.isFinite(height)?height:0;
  entry.root.position.set(pose?.position.x??entry.asset.position.x,entry.baseHeight,pose?.position.z??entry.asset.position.z);
  if(pose){entry.root.scale.setScalar(pose.scale);entry.root.rotation.y=pose.heading;entry.root.userData.target={kind:'animal',id:pose.animalId};}else delete entry.root.userData.target;
 }
 private eggProgress(entry:Entry){
  if(!entry.root||entry.asset.kind!=='custom-egg'||!entry.asset.egg)return;
  const progress=Math.floor(creativeEggProgress(entry.asset,this.options.now?.()??Date.now()).progress*100)/100;
  if(entry.root.userData.incubationProgress===progress)return;
  entry.root.userData.incubationProgress=progress;
  const ring=entry.root.getObjectByName('creative-egg-progress') as THREE.Mesh|undefined;
  if(ring){ring.geometry.dispose();ring.geometry=new THREE.RingGeometry(.25,.29,32,1,0,Math.max(.001,progress*Math.PI*2));}
 }
 private startLoad(key:string,template:CreativeTemplate):TemplateLoad{
  const cached:TemplateLoad={alive:true,status:'loading'};this.templates.set(key,cached);
  if(template.model.status!=='ready')return cached;
  const attempt=this.attempts.get(key)??0;this.attempts.set(key,attempt+1);
  const url=`${template.model.url}?rev=${template.model.sha256}${attempt?`&retry=${attempt}`:''}`;
  let pending:Promise<CreativeModel>;try{pending=this.load(url);}catch(error){pending=Promise.reject(error);}
  void pending.then(model=>{
   const release=ownModels([...new Set([model.scene,...(model.scenes??[])])]);
   if(!cached.alive||this.disposed){release();return;}
   try{modelBounds(model.scene);}catch(error){release();throw error;}
   cached.model=model;cached.release=release;cached.status='ready';
   for(const entry of this.entries.values())if(entry.cacheKey===key)this.instantiate(entry,cached,creativeTemplate(this.catalog,entry.asset.templateId)!);
  }).catch(()=>{if(!cached.alive||this.disposed)return;cached.status='failed';for(const entry of this.entries.values())if(entry.cacheKey===key&&!entry.root)entry.status='failed';});
  return cached;
 }
 private instantiate(entry:Entry,cached:TemplateLoad,template:CreativeTemplate){
  if(entry.root||!cached.model)return;
  const instance=cloneModel(cached.model.scene);
  try{
   const size=modelBounds(instance.scene).getSize(new THREE.Vector3()),requested=this.options.sizeForAsset?.(entry.asset,template),target=requested&&Number.isFinite(requested)&&requested>0?requested:entry.asset.kind==='custom-creature'?.85:1.25;
   instance.scene.scale.multiplyScalar(target/Math.max(size.x,size.y,size.z));
   const bounds=modelBounds(instance.scene),center=bounds.getCenter(new THREE.Vector3());instance.scene.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
   this.attach(entry,instance,template,template.model.status==='ready'?template.model.source:'authored-demo');
  }catch{instance.release();entry.status='failed';}
 }
 private attach(entry:Entry,instance:{scene:THREE.Group;release:()=>void},template:CreativeTemplate,source:string){
  const root=new THREE.Group();root.name=`creative-${entry.asset.id}`;root.userData={creativeAssetId:entry.asset.id,creativeAssetKind:entry.asset.kind,creativeTemplateId:template.id,creativeSource:source,motion:'static-or-whole-root-idle'};root.add(instance.scene);
  entry.root=root;entry.release=instance.release;entry.status='ready';this.parent.add(root);this.position(entry);
 }
 private remove(entry:Entry){entry.root?.removeFromParent();entry.release?.();entry.root=undefined;entry.release=undefined;}
 private prune(){
  const used=new Set([...this.entries.values()].map(entry=>entry.cacheKey));
  for(const [key,cached] of this.templates)if(!used.has(key)){cached.alive=false;cached.release?.();this.templates.delete(key);}
 }
 /** Explicit recovery avoids a render/update loop repeatedly hammering a failed URL. */
 retry(assetId?:string):void{
  if(this.disposed)return;
  const failed=new Set([...this.entries.values()].filter(entry=>entry.status==='failed'&&(!assetId||entry.asset.id===assetId)).map(entry=>entry.cacheKey));
  const assets=[...this.entries.values()].map(entry=>entry.asset),poses=new Map([...this.entries.values()].flatMap(entry=>entry.pose?[[entry.asset.id,entry.pose] as const]:[]));
  for(const [id,entry] of this.entries)if(entry.cacheKey&&failed.has(entry.cacheKey)){this.remove(entry);this.entries.delete(id);}
  this.prune();this.update(assets,poses);
 }
 tick(elapsedSeconds:number):void{
  if(this.disposed||!Number.isFinite(elapsedSeconds))return;
  for(const entry of this.entries.values())if(entry.root&&entry.asset.kind==='custom-creature'&&!entry.pose?.carried)entry.root.position.y=entry.baseHeight+(1+Math.sin(elapsedSeconds*1.8))*.012;
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;
  for(const entry of this.entries.values())this.remove(entry);this.entries.clear();
  for(const cached of this.templates.values()){cached.alive=false;cached.release?.();}this.templates.clear();this.attempts.clear();
 }
}
