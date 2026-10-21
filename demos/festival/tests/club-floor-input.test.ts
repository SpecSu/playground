import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { makeClubEnvironment } from '../lib/club-scene-environment.ts';
import { ClubCameraController } from '../lib/club-camera.ts';
import { constrainManualPosition, isManualWalkable } from '../lib/club-manual-motion.ts';
import { stagePosition } from '../lib/club-scene-math.ts';
const modulePath = new URL('../lib/club-floor-input.ts', import.meta.url);
async function input() { assert.ok(existsSync(modulePath), 'floor input module exists'); return import('../lib/club-floor-input.ts'); }
const bounds = { left: 40, top: 20, width: 390, height: 844 };
const pointer = (patch = {}) => ({ pointerId: 1, clientX: 180, clientY: 340, button: 0, isPrimary: true, pointerType: 'mouse', timeStamp: 100, ...patch });

test('quick floor release is a single tap and tiny jitter never rotates the view', async () => {
 const { FloorPointerGesture } = await input(); const gesture = new FloorPointerGesture();
 assert.equal(gesture.begin(pointer()), true);
 assert.equal(gesture.move(pointer({clientX:183})), null);
 assert.deepEqual(gesture.end(pointer({clientX:183,timeStamp:250}),bounds), {x:183,y:340});
 assert.equal(gesture.end(pointer({timeStamp:251}),bounds), null);
});
test('drag crossing threshold includes initial displacement and cannot become a click after returning',async()=>{
 const {FloorPointerGesture}=await input(); const gesture=new FloorPointerGesture();gesture.begin(pointer());
 assert.deepEqual(gesture.move(pointer({clientX:190})),{x:10,y:0});
 assert.deepEqual(gesture.move(pointer()),{x:-10,y:0});
 assert.equal(gesture.end(pointer({timeStamp:250}),bounds),null);
});
test('long presses, invalid buttons, multiple pointers, cancellation and outside release never tap',async()=>{
 const {FloorPointerGesture}=await input();const g=new FloorPointerGesture();
 for(const bad of [{button:2},{isPrimary:false}])assert.equal(g.begin(pointer(bad)),false);
 g.begin(pointer());assert.equal(g.end(pointer({timeStamp:451}),bounds),null);
 g.begin(pointer());g.begin(pointer({pointerId:2,isPrimary:false}));assert.equal(g.end(pointer({timeStamp:200}),bounds),null);
 g.begin(pointer());g.cancel();assert.equal(g.move(pointer({clientX:300})),null);assert.equal(g.end(pointer({timeStamp:200}),bounds),null);
 g.begin(pointer());assert.equal(g.end(pointer({clientX:700,timeStamp:200}),bounds),null);
});
test('touch uses a larger CSS-pixel threshold, while large release displacement also rejects a tap',async()=>{
 const {FloorPointerGesture}=await input();const g=new FloorPointerGesture();g.begin(pointer({pointerType:'touch'}));
 assert.equal(g.move(pointer({clientX:188})),null);assert.deepEqual(g.end(pointer({clientX:188,timeStamp:200}),bounds),{x:188,y:340});
 g.begin(pointer());assert.equal(g.end(pointer({clientX:195,timeStamp:200}),bounds),null);
});
test('actual floor is picked with both camera projections and CSS scaled/offset bounds',async()=>{
 const {pickClubFloor}=await input();const env=makeClubEnvironment();env.scene.updateMatrixWorld(true);
 const controller=new ClubCameraController();let checks=0;
 for(const mode of ['overview','third-person'] as const){
  const camera=controller.update({width:390,height:844,mode,orbit:{yaw:.2,pitch:.1},subject:{position:{x:3,y:0,z:3},heading:0,height:2,radius:.65},deltaSeconds:.025,reducedMotion:false});
  let count=0;
  for(let x=-5;x<=5;x++)for(let z=-5;z<=6;z++){
   const point=new THREE.Vector3(x,-.025,z),ndc=point.clone().project(camera);
   if(!isManualWalkable(point)||Math.abs(ndc.x)>.9||Math.abs(ndc.y)>.9||ndc.z< -1||ndc.z>1)continue;
   for(const scale of [.6,1,1.5]){
    const box={...bounds,width:390*scale,height:844*scale};
    const hit=pickClubFloor({x:box.left+(ndc.x+1)*box.width/2,y:box.top+(1-ndc.y)*box.height/2},box,camera,env.floor,[]);
    assert.ok(hit);assert.ok(Math.hypot(hit.x-x,hit.z-z)<1e-7);checks++;
   }count++;
  }assert.ok(count>0,mode);
 }assert.ok(checks>30);env.dispose();
});
test('picker rejects foreground solids, missed floor and off-canvas coordinates',async()=>{
 const {pickClubFloor}=await input();const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.MeshBasicMaterial());floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.updateMatrixWorld();
 const camera=new THREE.PerspectiveCamera(52,1,.08,80);camera.position.set(4,8,8);camera.lookAt(3,0,3);camera.updateMatrixWorld();
 const point=new THREE.Vector3(3,-.025,3).project(camera),box={left:0,top:0,width:500,height:500},screen={x:(point.x+1)*250,y:(1-point.y)*250};
 assert.ok(pickClubFloor(screen,box,camera,floor,[]));
 const solid=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());solid.position.set(3,.8,3);solid.updateMatrixWorld();
 assert.equal(pickClubFloor(screen,box,camera,floor,[solid]),null);
 solid.visible=false;assert.ok(pickClubFloor(screen,box,camera,floor,[solid]));
 for(const bad of [{x:-1,y:250},{x:NaN,y:250},{x:250,y:Infinity}])assert.equal(pickClubFloor(bad,box,camera,floor,[]),null);
 for(const worldPoint of [new THREE.Vector3(9.5,-.025,9.5)]){
  const ndc=worldPoint.project(camera);assert.equal(pickClubFloor({x:(ndc.x+1)*250,y:(1-ndc.y)*250},box,camera,floor,[]),null);
 }
 camera.lookAt(4,20,8);camera.updateMatrixWorld();assert.equal(pickClubFloor({x:250,y:250},box,camera,floor,[]),null);
 floor.geometry.dispose();floor.material.dispose();solid.geometry.dispose();solid.material.dispose();
});

test('visible floor outside navigation bounds resolves to a safe endpoint in both views and at CSS scales', async () => {
 const {pickClubFloor}=await input(), env=makeClubEnvironment();
 env.scene.updateMatrixWorld(true);
 let checks=0;
 for(const mode of ['overview','third-person'] as const) {
  const camera=new ClubCameraController().update({width:390,height:758,mode,orbit:{yaw:0,pitch:0},subject:{position:{x:3,y:0,z:3},heading:0,height:2,radius:.65},deltaSeconds:.025,reducedMotion:false});
  let modeChecks=0;
  for(let u=-6;u<=6;u+=2)for(let v=-6;v<=8;v+=2) {
   const ground=stagePosition(u,v), ndc=new THREE.Vector3(ground.x,-.025,ground.z).project(camera);
   if(isManualWalkable(ground)||Math.abs(ground.x)>=9||Math.abs(ground.z)>=9||Math.abs(ndc.x)>=1||Math.abs(ndc.y)>=1||Math.abs(ndc.z)>=1)continue;
   assert.equal(isManualWalkable(ground),false,'test covers floor beyond the unmarked safe boundary');
   for(const scale of [.6,1,1.5]) {
    const box={left:47,top:23,width:390*scale,height:758*scale};
    const hit=pickClubFloor({x:box.left+(ndc.x+1)*box.width/2,y:box.top+(1-ndc.y)*box.height/2},box,camera,env.floor,[]);
    assert.ok(hit,`${mode}: visible floor at (${u}, ${v}) responds`);
    assert.ok(isManualWalkable(hit),'movement limits stay unchanged');
    const expected=constrainManualPosition(ground);
    assert.ok(Math.hypot(hit.x-expected.x,hit.z-expected.z)<1e-7,'the target marker receives the actual reachable endpoint');
    checks++;modeChecks++;
   }
  }
  assert.ok(modeChecks>=6,`${mode} exercises multiple outside-ground taps`);
 }
 assert.ok(checks>=24,'both camera modes exercise multiple outside-ground taps');
 env.dispose();
});

test('the real booth shadow does not turn visible floor into a solid click blocker', async () => {
 const {pickClubFloor}=await input(),env=makeClubEnvironment();
 const camera=new THREE.PerspectiveCamera(52,1,.08,80),ground=stagePosition(1.65,.8);
 camera.position.set(ground.x,8,ground.z);camera.lookAt(ground.x,-.025,ground.z);camera.updateMatrixWorld();
 env.scene.updateMatrixWorld(true);
 const shadow=env.booth.getObjectByName('soft-contact-shadow');assert.ok(shadow);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);
 assert.ok(ray.intersectObject(shadow,false).length,'reproduce the transparent shadow plane under this tap');
 const hit=pickClubFloor({x:250,y:250},{left:0,top:0,width:500,height:500},camera,env.floor,[env.booth]);
 assert.ok(hit,'shadow pixels are ground decoration, not solids');
 assert.ok(isManualWalkable(hit));
 env.dispose();
});

test('the fully transparent rim is background while even faint visible ground remains pickable', async () => {
 const {pickClubFloor}=await input(),env=makeClubEnvironment();
 const camera=new THREE.PerspectiveCamera(52,1,.08,80),box={left:0,top:0,width:500,height:500};
 for(const x of [8.69,8.7,8.9]) {
  camera.position.set(x,8,0);camera.lookAt(x,-.025,0);camera.updateMatrixWorld();
  const hit=pickClubFloor({x:250,y:250},box,camera,env.floor,[]);
  if(x<8.7)assert.ok(hit,'all rendered ground responds, even in the faint fade');
  else assert.equal(hit,null,'the fully transparent mesh rim is not visible floor');
 }
 env.dispose();
});
test('an invisible material is not a visible solid that can block floor selection',async()=>{
 const {pickClubFloor}=await input();const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.MeshBasicMaterial());floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.updateMatrixWorld();
 const camera=new THREE.PerspectiveCamera(52,1,.08,80);camera.position.set(3,8,8);camera.lookAt(3,-.025,3);camera.updateMatrixWorld();
 const body=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());body.position.set(3,.8,3);body.material.visible=false;body.updateMatrixWorld();
 assert.ok(pickClubFloor({x:250,y:250},{left:0,top:0,width:500,height:500},camera,floor,[body]));
 floor.geometry.dispose();floor.material.dispose();body.geometry.dispose();body.material.dispose();
});
