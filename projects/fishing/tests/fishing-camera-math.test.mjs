import assert from 'node:assert/strict';
import test from 'node:test';
import * as module from '../lib/fishing-camera.ts';
const subject={id:'self',position:{x:-3.05,y:1.54,z:5.7},height:2,width:1.4};
const distance=p=>Math.hypot(p.position.x-p.target.x,p.position.y-p.target.y,p.position.z-p.target.z);
function rig(){assert.equal(typeof module.FishingCameraController,'function','persistent camera controller is exported');return new module.FishingCameraController();}
test('camera orbit is finite and bounded at extreme yaw, pitch, zoom and malformed input',()=>{
 for(const mode of ['overview','deck']){const c=rig();const input={mode,subject};c.update(input,35,390/758);
  for(let i=0;i<500;i++){c.orbit(10000,i%2?10000:-10000);c.zoom(i%2?1e6:1e-6);const p=c.update(input,35,390/758);assert.ok([...Object.values(p.position),...Object.values(p.target)].every(Number.isFinite));assert.ok(distance(p)>=4&&distance(p)<=90);assert.ok(p.position.y>p.target.y);}
  const before=c.update(input,35,390/758);c.orbit(NaN,Infinity);c.zoom(NaN);assert.deepEqual(c.update(input,35,390/758),before);
 }
});
test('new snapshots follow the subject without resetting yaw, pitch or user zoom',()=>{
 const c=rig(),input={mode:'deck',subject};c.update(input,35,.5);c.orbit(100,-45);c.zoom(.8);const a=c.update(input,35,.5),b=c.update({...input,subject:{...subject,position:{x:subject.position.x+2,y:1.54,z:subject.position.z+3}}},35,.5);
 assert.ok(Math.abs(b.position.x-a.position.x-2)<1e-10);assert.ok(Math.abs(b.position.z-a.position.z-3)<1e-10);assert.ok(Math.abs(distance(a)-distance(b))<1e-10);
});
test('catch reveal resets once and a new catch ID gets a new reveal',()=>{
 const c=rig(),input={mode:'deck',subject,catchId:'a',catchBounds:{width:5,height:2.5,depth:1.5}};const start=c.update(input,35,.5);c.orbit(130,-50);c.zoom(.7);const manual=c.update(input,35,.5);assert.notDeepEqual(manual,start);assert.deepEqual(c.update({...input},35,.5),manual);assert.deepEqual(c.update({...input,catchId:'b'},35,.5),start);
});
test('aspect resize refits large catches while preserving orbit and proportional zoom',()=>{
 const c=rig(),input={mode:'deck',subject,catchId:'a',catchBounds:{width:8,height:3,depth:2}};c.update(input,35,.8);c.orbit(50,-30);c.zoom(.9);const wide=c.update(input,35,.8),narrow=c.update(input,35,.35);assert.ok(distance(narrow)>distance(wide));
 const yaw=p=>Math.atan2(p.position.x-p.target.x,p.position.z-p.target.z);assert.ok(Math.abs(yaw(wide)-yaw(narrow))<1e-10);
});

test('closest catch zoom keeps every orbital bounding-box corner inside the phone frustum',async()=>{
 const THREE=await import('three');
 for(const bounds of [{width:8,height:3,depth:2},{width:2,height:3,depth:8},{width:5,height:5,depth:5}]){
  const c=rig(),input={mode:'deck',subject,catchId:'giant',catchBounds:bounds};c.update(input,35,390/758);
  for(let i=0;i<12;i++){
   c.orbit(70,i%2?-25:25);c.zoom(.01);const pose=c.update(input,35,390/758),camera=new THREE.PerspectiveCamera(35,390/758,.15,240);
   camera.position.set(pose.position.x,pose.position.y,pose.position.z);camera.lookAt(new THREE.Vector3(pose.target.x,pose.target.y,pose.target.z));camera.updateMatrixWorld();
   for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const p=new THREE.Vector3(pose.target.x+x*bounds.width/2,pose.target.y+y*bounds.height/2,pose.target.z+z*bounds.depth/2).project(camera);assert.ok(Math.abs(p.x)<.98&&Math.abs(p.y)<.98,`bounds ${JSON.stringify(bounds)} at orbit ${i}: ${p.x},${p.y}`);}
  }
 }
});

test('deck default pulls back and opens a sky band above the horizon',()=>{
 const pose=rig().update({mode:'deck',subject},35,390/758);
 assert.ok(distance(pose)>=11.3,'deck should show surrounding boat rather than a tight portrait');
 assert.ok(Math.asin((pose.position.y-pose.target.y)/distance(pose))<.30,'default deck elevation leaves the horizon in view');
});
test('watched catch transitions fit the catch without resetting manual orbit',()=>{
 const c=rig(),input={mode:'deck',subject:{...subject,id:'other'},autoReveal:false};c.update(input,35,.5);c.orbit(80,-30);const a=c.update(input,35,.5);
 const yaw=p=>Math.atan2(p.position.x-p.target.x,p.position.z-p.target.z);
 const caught=c.update({...input,catchId:'their-catch',catchCenter:{x:4,y:3,z:2},catchBounds:{width:12,height:4,depth:3}},35,.5);
 assert.ok(Math.abs(yaw(a)-yaw(caught))<1e-10,'new watched catch must preserve the chosen orbital angle');
 assert.deepEqual(caught.target,{x:4,y:3,z:2});assert.ok(distance(caught)>distance(a),'large watched catch is still fitted');
 const released=c.update(input,35,.5);assert.ok(Math.abs(yaw(a)-yaw(released))<1e-10,'releasing watched catch does not reset orbit');
});

test('drag right or down reverses the old fishing controls in overview and deck views',()=>{
 const yaw=p=>Math.atan2(p.position.x-p.target.x,p.position.z-p.target.z);
 const pitch=p=>Math.asin((p.position.y-p.target.y)/distance(p));
 for(const mode of ['overview','deck']){
  const c=rig(),input={mode,subject};const before=c.update(input,35,.5);
  c.orbit(12,0);const right=c.update(input,35,.5);
  assert.ok(yaw(right)<yaw(before),'drag right decreases orbit yaw');
  c.orbit(0,12);const down=c.update(input,35,.5);
  assert.ok(pitch(down)>pitch(right),'drag down raises orbit elevation');
  c.orbit(-12,-12);const restored=c.update(input,35,.5);
  assert.ok(Math.abs(yaw(restored)-yaw(before))<1e-10);
  assert.ok(Math.abs(pitch(restored)-pitch(before))<1e-10);
 }
});
