import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {HUNYUAN_ENVIRONMENT_ASSETS} from '../src/minimal/hunyuan-environment-assets.ts';
import {HunyuanEnvironmentScene,type HunyuanEnvironmentPlacement} from '../src/minimal/hunyuan-environment-scene.ts';

/** The real GLTF parser handles geometry, scene transforms, materials and UVs.
 * Only browser image decoding is replaced at its documented plugin boundary.
 * Texture dimensions/pixels are separately verified from original embedded JPEGs by Pillow/Blender;
 * this CPU test is NOT a WebGL, browser or FPS acceptance result.
 */
async function parseGeometry(bytes:Buffer):Promise<GLTF>{
 const loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEST_TEXTURE_DECODE',loadTexture:async()=>new THREE.Texture()}));
 return loader.parseAsync(new Uint8Array(bytes).buffer,'');
}

test('all five shipped derivatives have their exact recorded hashes, mobile budgets and self-contained textures',()=>{
 assert.deepEqual(Object.keys(HUNYUAN_ENVIRONMENT_ASSETS).sort(),['desert-dunes','glacier-outcrop','pine','rounded-bush','rounded-rock']);
 for(const [id,spec] of Object.entries(HUNYUAN_ENVIRONMENT_ASSETS)){
  const bytes=readFileSync(new URL(`../public${spec.url}`,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256,id);assert.ok(bytes.length<=1_500_000,id);
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));assert.equal(json.meshes.length,1);assert.equal(json.materials.length,1);assert.equal(json.images.length,1);assert.equal(json.images[0].mimeType,'image/jpeg');assert.ok(Number.isInteger(json.images[0].bufferView));assert.equal(json.images[0].uri,undefined);assert.equal(json.buffers[0].uri,undefined);assert.equal(json.skins?.length??0,0);assert.equal(json.animations?.length??0,0);
  let triangles=0;for(const mesh of json.meshes)for(const primitive of mesh.primitives){assert.equal(primitive.mode??4,4);triangles+=json.accessors[primitive.indices].count/3;assert.ok(primitive.attributes.TEXCOORD_0!==undefined);}
  assert.ok(triangles<=spec.triangleBudget*1.05&&triangles>=spec.triangleBudget*.9,`${id}: ${triangles}`);
 }
});

test('real mobile GLB coordinates normalize on a wrapper to max dimension and ground without rewriting loaded geometry',async()=>{
 for(const [asset,spec] of Object.entries(HUNYUAN_ENVIRONMENT_ASSETS)){
  const bytes=readFileSync(new URL(`../public${spec.url}`,import.meta.url)),model=await parseGeometry(bytes),sourceBox=new THREE.Box3().setFromObject(model.scene,true),parent=new THREE.Group();
  const adapter=new HunyuanEnvironmentScene(parent,{loadModel:async()=>model});adapter.update([{id:asset,asset:asset as HunyuanEnvironmentPlacement['asset'],x:7,z:-4,groundY:.03,maxDimension:spec.maxDimension}]);
  for(let i=0;i<4;i++)await Promise.resolve();assert.equal(adapter.status(asset),'ready',asset);assert.equal(adapter.root.children.length,1);
  const box=new THREE.Box3().setFromObject(adapter.root,true),size=box.getSize(new THREE.Vector3());assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-spec.maxDimension)<1e-5,asset);assert.ok(Math.abs(box.min.y-.03)<1e-5,asset);assert.ok(Math.abs((box.min.x+box.max.x)/2-7)<1e-5,asset);assert.ok(Math.abs((box.min.z+box.max.z)/2+4)<1e-5,asset);assert.ok(sourceBox.equals(new THREE.Box3().setFromObject(model.scene,true)),asset);
  adapter.dispose();assert.equal(parent.children.length,0);
 }
});
