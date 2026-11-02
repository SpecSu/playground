import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {tankBounds,fitTankCamera} from '../lib/world/tank-framing.js';
import {createAquariumArt} from '../lib/art/aquarium.js';
import {createCharacterFraming} from '../lib/world/character-framing.js';

const shapes=[
 [{x:0,z:0}],
 Array.from({length:6},(_,x)=>({x:x-3,z:2})),
 [{x:-2,z:3},{x:-1,z:3},{x:0,z:3},{x:-2,z:4},{x:-2,z:5}],
 Array.from({length:16},(_,i)=>({x:i%4,z:Math.floor(i/4)})),
];
const corners=box=>[...Array(8)].map((_,i)=>new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));

test('completed-cell bounds enclose base, glass and upper rim for irregular tanks and water heights',()=>{
 assert.equal(tankBounds([]),null);
 for(const cells of shapes)for(const waterHeight of [2.6,6.3]){
  const geometry=tankBounds(cells,{waterHeight});
  const aquarium=createAquariumArt({cells,waterHeight});
  assert.ok(geometry.bounds.containsBox(aquarium.bounds),'all aquarium art must fit, not just floor or water surface');
  assert.ok(geometry.centre.distanceTo(geometry.bounds.getCenter(new THREE.Vector3()))<1e-12);
  aquarium.dispose();
 }
 const b=tankBounds([{x:2,z:-3}],{cellSize:4,groundY:1,waterHeight:5}).bounds;
 assert.equal(b.min.x,6);assert.equal(b.max.x,10);assert.equal(b.min.z,-14);assert.equal(b.max.z,-10);
 assert.ok(b.min.y<=1&&b.min.y>.999);assert.ok(b.max.y>6.2);
});

test('whole tank fits portrait, landscape and half-screen tray across orbit angles without camera mutation',()=>{
 for(const [width,height] of [[390,844],[1440,900],[800,400]])for(const trayHeight of [0,height/2])for(const cells of shapes)for(const yaw of [0,.6,1.7,3.8,5.9])for(const polar of [.25,.8,1.28]){
  const camera=new THREE.OrthographicCamera(-8,8,8*height/width,-8*height/width,.1,500);
  camera.position.setFromSpherical(new THREE.Spherical(45,polar,yaw));camera.lookAt(new THREE.Vector3());
  const framing=createCharacterFraming(camera,new THREE.Vector3());framing.resize(width,height,trayHeight);
  camera.zoom=3.4;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const original={position:camera.position.clone(),quaternion:camera.quaternion.clone(),zoom:camera.zoom,view:{...camera.view}};
  const {bounds}=tankBounds(cells,{waterHeight:6.3});
  const fit=fitTankCamera(camera,bounds,{width,height,trayHeight});
  assert.ok(fit.zoom>0&&fit.zoom<=8);
  assert.ok(camera.position.equals(original.position));assert.ok(camera.quaternion.equals(original.quaternion));assert.equal(camera.zoom,original.zoom);assert.deepEqual(camera.view,original.view);
  camera.position.add(fit.centre);camera.zoom=fit.zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  for(const corner of corners(bounds)){
   const p=corner.project(camera),x=(p.x+1)*width/2,y=(1-p.y)*height/2;
   assert.ok(x>=16-1e-7&&x<=width-16+1e-7,`horizontal containment ${x}, ${width}`);
   assert.ok(y>=80-1e-7&&y<=height-trayHeight-12+1e-7,`vertical containment ${y}, ${height}, tray ${trayHeight}`);
  }
 }
});

test('fit uses current projection offsets and camera axes rather than arbitrary fish position or size',()=>{
 const camera=new THREE.OrthographicCamera(-8,8,12,-12,.1,500);camera.position.set(17,23,26);camera.lookAt(0,0,0);
 camera.setViewOffset(800,1200,45,210,800,1200);camera.updateMatrixWorld(true);
 const cells=shapes[2],{bounds}=tankBounds(cells),options={width:800,height:1200,trayHeight:480};
 const first=fitTankCamera(camera,bounds,options);
 const unrelatedFish=new THREE.Object3D();unrelatedFish.position.set(10000,-500,300);unrelatedFish.scale.setScalar(5000);
 const next=fitTankCamera(camera,tankBounds(cells).bounds,options);
 assert.equal(next.zoom,first.zoom);assert.ok(next.centre.equals(first.centre));
 camera.position.add(first.centre);camera.zoom=first.zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 for(const p of corners(bounds)){p.project(camera);assert.ok((p.x+1)*400>=16-1e-7&&(p.x+1)*400<=784+1e-7);assert.ok((1-p.y)*600>=80-1e-7&&(1-p.y)*600<=708+1e-7);}
});

test('large tanks may fit below normal player zoom minimum and invalid inputs fail explicitly',()=>{
 const camera=new THREE.OrthographicCamera(-8,8,16,-16,.1,1000);camera.position.set(17,23,26);camera.lookAt(0,0,0);camera.setViewOffset(400,800,0,160,400,800);
 const cells=Array.from({length:80},(_,x)=>({x,z:0}));
 assert.ok(fitTankCamera(camera,tankBounds(cells).bounds,{width:400,height:800,trayHeight:400}).zoom<.3);
 assert.throws(()=>fitTankCamera(camera,tankBounds([{x:0,z:0}]).bounds,{width:0,height:800}),/viewport/i);
 assert.throws(()=>tankBounds([{x:NaN,z:0}]),/cell/i);
});
