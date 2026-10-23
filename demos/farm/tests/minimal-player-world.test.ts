import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window} from 'happy-dom';
import * as THREE from 'three';
import {createMinimalState,advanceMinimalState,minimalCommand} from '../src/minimal/model.ts';
import {withRenderedPlayer} from '../src/minimal/player-motion.ts';
import type {ClubMotionState} from '../src/avatars/club-scene-motion.ts';

test('actual LX controller strolls, never fires early arrival, cancels safely and stops gait',async()=>{
 const hooks=registerHooks({load(url,context,next){if(url.endsWith('/avatars/club-avatar-rig.ts'))return {format:'module',shortCircuit:true,source:`import * as THREE from 'three';export function createClubAvatar(kind,key){const avatar={root:new THREE.Group(),height:1.8,loaded:false,ready:Promise.resolve(),update(time,action,idle,energy,motion){this.motion=motion;this.idle=idle;},dispose(){}};if(key==='minimal-player')globalThis.__strollAvatar=avatar;return avatar;}`};return next(url,context);}});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=(()=>null) as typeof w.HTMLCanvasElement.prototype.getContext;
 const host=w.document.createElement('div');w.document.body.append(host);Object.defineProperties(host,{clientWidth:{value:390},clientHeight:{value:844}});
 const canvas=w.document.createElement('canvas'),renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){},dispose(){}};
 const {MinimalWorld}=await import('../src/minimal/World.ts');const state=createMinimalState(Date.now()),arrivals:{x:number;z:number}[]=[];
 const world=new MinimalWorld(host as unknown as HTMLElement,state,{select(){},arrive:p=>arrivals.push(p)},()=>renderer as unknown as THREE.WebGLRenderer);
 const internals=world as unknown as {updateActors:(dt:number,now:number)=>void;playerRoot:THREE.Group};
 const avatar=(globalThis as unknown as {__strollAvatar:{motion:ClubMotionState;idle:boolean}}).__strollAvatar;
 let clock=performance.now();const frame=()=>{clock+=1000/60;internals.updateActors(1/60,clock);};
 try{
  await Promise.resolve();assert.ok(world.walkTo({x:2,z:3}));
  const initial=internals.playerRoot.position.clone();for(let i=0;i<37;i++)frame();
  assert.equal(arrivals.length,0,'no arrival at old sprint duration');assert.ok(internals.playerRoot.position.x-initial.x<1,'less than half a cell at .62s');
  for(let i=0;i<100;i++)frame();assert.deepEqual(arrivals,[{x:2,z:3}]);assert.ok(Math.abs(internals.playerRoot.position.x-1)<1e-9);assert.equal(avatar.idle,true);assert.equal(avatar.motion.walkBlend,0);
  const ended=internals.playerRoot.position.clone();for(let i=0;i<20;i++)frame();assert.equal(arrivals.length,1);assert.equal(internals.playerRoot.position.x,ended.x,'idle does not drift');
  world.walkTo({x:3,z:3});for(let i=0;i<20;i++)frame();world.cancelWalk();const stopped=internals.playerRoot.position.clone();for(let i=0;i<80;i++)frame();assert.equal(arrivals.length,1);assert.equal(internals.playerRoot.position.x,stopped.x);
  world.walkTo({x:1,z:3});for(let i=0;i<10;i++)frame();world.walkTo({x:2.3,z:3});for(let i=0;i<180;i++)frame();assert.deepEqual(arrivals.at(-1),{x:2.3,z:3});assert.equal(arrivals.length,2,'replaced target cannot arrive later');
  assert.equal(avatar.motion.sampleAtDistance!(avatar.motion.distance).x,avatar.motion.x,'planted-foot trajectory still uses current world root');
  // Reproduce cancellation 240ms after the last persisted simulation tick.
  let logical=withRenderedPlayer(state,world.playerMotionSnapshot()),time=state.updatedAt;
  logical=minimalCommand(logical,{type:'move',to:{x:1,z:3}},time).state;world.update(logical);world.walkTo({x:1,z:3});
  for(let i=1;i<=74;i++){frame();if(i%15===0){time+=250;logical=withRenderedPlayer(advanceMinimalState(logical,time),world.playerMotionSnapshot());world.update(logical);}}
  const beforeCancel=world.playerMotionSnapshot();assert.ok(Math.abs(logical.player.x-beforeCancel.position.x)>.1,'fixture actually has a stale 250ms model position');
  logical={...withRenderedPlayer(advanceMinimalState(logical,time+240),beforeCancel),playerPath:[],playerSpeed:0};world.cancelWalk();world.update(logical);
  assert.deepEqual(logical.player,world.playerMotionSnapshot().position,'cancel saves the exact rendered origin, not the stale tick');
  logical=minimalCommand(logical,{type:'move',to:{x:3,z:3}},time+240).state;world.update(logical);world.walkTo({x:3,z:3});
  for(let i=0;i<20;i++)frame();world.setPlayerMotionVisible(false);const hidden=world.playerMotionSnapshot(),arrivalCount=arrivals.length;
  for(let i=0;i<120;i++){frame();logical=withRenderedPlayer(advanceMinimalState(logical,logical.updatedAt+17),world.playerMotionSnapshot());world.update(logical);}
  assert.deepEqual(world.playerMotionSnapshot(),hidden);assert.deepEqual(logical.player,hidden.position);assert.equal(arrivals.length,arrivalCount);
  world.setPlayerMotionVisible(true);frame();const resumed=world.playerMotionSnapshot();assert.ok(Math.hypot(resumed.position.x-hidden.position.x,resumed.position.z-hidden.position.z)<=.9/60+1e-8,'visible return advances one ordinary frame without teleport');
  for(let i=0;i<240;i++)frame();assert.deepEqual(arrivals.at(-1),{x:3,z:3});

 }finally{world.dispose();hooks.deregister();await w.happyDOM.close();}
});
