import {selectedLocalAnimal} from './local-animal-models.ts';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {Species,LegacySpecies} from './model.ts';
import {isLegacySpecies} from './species.ts';
import {ANIMAL_ASSET_REVISIONS} from './animal-asset-revisions.ts';
import {ANIMAL_PICK_CACHE_DATA} from './animal-pick-cache-data.ts';
import {captureGeometryAttributes,geometryAttributesMatch,type GeometryAttributeStamp,type PickGeometry} from './animal-picking-geometry.ts';

export type AnimalPickCacheMesh={id:[number,number];name:string;vertices:number;weights:[number,number];regions:Array<[number,number,number,number,number,number,number]>;samples:number[];geometrySha256:string};
export type AnimalPickCacheModel={sha256:string;bones:string[];meshes:AnimalPickCacheMesh[]};
export type AnimalPickCacheArtifact={schema:number;algorithm:number;three:string;attributeLayout:Array<[string,number,string,boolean,boolean]>;models:Record<LegacySpecies,AnimalPickCacheModel>};
type Digest=(bytes:Uint8Array<ArrayBuffer>)=>Promise<ArrayBuffer>;
type RegisteredGeometry={data:PickGeometry;stamp:GeometryAttributeStamp;bones:string[]};
const layout:Array<[string,number,string,boolean,boolean]>=[['position',3,'Float32Array',false,false],['skinIndex',4,'Uint8Array',false,false],['skinWeight',4,'Float32Array',false,false]];
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');
const validHash=(value:string)=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** Optional acceleration only. Verification failure never rejects a valid model.
 * Template geometry is immutable after registration; supported attribute changes
 * invalidate the record and retain the existing dynamic builder as a fallback. */
export class AnimalPickCacheRegistry{
 private artifact:AnimalPickCacheArtifact;
 private digest:Digest|null;
 private registrations=new WeakMap<THREE.Object3D,Promise<boolean>>();
 private geometries=new WeakMap<THREE.BufferGeometry,RegisteredGeometry>();
 constructor(options:{artifact?:AnimalPickCacheArtifact;digest?:Digest|null}={}){
  this.artifact=options.artifact??ANIMAL_PICK_CACHE_DATA;
  this.digest=options.digest===undefined?async bytes=>{const subtle=globalThis.crypto?.subtle;if(!subtle)throw new Error('Optional picking-cache verification unavailable');return subtle.digest('SHA-256',bytes);}:options.digest;
 }
 register(species:Species,asset:GLTF):Promise<boolean>{
  const existing=this.registrations.get(asset.scene);if(existing)return existing;
  const pending=this.verify(species,asset).catch(()=>false);this.registrations.set(asset.scene,pending);return pending;
 }
 get(mesh:THREE.SkinnedMesh):PickGeometry|undefined{
  const entry=this.geometries.get(mesh.geometry);if(!entry)return undefined;
  if(!geometryAttributesMatch(mesh.geometry,entry.stamp)){this.geometries.delete(mesh.geometry);return undefined;}
  if(mesh.skeleton.bones.length!==entry.bones.length||mesh.skeleton.bones.some((bone,i)=>bone.name!==entry.bones[i]))return undefined;
  return entry.data;
 }
 private async verify(species:Species,asset:GLTF):Promise<boolean>{
  if(!isLegacySpecies(species))return false; // New verified skins use the existing dynamic picker, never a stale legacy cache.
  const artifact=this.artifact,model=artifact.models[species as LegacySpecies],selected=selectedLocalAnimal(species);
  if(selected&&model?.sha256!==selected.sha256)return false; // Dynamic picker until an exact selected-byte cache exists.
  if(!this.digest||artifact.schema!==1||artifact.algorithm!==1||artifact.three!=='0.186.1'||JSON.stringify(artifact.attributeLayout)!==JSON.stringify(layout)||!model||!validHash(model.sha256)||!model.sha256.startsWith(ANIMAL_ASSET_REVISIONS[species]))return false;
  if(!Array.isArray(model.bones)||!model.bones.length||new Set(model.bones).size!==model.bones.length||model.bones.some(name=>typeof name!=='string'||!name))return false;
  const meshes:THREE.SkinnedMesh[]=[];asset.scene.traverse(node=>{if(node instanceof THREE.SkinnedMesh)meshes.push(node);});
  if(meshes.length!==model.meshes.length||!meshes.length||!asset.parser?.associations)return false;
  const records=new Map<string,AnimalPickCacheMesh>();
  for(const record of model.meshes){
   if(!Array.isArray(record.id)||record.id.length!==2||record.id.some(index=>!Number.isInteger(index)||index<0))return false;
   const key=record.id.join(':');if(records.has(key))return false;records.set(key,record);
  }
  const prepared:Array<{mesh:THREE.SkinnedMesh;record:AnimalPickCacheMesh;stamp:GeometryAttributeStamp}>=[],seen=new Set<string>();
  for(const mesh of meshes){
   const identity=asset.parser.associations.get(mesh);if(!identity||!Number.isInteger(identity.meshes)||!Number.isInteger(identity.primitives))return false;
   const key=`${identity.meshes}:${identity.primitives}`,record=records.get(key);if(!record||seen.has(key))return false;seen.add(key);
   const geometry=mesh.geometry;
   if(record.name!==mesh.name||!Number.isInteger(record.vertices)||record.vertices<=0||!validHash(record.geometrySha256)||Object.values(geometry.morphAttributes).some(attributes=>attributes?.length))return false;
   if(mesh.skeleton.bones.length!==model.bones.length||mesh.skeleton.bones.some((bone,i)=>bone.name!==model.bones[i]))return false;
   for(const [name,itemSize,arrayType,normalized,interleaved]of layout){const attribute=geometry.getAttribute(name);if(!attribute||attribute.count!==record.vertices||attribute.itemSize!==itemSize||attribute.normalized!==normalized||(attribute instanceof THREE.InterleavedBufferAttribute)!==interleaved||attribute.array.constructor.name!==arrayType)return false;}
   if(record.weights.length!==2||!record.weights.every(Number.isFinite)||record.weights[0]<0||record.weights[1]<=0||record.weights[0]>record.weights[1]||!record.regions.length||!record.samples.length)return false;
   const bones=new Set<number>();for(const region of record.regions){if(region.length!==7||!region.every(Number.isFinite)||!Number.isInteger(region[0])||region[0]<0||region[0]>=model.bones.length||bones.has(region[0])||region[1]>region[4]||region[2]>region[5]||region[3]>region[6])return false;bones.add(region[0]);}
   if(record.samples.some(index=>!Number.isInteger(index)||index<0||index>=record.vertices)||new Set(record.samples).size!==record.samples.length)return false;
   prepared.push({mesh,record,stamp:captureGeometryAttributes(geometry)});
  }
  // Hash the loaded arrays, after GLTFLoader's weight normalization. The compact
  // input copy is once per template, never per clone, click or rendered frame.
  for(const {mesh,record,stamp}of prepared){
   const arrays=layout.map(([name])=>mesh.geometry.getAttribute(name).array),bytes=new Uint8Array(arrays.reduce((total,array)=>total+array.byteLength,0));let offset=0;
   for(const array of arrays){const source=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);bytes.set(source,offset);offset+=source.byteLength;}
   if(hex(await this.digest(bytes))!==record.geometrySha256||!geometryAttributesMatch(mesh.geometry,stamp))return false;
  }
  // Register atomically only after every primitive has passed verification.
  if(prepared.some(({mesh,stamp})=>!geometryAttributesMatch(mesh.geometry,stamp)))return false;
  for(const {mesh,record,stamp}of prepared){
   const data:PickGeometry={regions:record.regions.map(([bone,minX,minY,minZ,maxX,maxY,maxZ])=>({bone,bounds:new THREE.Box3(new THREE.Vector3(minX,minY,minZ),new THREE.Vector3(maxX,maxY,maxZ))})),samples:record.samples.slice(),minimumWeight:record.weights[0],maximumWeight:record.weights[1],valid:true};
   this.geometries.set(mesh.geometry,{data,stamp,bones:model.bones.slice()});
  }
  return true;
 }
}
const animalPickCache=new AnimalPickCacheRegistry();
export const registerAnimalPickCache=(species:Species,asset:GLTF)=>animalPickCache.register(species,asset);
export const registeredAnimalPickGeometry=(mesh:THREE.SkinnedMesh)=>animalPickCache.get(mesh);
