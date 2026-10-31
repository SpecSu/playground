import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HUNYUAN_ENVIRONMENT_ASSETS,type HunyuanEnvironmentAssetId} from './hunyuan-environment-assets.ts';
export type HunyuanEnvironmentPlacement={id:string;asset:HunyuanEnvironmentAssetId;x:number;z:number;maxDimension:number;yaw?:number;groundY?:number};
type Model={scene:THREE.Group;scenes?:THREE.Group[]};
type Status='loading'|'ready'|'failed';
type Template={alive:boolean;status:Status;model?:Model;bounds?:THREE.Box3;release?:()=>void};
type Entry={placement:HunyuanEnvironmentPlacement;status:Status;root?:THREE.Group};
export type HunyuanEnvironmentOptions={loadModel?:(url:string)=>Promise<Model>};
export const MAX_HUNYUAN_ENVIRONMENT_INSTANCES=12;

function ownModel(model:Model){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 for(const scene of new Set([model.scene,...model.scenes??[]]))scene.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);
  for(const material of Array.isArray(o.material)?o.material:[o.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}
 });
 let released=false;return ()=>{if(released)return;released=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  for(const data of new Set([...textures].map(t=>t.source.data as unknown)))if(typeof ImageBitmap!=='undefined'&&data instanceof ImageBitmap)data.close();
 };
}
function modelBounds(model:Model,asset:HunyuanEnvironmentAssetId){
 let triangles=0,primitives=0;
 model.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(o instanceof THREE.SkinnedMesh)throw new Error('Environment geometry must be static');
  const positions=o.geometry.getAttribute('position');if(!positions?.count)throw new Error('Empty environment geometry');
  for(let i=0;i<positions.count;i++)if(![positions.getX(i),positions.getY(i),positions.getZ(i)].every(Number.isFinite))throw new Error('Non-finite environment geometry');
  triangles+=(o.geometry.index?.count??positions.count)/3;primitives+=Array.isArray(o.material)?Math.max(1,o.geometry.groups.length):1;
 });
 if(!primitives||primitives>4||triangles>HUNYUAN_ENVIRONMENT_ASSETS[asset]!.triangleBudget*1.05)throw new Error('Environment asset exceeds mobile budget');
 model.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.scene,true),size=bounds.getSize(new THREE.Vector3());
 if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||Math.max(size.x,size.y,size.z)<=1e-6)throw new Error('Invalid environment bounds');
 return bounds;
}
function valid(p:HunyuanEnvironmentPlacement){
 const asset=HUNYUAN_ENVIRONMENT_ASSETS[p.asset];return !!asset&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=100&&[p.x,p.z,p.maxDimension,p.yaw??0,p.groundY??0].every(Number.isFinite)&&p.maxDimension>0&&p.maxDimension<=asset.maxDimension;
}
/** One World owns this adapter and its cache. Copies share immutable geometry/materials/textures.
 * Failed/missing loads add nothing, leaving the real continuous ground and existing art intact.
 * Call dispose before a generic scene traversal would dispose shared resources a second time.
 */
export class HunyuanEnvironmentScene{
 readonly root=new THREE.Group();
 private readonly load:(url:string)=>Promise<Model>;
 private readonly entries=new Map<string,Entry>();
 private readonly templates=new Map<HunyuanEnvironmentAssetId,Template>();
 private readonly attempts=new Map<HunyuanEnvironmentAssetId,number>();
 private disposed=false;
 constructor(parent:THREE.Object3D,options:HunyuanEnvironmentOptions={}){this.root.name='hunyuan-environment-decoration';parent.add(this.root);this.load=options.loadModel??(url=>new GLTFLoader().loadAsync(url));}
 status(id:string):Status|undefined{return this.entries.get(id)?.status;}
 update(placements:readonly HunyuanEnvironmentPlacement[]):void{
  if(this.disposed)return;const wanted=new Map<string,HunyuanEnvironmentPlacement>();
  for(const p of placements){if(wanted.size>=MAX_HUNYUAN_ENVIRONMENT_INSTANCES)break;if(valid(p)&&!wanted.has(p.id))wanted.set(p.id,{...p});}
  for(const [id,entry] of this.entries)if(!wanted.has(id)||wanted.get(id)!.asset!==entry.placement.asset){entry.root?.removeFromParent();this.entries.delete(id);}
  for(const [id,placement] of wanted){let entry=this.entries.get(id);if(!entry){entry={placement,status:'loading'};this.entries.set(id,entry);}else entry.placement=placement;}
  this.prune();
  for(const entry of this.entries.values()){
   const asset=entry.placement.asset,cached=this.templates.get(asset)??this.startLoad(asset);entry.status=cached.status;
   if(cached.status==='ready')this.attach(entry,cached);else entry.root?.removeFromParent();
  }
 }
 private startLoad(asset:HunyuanEnvironmentAssetId):Template{
  const cached:Template={alive:true,status:'loading'};this.templates.set(asset,cached);
  const spec=HUNYUAN_ENVIRONMENT_ASSETS[asset]!,attempt=this.attempts.get(asset)??0;this.attempts.set(asset,attempt+1);
  let pending:Promise<Model>;try{pending=this.load(`${spec.url}?rev=${spec.sha256}${attempt?`&retry=${attempt}`:''}`);}catch(error){pending=Promise.reject(error);}
  void pending.then(model=>{
   const release=ownModel(model);if(this.disposed||!cached.alive){release();return;}
   try{cached.bounds=modelBounds(model,asset);}catch(error){release();throw error;}
   cached.model=model;cached.release=release;cached.status='ready';
   for(const entry of this.entries.values())if(entry.placement.asset===asset)this.attach(entry,cached);
  }).catch(()=>{if(this.disposed||!cached.alive)return;cached.status='failed';for(const entry of this.entries.values())if(entry.placement.asset===asset)entry.status='failed';});
  return cached;
 }
 private attach(entry:Entry,cached:Template){
  if(!cached.model||!cached.bounds)return;
  if(!entry.root){const clone=cached.model.scene.clone(true),normalizer=new THREE.Group(),root=new THREE.Group();normalizer.add(clone);root.add(normalizer);root.name=`hunyuan-environment-${entry.placement.id}`;
   root.userData={environmentAsset:entry.placement.asset,source:'hunyuan-generated',decorationOnly:true};
   clone.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});entry.root=root;this.root.add(root);
  }
  const root=entry.root,p=entry.placement,normalizer=root.children[0],bounds=cached.bounds,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=p.maxDimension/Math.max(size.x,size.y,size.z);
  normalizer.scale.setScalar(scale);normalizer.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);root.position.set(p.x,p.groundY??0,p.z);root.rotation.y=p.yaw??0;entry.status='ready';
 }
 // Keep at most five failed-asset tombstones: visibility changes are not a retry request.
 private prune(){const used=new Set([...this.entries.values()].map(e=>e.placement.asset));for(const [asset,cached] of this.templates)if(!used.has(asset)&&cached.status!=='failed'){cached.alive=false;cached.release?.();this.templates.delete(asset);}}
 retry():void{if(this.disposed)return;const placements=[...this.entries.values()].map(e=>e.placement);for(const [asset,cached] of this.templates)if(cached.status==='failed'){cached.alive=false;cached.release?.();this.templates.delete(asset);}this.update(placements);}
 dispose():void{if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.root.clear();this.entries.clear();for(const cached of this.templates.values()){cached.alive=false;cached.release?.();}this.templates.clear();this.attempts.clear();}
}
