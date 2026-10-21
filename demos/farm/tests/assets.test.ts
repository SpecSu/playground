import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import {createClubAvatar} from '../src/avatars/club-avatar-rig.ts';
for(const kind of ['human-lx','miaocuijiao','banana-cat','milk-frog'] as const)test(`${kind} loads the archived skeleton and yields finite articulated poses`,async()=>{
 const bytes=readFileSync(new URL(`../public/avatars/cast-v1/${kind}.glb`,import.meta.url));
 const original=readFileSync(new URL(`../../disco/public/avatars/cast-v1/${kind}.glb`,import.meta.url));assert.deepEqual(bytes,original);
 // Geometry/skin test only: image decoding and WebGL remain browser acceptance gaps.
 const loader=new GLTFLoader();loader.register(()=>({name:'TEST_ONLY_NO_IMAGE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const bones:THREE.Bone[]=[];gltf.scene.traverse(o=>{if(o instanceof THREE.Bone)bones.push(o);});assert.ok(bones.length>=18);
 const avatar=createClubAvatar(kind,'farm-test',{template:gltf.scene});await avatar.ready;assert.equal(avatar.loaded,true);assert.ok(avatar.height>0);
 for(const action of ['dance','bounce','love'] as const){avatar.update(1.7,action,false,.75);avatar.root.updateMatrixWorld(true);avatar.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}
 avatar.dispose();
});
