import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ANIMAL_ASSET_REVISIONS} from '../src/minimal/animal-asset-revisions.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('../scripts/generate-animal-pick-cache.ts',import.meta.url));
const committed=fileURLToPath(new URL('../src/minimal/animal-pick-cache-data.ts',import.meta.url));
function generate(...args:string[]){
 const result=spawnSync(process.execPath,['--experimental-strip-types',script,...args],{cwd:root,encoding:'utf8'});
 assert.equal(result.error,undefined);
 return {status:result.status,output:result.stdout+result.stderr};
}

test('offline animal pick cache freshly reproduces the committed bytes and check never repairs missing or stale output',()=>{
 const directory=mkdtempSync(join(tmpdir(),'animal-pick-cache-generator-')),output=join(directory,'cache.ts');
 try{
  const fresh=generate('--output',output);
  assert.equal(fresh.status,0,fresh.output);
  assert.equal(readFileSync(output,'utf8'),readFileSync(committed,'utf8'),'freshly loaded fixed GLBs must reproduce the committed typed artifact exactly');
  const check=generate('--check','--output',output);
  assert.equal(check.status,0,check.output);
  const original=readFileSync(output,'utf8');
  writeFileSync(output,original+'// stale\n');
  const stale=generate('--check','--output',output);
  assert.equal(stale.status,1,stale.output);
  assert.match(stale.output,/stale/i);
  assert.equal(readFileSync(output,'utf8'),original+'// stale\n','check is read-only');
  rmSync(output);
  const missing=generate('--check','--output',output);
  assert.equal(missing.status,1,missing.output);
  assert.match(missing.output,/missing/i);
  assert.throws(()=>readFileSync(output),{code:'ENOENT'});
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('offline cache builder rejects a GLB whose full SHA no longer matches the URL revision prefix',async()=>{
 const {buildAnimalPickCache}=await import('../scripts/generate-animal-pick-cache.ts');
 await assert.rejects(buildAnimalPickCache({...ANIMAL_ASSET_REVISIONS,cow:'0000000000000000'}),/cow.*revision/i);
});

test('offline cache builder refuses unsupported layouts and ambiguous or malformed loaded skins instead of guessing',async()=>{
 const {buildAnimalPickModel}=await import('../scripts/generate-animal-pick-cache.ts');
 const bytes=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url)),loader=new GLTFLoader();
 // Texture pixels do not participate in loaded position or skin attributes.
 loader.register(()=>({name:'TEST_SKIP_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const meshes:THREE.SkinnedMesh[]=[];gltf.scene.traverse(node=>{if(node instanceof THREE.SkinnedMesh)meshes.push(node);});
 const first=meshes[0],geometry=first.geometry,position=geometry.getAttribute('position'),weights=geometry.getAttribute('skinWeight'),indices=geometry.getAttribute('skinIndex');
 const association=gltf.parser.associations.get(first)!;
 gltf.parser.associations.delete(first);
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/association/i);
 gltf.parser.associations.set(first,{meshes:99999,primitives:0});
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/association/i);
 gltf.parser.associations.set(first,association);
 const secondAssociation=gltf.parser.associations.get(meshes[1])!;
 gltf.parser.associations.set(meshes[1],association);
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/duplicate.*association/i);
 gltf.parser.associations.set(meshes[1],secondAssociation);
 const secondGeometry=meshes[1].geometry;meshes[1].geometry=geometry;
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/shared.*geometry/i);
 meshes[1].geometry=secondGeometry;
 const skeleton=meshes[1].skeleton;meshes[1].skeleton=new THREE.Skeleton([...skeleton.bones].reverse(),[...skeleton.boneInverses].reverse());
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/ordered bones/i);
 meshes[1].skeleton.dispose();meshes[1].skeleton=skeleton;
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/incomplete skin|count/i);
 geometry.setAttribute('position',position);
 position.normalized=true;
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/layout/i);
 position.normalized=false;
 geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(position.count*3),3),3,0));
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/layout/i);
 geometry.setAttribute('position',position);
 geometry.morphAttributes.position=[position];
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/morph/i);
 delete geometry.morphAttributes.position;
 const x=position.getX(0);position.setX(0,NaN);
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/invalid|nonfinite/i);
 position.setX(0,x);
 const weight=weights.getX(0);weights.setX(0,-1);
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/invalid|negative/i);
 weights.setX(0,weight);
 const bone=indices.getX(0);indices.setX(0,255);
 assert.throws(()=>buildAnimalPickModel('cow',gltf,bytes),/bone|invalid/i);
 indices.setX(0,bone);
 const record=buildAnimalPickModel('cow',gltf,bytes);
 assert.equal(record.sha256,'a48d6664d9e8b1dc056fdf002bc73d5d60eec296e8e2c21babb6f4765a9ad0cd');
 assert.equal(record.meshes.length,9);
 assert.equal(record.meshes.reduce((count,mesh)=>count+mesh.vertices,0),19014);
 assert.equal(record.meshes.reduce((count,mesh)=>count+mesh.samples.length,0),4965);
});
