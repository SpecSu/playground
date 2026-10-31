import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {AnimalPickCacheRegistry,type AnimalPickCacheArtifact} from '../src/minimal/animal-pick-cache.ts';
import {ANIMAL_PICK_CACHE_DATA} from '../src/minimal/animal-pick-cache-data.ts';
import {cacheGeometry,sampleGeometry} from '../src/minimal/animal-picking-geometry.ts';
import {AnimalAssetLibrary} from '../src/minimal/animal-assets.ts';
import {AnimalPickSampler} from '../src/minimal/animal-picking.ts';
import type {Species} from '../src/minimal/model.ts';

async function load(species:Species){const bytes=readFileSync(new URL(`../public/models/farm/${species}-animated.glb`,import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:'PICK_CACHE_SKIP_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
function skins(asset:GLTF){const meshes:THREE.SkinnedMesh[]=[];asset.scene.traverse(node=>{if(node instanceof THREE.SkinnedMesh)meshes.push(node);});return meshes;}
const digest=(bytes:Uint8Array<ArrayBuffer>)=>webcrypto.subtle.digest('SHA-256',bytes);
const artifact=()=>structuredClone(ANIMAL_PICK_CACHE_DATA) as AnimalPickCacheArtifact;

test('strict static cache matches the dynamic builder across all five delivered skins',async t=>{
 for(const species of ['cow','sheep','pig','bunny','duck'] as Species[])await t.test(species,async()=>{
  const source=await load(species),registry=new AnimalPickCacheRegistry({digest});assert.equal(await registry.register(species,source),true);
  for(const mesh of skins(source)){const cached=registry.get(mesh);assert.ok(cached);const expected=cacheGeometry(mesh.geometry);expected.samples=sampleGeometry(mesh.geometry);assert.deepEqual(cached,expected,'cache preserves exact regions, weight endpoints and sample order');}
 });
});

test('one validated template serves all shared-geometry clones without repeated hashes or actor references',async()=>{
 const source=await load('cow');let hashes=0;const registry=new AnimalPickCacheRegistry({digest:bytes=>{hashes++;return digest(bytes);}}),first=registry.register('cow',source),again=registry.register('cow',source);assert.equal(first,again);assert.equal(await first,true);assert.equal(hashes,skins(source).length);
 const original=skins(source),clones=Array.from({length:16},()=>cloneSkeleton(source.scene));for(const clone of clones){const copied:THREE.SkinnedMesh[]=[];clone.traverse(node=>{if(node instanceof THREE.SkinnedMesh)copied.push(node);});copied.forEach((mesh,i)=>{assert.equal(mesh.geometry,original[i].geometry);assert.equal(registry.get(mesh),registry.get(original[i]));});clone.clear();}
 assert.equal(hashes,original.length);const numericOnly=(value:unknown):boolean=>{if(value instanceof THREE.Object3D||value instanceof THREE.BufferGeometry||value instanceof THREE.Material)return false;if(Array.isArray(value))return value.every(numericOnly);if(value&&typeof value==='object')return Object.values(value).every(numericOnly);return true;};assert.equal(numericOnly(registry.get(original[0])),true);
});

test('stale or malformed artifacts fail closed to dynamic picking without rejecting the model',async t=>{
 const mutations:Array<[string,(data:AnimalPickCacheArtifact)=>void]>=[['revision',data=>{data.models.cow.sha256='0'.repeat(64);}],['algorithm',data=>{data.algorithm++;}],['same-size wrong digest',data=>{data.models.cow.meshes[0].geometrySha256='0'.repeat(64);}],['bone order',data=>{data.models.cow.bones.reverse();}],['missing primitive',data=>{data.models.cow.meshes.pop();}],['bad sample',data=>{const mesh=data.models.cow.meshes[0];mesh.samples[0]=mesh.vertices;}],['nonfinite envelope',data=>{data.models.cow.meshes[0].regions[0][1]=NaN;}],['unsupported layout',data=>{data.attributeLayout[1][2]='Uint16Array';}]];
 for(const [name,mutate] of mutations)await t.test(name,async()=>{const source=await load('cow'),data=artifact();mutate(data);const registry=new AnimalPickCacheRegistry({artifact:data,digest});assert.equal(await registry.register('cow',source),false);assert.equal(registry.get(skins(source)[0]),undefined);assert.ok(skins(source).length>0);});
});

test('same-size loaded geometry tampering and missing parser identity never borrow a cache',async()=>{
 const changed=await load('cow'),mesh=skins(changed)[0],positions=mesh.geometry.getAttribute('position');positions.setX(0,positions.getX(0)+.001);positions.needsUpdate=true;const registry=new AnimalPickCacheRegistry({digest});assert.equal(await registry.register('cow',changed),false);assert.equal(registry.get(mesh),undefined);
 const unknown=await load('cow');unknown.parser.associations.clear();assert.equal(await registry.register('cow',unknown),false);assert.equal(registry.get(skins(unknown)[0]),undefined);
});

test('attribute replacement and supported version changes invalidate registered data',async()=>{
 const source=await load('cow'),registry=new AnimalPickCacheRegistry({digest});assert.equal(await registry.register('cow',source),true);const [first,second]=skins(source);assert.ok(registry.get(first));first.geometry.setAttribute('position',first.geometry.getAttribute('position').clone());assert.equal(registry.get(first),undefined);
 assert.ok(registry.get(second));second.geometry.getAttribute('skinWeight').needsUpdate=true;assert.equal(registry.get(second),undefined);
});

test('multi-primitive mesh identities remain distinct and unavailable or rejected crypto is harmless',async()=>{
 const source=await load('sheep'),registry=new AnimalPickCacheRegistry({digest});assert.equal(await registry.register('sheep',source),true);const identities=skins(source).map(mesh=>source.parser.associations.get(mesh)!);assert.ok(identities.some((identity,i)=>identities.some((other,j)=>i!==j&&identity.meshes===other.meshes&&identity.primitives!==other.primitives)));
 for(const unavailable of [null,async()=>{throw new Error('crypto unavailable');}]){const fallback=new AnimalPickCacheRegistry({digest:unavailable});assert.equal(await fallback.register('sheep',source),false);assert.equal(fallback.get(skins(source)[0]),undefined);}
});

test('cache verification failures do not poison animal loading, retry or idempotent release',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{value:{subtle:{digest:async()=>{throw new Error('verification unavailable');}}},configurable:true});let attempts=0;
 try{const library=new AnimalAssetLibrary(async()=>{if(++attempts===1)throw new Error('temporary asset failure');return load('cow');});await assert.rejects(library.instantiate('cow'),/temporary asset failure/);const instance=await library.instantiate('cow');assert.equal(attempts,2);assert.ok(instance.scene.children.length);instance.release();instance.release();const second=await library.instantiate('cow');assert.equal(attempts,2,'valid loaded template remains cached even when optional verification fails');second.release();}
 finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);}
});

test('an attribute change during asynchronous verification leaves no partially registered primitives',async()=>{
 const source=await load('cow'),meshes=skins(source);let hashes=0;const registry=new AnimalPickCacheRegistry({digest:async bytes=>{if(++hashes===meshes.length)meshes[1].geometry.getAttribute('position').needsUpdate=true;return digest(bytes);}});assert.equal(await registry.register('cow',source),false);for(const mesh of meshes)assert.equal(registry.get(mesh),undefined,'verification is atomic across the template');
});


test('dynamic fallback rebuilds its bind envelopes after a supported attribute mutation',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.1,0,0,.1,0,0,0,.2,0],3));geometry.setAttribute('skinIndex',new THREE.Uint8BufferAttribute(new Uint8Array(12),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));mesh.updateMatrixWorld(true);const sampler=new AnimalPickSampler();sampler.refreshRayBounds(mesh);assert.ok(mesh.boundingBox!.min.x>-.11);const position=geometry.getAttribute('position');position.setX(0,-.4);position.needsUpdate=true;sampler.refreshRayBounds(mesh);assert.ok(mesh.boundingBox!.min.x<=-.4,'stale fallback envelopes are not reused after mutation');geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.skeleton.dispose();
});

test('a validated template reaches the sampler without constructing a duplicate dynamic cache',async()=>{
 // The library entrypoint is exercised with a real parsed GLB but no network.
 const source=await load('cow'),library=new AnimalAssetLibrary(async()=>source),instance=await library.instantiate('cow'),sampler=new AnimalPickSampler();instance.scene.updateMatrixWorld(true);sampler.refreshRayBounds(instance.scene);const dynamic=(sampler as unknown as {geometry:WeakMap<THREE.BufferGeometry,unknown>}).geometry;instance.scene.traverse(node=>{if(node instanceof THREE.SkinnedMesh)assert.equal(dynamic.has(node.geometry),false);});instance.release();
});
