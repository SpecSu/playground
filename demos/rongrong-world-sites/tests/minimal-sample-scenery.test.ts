import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {sampleFarm} from '../src/minimal/sample-farms.ts';import {SampleScenery} from '../src/minimal/sample-scenery.ts';
test('sample paths and rest points have bounded non-pickable reusable geometry and idempotent disposal',()=>{
 for(const id of ['forest','glacier','oasis','lunar']){
  const scene=new THREE.Group();const scenery=new SampleScenery(scene,sampleFarm(id,1_800_000_000_000),{loadModel:async()=>{throw Error('offline');}});
  assert.equal(scene.children.length,1);let triangles=0,meshes=0,minimumPrimitiveMargin=Infinity;
  // The new court has its own stricter floor/paint/hardware budget and disposal tests.
  const isCourt=(o:THREE.Object3D)=>{for(let p:THREE.Object3D|null=o;p;p=p.parent)if(p===scenery.court?.root)return true;return false;};
  scenery.root.traverse(o=>{if(o instanceof THREE.Mesh&&!isCourt(o)){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;meshes++;assert.equal(o.userData.pickTarget,undefined);assert.equal(o.userData.target,undefined);}});
  assert.ok(meshes>=15&&meshes<=40,`${id}: ${meshes}`);assert.ok(triangles<1500,`${id}: ${triangles}`);
  scenery.root.updateMatrixWorld(true);scenery.root.traverse(o=>{if(!(o instanceof THREE.Mesh)||isCourt(o))return;const bounds=new THREE.Box3().setFromObject(o,true);assert.ok(bounds.min.x>=-10&&bounds.max.x<=10&&bounds.min.z>=-10&&bounds.max.z<=10,`${id}: ${o.name} extends beyond the existing terrain floor`);if(o.name==='sample-low-path')assert.ok(bounds.max.y<=.055,`${id}: path is cosmetic, not a raised walk platform`);else {const clearance=Math.hypot(Math.max(-4-bounds.max.x,bounds.min.x-8,0),Math.max(-4-bounds.max.z,bounds.min.z-8,0));minimumPrimitiveMargin=Math.min(minimumPrimitiveMargin,clearance);assert.ok(clearance>.3,`${id}: procedural prop ${o.name} must clear owned land by the body radius`);}});
  console.log(JSON.stringify({theme:id,proceduralMeshes:meshes,proceduralTriangles:triangles,minimumPrimitiveMargin}));
  assert.ok(scenery.landmarks.length<=6);assert.ok(scenery.landmarks.every(p=>p.maxDimension<=1.45));for(const p of scenery.landmarks){const x=p.x/2+1.5,half=p.maxDimension*Math.SQRT2/4;assert.ok(x+half<-.5||x-half>5.5,`decorative landmark ${p.id} must stay outside the owned walkable footprint`);}
  const owned=new Set<THREE.BufferGeometry|THREE.Material>();scenery.root.traverse(o=>{if(o instanceof THREE.Mesh){owned.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])owned.add(m);}});let releases=0;for(const resource of owned)resource.addEventListener('dispose',()=>releases++);scenery.dispose();scenery.dispose();assert.equal(scene.children.length,0);assert.equal(releases,owned.size,'each visitor-owned geometry/material is released exactly once');
 }
});
