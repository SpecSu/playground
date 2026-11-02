import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';
import {FISHING_RENDER_SEATS} from '../lib/fishing-world.ts';

const stations=h=>h.world.yacht.children.filter(object=>object.name.startsWith('Fishing station '));
const active=h=>stations(h).filter(object=>object.visible);
const angler=h=>h.world.yacht.getObjectByName('Angler 小浪');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function stationPoint(h,slot){const marker=stations(h).find(object=>object.userData.slot===slot);assert.ok(marker,`station ${slot} exists`);h.world.scene.updateMatrixWorld(true);const p=marker.getWorldPosition(new THREE.Vector3()).project(h.camera);return {clientX:(p.x*.5+.5)*h.host.clientWidth,clientY:(-p.y*.5+.5)*h.host.clientHeight};}
function tap(h,point){h.event('pointerdown',point);h.event('pointerup',point);}
async function firstVisibleStation(h){
 for(const marker of active(h)){const point=stationPoint(h,marker.userData.slot);if(point.clientX<0||point.clientX>390||point.clientY<0||point.clientY>758)continue;const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(point.clientX/390*2-1,-point.clientY/758*2+1),h.camera);const hits=ray.intersectObjects(h.world.yacht.children,true);const nearest=hits.find(hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return hit.object.isMesh&&(!hit.object.material.transparent||hit.object.material.opacity>.01||hit.object.userData.seatHit);});if(nearest){for(let o=nearest.object;o;o=o.parent)if(o===marker)return {slot:marker.userData.slot,point};}}
 throw new Error('No unoccluded selectable station');
}

test('twelve physical rings are white, and only unoccupied seats show for a resting joined user',async t=>{
 const peers=[participant(),{...participant(),id:'peer',name:'同行',slot:3}];
 const ambient=[{...participant(),id:'ambient:one',name:'海叔',slot:5,ambient:true},{...participant(),id:'ambient:two',name:'阿蓝',slot:10,ambient:true}];
 const h=await fishingSceneHarness({participants:peers,ambientParticipants:ambient,ownId:'self',seatMovementEnabled:true,onMoveSeat:async()=>null});t.after(()=>h.dispose());
 assert.equal(stations(h).length,12);assert.equal(active(h).length,8);
 assert.deepEqual(active(h).map(object=>object.userData.slot),[1,2,4,6,7,8,9,11]);
 for(const marker of active(h)){assert.equal(marker.children[0].material.color.getHexString(),'ffffff');assert.equal(marker.parent,h.world.yacht);}
 for(const phase of ['waiting','bite','holding']){const p=participant(phase,phase==='bite'?{biteAt:h.now()-1,expiresAt:h.now()+5000}:{});h.render({participants:[p],ambientParticipants:[]});h.step();assert.equal(active(h).length,0,`${phase} hides markers`);}
 h.render({participants:[participant('escaped')],ownId:'self'});h.step();assert.equal(active(h).length,11,'escaped is a resting state');
 h.render({ownId:null});h.step();assert.equal(active(h).length,0,'visitor cannot see selectable markers');
});

test('tap gives immediate selection feedback, waits for authority, then whole avatar hops and settles exactly',async t=>{
 let resolve;const requests=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',cameraMode:'overview',reducedMotion:false,seatMovementEnabled:true,onMoveSeat:slot=>{requests.push(slot);return new Promise(r=>{resolve=r;});}});t.after(()=>h.dispose());h.frames(70);
 const target=await firstVisibleStation(h),start=angler(h).position.clone(),label=h.labels.children[0],beforeLabel=label.style.transform;
 tap(h,target.point);assert.deepEqual(requests,[target.slot]);assert.equal(stations(h).find(s=>s.userData.slot===target.slot).userData.pending,true,'feedback changes in the tap handler');
 h.frames(4);assert.ok(angler(h).position.distanceTo(start)<.0001,'no unauthorized optimistic relocation');tap(h,target.point);assert.equal(requests.length,1,'pending request cannot duplicate');
 const startedAt=h.now(),person={...participant(),slot:target.slot,movement:{fromSlot:0,startedAt,endsAt:startedAt+700}};
 h.render({participants:[person]});resolve({participants:[person]});await flush();h.step(350);
 const group=angler(h),seat=FISHING_RENDER_SEATS[target.slot],from=FISHING_RENDER_SEATS[0];assert.ok(group.position.y>Math.max(seat.y,from.y)+.45,'hop has a visible arc');
 assert.equal(group.children[1].parent,group,'rod travels with whole avatar');assert.notEqual(label.style.transform,beforeLabel,'label follows hop');assert.equal(active(h).length,0,'rings hide during hop');
 h.step(350);assert.ok(group.position.distanceTo(new THREE.Vector3(seat.x,seat.y,seat.z))<1e-7,'lands on authoritative seat');assert.deepEqual(group.scale.toArray(),[1,1,1]);
 const beforeWorld=group.getWorldPosition(new THREE.Vector3());h.frames(10);assert.notDeepEqual(group.getWorldPosition(new THREE.Vector3()).toArray(),beforeWorld.toArray(),'landed avatar continues yacht bob');assert.ok(h.renders.length>80,'RAF continues through landing');
});

test('drag and pinch over a station never trigger a move',async t=>{
 const requests=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',seatMovementEnabled:true,onMoveSeat:async slot=>requests.push(slot)});t.after(()=>h.dispose());const {point}=await firstVisibleStation(h);
 h.event('pointerdown',point);h.event('pointermove',{...point,clientX:point.clientX+30});h.event('pointerup',{...point,clientX:point.clientX+30});
 h.event('pointerdown',point);h.event('pointerdown',{...point,pointerId:2,isPrimary:false,clientX:point.clientX+20});h.event('pointerup',{...point,pointerId:2,isPrimary:false,clientX:point.clientX+20});h.event('pointerup',point);
 assert.deepEqual(requests,[]);
});

test('stale occupied target is rejected before RAF and rejected network request clears feedback safely',async t=>{
 let reject;const requests=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',seatMovementEnabled:true,onMoveSeat:slot=>{requests.push(slot);return new Promise((_,r)=>{reject=r;});}});t.after(()=>h.dispose());const target=await firstVisibleStation(h);
 h.render({participants:[participant(),{...participant(),id:'race',name:'抢先',slot:target.slot}]});tap(h,target.point);assert.deepEqual(requests,[],'click rechecks current ownership before drawing new snapshot');
 h.render({participants:[participant()]});h.step();tap(h,target.point);assert.equal(requests.length,1);reject(new Error('seat taken'));await flush();h.step();assert.equal(stations(h).some(marker=>marker.userData.pending),false);assert.equal(angler(h).position.x,FISHING_RENDER_SEATS[0].x);assert.ok(h.renders.length>1);
});

test('late callback after disconnect or unmount cannot move an avatar or revive markers',async()=>{
 let resolve;const h=await fishingSceneHarness({participants:[participant()],ownId:'self',seatMovementEnabled:true,onMoveSeat:()=>new Promise(r=>{resolve=r;})});const target=await firstVisibleStation(h);tap(h,target.point);
 h.render({ownId:null,seatMovementEnabled:false});h.step();resolve({participants:[{...participant(),slot:target.slot}]});await flush();h.step();assert.equal(active(h).length,0);assert.equal(angler(h).position.z,FISHING_RENDER_SEATS[0].z);
 h.render({ownId:'self',seatMovementEnabled:true});h.step();tap(h,target.point);h.dispose();const renders=h.renders.length;resolve(null);await flush();h.step();assert.equal(h.renders.length,renders);assert.equal(h.labels.children.length,0);
});

test('opaque yacht geometry blocks a ring raycast instead of tapping through the cabin',async t=>{
 const requests=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',seatMovementEnabled:true,onMoveSeat:async slot=>requests.push(slot)});t.after(()=>h.dispose());const target=await firstVisibleStation(h);const center=stations(h).find(s=>s.userData.slot===target.slot).getWorldPosition(new THREE.Vector3());
 const blocker=new THREE.Mesh(new THREE.SphereGeometry(.6,12,12),new THREE.MeshBasicMaterial());blocker.position.copy(center).lerp(h.camera.position,.12);h.world.scene.add(blocker);h.world.scene.updateMatrixWorld(true);
 // Yacht occlusion is checked by the same scene raycast, including actual structures.
 h.world.yacht.attach(blocker);h.world.scene.updateMatrixWorld(true);tap(h,target.point);assert.deepEqual(requests,[]);
 h.world.yacht.remove(blocker);blocker.geometry.dispose();blocker.material.dispose();tap(h,target.point);assert.deepEqual(requests,[target.slot]);
});

test('late authoritative slot changes still hop once, lock local casting, and never replay on identical snapshots',async t=>{
 const locks=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',reducedMotion:false,onSeatMotionChange:moving=>locks.push(moving)});t.after(()=>h.dispose());h.frames(10);
 const moved={...participant(),slot:2,movement:{fromSlot:0,startedAt:h.now()-1500,endsAt:h.now()-800}};
 h.render({participants:[moved]});h.step();h.step(250);assert.ok(angler(h).position.y>FISHING_RENDER_SEATS[0].y+.5,'late ACK still gets readable visual arc');assert.equal(locks.at(-1),true);
 h.step(700);assert.equal(locks.at(-1),false);const count=locks.length;
 h.render({participants:[{...moved,lastSeenAt:h.now()}]});h.step();assert.equal(locks.length,count,'same acknowledgement never replays');
 h.render({participants:[{...participant(),slot:4}]});h.step();h.step(250);assert.ok(angler(h).position.y>FISHING_RENDER_SEATS[0].y+.5,'poll that missed short metadata still hops on changed slot');
});

test('a cold snapshot at its destination never replays an already completed hop',async t=>{
 const moved={...participant(),slot:2,movement:{fromSlot:0,startedAt:1_799_999_998_000,endsAt:1_799_999_998_700}};
 const h=await fishingSceneHarness({participants:[moved],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());h.step(250);assert.equal(angler(h).position.y,FISHING_RENDER_SEATS[2].y);
});

for(const interruption of ['disabled','hidden','contextlost','failure'])test(`visual hop lock clears on ${interruption} without a stale replay`,async t=>{
 const locks=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',reducedMotion:false,onSeatMotionChange:moving=>locks.push(moving)});t.after(()=>h.dispose());
 h.render({participants:[{...participant(),slot:2}]});h.step();h.step(150);assert.equal(locks.at(-1),true);
 if(interruption==='disabled')h.render({enabled:false});
 if(interruption==='hidden')h.document.hidden=true;
 if(interruption==='contextlost')h.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
 if(interruption==='failure')h.world.animate=()=>{throw new Error('render fixture failure');};
 h.step();assert.equal(locks.at(-1),false,'interrupted renderer must not leave cast locked forever');
 if(interruption==='disabled'||interruption==='hidden'){h.render({enabled:true});h.document.hidden=false;h.step();assert.equal(angler(h).position.y,FISHING_RENDER_SEATS[2].y,'resume uses authoritative resting spot');}
});
for(const phase of ['waiting','bite','holding'])test(`authoritative ${phase} preempts a late visual hop`,async t=>{
 const locks=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',reducedMotion:false,onSeatMotionChange:moving=>locks.push(moving)});t.after(()=>h.dispose());
 h.render({participants:[{...participant(),slot:2}]});h.step();h.step(150);assert.equal(locks.at(-1),true);
 h.render({participants:[{...participant(phase,phase==='bite'?{biteAt:h.now()-1,expiresAt:h.now()+5000}:{}),slot:2}]});h.step();assert.equal(locks.at(-1),false);assert.equal(angler(h).position.y,FISHING_RENDER_SEATS[2].y);
});
