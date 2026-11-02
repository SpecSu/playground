import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createPlantPresentation} from '../lib/art/plant-presentation.js';import {PLANT_STANDARD_METRES,PLANT_WIDTH_BUDGET_METRES} from '../lib/art/plant-sizing.js';
const out=[];
for(const species of Object.keys(PLANT_STANDARD_METRES)){
 const path=new URL(`../public/assets/world/plants/${species}.glb`,import.meta.url);if(!fs.existsSync(path)){out.push({species,status:'not exported yet'});continue;}
 const c=fs.readFileSync(path);const gltf=await new Promise((yes,no)=>new GLTFLoader().parse(c.buffer.slice(c.byteOffset,c.byteOffset+c.byteLength),'',yes,no));assert.equal(gltf.animations.length,1,species+' single Growth clip');
 const original=[];gltf.scene.traverse(n=>{if(n.isMesh)original.push([n.uuid,(Array.isArray(n.material)?n.material:[n.material]).map(m=>m.color.getHex())]);});
 const normal=createPlantPresentation(gltf),gold=createPlantPresentation(gltf,{variant:'gold'}),giant=createPlantPresentation(gltf,{instanceScale:1.3});
 const measures=[];for(const v of [0,.5,1,.2,1]){normal.setGrowth(v);gold.setGrowth(v);giant.setGrowth(v);for(const p of [normal,gold,giant])p.root.updateMatrixWorld(true);
 const size=new THREE.Box3().setFromObject(normal.root).getSize(new THREE.Vector3()),large=new THREE.Box3().setFromObject(giant.root).getSize(new THREE.Vector3());
 assert.ok(large.clone().multiplyScalar(1/1.3).distanceTo(size)<.0001,species+' true relative giant size');assert.equal(normal.root.scale.x,1);measures.push(size.toArray());}
 const after=[];gltf.scene.traverse(n=>{if(n.isMesh)after.push([n.uuid,(Array.isArray(n.material)?n.material:[n.material]).map(m=>m.color.getHex())]);});assert.deepEqual(original,after,species+' source materials untouched');
 const colors=p=>{const a=[];p.root.traverse(n=>{if(n.isMesh)a.push((Array.isArray(n.material)?n.material:[n.material]).map(m=>m.color.getHex()));});return a;};assert.deepEqual(colors(normal),colors(giant),species+' normal instances not contaminated by gold');assert.notDeepEqual(colors(normal),colors(gold),species+' gold visibly distinct materials');
 assert.ok(new THREE.Vector3(...measures[2]).distanceTo(new THREE.Vector3(...measures[4]))<1e-5,species+' reverse seek restores');
 normal.setGrowth(.2);gold.setGrowth(.8);const a=colors(normal);gold.root.traverse(n=>{if(n.isMesh){const m=Array.isArray(n.material)?n.material[0]:n.material;m.color.set('#ff0000');}});assert.deepEqual(a,colors(normal),species+' isolated material changes');
 const raw=JSON.parse(fs.readFileSync(new URL(`../public/assets/world/plants/${species}.json`,import.meta.url)));assert.ok(Math.max(raw.bounds.size[0],raw.bounds.size[2])<=PLANT_WIDTH_BUDGET_METRES[species]+.02,species+' authored footprint within route budget');
 out.push({species,status:'PASS',bytes:c.length,stages:measures.slice(0,3),declaredMetres:PLANT_STANDARD_METRES[species],geometryCount:original.length});[normal,gold,giant].forEach(p=>p.dispose());
}
fs.writeFileSync(new URL('../../art-evidence/botanical-instance-audit.json',import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
