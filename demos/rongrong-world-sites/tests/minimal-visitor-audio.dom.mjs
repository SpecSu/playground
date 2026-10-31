import test from 'node:test';import assert from 'node:assert/strict';
import {createElement,act} from 'react';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {createRoot} from 'react-dom/client';
import {installFixture} from './helpers/network-motion-fixture.mjs';
import {installAudioDevice,TestAudioContext} from './helpers/audio-device.ts';
import {createMinimalState,MINIMAL_STORAGE_KEY} from '../src/minimal/model.ts';
import {ATMOSPHERE_STORAGE} from '../src/minimal/atmosphere-settings.ts';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));};
async function setup({muted=false,volume=.37}={}){
 const fixture=await installFixture(),restore=installAudioDevice(),state=createMinimalState(fixture.now);state.welcomeClaimed=true;
 fixture.w.localStorage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));fixture.w.localStorage.setItem('dreamina-farm-audio-v1',muted?'muted':'enabled');fixture.w.localStorage.setItem(ATMOSPHERE_STORAGE,JSON.stringify({volume,reducedMotion:false}));
 const {default:App}=await import('../src/minimal/MinimalApp.tsx');const host=fixture.w.document.createElement('div');fixture.w.document.body.append(host);const root=createRoot(host);
 await act(async()=>{root.render(createElement(App));await flush();});
 const button=name=>{const found=[...host.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===name||node.textContent===name);assert.ok(found,`button ${name}`);return found;};
 const click=async name=>act(async()=>{button(name).click();await flush();});
 const visit=async(name='Rummons的芦苇水乡')=>{await click(host.querySelector('.visitor-farm')?'打开好友列表':'好友牧场');await click(`串门：${name}（示例）`);};
 let hidden=false;Object.defineProperty(fixture.w.document,'hidden',{get:()=>hidden,configurable:true});Object.defineProperty(fixture.w.document,'visibilityState',{get:()=>hidden?'hidden':'visible',configurable:true});
 return {...fixture,host,root,button,click,visit,async visibility(value){hidden=value;await act(async()=>fixture.w.document.dispatchEvent(new fixture.w.Event('visibilitychange')));},async event(type){await act(async()=>fixture.w.dispatchEvent(new fixture.w.Event(type)));},async dispose(){await act(async()=>root.unmount());restore();await fixture.dispose();}};
}

test('actual App carries one original score into visits, respects focus/visibility, and disposes all audio',async t=>{
 const set=globalThis.setInterval,clear=globalThis.clearInterval,scoreTimers=new Map();
 t.mock.method(globalThis,'setInterval',(callback,period,...args)=>{const handle=set(callback,period,...args);if(period===100)scoreTimers.set(handle,callback);return handle;});
 t.mock.method(globalThis,'clearInterval',handle=>{scoreTimers.delete(handle);return clear(handle);});
 const expectScore=context=>{const before=context.sources.filter(node=>node.kind==='oscillator').length;for(let step=0;step<21;step++){context.advance(.1);for(const tick of scoreTimers.values())tick();}assert.ok(context.sources.filter(node=>node.kind==='oscillator').length>before,'original-score notes advance beyond ambience across the two-beat bass pulse');};
 const f=await setup();try{
  assert.equal(TestAudioContext.instances.length,0,'mount is not a user gesture');
  await f.visit();const context=TestAudioContext.instances[0];assert.ok(context);assert.equal(TestAudioContext.instances.length,1);assert.equal(scoreTimers.size,1);
  expectScore(context);
  assert.equal(context.nodes[0].gain.value,.7*.37,'saved master volume survives entry');
  assert.equal(f.button('好友牧场音乐').getAttribute('aria-pressed'),'true');
  for(const destination of ['吉吉的月球剧场','加新的冰川港湾','Rummons的芦苇水乡']){await f.visit(destination);expectScore(context);assert.equal(TestAudioContext.instances.length,1);assert.equal(scoreTimers.size,1);}
  await f.click('串门怎么玩');expectScore(context);await f.click('关闭串门怎么玩');
  for(let i=0;i<3;i++){
   const resumes=context.resumes;await f.visibility(true);assert.equal(context.liveSources.length,0);assert.equal(scoreTimers.size,0);await f.visibility(false);expectScore(context);assert.equal(context.resumes,resumes,'visibility does not call resume');
   await f.event('blur');assert.equal(context.liveSources.length,0);await f.event('focus');expectScore(context);assert.equal(context.resumes,resumes,'focus does not call resume');
   await f.click('回家');expectScore(context);await f.visit();expectScore(context);assert.equal(TestAudioContext.instances.length,1);assert.equal(scoreTimers.size,1);
  }
  await f.click('好友牧场音乐');assert.equal(context.liveSources.length,0);assert.equal(f.w.localStorage.getItem('dreamina-farm-audio-v1'),'muted');
  await f.click('回家');await f.visit();assert.equal(context.liveSources.length,0,'navigation cannot unmute');
  await f.click('好友牧场音乐');expectScore(context);assert.equal(context.nodes[0].gain.value,.7*.37);
 }finally{await f.dispose();}
 const context=TestAudioContext.instances[0];assert.equal(scoreTimers.size,0);assert.equal(context.closed,1);assert.ok(context.nodes.every(node=>node.disconnected));assert.equal(context.liveSources.length,0);
});

test('stored mute and zero volume remain silent across repeated entry, focus and return',async()=>{
 for(const settings of [{muted:true,volume:.6},{volume:0}]){
  const f=await setup(settings);try{await f.visit();await f.event('blur');await f.event('focus');await f.visibility(true);await f.visibility(false);await f.click('回家');await f.visit();assert.ok(TestAudioContext.instances.every(context=>context.liveSources.length===0));if(settings.muted)assert.equal(TestAudioContext.instances.length,0);assert.equal(JSON.parse(f.w.localStorage.getItem(ATMOSPHERE_STORAGE)).volume,settings.volume);}finally{await f.dispose();}
 }
});

test('suspended devices require a fresh visitor gesture; slow resume cannot play after hide or unmount',async()=>{
 const f=await setup();try{await f.visit();const context=TestAudioContext.instances[0];await act(async()=>context.suspendBySystem());const resumes=context.resumes;await f.event('blur');await f.event('focus');await f.visibility(true);await f.visibility(false);assert.equal(context.resumes,resumes);assert.equal(context.liveSources.length,0);assert.equal(f.button('好友牧场音乐').getAttribute('data-audio-status'),'awaiting-gesture');await f.click('好友牧场音乐');assert.ok(context.liveOscillators.length>0);assert.equal(f.w.localStorage.getItem('dreamina-farm-audio-v1'),'enabled','tap-to-listen is not a mute action');
  await act(async()=>context.suspendBySystem());TestAudioContext.holdResume=true;await f.click('好友牧场音乐');await f.visibility(true);await act(async()=>{context.finishResume();await flush();});assert.equal(context.liveSources.length,0,'late unlock cannot restart hidden visitor');await f.visibility(false);assert.ok(context.liveOscillators.length>0);
  await act(async()=>context.suspendBySystem());await f.click('好友牧场音乐');await f.dispose();context.finishResume();await flush();assert.equal(context.liveSources.length,0);assert.equal(context.closed,1);assert.ok(context.nodes.every(node=>node.disconnected));
 }catch(error){await f.dispose();throw error;}
});

test('device failure leaves the visitor playable with one short unavailable control',async()=>{
 const f=await setup();try{TestAudioContext.failResume=true;await f.visit();assert.ok(f.host.querySelector('.visitor-farm'));assert.equal(f.button('好友牧场音乐').getAttribute('data-audio-status'),'unavailable');assert.equal(TestAudioContext.instances[0].liveSources.length,0);await f.click('回家');assert.equal(f.host.querySelector('.visitor-farm'),null);}finally{await f.dispose();}
});


test('visitor model loads may be slow or fail without owning or duplicating the score',async()=>{
 const f=await setup(),load=GLTFLoader.prototype.loadAsync,finishes=[];try{
  GLTFLoader.prototype.loadAsync=async()=>{await new Promise(resolve=>{finishes.push(resolve);});throw new Error('simulated missing optional model');};
  await f.visit('加新的冰川港湾');assert.ok(finishes.length>0,'at least one actual 3D asset request is held');const context=TestAudioContext.instances[0];assert.ok(context.liveOscillators.length>0,'music does not await 3D assets');
  await f.click('回家');assert.ok(context.liveOscillators.length>0);await act(async()=>{for(const finish of finishes.splice(0))finish();await flush();});assert.equal(TestAudioContext.instances.length,1);assert.ok(context.liveOscillators.length>0,'late visitor failure cannot stop home score');
 }finally{GLTFLoader.prototype.loadAsync=load;for(const finish of finishes.splice(0))finish();await f.dispose();}
});

test('music control stays inside visitor stacking scope below its boarding dialog',async()=>{
 const f=await setup();try{await f.visit();const control=f.button('好友牧场音乐');assert.ok(f.host.querySelector('.visitor-farm').contains(control),'the visitor modal must share the music control stacking context');await f.click('寄养演示');assert.ok(f.host.querySelector('.visitor-farm [aria-modal="true"]'));assert.ok(TestAudioContext.instances[0].liveOscillators.length>0,'modal changes movement only');await f.click('关闭寄养演示');assert.equal(f.host.querySelector('.visitor-farm [aria-modal="true"]'),null);}finally{await f.dispose();}
});
