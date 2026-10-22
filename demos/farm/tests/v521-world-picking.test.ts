import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EstateWorld,type EstateWorldHandlers} from '../src/v5/EstateWorld.ts';
import {EstateCameraController,type EstateCameraMode} from '../src/v5/isometric-camera.ts';
import {createEstate,estateSnapshot} from '../src/v5/estate.ts';
import {gridToWorld,legacyAnimal} from '../src/v5/estate-scene.ts';
import {animalScale} from '../src/v5/life.ts';
import {isWalkable,regionAt,type GridPoint} from '../src/v5/layout.ts';
import {makeSheep} from '../src/sheep.ts';
import {SceneTapGesture} from '../src/picking.ts';

type Rect={left:number;top:number;width:number;height:number};
type PointHarness={
 scene:THREE.Scene;camera:THREE.Camera;ray:THREE.Raycaster;cursor:THREE.Vector2;
 renderer:{domElement:{getBoundingClientRect:()=>Rect}};handlers:EstateWorldHandlers;
 inputLocked:boolean;keys:Set<string>;direction:GridPoint;steering:boolean;
 point:(e:PointerEvent)=>void;
};
const T=1_800_000_000_000;
const rects:Rect[]=[{left:100,top:70,width:390,height:844},{left:18,top:23,width:312,height:675.2}];
function fixture(rect=rects[0],mode:EstateCameraMode='third-person',focus:GridPoint={x:5.5,z:5.5}){
 const world=Object.create(EstateWorld.prototype) as PointHarness;
 const calls:{destination:GridPoint[];select:string[];steer:GridPoint[]}={destination:[],select:[],steer:[]};
 world.scene=new THREE.Scene();world.camera=new EstateCameraController().update({dt:0,aspect:390/844,mode,position:gridToWorld(focus),bounds:{minX:-5.5,maxX:5.5,minZ:-5.5,maxZ:5.5}});
 world.renderer={domElement:{getBoundingClientRect:()=>rect}};
 world.ray=new THREE.Raycaster();world.cursor=new THREE.Vector2();world.keys=new Set();world.direction={x:0,z:0};world.steering=false;world.inputLocked=false;
 world.handlers={destination:to=>calls.destination.push(to),select:id=>calls.select.push(id),steer:to=>calls.steer.push(to),status:()=>{}};
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));ground.rotation.x=-Math.PI/2;world.scene.add(ground);
 const pointer=(position:THREE.Vector3)=>{
  const ndc=position.clone().project(world.camera);
  assert.ok(Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1,'the exercised point is actually inside the visible canvas');
  return {clientX:rect.left+(ndc.x+1)*rect.width/2,clientY:rect.top+(1-ndc.y)*rect.height/2,pointerId:1,isPrimary:true,button:0,timeStamp:100} as PointerEvent;
 };
 return {world,calls,pointer,dispose:()=>{world.scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}};
}

test('actual World.point maps visible ground taps in all four regions through the fixed camera and CSS-scaled canvas',()=>{
 const layout=estateSnapshot(createEstate('point-fixture',T),T).profile.layout;
 const destinations:GridPoint[]=[{x:4,z:4},{x:8,z:3},{x:4,z:9},{x:9,z:8}];
 assert.deepEqual(destinations.map(regionAt),['pen','meadow','home','shore']);
 for(const rect of rects)for(const mode of ['third-person','overview'] as const)for(const to of destinations){
  assert.ok(isWalkable(layout,to));const h=fixture(rect,mode,to);
  try{const w=gridToWorld(to);h.world.point(h.pointer(new THREE.Vector3(w.x+.2,0,w.z-.15)));assert.deepEqual(h.calls.destination,[to]);assert.deepEqual(h.calls.select,[]);}
  finally{h.dispose();}
 }
});

test('actual World.point selects each real procedural sheep mesh without also issuing a ground destination',()=>{
 const data=estateSnapshot(createEstate('mesh-fixture',T),T),h=fixture(rects[1],'overview');
 const locations:GridPoint[]=[{x:4,z:4},{x:7,z:3},{x:4,z:8}];
 try{
  const bodies=data.profile.animals.map((animal,index)=>{
   const visual=makeSheep(legacyAnimal(animal)),w=gridToWorld(locations[index]),scale=animalScale(animal.life);
   visual.root.userData.entityId=animal.id;visual.root.position.set(w.x,0,w.z);visual.root.scale.setScalar(scale);h.world.scene.add(visual.root);
   return {id:animal.id,center:new THREE.Vector3(w.x,.87*scale,w.z)};
  });
  for(const body of bodies){h.world.point(h.pointer(body.center));assert.equal(h.calls.select.at(-1),body.id);}
  assert.deepEqual(h.calls.select,data.profile.animals.map(a=>a.id));assert.deepEqual(h.calls.destination,[]);
 }finally{h.dispose();}
});

test('actual World.point emits no movement or selection while the UI locks scene interaction',()=>{
 const h=fixture();try{
  h.world.inputLocked=true;h.world.steering=true;h.world.keys.add('w');
  const animal=createEstate('locked-fixture',T).profiles.home.animals[0],visual=makeSheep(legacyAnimal(animal));visual.root.userData.entityId=animal.id;h.world.scene.add(visual.root);
  h.world.point(h.pointer(new THREE.Vector3(0,.87,0)));
  h.world.point(h.pointer(new THREE.Vector3(2,0,0)));
  assert.deepEqual(h.calls,{destination:[],select:[],steer:[]});
 }finally{h.dispose();}
});

test('a short canvas release reaches actual World.point once; a captured drag or cancellation does not',()=>{
 const h=fixture(),tap=new SceneTapGesture();try{
  const e=h.pointer(new THREE.Vector3(1.5,0,1.5));
  assert.equal(tap.begin(e),true);const released={...e,timeStamp:180};if(tap.end(released))h.world.point(released);
  assert.deepEqual(h.calls.destination,[{x:7,z:7}]);
  tap.begin(e);tap.move({...e,clientX:e.clientX+30});if(tap.end(released))h.world.point(released);
  tap.begin(e);tap.cancel(e.pointerId);if(tap.end(released))h.world.point(released);
  assert.equal(h.calls.destination.length,1);assert.deepEqual(h.calls.select,[]);
 }finally{h.dispose();}
});
