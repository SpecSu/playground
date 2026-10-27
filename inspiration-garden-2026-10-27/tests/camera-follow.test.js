import test from 'node:test';import assert from 'node:assert/strict';
import {createCameraFollow} from '../src/camera-follow.js';
test('owner walking gently centers the actual visual pose without changing zoom or following a host',()=>{
 const f=createCameraFollow(),camera={x:220,y:320,zoom:1.2},owner={x:400,y:500,moving:true};const first=f.step(0,{owner,camera,width:440,height:757,trayHeight:100});assert.deepEqual(first,{x:0,y:0});const next=f.step(33,{owner,camera,width:440,height:757,trayHeight:100});assert.ok(next.x<0&&next.x>-180);assert.ok(next.y<0);assert.equal(camera.zoom,1.2);assert.deepEqual(f.step(66,{owner:{...owner,moving:false},camera,width:440,height:757,trayHeight:100,host:{x:0,y:0,moving:true}}),{x:0,y:0});
});
test('view gesture holds inspection priority for2seconds without moving idle state, then smoothly resumes only for moving owner',()=>{
 const f=createCameraFollow(),input={owner:{x:390,y:450,moving:true},camera:{zoom:1},width:440,height:757,trayHeight:140};f.step(0,input);f.view(10);assert.deepEqual(f.step(100,input),{x:0,y:0});assert.deepEqual(f.step(2009,input),{x:0,y:0});assert.ok(f.step(2011,input).x<0);f.view(2012);f.resume(2013);assert.ok(f.step(2046,input).x<0);
});
test('active world contacts and stationary candidates lock camera and long frame gaps never produce a snap',()=>{
 const f=createCameraFollow(),input={owner:{x:390,y:450,moving:true},camera:{zoom:1},width:440,height:757,trayHeight:250};f.step(0,input);assert.deepEqual(f.step(200,{...input,locked:true}),{x:0,y:0});const step=f.step(100000,input);assert.ok(Math.abs(step.x)<50);assert.ok(Math.abs(step.y)<50);
});
