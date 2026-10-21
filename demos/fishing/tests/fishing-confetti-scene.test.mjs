import assert from 'node:assert/strict';
import test from 'node:test';
import {TEST_FIRST_THREE_CONFETTI} from '../lib/fishing-confetti.ts';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';
const held=(h,id='rare-catch',speciesId='lobster')=>participant('holding',{catch:{id,speciesId,lengthCm:70,weightKg:2,caughtAt:h.now()}});
const mesh=h=>h.world.scene.getObjectByName('Rare catch paper celebration');
test('live own catch waits for the closeup then renders once and ends',async t=>{
 const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());
 h.render({participants:[held(h)]});h.step();assert.equal(mesh(h).visible,false);await h.settleCatches();
 h.frames(46);assert.equal(mesh(h).visible,true);assert.equal(mesh(h).count,36);
 h.frames(80);assert.equal(mesh(h).visible,false);
 h.render({participants:[{...held(h),lastSeenAt:h.now()}]});h.frames(50);assert.equal(mesh(h).visible,false);
});
for(const reason of ['hidden','disabled','reduced motion','camera exit'])test(`active effect stops on ${reason} without replay`,async t=>{
 const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());
 h.render({participants:[held(h)]});h.step();await h.settleCatches();h.frames(46);assert.equal(mesh(h).visible,true);
 if(reason==='hidden'){h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));}
 if(reason==='disabled')h.render({enabled:false});
 if(reason==='reduced motion')h.render({reducedMotion:true});
 if(reason==='camera exit')h.render({cameraMode:'deck'});
 h.step();assert.equal(mesh(h).visible,false);
 h.document.hidden=false;h.render({enabled:true,reducedMotion:false});h.frames(50);assert.equal(mesh(h).visible,false);
});
test('cold refresh and remote legendary catch do not celebrate',async t=>{
 const h=await fishingSceneHarness({participants:[participant('holding',{catch:{id:'saved',speciesId:'manta-ray',lengthCm:300,weightKg:10,caughtAt:1_800_000_000_000}})],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());h.frames(60);assert.equal(mesh(h).visible,false);
 h.render({participants:[participant('idle'),{...held(h,'remote','manta-ray'),id:'peer',slot:1}]});h.step();await h.settleCatches();h.frames(60);assert.equal(mesh(h).visible,false);
});
test('cast callback belongs to fresh own animation and never repeats after interruption',async t=>{
 const calls=[];const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',reducedMotion:false,onCastStart:id=>calls.push(id)});t.after(()=>h.dispose());
 h.render({participants:[participant('waiting',{castId:'fresh',castAt:h.now()})]});h.step();assert.deepEqual(calls,['fresh']);h.frames(10);assert.deepEqual(calls,['fresh']);
 h.render({enabled:false,participants:[participant('waiting',{castId:'hidden',castAt:h.now()})]});h.step();h.render({enabled:true});h.step();assert.deepEqual(calls,['fresh']);
 h.render({reducedMotion:true,participants:[participant('waiting',{castId:'reduced',castAt:h.now()})]});h.step();assert.deepEqual(calls,['fresh','reduced']);
});
test('context loss clears active strips and unmount releases their resources',async()=>{
 const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',reducedMotion:false});
 h.render({participants:[held(h)]});h.step();await h.settleCatches();h.frames(46);const strips=mesh(h);assert.equal(strips.visible,true);
 let geometries=0,materials=0;strips.geometry.addEventListener('dispose',()=>geometries++);strips.material.addEventListener('dispose',()=>materials++);
 h.event('webglcontextlost');assert.equal(strips.visible,false);h.dispose();assert.equal(geometries,1);assert.equal(materials,1);assert.equal(strips.parent,null);
 h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(strips.visible,false);
});
test('a catch received while RAF is suspended in a hidden tab is consumed on return',async t=>{
 const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());
 h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));
 h.render({participants:[held(h)]});
 h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));h.step();await h.settleCatches();h.frames(60);assert.equal(mesh(h).visible,false);
});

test('production defaults skip the first three common catches and only celebrate actual rare tiers',async t=>{
 assert.equal(TEST_FIRST_THREE_CONFETTI,false,'temporary forced preview must be off in production');
 const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());
 for(const [id,speciesId,count] of [['common-one','clownfish',0],['common-two','sardine',0],['common-three','blue-tang',0],['uncommon','pufferfish',0],['actual-rare','lobster',36],['actual-epic','tuna',54],['actual-legendary','manta-ray',72]]){
  h.render({participants:[participant('idle')]});h.step();
  h.render({participants:[held(h,id,speciesId)]});h.step();await h.settleCatches();h.frames(46);
  assert.equal(mesh(h).count,count,id);assert.equal(mesh(h).visible,count>0,id);
 }
 h.event('webglcontextlost');const tree=h.render();
 const findButton=node=>{if(!node||typeof node!=='object')return null;if(node.type==='button')return node;for(const child of [node.props?.children].flat(Infinity)){const result=findButton(child);if(result)return result;}return null;};
 const retry=findButton(tree);assert.ok(retry);retry.props.onClick();h.render();h.step();assert.equal(mesh(h).visible,false,'renderer retry never replays held catch');
 h.render({enabled:false});h.step();h.render({enabled:true,cameraMode:'deck',participants:[participant('idle')]});h.step();
 h.render({participants:[held(h,'common-after-retry','clownfish')]});h.step();await h.settleCatches();h.frames(46);assert.equal(mesh(h).visible,false,'retry/profile cannot re-enable forced preview');
});
