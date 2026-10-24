import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Window} from 'happy-dom';
import * as THREE from 'three';
import {createMinimalState,type MinimalAnimal} from '../src/minimal/model.ts';

test('World growth never shrinks between persisted ticks when the wall clock rolls back',async()=>{
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/avatars/club-avatar-rig.ts'))return {format:'module',shortCircuit:true,source:`import * as THREE from 'three';export function createClubAvatar(){return {root:new THREE.Group(),height:1.8,loaded:false,ready:Promise.resolve(),update(){},dispose(){}}}`};return next(url,context);}});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=(()=>null) as typeof w.HTMLCanvasElement.prototype.getContext;
 const host=w.document.createElement('div');w.document.body.appendChild(host);Object.defineProperties(host,{clientWidth:{value:390},clientHeight:{value:844}});
 const canvas=w.document.createElement('canvas');canvas.getBoundingClientRect=()=>new w.DOMRect(0,0,390,844);canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;canvas.releasePointerCapture=()=>{};Object.defineProperties(canvas,{clientWidth:{value:390},clientHeight:{value:844}});
 const renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){},dispose(){}};
 const originalNow=Date.now,originalLoad=GLTFLoader.prototype.loadAsync;const bornAt=1_793_000_000_000;let now=bornAt;Date.now=()=>now;
 GLTFLoader.prototype.loadAsync=async function(){const bytes=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url));return this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
 const {MinimalWorld}=await import('../src/minimal/World.ts');const state=createMinimalState(bornAt);state.welcomeClaimed=true;
 state.animals=(['cow','pig','sheep','bunny'] as const).map((species,index):MinimalAnimal=>({id:species,name:species,species,sex:'female',size:'giant',growth:{version:1,scales:[.6,1.1,1.8]},growthAgeMs:0,position:{x:2+(index%2),z:1+Math.floor(index/2)},activity:'idle',energy:85,bond:0,bornAt,activityUntil:bornAt+150_000}));
 const world=new MinimalWorld(host as unknown as HTMLElement,state,{select(){},arrive(){}},()=>renderer as unknown as THREE.WebGLRenderer);
 const internals=world as unknown as {animals:Map<string,{art:{root:THREE.Group}}> ;updateActors:(dt:number,now:number)=>void};
 const scales=()=>[...internals.animals.values()].map(v=>v.art.root.scale.x);
 const frame=(age:number)=>{now=bornAt+age;internals.updateActors(1/60,performance.now());return scales();};
 try{
  const cow=internals.animals.get('cow')!.art.root;assert.equal(await cow.userData.animationReady,true);assert.equal(cow.userData.animationSource,'blender-skinned');
  assert.deepEqual(frame(0),[.6,.6,.6,.6]);
  const grown=frame(30_249);assert.ok(grown.every(scale=>scale>.85));
  assert.deepEqual(frame(30_000),grown,'a backwards clock before the next model tick must not shrink any species');
  const beforeStage=frame(59_999),atStage=frame(60_000),afterStage=frame(60_001);
  for(let i=0;i<4;i++){assert.equal(atStage[i],1.1);assert.ok(atStage[i]>=beforeStage[i]&&afterStage[i]>=atStage[i]);assert.ok(afterStage[i]-beforeStage[i]<.00001,'no visual size snap at juvenile boundary');}
  const beforeAdult=frame(119_999),adult=frame(120_000);for(let i=0;i<4;i++){assert.equal(adult[i],1.8);assert.ok(adult[i]-beforeAdult[i]<.00001);}
  assert.deepEqual(frame(120_001),adult);assert.deepEqual(frame(3600_000),adult,'adult size is bounded');
 }finally{world.dispose();Date.now=originalNow;GLTFLoader.prototype.loadAsync=originalLoad;hook.deregister();await w.happyDOM.close();}
});
