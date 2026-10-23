import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window} from 'happy-dom';
import * as THREE from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMinimalState,minimalCommand} from '../src/minimal/model.ts';

test('actual scene geometry keeps two-cell shop clickable after batching and first scene within draw budget',async()=>{
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/avatars/club-avatar-rig.ts'))return {format:'module',shortCircuit:true,source:`import * as THREE from 'three';export function createClubAvatar(){return {root:new THREE.Group(),height:1.8,loaded:false,ready:Promise.resolve(),update(){},dispose(){}}}`};return next(url,context);}});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=(()=>null) as typeof w.HTMLCanvasElement.prototype.getContext;
 const host=w.document.createElement('div');w.document.body.appendChild(host);Object.defineProperties(host,{clientWidth:{value:390},clientHeight:{value:844}});
 const canvas=w.document.createElement('canvas');canvas.getBoundingClientRect=()=>new w.DOMRect(0,0,390,844);canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;canvas.releasePointerCapture=()=>{};Object.defineProperties(canvas,{clientWidth:{value:390},clientHeight:{value:844}});
 const renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){},dispose(){}};
 const {MinimalWorld}=await import('../src/minimal/World.ts');const now=Date.now();const state=minimalCommand(createMinimalState(now),{type:'welcome'},now).state;const selected:string[]=[];
 const world=new MinimalWorld(host as unknown as HTMLElement,state,{select:t=>selected.push(t.kind),arrive(){}},()=>renderer as unknown as THREE.WebGLRenderer);
 const internals=world as unknown as {scene:THREE.Scene;camera:THREE.OrthographicCamera;controls:OrbitControls;playerRoot:THREE.Group;shop:THREE.Group;animate:(n:number)=>void;onPointerDown:(e:PointerEvent)=>void;onPointerUp:(e:PointerEvent)=>void};
 try{
  internals.animate(performance.now()+16);internals.scene.updateMatrixWorld(true);internals.camera.updateMatrixWorld(true);
  let visible=0;internals.scene.traverseVisible(o=>{if(o instanceof THREE.Mesh&&(Array.isArray(o.material)?o.material.some(m=>m.visible):o.material.visible))visible++;});assert.ok(visible<250,`visible scene mesh count ${visible}`);
  const spot=internals.shop.position.clone().add(new THREE.Vector3(0,1.1,.72)).project(internals.camera);const event={clientX:(spot.x+1)*195,clientY:(1-spot.y)*422,button:0,pointerId:1} as PointerEvent;
  const dispatch=(type:string,x:number,y:number,id=1,pointerType='mouse',buttons=type==='pointerup'?0:1)=>{const e=new w.PointerEvent(type,{clientX:x,clientY:y,pointerId:id,pointerType,button:0,buttons,bubbles:true});Object.defineProperties(e,{pageX:{value:x},pageY:{value:y}});return canvas.dispatchEvent(e);};
  const click=(x:number,y:number)=>canvas.dispatchEvent(new w.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
  dispatch('pointerdown',event.clientX,event.clientY);dispatch('pointerup',event.clientX,event.clientY);click(event.clientX,event.clientY);assert.equal(selected.at(-1),'shop','batched shop meshes retain pointer target');
  assert.equal(selected.length,1,'one tap selects exactly once');click(event.clientX,event.clientY);assert.equal(selected.length,1,'click eligibility is consumed');
  const beforeYaw=internals.controls.getAzimuthalAngle(),beforePolar=internals.controls.getPolarAngle();
  world.setPlacementMode(true);
  dispatch('pointerdown',190,420);dispatch('pointermove',270,470);dispatch('pointerup',270,470);click(270,470);
  assert.notEqual(internals.controls.getAzimuthalAngle(),beforeYaw,'left drag rotates yaw');assert.notEqual(internals.controls.getPolarAngle(),beforePolar,'left drag rotates elevation');assert.equal(selected.length,1,'rotation never places an egg');
  dispatch('pointerdown',190,420);dispatch('pointermove',200,420);dispatch('pointermove',190,420);dispatch('pointerup',190,420);click(190,420);assert.equal(selected.length,1,'return-to-start drag is not a tap');
  const touchYaw=internals.controls.getAzimuthalAngle();dispatch('pointerdown',190,420,1,'touch');dispatch('pointermove',230,450,1,'touch');dispatch('pointerup',230,450,1,'touch');click(230,450);assert.notEqual(internals.controls.getAzimuthalAngle(),touchYaw,'single finger rotates');assert.equal(selected.length,1,'single finger drag never selects');
  dispatch('pointerdown',150,400,1,'touch');dispatch('pointerdown',230,400,2,'touch');dispatch('pointermove',270,400,2,'touch');dispatch('pointerup',150,400,1,'touch');dispatch('pointerup',270,400,2,'touch');click(190,420);assert.equal(selected.length,1,'pinch never selects');assert.ok(Number.isFinite(internals.camera.zoom)&&internals.camera.zoom>1,'pinch zooms');
  dispatch('pointerdown',190,420);dispatch('pointercancel',190,420);dispatch('pointerup',190,420);click(190,420);assert.equal(selected.length,1,'cancel never selects');
  dispatch('pointerdown',190,420);w.dispatchEvent(new w.Event('blur'));dispatch('pointerup',190,420);click(190,420);assert.equal(selected.length,1,'blur never selects');
  world.setPlacementMode(false);
  for(let i=0;i<180;i++)internals.controls.update();
  const offset=internals.camera.position.clone().sub(internals.controls.target),zoom=internals.camera.zoom;
  world.update(state);world.walkTo({x:1,z:1});for(let i=0;i<30;i++)internals.animate(performance.now()+1000+i*16);
  assert.ok(internals.camera.position.clone().sub(internals.controls.target).distanceTo(offset)<1e-5,'walk follow translates without resetting manual orbit');assert.equal(internals.camera.zoom,zoom,'simulation and walk retain zoom');
  const zoomBeforeWheel=internals.camera.zoom;canvas.dispatchEvent(new w.WheelEvent('wheel',{deltaY:-100,cancelable:true}));assert.ok(internals.camera.zoom>zoomBeforeWheel,'wheel zooms');
  world.update(state);
  world.focus();world.zoom(.1);internals.animate(performance.now()+32);assert.ok(internals.camera.matrixWorld.elements.every(Number.isFinite));
 }finally{world.dispose();hook.deregister();await w.happyDOM.close();}
});
