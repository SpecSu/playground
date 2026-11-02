import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createYachtWorld} from '../lib/fishing-world.ts';

test('ocean resolves visible moving swells and exposes the same absolute water height',()=>{
 const world=createYachtWorld();
 assert.equal(typeof world.waterHeightAt,'function');
 const positions=world.ocean.geometry.attributes.position;
 assert.ok(positions.count>=20000&&positions.count<=40000,'bounded, sufficiently fine surface mesh');
 world.animate(3);
 let low=Infinity,high=-Infinity;
 for(let i=0;i<positions.count;i++){
  const height=positions.getY(i)+world.ocean.position.y;
  low=Math.min(low,height);high=Math.max(high,height);
  assert.ok(Math.abs(height-world.waterHeightAt(positions.getX(i),positions.getZ(i),3))<1e-6);
 }
 assert.ok(high-low>.6,'swells have visible crest-to-trough height');
 const below=world.scene.getObjectByName('Deep ocean floor');
 assert.ok(below&&below.position.y<low-.5,'no flat layer clips the wave troughs');
 assert.ok(below.geometry.parameters.width>=1000,'distant sea extends past the near wave grid to the fog horizon');
 assert.notEqual(world.waterHeightAt(8,4,3),world.waterHeightAt(8,4,5));
 world.dispose();
});

test('yacht sway is perceptible but slow and keeps every attached point coherent',()=>{
 const world=createYachtWorld(),point=new THREE.Object3D();point.position.set(2,2,5);world.yacht.add(point);
 const samples=[];
 for(let t=0;t<=30;t+=.05){world.animate(t);samples.push([world.yacht.position.y,world.yacht.rotation.x,world.yacht.rotation.z]);}
 for(const [axis,min,max] of [[0,.2,.4],[1,.014,.035],[2,.025,.055]]){
  const values=samples.map(v=>v[axis]);assert.ok(Math.max(...values)-Math.min(...values)>min);assert.ok(Math.max(...values)-Math.min(...values)<max);
 }
 for(let i=1;i<samples.length;i++)assert.ok(Math.abs(samples[i][2]-samples[i-1][2])/.05<.014,'roll is gentle, under .8 degrees per second');
 world.animate(4);world.yacht.updateMatrixWorld(true);
 assert.ok(point.getWorldPosition(new THREE.Vector3()).distanceTo(world.yacht.localToWorld(new THREE.Vector3(2,2,5)))<1e-8);
 world.dispose();
});

test('blue sky has soft distant volumetric cloud groups and reduced motion is deterministic',()=>{
 const world=createYachtWorld();const color=world.scene.background;
 assert.ok(color.b>color.g&&color.g>color.r*1.6,'sky reads blue, not pale gray');
 const clouds=world.scene.getObjectByName('White cloudscape');
 assert.ok(clouds&&clouds.children.length>=10);
 for(const cloud of clouds.children){assert.ok(Math.hypot(cloud.position.x,cloud.position.z)>45);assert.ok(cloud.position.y>=6);assert.ok(cloud.children.length>=4);}
 world.animate(3,true);
 const snapshot=()=>[...world.yacht.position.toArray(),...world.yacht.rotation.toArray(),...world.ocean.geometry.attributes.position.array,...clouds.position.toArray()];
 const still=snapshot();world.animate(200,true);assert.deepEqual(snapshot(),still);
 assert.equal(world.waterHeightAt(8,4,3,true),world.waterHeightAt(8,4,200,true));
 world.dispose();
});

test('default deck view shows cloud volumes in the clear sky band from every berth',async()=>{
 const {FISHING_RENDER_SEATS}=await import('../lib/fishing-world.ts');
 const {FishingCameraController}=await import('../lib/fishing-camera.ts');
 const world=createYachtWorld();world.scene.updateMatrixWorld(true);
 for(const [index,seat] of FISHING_RENDER_SEATS.entries()){
  const pose=new FishingCameraController().update({mode:'deck',subject:{id:'test',position:seat,height:2,width:1.4}},35,390/758);
  const camera=new THREE.PerspectiveCamera(35,390/758,.15,240);
  camera.position.copy(pose.position);camera.lookAt(pose.target.x,pose.target.y,pose.target.z);camera.setViewOffset(390,758,0,24,390,758);camera.updateMatrixWorld(true);
  let visible=0;world.scene.getObjectByName('White cloudscape').traverse(object=>{
   if(!object.isMesh)return;const p=object.getWorldPosition(new THREE.Vector3()).project(camera),screenY=(-p.y*.5+.5)*758;
   if(Math.abs(p.x)<.75&&screenY>195&&screenY<300&&p.z<1)visible++;
  });
  assert.ok(visible>=1,`berth ${index} has white clouds below the top HUD`);
 }
 world.dispose();
});
