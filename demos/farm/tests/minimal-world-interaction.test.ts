import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window} from 'happy-dom';
import * as THREE from 'three';
import {createMinimalState,minimalCommand} from '../src/minimal/model.ts';

test('actual scene geometry keeps two-cell shop clickable after batching and first scene within draw budget',async()=>{
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/avatars/club-avatar-rig.ts'))return {format:'module',shortCircuit:true,source:`import * as THREE from 'three';export function createClubAvatar(){return {root:new THREE.Group(),height:1.8,loaded:false,ready:Promise.resolve(),update(){},dispose(){}}}`};return next(url,context);}});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=(()=>null) as typeof w.HTMLCanvasElement.prototype.getContext;
 const host=w.document.createElement('div');w.document.body.appendChild(host);Object.defineProperties(host,{clientWidth:{value:390},clientHeight:{value:844}});
 const canvas=w.document.createElement('canvas');canvas.getBoundingClientRect=()=>new w.DOMRect(0,0,390,844);canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
 const renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){},dispose(){}};
 const {MinimalWorld}=await import('../src/minimal/World.ts');const now=Date.now();const state=minimalCommand(createMinimalState(now),{type:'welcome'},now).state;const selected:string[]=[];
 const world=new MinimalWorld(host as unknown as HTMLElement,state,{select:t=>selected.push(t.kind),arrive(){}},()=>renderer as unknown as THREE.WebGLRenderer);
 const internals=world as unknown as {scene:THREE.Scene;camera:THREE.Camera;shop:THREE.Group;animate:(n:number)=>void;onPointerDown:(e:PointerEvent)=>void;onPointerUp:(e:PointerEvent)=>void};
 try{
  internals.animate(performance.now()+16);internals.scene.updateMatrixWorld(true);internals.camera.updateMatrixWorld(true);
  let visible=0;internals.scene.traverseVisible(o=>{if(o instanceof THREE.Mesh&&(Array.isArray(o.material)?o.material.some(m=>m.visible):o.material.visible))visible++;});assert.ok(visible<250,`visible scene mesh count ${visible}`);
  const spot=internals.shop.position.clone().add(new THREE.Vector3(0,1.1,.72)).project(internals.camera);const event={clientX:(spot.x+1)*195,clientY:(1-spot.y)*422,button:0,pointerId:1} as PointerEvent;
  internals.onPointerDown(event);internals.onPointerUp(event);assert.equal(selected.at(-1),'shop','batched shop meshes retain pointer target');
  world.setPlacementMode(true);world.update(state);world.setPlacementMode(false);
  world.focus();world.zoom(.1);internals.animate(performance.now()+32);assert.ok(internals.camera.matrixWorld.elements.every(Number.isFinite));
 }finally{world.dispose();hook.deregister();await w.happyDOM.close();}
});
