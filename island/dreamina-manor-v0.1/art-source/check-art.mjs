import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createPlantPresentation} from '../lib/art/plant-presentation.js';
import {createFishPresentation,FISH_ART_IDS,individualMotion} from '../lib/art/fish-presentation.js';
import {FISH_STANDARD_SIZES_CM} from '../lib/art/fish-sizing.js';
const content=fs.readFileSync(new URL('../public/assets/world/plants/radish.glb',import.meta.url));
const gltf=await new Promise((yes,no)=>new GLTFLoader().parse(content.buffer.slice(content.byteOffset,content.byteOffset+content.byteLength),'',yes,no));
assert.equal(gltf.animations.length,1);
const p=createPlantPresentation(gltf);const independent=createPlantPresentation(gltf,{variant:'gold'});independent.setGrowth(.2);const separateBox=new THREE.Box3().setFromObject(independent.root).getSize(new THREE.Vector3());const growth=[];
for(const f of [0,.25,.5,.75,1,.2,1]){
 p.setGrowth(f);const b=new THREE.Box3().setFromObject(p.root);growth.push({f,box:b.getSize(new THREE.Vector3()).toArray()});
 assert.equal(p.root.scale.x,1);assert.equal(p.root.scale.y,1);assert.equal(p.root.scale.z,1);
}
assert.ok(growth[0].box[1]<growth[4].box[1]*.5,'initial sprout distinctly smaller');
assert.ok(growth[2].box[1]>growth[0].box[1],'organ growth advances');
assert.ok(Math.abs(growth[4].box[1]-growth[6].box[1])<1e-6,'seeking back then mature works');
assert.ok(new THREE.Box3().setFromObject(independent.root).getSize(new THREE.Vector3()).distanceTo(separateBox)<1e-6,'same source produces independent growth instances');independent.dispose();
assert.notDeepEqual(individualMotion('fish-A'),individualMotion('fish-B'));
for(const id of FISH_ART_IDS){
 const cm=FISH_STANDARD_SIZES_CM[id];const q=createFishPresentation({speciesId:id,lengthCm:cm,worldLength:cm*.01,instanceId:id});
 assert.ok(Math.abs(Math.max(q.dimensions.x,q.dimensions.y,q.dimensions.z)-cm*.01)<1e-4,id+' overall size');
 assert.equal(q.root.scale.x,q.root.scale.y);assert.equal(q.root.scale.y,q.root.scale.z);
 q.dispose();
}
p.dispose();
console.log(JSON.stringify({result:'PASS',checks:'radish GLB one clip, fixed root/seek growth, 20 overall-size models, uniform scaling, independent motion',growth},null,2));
