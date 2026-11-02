import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import test from 'node:test';import vm from 'node:vm';import ts from 'typescript';import * as THREE from 'three';
import {FloorPointerGesture,pickClubFloor} from '../lib/club-floor-input.ts';import {dragCameraOrbit} from '../lib/club-camera.ts';
const source=readFileSync(new URL('../components/ClubScene.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('ClubScene.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),handlers=new Map();
function visit(node){if(ts.isVariableDeclaration(node)&&node.initializer)handlers.set(node.name.getText(ast),node.initializer.getText(ast));ts.forEachChild(node,visit);}visit(ast);
const names=['cancelCameraPointer','onDocumentPointerDown','onDocumentPointerEnd','onPointerDown','onPointerMove','onPointerEnd','onPointerCancel','onLostCapture'];
function harness(){
 for(const name of names)assert.ok(handlers.has(name),`real ${name} handler exists`);
 const captured=new Set(),control={x:0,y:0,active:false,enabled:true,autoRequest:0},floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.MeshBasicMaterial());floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.updateMatrixWorld();
 const camera=new THREE.PerspectiveCamera(52,1,.08,80);camera.position.set(3,8,8);camera.lookAt(3,-.025,3);camera.updateMatrixWorld();
 const context=vm.createContext({gesture:new FloorPointerGesture(),touchPointers:new Set(),pointerGeneration:'',pointerCanWalk:false,latest:{current:{movementControl:{current:control},ownId:'self',participants:[{id:'self',joinedAt:1}],serverOffsetMs:0}},
 world:{floor,getFloorPickBlockers:()=>[],players:new Map([['self',{root:{visible:true}}]])},camera,hasRendered:true,alive:true,lost:false,width:500,orbit:{yaw:0,pitch:0},pickClubFloor,dragCameraOrbit,
 inputGeneration:()=>`fixed:${control.cancelRequest??0}`,Date,canvas:{style:{},focus(){},getBoundingClientRect:()=>({left:0,top:0,width:500,height:500}),setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>{captured.delete(id);context.onLostCapture?.({pointerId:id});}}});
 for(const name of names)vm.runInContext(ts.transpileModule(`globalThis.${name} = ${handlers.get(name)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const event=(patch={})=>({pointerId:1,isPrimary:true,button:0,pointerType:'mouse',clientX:250,clientY:250,timeStamp:100,...patch});
 return{context,control,captured,event,dispose:()=>{floor.geometry.dispose();floor.material.dispose();}};
}
test('real canvas release requests one target and normal lostcapture cannot cancel that target',()=>{
 const h=harness();h.context.onPointerDown(h.event());h.context.onPointerEnd(h.event({timeStamp:200}));
 assert.equal(h.control.targetRequest?.sequence,1);assert.ok(Math.hypot(h.control.targetRequest.x-3,h.control.targetRequest.z-3)<1e-7);assert.equal(h.captured.size,0);
 h.context.onPointerEnd(h.event({timeStamp:210}));assert.equal(h.control.targetRequest.sequence,1);h.dispose();
});
test('a fresh canvas tap carries the cancellation generation that was current for that gesture',()=>{
 const h=harness();h.control.cancelRequest=4;
 h.context.onPointerDown(h.event());h.context.onPointerEnd(h.event({timeStamp:200}));
 assert.equal(h.control.targetRequest?.cancelGeneration,4,'the world can distinguish a fresh post-cancel tap from a stale queued target');
 h.dispose();
});
test('real canvas drag changes view and a return-to-origin release never walks',()=>{
 const h=harness();h.context.onPointerDown(h.event());h.context.onPointerMove(h.event({clientX:275}));assert.notEqual(h.context.orbit.yaw,0);
 h.context.onPointerMove(h.event());h.context.onPointerEnd(h.event({timeStamp:200}));assert.equal(h.control.targetRequest,undefined);h.dispose();
});
test('a second touch outside the canvas, cancellation and eligibility changes abort pending floor taps',()=>{
 for(const abort of ['second','cancel','lost','disabled','generation','joystick']){
  const h=harness();h.context.onPointerDown(h.event({pointerType:'touch'}));
  if(abort==='second')h.context.onDocumentPointerDown(h.event({pointerId:2,pointerType:'touch',isPrimary:false}));
  if(abort==='cancel')h.context.onPointerCancel(h.event());if(abort==='lost')h.context.onLostCapture(h.event());
  if(abort==='disabled')h.control.enabled=false;if(abort==='generation')h.control.cancelRequest=1;if(abort==='joystick')h.control.active=true;
  h.context.onPointerEnd(h.event({timeStamp:200}));assert.equal(h.control.targetRequest,undefined,abort);h.dispose();
 }
});
test('spectators retain camera dragging but cannot issue a floor target',()=>{
 const h=harness();h.control.enabled=false;h.context.onPointerDown(h.event());h.context.onPointerEnd(h.event({timeStamp:200}));assert.equal(h.control.targetRequest,undefined);
 h.context.onPointerDown(h.event());h.context.onPointerMove(h.event({clientX:280}));assert.notEqual(h.context.orbit.yaw,0);h.dispose();
});
test('lifecycle stop discards stale touch IDs before a fresh primary touch',()=>{
 const h=harness();h.context.touchPointers.add(88);
 const stop=handlers.get('stopMovement');assert.ok(stop);
 Object.assign(h.context,{manualGesture:false,manualHeadingLock:undefined,lastMovementSample:undefined,lastMovementGeneration:'fixed',movementGeneration:()=> 'fixed',shouldStopMovementSample:()=>false,cancelClickMovement:control=>{control.cancelRequest=(control.cancelRequest??0)+1;control.targetRequest=null;}});
 vm.runInContext(ts.transpileModule(`globalThis.stopMovement = ${stop}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,h.context);
 h.context.stopMovement();assert.equal(h.context.touchPointers.size,0);
 h.context.onDocumentPointerDown(h.event({pointerType:'touch',pointerId:2}));h.context.onPointerDown(h.event({pointerType:'touch',pointerId:2}));
 h.context.onPointerEnd(h.event({pointerType:'touch',pointerId:2,timeStamp:200}));assert.equal(h.control.targetRequest?.sequence,1);h.dispose();
});
test('real camera toggle branch keeps a click destination but resets held joystick input',()=>{
 let branch;function find(node){if(ts.isIfStatement(node)&&node.expression.getText(ast).includes('snapshot.cameraResetKey !== lastCameraReset'))branch=node.thenStatement.getText(ast);ts.forEachChild(node,find);}find(ast);assert.ok(branch);
 for(const active of [false,true]){
  const control={active,targetRequest:{sequence:1,x:3,z:3}},state={stops:0,cancels:0,resets:0};
  const context=vm.createContext({control,snapshot:{cameraResetKey:1,cameraMode:'third-person'},lastCameraReset:0,lastCameraMode:'overview',manualGesture:active,manualHeadingLock:1,orbit:{yaw:1,pitch:.1},DEFAULT_CAMERA_ORBIT:{yaw:0,pitch:0},cancelCameraPointer:()=>state.cancels++,stopMovement:()=>{state.stops++;control.targetRequest=null;},cameras:{reset:()=>state.resets++}});
  vm.runInContext(ts.transpileModule(branch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.equal(state.cancels,1);assert.equal(state.resets,1);assert.equal(state.stops,active?1:0);assert.equal(Boolean(control.targetRequest),!active);
 }
});
