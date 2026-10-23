import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {createMinimalState,MINIMAL_STORAGE_KEY,type MinimalState} from '../src/minimal/model.ts';
import type {PlayerMotionSnapshot} from '../src/minimal/player-motion.ts';
import type {AudioScene} from '../src/v5/estate-audio.ts';
const pause=(ms=40)=>new Promise(resolve=>setTimeout(resolve,ms));
type AudioStub={unlocks:number;enabled:boolean;visible:boolean;disposed:boolean;scene:AudioScene};
type WorldStub={state:MinimalState;walks:number;motion?:PlayerMotionSnapshot;visible:boolean;handlers:{select:(target:{kind:'tile';x:number;z:number})=>void}};

test('minimal UI wires gesture-only music, saved mute, live raid snapshots and safe pond selection',async()=>{
 const hooks=registerHooks({load(url,context,next){
  if(url.endsWith('/minimal/World.ts'))return {format:'module',shortCircuit:true,source:`export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;this.walks=0;globalThis.__audioUIWorld=this;}update(s){this.state=s;}walkTo(){this.walks++;return true;}setPlacementMode(){}setWeatherPreferences(){}playerMotionSnapshot(){return this.motion;}setPlayerMotionVisible(value){this.visible=value;}cancelWalk(){if(this.motion){this.motion.path=[];this.motion.speed=0;}}dispose(){}screenPoint(){return {x:195,y:300};}}`};
  if(url.endsWith('/v5/estate-audio.ts'))return {format:'module',shortCircuit:true,source:`export class FarmAudio{constructor(callback){this.callback=callback;this.unlocks=0;this.enabled=true;this.visible=true;globalThis.__audioUIEngine=this;}async unlock(){this.unlocks++;}setEnabled(value){this.enabled=value;}setVisible(value){this.visible=value;}updateScene(value){this.scene=value;}dispose(){this.disposed=true;}}`};
  if(url.endsWith('/feed/PhoneViewport.tsx'))return {format:'module',shortCircuit:true,source:'export default function PhoneViewport({children}){return children;}'};
  return next(url,context);
 }});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});
 const state=createMinimalState(Date.now());state.welcomeClaimed=true;state.tiles.find(t=>t.x===2&&t.z===2)!.terrain='pond';w.localStorage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));
 const host=w.document.createElement('div');w.document.body.append(host);let root=createRoot(host as unknown as HTMLElement);
 const button=(label:string)=>{const b=host.querySelector<HappyButton>(`button[aria-label="${label}"]`);assert.ok(b);return b;};
 const refs=()=>globalThis as unknown as {__audioUIEngine:AudioStub;__audioUIWorld:WorldStub};
 try{
  const {default:MinimalApp,terrainCanOpen}=await import('../src/minimal/MinimalApp.tsx');
  root.render(createElement(MinimalApp));await pause();await pause();
  const audio=refs().__audioUIEngine,world=refs().__audioUIWorld;
  assert.equal(audio.unlocks,0,'mount, load and snapshot updates do not unlock audio');assert.equal(audio.scene.active,false);
  host.querySelector('section[aria-label="萌蛋牧场"]')!.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));await pause();assert.ok(audio.unlocks>0);
  world.handlers.select({kind:'tile',x:2,z:2});await pause();assert.equal(world.walks,0);assert.match(host.textContent!,/池塘不能穿过/);
  const edge=createMinimalState(Date.now());for(const t of edge.tiles)t.owned=false;
  edge.tiles.find(t=>t.x===2&&t.z===2)!.owned=true;edge.tiles.find(t=>t.x===2&&t.z===2)!.terrain='pond';
  assert.equal(terrainCanOpen(edge,{x:3,z:2}),false,'a pond cannot serve as expansion access');
  edge.tiles.find(t=>t.x===2&&t.z===2)!.terrain='creek';assert.equal(terrainCanOpen(edge,{x:3,z:2}),true,'a shallow walkable creek can serve as access');
  world.state.wolfEvent={startedAt:Date.now(),endsAt:Date.now()+18000,helped:false};await pause(300);assert.equal(audio.scene.active,true,'timer snapshots feed the active score');
  world.state.wolfEvent=null;await pause(300);assert.equal(audio.scene.complete,true,'timer snapshots feed recovery');
  button('设置与说明').click();await pause();const unlocksBeforeMute=audio.unlocks;button('牧场背景音乐').dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));button('牧场背景音乐').click();await pause();assert.equal(audio.unlocks,unlocksBeforeMute,'mute interaction never resumes audio first');assert.equal(audio.enabled,false);assert.equal(w.localStorage.getItem('dreamina-farm-audio-v1'),'muted');assert.equal(button('牧场背景音乐').getAttribute('aria-pressed'),'false');
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'hidden'});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(audio.visible,false);assert.equal(world.visible,false,'visibility also pauses the rendered walking route');
  world.motion={position:{x:2.25,z:3},path:[{x:3,z:3}],speed:.9};
  button('设置与说明').click();await pause();const stopped=JSON.parse(w.localStorage.getItem(MINIMAL_STORAGE_KEY)!) as MinimalState;
  assert.deepEqual(stopped.player,{x:2.25,z:3},'UI cancellation saves exact current frame instead of stale simulation tick');assert.deepEqual(stopped.playerPath,[]);assert.equal(stopped.playerSpeed,0);
  root.unmount();assert.equal(audio.disposed,true);
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'visible'});
  root=createRoot(host as unknown as HTMLElement);root.render(createElement(MinimalApp));await pause();await pause();const reloaded=refs().__audioUIEngine;assert.equal(reloaded.enabled,false);assert.equal(reloaded.unlocks,0,'saved mute does not cause an unlock');
  button('设置与说明').click();await pause();button('牧场背景音乐').click();await pause();assert.equal(reloaded.enabled,true);assert.ok(reloaded.unlocks>0);assert.equal(w.localStorage.getItem('dreamina-farm-audio-v1'),'enabled');
 }finally{root.unmount();hooks.deregister();await w.happyDOM.close();}
});
