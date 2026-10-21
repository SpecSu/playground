import assert from 'node:assert/strict';
import test from 'node:test';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const angler=h=>h.world.yacht.getObjectByName('Angler 小浪');
function deferredAvatar(avatar){
 let resolve,reject,loaded=false;const ready=new Promise((a,b)=>{resolve=a;reject=b;});
 return {avatar:{...avatar,get loaded(){return loaded&&avatar.loaded;},ready},resolve(){loaded=true;resolve();},reject};
}
for(const phase of ['idle','waiting','holding'])test(`uninstalled ${phase} avatar hides model, rod, line, float, catch and labels`,async t=>{
 const events=[];const h=await fishingSceneHarness({participants:[participant(phase)],ownId:'self',qaAvatarLoaded:false,onAvatarStatus:(...args)=>events.push(args)});t.after(()=>h.dispose());
 assert.equal(angler(h).visible,false,'an empty avatar group must not expose its rod or catch');
 assert.equal(h.labels.children[0].style.visibility,'hidden');
 assert.equal(h.labels.children[0].children[0].style.visibility,'hidden');
 assert.ok(h.world.scene.children.filter(o=>o.isLine).every(o=>!o.visible),'world-space lines are hidden too');
 assert.equal(events.some(e=>e[2]==='ready'),false);
});
test('ready is acknowledged only after installed avatar is drawn and only once',async t=>{
 let pending;const events=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',qaCreateAvatar:a=>(pending=deferredAvatar(a)).avatar,onAvatarStatus:(...args)=>events.push(args)});t.after(()=>h.dispose());
 pending.resolve();await flush();assert.equal(events.some(e=>e[2]==='ready'),false,'fetch/install promise is not a render receipt');
 const before=h.renders.length;h.step();assert.ok(h.renders.length>before);assert.equal(angler(h).visible,true);
 assert.deepEqual(events.filter(e=>e[2]==='ready'),[['self','cat','ready']]);h.frames(5);assert.equal(events.filter(e=>e[2]==='ready').length,1);
});
test('profile replacement preserves the complete old avatar until new model is installed',async t=>{
 let pending;const h=await fishingSceneHarness({participants:[participant()],qaTemplates:['dog'],qaCreateAvatar:(a,kind)=>kind==='dog'?(pending=deferredAvatar(a)).avatar:a});t.after(()=>h.dispose());
 const group=angler(h),old=group.children[0];let disposed=0;old.traverse(n=>n.geometry?.addEventListener('dispose',()=>disposed++));
 h.render({participants:[{...participant(),preset:'dog'}]});h.step();assert.equal(angler(h),group);assert.equal(group.children[0],old);assert.equal(group.visible,true);assert.equal(disposed,0);
 pending.resolve();await flush();h.step();assert.notEqual(group.children[0],old);assert.ok(disposed>0);assert.equal(group.visible,true);
});
test('stale model completion after leave never adds a character or acknowledges readiness',async()=>{
 let pending;const events=[];const h=await fishingSceneHarness({participants:[participant()],qaCreateAvatar:a=>(pending=deferredAvatar(a)).avatar,onAvatarStatus:(...e)=>events.push(e)});
 h.render({participants:[]});h.step();pending.resolve();await flush();h.step();assert.equal(angler(h),undefined);assert.equal(events.some(e=>e[2]==='ready'),false);h.dispose();
});
test('picker can prepare and render a model with camera and seat interaction disabled',async t=>{
 const events=[];const h=await fishingSceneHarness({participants:[participant()],ownId:'self',enabled:false,prepareAvatars:true,onAvatarStatus:(...e)=>events.push(e)});t.after(()=>h.dispose());
 assert.ok(h.renders.length>0);assert.equal(events.some(e=>e[2]==='ready'),true);assert.equal(h.world.yacht.children.filter(o=>o.name.startsWith('Fishing station ')&&o.visible).length,0);
});
test('failed replacement keeps old model and explicit retry installs the new model',async t=>{
 const attempts=[],events=[];const h=await fishingSceneHarness({participants:[participant()],qaTemplates:['dog'],qaCreateAvatar:(a,kind)=>{if(kind!=='dog')return a;const pending=deferredAvatar(a);attempts.push(pending);return pending.avatar;},onAvatarStatus:(...e)=>events.push(e)});t.after(()=>h.dispose());
 const old=angler(h).children[0];h.render({participants:[{...participant(),preset:'dog'}]});h.step();attempts[0].reject(new Error('offline'));await flush();h.frames(3);assert.equal(angler(h).children[0],old);assert.equal(attempts.length,1,'failure must not create a request every frame');assert.ok(events.some(e=>e[1]==='dog'&&e[2]==='error'));
 h.render({avatarRetry:1});h.step();assert.equal(attempts.length,2);attempts[1].resolve();await flush();h.step();assert.notEqual(angler(h).children[0],old);assert.ok(events.some(e=>e[1]==='dog'&&e[2]==='ready'));
});
test('an older initial load cannot hide a newer installed replacement when it completes late',async t=>{
 const pending=new Map();const h=await fishingSceneHarness({participants:[participant()],qaTemplates:['dog'],qaCreateAvatar:(a,kind)=>{const loading=deferredAvatar(a);pending.set(kind,loading);return loading.avatar;}});t.after(()=>h.dispose());
 h.render({participants:[{...participant(),preset:'dog'}]});h.step();pending.get('dog').resolve();await flush();h.step();assert.equal(angler(h).visible,true);
 pending.get('cat').resolve();await flush();h.step();assert.equal(angler(h).visible,true,'old disposed avatar completion must not overwrite the current installed flag');
});
test('failed own or peer model exposes an in-scene retry without rebuilding the current yacht',async t=>{
 const attempts=[];const h=await fishingSceneHarness({participants:[participant()],qaCreateAvatar:a=>{const loading=deferredAvatar(a);attempts.push(loading);return loading.avatar;}});t.after(()=>h.dispose());
 const world=h.world;attempts[0].reject(new Error('offline'));await flush();h.step();
 const elements=node=>Array.isArray(node)?node.flatMap(elements):node?.props?[node,...elements(node.props.children)]:[];
 const retry=elements(h.render()).find(n=>n.type==='button'&&n.props.children==='重试分身');assert.ok(retry,'asset failure needs a visible retry even without an open picker');retry.props.onClick();h.step();assert.equal(attempts.length,2);attempts[1].resolve();await flush();h.step();assert.equal(h.world,world);assert.equal(angler(h).visible,true);assert.equal(elements(h.render()).some(n=>n.props?.className==='yacht-avatar-failure'),false);
});
test('a render call without an actual avatar mesh draw cannot announce readiness',async t=>{
 let draw=false;const events=[];const h=await fishingSceneHarness({participants:[participant()],qaDrawMeshes:()=>draw,onAvatarStatus:(...e)=>events.push(e)});t.after(()=>h.dispose());assert.ok(h.renders.length);assert.equal(events.some(e=>e[2]==='ready'),false);
 draw=true;h.step();assert.equal(events.filter(e=>e[2]==='ready').length,1);
});
test('a new own-avatar submission clears peer camera focus so its render receipt cannot wait off-screen',async t=>{
 const peer={...participant(),id:'peer',name:'同伴',slot:5};const h=await fishingSceneHarness({participants:[participant(),peer],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());
 const click=new Event('click');Object.defineProperty(click,'detail',{value:0});h.labels.children[1].dispatchEvent(click);h.step();assert.equal(h.labels.children[1].attributes['aria-pressed'],'true');
 h.render({avatarRetry:1});h.step();assert.equal(h.labels.children[0].attributes['aria-pressed'],'true');assert.equal(h.labels.children[1].attributes['aria-pressed'],'false');
});
