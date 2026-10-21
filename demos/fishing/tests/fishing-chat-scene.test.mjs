import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';
import {FISHING_RENDER_SEATS} from '../lib/fishing-world.ts';
const ownRing=h=>h.world.yacht.children.find(o=>o.name==='Own angler ground ring');
test('one yellow own ring uses actual yacht deck, retains depth and has no direction triangle',async t=>{
 const h=await fishingSceneHarness({participants:[participant(),{...participant(),id:'other',name:'好友',slot:2}],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());
 const ring=ownRing(h);assert.ok(ring);assert.equal(ring.parent,h.world.yacht);assert.equal(ring.visible,true);assert.equal(ring.position.y,FISHING_RENDER_SEATS[0].y+.018);assert.equal(ring.children.length,3);
 assert.equal(ring.getObjectByName('Own ring fill').material.opacity,.15);assert.equal(ring.getObjectByName('Own ring yellow').material.color.getHexString(),'ffd84d');
 for(const m of ring.children){assert.equal(m.material.depthTest,true);assert.equal(m.material.depthWrite,false);assert.ok(!/triangle|chevron/i.test(m.name));}
 const initial=ring.getWorldPosition(new THREE.Vector3());h.frames(20);assert.notDeepEqual(ring.getWorldPosition(new THREE.Vector3()).toArray(),initial.toArray());
 const startedAt=h.now();h.render({participants:[{...participant(),slot:2,movement:{fromSlot:0,startedAt,endsAt:startedAt+700}}]});h.step(350);
 assert.equal(ring.position.y,FISHING_RENDER_SEATS[0].y+.018,'ground ring does not rise with body hop');assert.ok(h.world.yacht.getObjectByName('Angler 小浪').position.y>ring.position.y+.5);
 h.render({ownId:null});h.step();assert.equal(ring.visible,false);h.render({ownId:'other'});h.step();assert.equal(ring.visible,false,'camera or missing identity cannot create a personal ring');
});
test('ring anchors upper deck and swaps identity or avatar without leaving duplicate rings',async t=>{
 const h=await fishingSceneHarness({participants:[{...participant(),slot:10}],ownId:'self'});t.after(()=>h.dispose());const ring=ownRing(h);assert.ok(ring);assert.equal(ring.position.y,FISHING_RENDER_SEATS[10].y+.018);
 h.render({participants:[]});h.step();assert.equal(ring.visible,false);assert.equal(h.world.yacht.children.filter(o=>o.name==='Own angler ground ring').length,1);
});
test('chat is literal DOM text, emoji temporarily replaces it, and both expire from server time',async t=>{
 const now=1800000000000,person={...participant(),chat:{id:'msg',text:'<img src=x onerror=alert(1)>',createdAt:now,expiresAt:now+8000},emote:{id:'emoji',emoji:'🐟',createdAt:now,expiresAt:now+4000}};
 const h=await fishingSceneHarness({participants:[person],ownId:'self'});t.after(()=>h.dispose());const label=h.labels.children[0],bubble=label.children.find(e=>e.className.includes('yacht-person-speech'));assert.ok(bubble);assert.equal(bubble.textContent,'🐟');
 h.step(4000);assert.equal(bubble.textContent,person.chat.text);assert.equal(bubble.children.length,0,'HTML-looking messages must never become elements');h.step(4000);assert.equal(bubble.style.display,'none');assert.equal(bubble.textContent,'');
});
test('unloaded avatar never gets a ground marker, and marker size has a bounded screen floor',async t=>{
 const h=await fishingSceneHarness({participants:[participant()],ownId:'self',qaAvatarLoaded:false});t.after(()=>h.dispose());assert.equal(ownRing(h).visible,false);
 const {fishingOwnMarkerRadius,fitFishingOwnMarkerRadius}=await import('../lib/fishing-own-marker.ts');assert.ok(fishingOwnMarkerRadius(.1)<fishingOwnMarkerRadius(.7));assert.equal(fitFishingOwnMarkerRadius(.6,20),.74);assert.equal(fitFishingOwnMarkerRadius(.6,50),.6);
});
test('cross-deck hops hide the marker until there is an actual destination deck beneath it',async t=>{
 const h=await fishingSceneHarness({participants:[participant()],ownId:'self',reducedMotion:false});t.after(()=>h.dispose());const startedAt=h.now();h.render({participants:[{...participant(),slot:10,movement:{fromSlot:0,startedAt,endsAt:startedAt+700}}]});h.step(350);assert.equal(ownRing(h).visible,false);h.step(350);assert.equal(ownRing(h).visible,true);assert.equal(ownRing(h).position.y,FISHING_RENDER_SEATS[10].y+.018);
});

const translated=element=>{
 const [,x,y]=element.style.transform.match(/^translate\(([-\d.]+)px,([-\d.]+)px\)/);
 return {x:Number(x),y:Number(y)};
};
function assertSpeechSafe(h,label,expected){
 const speech=label.children[0],anchor=translated(label),offset=translated(speech);
 assert.equal(label.style.visibility,'visible','the own speech parent must survive close-up nameplate culling');
 assert.equal(speech.style.visibility,'visible','own speech must be laid out in the close-up safe region');
 assert.equal(speech.textContent,expected,'projection never rewrites or truncates chat');
 const emote=speech.className.includes('is-emote');
 const width=speech.offsetWidth||(emote?66:Math.min(184,[...expected].length*12+24));
 const height=speech.offsetHeight||(emote?58:Math.ceil([...expected].length*12/160)*17+16);
 assert.ok(anchor.x+offset.x-width/2>=12,'speech clears the left edge');
 assert.ok(anchor.x+offset.x+width/2<=h.host.clientWidth-12,'speech clears the right edge');
 assert.ok(anchor.y-37+offset.y-height>=140,'speech clears the top HUD');
 assert.ok(anchor.y-37+offset.y<=h.host.clientHeight-200,'speech clears lower controls');
}
test('own chat remains visible in catch close-up and at minimum zoom without moving the camera',async t=>{
 for(const cameraMode of ['overview','deck']){
  const person=participant('holding'),h=await fishingSceneHarness({participants:[person],ownId:'self',cameraMode});t.after(()=>h.dispose());
  const cameraBefore=h.camera.position.clone(),lookBefore=h.camera.quaternion.clone();
  const text='看看我的小鱼 🐟';
  h.render({participants:[{...person,chat:{id:'closeup',text,createdAt:h.now(),expiresAt:h.now()+8000}}]});h.step();
  assertSpeechSafe(h,h.labels.children[0],text);
  assert.ok(h.camera.position.distanceTo(cameraBefore)<1e-8,'speech cannot zoom out the camera');
  assert.ok(h.camera.quaternion.angleTo(lookBefore)<1e-7,'speech cannot redirect the scene');
  h.event('wheel',{deltaY:-1000,deltaMode:0});h.step();assertSpeechSafe(h,h.labels.children[0],text);
 }
});
test('close-up speech uses measured multiline height, honors expiry and leaves peers culled',async t=>{
 const text='海'.repeat(80),now=1800000000000;
 const self={...participant('holding'),chat:{id:'long',text,createdAt:now,expiresAt:now+8000}};
 const peer={...participant('holding'),id:'peer',slot:1,name:'好友',chat:{id:'peer-msg',text:'同船消息',createdAt:now,expiresAt:now+8000}};
 const h=await fishingSceneHarness({participants:[self,peer],ownId:'self',cameraMode:'overview'});t.after(()=>h.dispose());
 const label=h.labels.children[0];label.offsetHeight=176;label.children[0].offsetTop=4;label.children[0].offsetWidth=184;label.children[0].offsetHeight=135;
 h.event('wheel',{deltaY:-1000,deltaMode:0});h.step();assertSpeechSafe(h,label,text);
 assert.equal(h.labels.children[1].style.visibility,'hidden','off-screen peer nameplates retain their original culling');
 assert.equal(h.labels.children[1].children[0].style.visibility,'hidden');
 const ownPosition=translated(label);
 h.render({ownId:'peer'});h.step();
 assert.notDeepEqual(translated(label),ownPosition,'clamp follows current identity instead of persisting on a former owner');
 h.step(8000);assert.equal(label.children[0].style.display,'none');assert.equal(label.children[0].textContent,'');
});


test('own emoji keeps its full padded bubble in catch close-up at every zoom and restores live speech',async t=>{
 for(const cameraMode of ['overview','deck']){
  const person=participant('holding'),h=await fishingSceneHarness({participants:[person],ownId:'self',cameraMode});t.after(()=>h.dispose());
  const label=h.labels.children[0],bubble=label.children[0],name=label.children[1].textContent;
  const now=h.now(),text='我的鱼到了';
  h.render({participants:[{...person,chat:{id:'text',text,createdAt:now,expiresAt:now+8000},emote:{id:'wave',emoji:'👏',createdAt:now,expiresAt:now+4000}}]});h.step();
  assert.equal(bubble.className,'yacht-person-speech is-emote');assertSpeechSafe(h,label,'👏');
  for(const deltaY of [-1000,2000,-1000]){h.event('wheel',{deltaY,deltaMode:0});h.step();assertSpeechSafe(h,label,'👏');assert.doesNotMatch(bubble.style.transform,/scale/);}
  assert.equal(label.children[1].textContent,name);
  h.step(4000);assert.equal(label.children[0],bubble,'one shared bubble node survives expression expiry');assert.equal(bubble.className,'yacht-person-speech');assertSpeechSafe(h,label,text);
  h.step(4000);assert.equal(bubble.style.display,'none');assert.equal(bubble.style.visibility,'hidden');
 }
});

test('normal-view own and peer emoji share speech DOM while ambient NPCs never echo human expression',async t=>{
 const now=1800000000000,emote={id:'emoji',emoji:'😊',createdAt:now,expiresAt:now+4000};
 const people=[{...participant(),emote},{...participant(),id:'other',name:'朋友',slot:2,emote}];
 const {projectFishingAmbientParticipants}=await import('../lib/fishing-ambient.ts');
 const ambient=projectFishingAmbientParticipants(now).map(p=>({...p,emote,chat:{id:'bad',text:'not human',expiresAt:now+8000}}));
 const h=await fishingSceneHarness({participants:people,ambientParticipants:ambient,ownId:'self',cameraMode:'overview'});t.after(()=>h.dispose());
 for(const label of h.labels.children.slice(0,2)){assert.equal(label.children[0].className,'yacht-person-speech is-emote');assert.equal(label.children[0].textContent,'😊');assert.equal(label.children[0].style.visibility,'visible');assert.equal(label.children.length,3);}
 for(const label of h.labels.children.slice(2)){assert.equal(label.children[0].textContent,'');assert.equal(label.children[0].style.display,'none');assert.equal(label.children[0].style.visibility,'hidden');}
 h.step(4000);for(const label of h.labels.children){assert.equal(label.children[0].textContent,'');assert.equal(label.children[0].style.display,'none');}
});


test('measured emoji bubble wins over fallback size and hidden peers cannot leak through close-up culling',async t=>{
 const now=1800000000000,emote={id:'live',emoji:'🎉',createdAt:now+5000,expiresAt:now+9000};
 const self={...participant('holding'),emote},peer={...participant('holding'),id:'peer',slot:1,name:'朋友',emote};
 const h=await fishingSceneHarness({participants:[self,peer],ownId:'self',cameraMode:'overview',serverOffsetMs:5000});t.after(()=>h.dispose());
 const label=h.labels.children[0],bubble=label.children[0];label.offsetHeight=108;bubble.offsetTop=5;bubble.offsetWidth=78;bubble.offsetHeight=66;
 h.event('wheel',{deltaY:-1000,deltaMode:0});h.step();assertSpeechSafe(h,label,'🎉');
 const peerLabel=h.labels.children[1];assert.equal(peerLabel.style.visibility,'hidden');assert.equal(peerLabel.children[0].style.visibility,'hidden');
 h.step(emote.expiresAt-(h.now()+5000)-1);assert.equal(bubble.textContent,'🎉','server offset does not prematurely expire a four-second emote');
 h.step(34);assert.equal(bubble.textContent,'');assert.equal(bubble.style.display,'none');assert.equal(bubble.style.visibility,'hidden');
});
