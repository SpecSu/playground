import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';

const position=element=>element.style.transform.match(/^translate\(([-\d.]+)px,([-\d.]+)px\)/).slice(1).map(Number);
test('steady speech is measured without display/visibility cycling or replacing text nodes',async t=>{
 const person={...participant(),chat:{id:'m',text:'今天海风舒服',createdAt:1800000000000,expiresAt:1800000100000}};
 const h=await fishingSceneHarness({participants:[person],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());
 const label=h.labels.children[0],speech=label.children[0],writes=[];
 for(const node of [label,...label.children]){
  node.style=new Proxy(node.style,{set(target,key,value){writes.push([node,key,value]);target[key]=value;return true;}});
  const prototype=Object.getPrototypeOf(node),descriptor=Object.getOwnPropertyDescriptor(prototype,'textContent');
  Object.defineProperty(node,'textContent',{get(){return descriptor.get.call(this);},set(value){writes.push([node,'textContent',value]);descriptor.set.call(this,value);}});
 }
 h.step();
 assert.equal(writes.filter(([,key])=>key==='display').length,0,'no display changes during a stable frame');
 assert.equal(writes.filter(([,key])=>key==='textContent').length,0,'unchanged text retains its DOM nodes');
 assert.ok(writes.filter(([node,key])=>node===speech&&key==='visibility').length<=1,'speech visibility is committed once after collision layout');
});

test('rapid touch orbit projects every nameplate with the exact camera rendered that frame',async t=>{
 const h=await fishingSceneHarness({participants:[participant()],ownId:'self',cameraMode:'deck',reducedMotion:false});t.after(()=>h.dispose());h.frames(30);
 const label=h.labels.children[0],group=h.world.yacht.getObjectByName('Angler 小浪');
 // Infer the unchanged local anchor from the initial camera projection; then
 // compare world/camera reprojection throughout alternating fast finger moves.
 const [x,y]=position(label),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/h.host.clientWidth*2-1,1-y/h.host.clientHeight*2),h.camera);
 const origin=group.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(1,0,0).transformDirection(group.matrixWorld);
 const hit=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,origin),new THREE.Vector3());
 assert.ok(hit);const anchor=group.worldToLocal(hit.clone());
 h.event('pointerdown');
 for(let i=0;i<35;i++){
  h.event('pointermove',{clientX:150+(i%2?90:-90),clientY:300+(i%3-1)*45});h.step();
  const projected=group.localToWorld(anchor.clone()).project(h.camera),actual=position(label);
  assert.ok(Math.abs(actual[0]-(projected.x*.5+.5)*h.host.clientWidth)<1e-6);
  assert.ok(Math.abs(actual[1]-(-projected.y*.5+.5)*h.host.clientHeight)<1e-6);
 }
 h.event('pointerup');
});
