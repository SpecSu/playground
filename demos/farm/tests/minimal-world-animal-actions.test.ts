import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Window} from 'happy-dom';
import * as THREE from 'three';
import {createMinimalState,minimalCommand,getDrinkSpot,isWalkableTile} from '../src/minimal/model.ts';

test('World contacts real bank water and repairs autonomous guardian routes after pond conversion',async()=>{
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/avatars/club-avatar-rig.ts'))return {format:'module',shortCircuit:true,source:`import * as THREE from 'three';export function createClubAvatar(){return {root:new THREE.Group(),height:1.8,loaded:false,ready:Promise.resolve(),update(){},dispose(){}}}`};return next(url,context);}});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=(()=>null) as typeof w.HTMLCanvasElement.prototype.getContext;
 const host=w.document.createElement('div');w.document.body.appendChild(host);Object.defineProperties(host,{clientWidth:{value:390},clientHeight:{value:844}});
 const canvas=w.document.createElement('canvas');canvas.getBoundingClientRect=()=>new w.DOMRect(0,0,390,844);canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;canvas.releasePointerCapture=()=>{};Object.defineProperties(canvas,{clientWidth:{value:390},clientHeight:{value:844}});
 const renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){},dispose(){}};
 const {MinimalWorld}=await import('../src/minimal/World.ts');const now=Date.now();const state=minimalCommand(createMinimalState(now),{type:'welcome'},now).state;state.animals=[{id:'water-cow',name:'小牛',species:'cow',sex:'female',size:'normal',position:{x:2,z:2},activity:'drink',energy:60,bond:0,bornAt:now-120000,activityUntil:now+3000}];state.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const selected:string[]=[];
 const originalLoad=GLTFLoader.prototype.loadAsync;GLTFLoader.prototype.loadAsync=async function(){const bytes=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url));return this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
 const world=new MinimalWorld(host as unknown as HTMLElement,state,{select:t=>selected.push(t.kind),arrive(){}},()=>renderer as unknown as THREE.WebGLRenderer);

 const internals=world as unknown as {animals:Map<string,{art:{root:THREE.Group;mouth:THREE.Object3D};distance:number}>;guardRoot:THREE.Group;guardTarget:THREE.Vector3;guardPath:THREE.Vector3[];updateActors:(dt:number,n:number)=>void;updateGuardian:(dt:number,n:number)=>void};
 try{
  const loaded=internals.animals.get('water-cow')!.art;assert.equal(await loaded.root.userData.animationReady,true);assert.equal(loaded.root.userData.animationSource,'blender-skinned','World opts into the real GLB, not procedural fallback');assert.ok(loaded.mouth instanceof THREE.Bone);
  for(let i=0;i<120;i++)internals.updateActors(1/60,performance.now()+i*16);
  const art=internals.animals.get('water-cow')!.art;art.root.updateMatrixWorld(true);
  const spot=getDrinkSpot(state,state.animals[0])!;const expected=new THREE.Vector3((spot.waterPoint.x-1.5)*2,spot.waterHeight,(spot.waterPoint.z-1.5)*2);
  assert.ok(art.mouth.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<.025,'rendered mouth reaches the model-selected pond surface');
  assert.ok(isWalkableTile(state,{x:art.root.position.x/2+1.5,z:art.root.position.z/2+1.5}),'drinker stands on bank');
  const converted=structuredClone(state);converted.tiles.find(t=>t.x===3&&t.z===1)!.terrain='pond';world.update(converted);
  const grid=(p:THREE.Vector3)=>({x:p.x/2+1.5,z:p.z/2+1.5});
  assert.ok(isWalkableTile(converted,grid(internals.guardRoot.position)),'guardian immediately leaves converted tile safely');
  for(let i=0;i<600;i++){internals.updateGuardian(1/60,100000+i*16);assert.ok(isWalkableTile(converted,grid(internals.guardRoot.position)),'patrol never enters pond');}
  internals.guardPath=[new THREE.Vector3((1-1.5)*2,0,(3-1.5)*2)];internals.guardTarget.copy(internals.guardPath[0]);
  const rerouted=structuredClone(converted);rerouted.tiles.find(t=>t.x===1&&t.z===3)!.terrain='pond';world.update(rerouted);
  assert.ok(internals.guardPath.every(p=>isWalkableTile(rerouted,grid(p))),'stale route cleared after pond edit');
  assert.ok(isWalkableTile(rerouted,grid(internals.guardTarget)),'stale target cleared');
 }finally{world.dispose();GLTFLoader.prototype.loadAsync=originalLoad;hook.deregister();await w.happyDOM.close();}
});
