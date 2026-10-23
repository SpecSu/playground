import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {EstateWorld,type EstateGhost} from '../src/v5/EstateWorld.ts';
import {EstateCameraController} from '../src/v5/isometric-camera.ts';
import {gridToWorld} from '../src/v5/estate-scene.ts';
import type {GridPoint} from '../src/v5/layout.ts';
const rect={left:20,top:30,width:312,height:675.2};
function harness(){
 const calls={place:[] as GridPoint[],move:[] as GridPoint[],select:[] as string[]};
 const camera=new EstateCameraController().update({dt:0,aspect:390/844,mode:'overview',position:gridToWorld({x:6,z:5}),bounds:{minX:-11.5,maxX:17.5,minZ:-11.5,maxZ:11.5}});
 const world=Object.create(EstateWorld.prototype) as unknown as {ghost:EstateGhost;placementDown:(e:PointerEvent)=>boolean;placementMove:(e:PointerEvent)=>boolean;placementUp:(e:PointerEvent)=>boolean;cancelPlacement:()=>void;cameraUpdate:(dt:number)=>void;drawGhost:()=>void;ghostGroup:THREE.Group;camera:THREE.Camera;point:(e:PointerEvent)=>void};
 Object.assign(world,{camera,ghost:{x:7,z:2,kind:'tower',valid:true,interactive:true},renderer:{domElement:{getBoundingClientRect:()=>rect}},handlers:{place:(p:GridPoint)=>{calls.place.push(p);Object.assign(world.ghost,p);},destination:(p:GridPoint)=>calls.move.push(p),select:(id:string)=>calls.select.push(id)},keys:new Set(),direction:{x:0,z:0},steering:false,inputLocked:false,ray:new THREE.Raycaster(),cursor:new THREE.Vector2(),ghostGroup:new THREE.Group(),obstacles:[],scene:new THREE.Scene(),layoutGroup:new THREE.Group()});
 const pointer=(p:GridPoint,options={},height=0)=>{const w=gridToWorld(p),v=new THREE.Vector3(w.x,height,w.z).project(camera);return {pointerId:1,isPrimary:true,button:0,clientX:rect.left+(v.x+1)*rect.width/2,clientY:rect.top+(1-v.y)*rect.height/2,timeStamp:100,preventDefault(){},...options} as PointerEvent;};
 return {world,calls,pointer};
}
test('dragging a ghost changes only its snapped proposal, never LX or animal selection',()=>{
 const h=harness();assert.equal(typeof h.world.placementDown,'function','world must handle held placement gestures');
 assert.equal(h.world.placementDown(h.pointer({x:7.5,z:2.5})),true);
 h.world.placementMove(h.pointer({x:9.5,z:5.5}));assert.deepEqual(h.calls.place.at(-1),{x:9,z:5});
 h.world.placementUp(h.pointer({x:9.5,z:5.5}));assert.deepEqual(h.calls.move,[]);assert.deepEqual(h.calls.select,[]);
});
test('cancelled capture restores the pre-drag proposal without committing or moving',()=>{
 const h=harness();assert.equal(typeof h.world.placementDown,'function');h.world.placementDown(h.pointer({x:7.5,z:2.5}));h.world.placementMove(h.pointer({x:9.5,z:5.5}));h.world.cancelPlacement();assert.deepEqual(h.calls.place.at(-1),{x:7,z:2});assert.deepEqual(h.calls.move,[]);h.world.placementUp(h.pointer({x:9.5,z:5.5}));assert.deepEqual(h.calls.place.at(-1),{x:7,z:2});
});
test('touch second pointers cannot steal an in-progress placement and camera remains still while dragging',()=>{
 const h=harness();assert.equal(typeof h.world.placementDown,'function');const camera=h.world.camera.matrixWorld.clone();h.world.placementDown(h.pointer({x:7.5,z:2.5}));assert.equal(h.world.placementDown(h.pointer({x:8,z:3},{pointerId:2,isPrimary:false})),false);h.world.placementMove(h.pointer({x:9.5,z:5.5},{pointerId:2,isPrimary:false}));assert.equal(h.calls.place.length,0);h.world.cameraUpdate(.016);assert.deepEqual(h.world.camera.matrixWorld.elements,camera.elements);
});
test('invalid outside placement stays a preview and normal entity clicks are suppressed',()=>{
 const h=harness();assert.equal(typeof h.world.placementDown,'function');h.world.placementDown(h.pointer({x:7.5,z:2.5}));h.world.placementMove(h.pointer({x:11.5,z:5.5}));assert.deepEqual(h.calls.place.at(-1),{x:11,z:5});h.world.point(h.pointer({x:8,z:4}));assert.deepEqual(h.calls.move,[]);assert.deepEqual(h.calls.select,[]);
});
test('the ghost is a floating translucent recognizable facility with a legality footprint',()=>{
 for(const kind of ['tower','shelter','factory'] as const){const h=harness();h.world.ghost.kind=kind;h.world.drawGhost();const model=h.world.ghostGroup.getObjectByName('placement-model');assert.ok(model,'facility shape, not a single flat block');assert.ok(model.position.y>=.2);let meshes=0;model.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;assert.equal(o.castShadow,false);for(const m of Array.isArray(o.material)?o.material:[o.material]){assert.equal(m.transparent,true);assert.ok(m.opacity<.7);assert.equal(m.depthWrite,false);}}});assert.ok(meshes>=4);assert.ok(h.world.ghostGroup.getObjectByName('placement-footprint'));}
});

test('holding a grabbed preview at the screen edge pans the view without steering LX or rotating the camera',()=>{
 const h=harness();assert.equal(typeof h.world.placementDown,'function');const controller=new EstateCameraController(),position=gridToWorld({x:6,z:5});h.world.camera=controller.update({dt:0,aspect:390/844,mode:'overview',position,bounds:{minX:-11.5,maxX:17.5,minZ:-11.5,maxZ:11.5}});
 Object.assign(h.world,{host:{clientWidth:390,clientHeight:844},cameraController:controller,player:{root:{position}},cameraMode:'overview',attention:null,reduced:false});
 h.world.placementDown(h.pointer({x:7.5,z:2.5}));h.world.placementMove({...h.pointer({x:7.5,z:2.5}),clientX:rect.left+rect.width-2});const before=h.world.camera.position.clone(),rotation=h.world.camera.quaternion.clone();
 for(let i=0;i<60;i++)h.world.cameraUpdate(1/60);
 assert.ok(h.world.camera.position.distanceTo(before)>.5,'holding the edge reveals more land');assert.ok(h.world.camera.quaternion.angleTo(rotation)<1e-7);assert.deepEqual(h.calls.move,[]);assert.deepEqual(h.calls.select,[]);
});

test('grabbing a tall ghost surface preserves the grab offset instead of jumping to the ground projection',()=>{
 for(const height of [2.44,3.08]){
  const h=harness();h.world.drawGhost();h.world.ghostGroup.updateMatrixWorld(true);
  const down=h.pointer({x:7.5,z:2.5},{},height);assert.equal(h.world.placementDown(down),true);
  assert.deepEqual(h.calls.place,[],`height ${height}: pointer down must not relocate the preview`);
  h.world.placementMove(h.pointer({x:9.5,z:5.5},{},height));assert.deepEqual(h.calls.place.at(-1),{x:9,z:5});
  h.world.placementUp(h.pointer({x:9.5,z:5.5},{},height));assert.deepEqual(h.calls.move,[]);assert.deepEqual(h.calls.select,[]);
 }
});
test('clicking empty ground still moves a tall preview to that location',()=>{
 const h=harness();h.world.drawGhost();h.world.placementDown(h.pointer({x:10.5,z:8.5}));assert.deepEqual(h.calls.place.at(-1),{x:10,z:8});
});
