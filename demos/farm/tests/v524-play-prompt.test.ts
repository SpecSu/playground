import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {createEstate,commandEstate,currentProfile,type Estate,type EstateSnapshot} from '../src/v5/estate.ts';
import {initialOpening} from '../src/v5/opening.ts';
import {LANDMARKS} from '../src/v5/journey.ts';
import {EstateWorld} from '../src/v5/EstateWorld.ts';
import {makeSheep} from '../src/sheep.ts';
import {legacyAnimal} from '../src/v5/estate-scene.ts';
const T=1_800_000_000_000;
let sequence=0;
function ready(){let s=createEstate('prompt-owner',T);const p=currentProfile(s);p.tutorial='done';p.opening=initialOpening('done');p.threat=null;p.guardian='dog';s=commandEstate(s,{id:'enter',type:'enter'},T).state;return s;}
function command(s:Estate,type:string,extra:Record<string,unknown>={},at=currentProfile(s).lastPulseAt){const r=commandEstate(s,{id:`prompt-${++sequence}`,type,session:currentProfile(s).session,...extra},at);assert.equal(r.accepted,true,r.message);return r.state;}
function pulse(s:Estate){return command(s,'pulse',{},currentProfile(s).lastPulseAt+1000);}
async function module(){const result=await import('../src/v5/play-prompt.ts').catch(()=>null);assert.ok(result,'playPrompt must provide a short, state-driven action and settled feedback');return result;}
test('the first care prompt names one actual unfed animal and does not change the save',async()=>{
 const {playPrompt}=await module();const p=currentProfile(ready()),before=structuredClone(p),prompt=playPrompt(p,T);
 assert.equal(prompt.title,'给皮皮喂奶');assert.equal(prompt.progress,'0/3');assert.equal(prompt.label,'去喂奶');assert.deepEqual(prompt.action,{kind:'inspect',target:'pipi'});assert.equal(prompt.feedback,null);assert.deepEqual(p,before);
});
test('real feeding exposes walking then three-second care without a button that reopens the card',async()=>{
 const {playPrompt}=await module();let s=command(ready(),'feed',{target:'pipi',food:'milk'}),p=currentProfile(s),prompt=playPrompt(p,p.lastPulseAt);
 assert.equal(p.job?.phase,'walk');assert.equal(prompt.title,'正在走向皮皮');assert.equal(prompt.progress,'0/3秒');assert.equal(prompt.action,null);assert.equal(prompt.feedback,null);
 for(let i=0;i<20&&currentProfile(s).job?.phase==='walk';i++)s=pulse(s);
 p=currentProfile(s);assert.equal(p.job?.phase,'act');prompt=playPrompt(p,p.lastPulseAt);assert.equal(prompt.title,'皮皮正在喝奶');assert.match(prompt.progress,/^[012]\/3秒$/);assert.equal(prompt.action,null);assert.equal(prompt.feedback,null);assert.equal(p.milestones.includes('fed-pipi'),false);
 s=pulse(s);p=currentProfile(s);assert.match(playPrompt(p,p.lastPulseAt).progress,/^[12]\/3秒$/);
 for(let i=0;i<5&&currentProfile(s).job;i++)s=pulse(s);
 p=currentProfile(s);assert.ok(p.milestones.includes('fed-pipi'));assert.equal(p.inventory.hand,2);prompt=playPrompt(p,p.lastPulseAt);assert.equal(prompt.feedback,'皮皮吃饱啦');assert.equal(prompt.progress,'1/3');assert.equal(prompt.action?.kind,'inspect');assert.notEqual(prompt.action?.kind==='inspect'&&prompt.action.target,'pipi');
});
test('cancelled and rejected care never claims that the animal ate',async()=>{
 const {playPrompt}=await module();let s=command(ready(),'feed',{target:'pipi',food:'milk'});s=command(s,'steer',{direction:{x:0,z:0}});let p=currentProfile(s);assert.equal(p.job,null);assert.equal(playPrompt(p,p.lastPulseAt).feedback,null);assert.equal(p.inventory.hand,3);
 p.animals[0].life.hunger=100;const r=commandEstate(s,{id:'satiated-care',type:'feed',target:'pipi',food:'milk',session:p.session},p.lastPulseAt);assert.equal(r.accepted,false);p=currentProfile(r.state);assert.equal(playPrompt(p,p.lastPulseAt).feedback,null);assert.notDeepEqual(playPrompt(p,p.lastPulseAt).action,{kind:'inspect',target:'pipi'});
});
test('only a current settled eat visual produces the five-second completion cue',async()=>{
 const {playPrompt}=await module();const p=currentProfile(ready());p.lastVisual={id:'settled',action:'eat',target:'pipi',at:T};
 assert.equal(playPrompt(p,T+4999).feedback,'皮皮喝到奶啦');p.animals[0].life.hunger=85;assert.equal(playPrompt(p,T+4999).feedback,'皮皮吃饱啦');assert.equal(playPrompt(p,T+5000).feedback,null);assert.equal(playPrompt(p,T-1).feedback,null);
 p.lastVisual.action='love';assert.equal(playPrompt(p,T).feedback,null);p.lastVisual.action='eat';p.lastVisual.target='unknown';assert.equal(playPrompt(p,T).feedback,null);
});
test('jobs for supplies, surveying and delivery give progress without another task CTA',async()=>{
 const {playPrompt}=await module();let s=ready();currentProfile(s).inventory.hand=0;assert.deepEqual(playPrompt(currentProfile(s),T).action,{kind:'refill'});
 s=command(s,'refill');let p=currentProfile(s);assert.equal(playPrompt(p,T).action,null);assert.match(playPrompt(p,T).title,/工作台|补充/);
 s=ready();p=currentProfile(s);p.position={x:11,z:4};s=command(s,'survey');p=currentProfile(s);assert.equal(playPrompt(p,T).title,'正在勘察新土地');assert.equal(playPrompt(p,T).progress,'0/5秒');assert.equal(playPrompt(p,T).action,null);
 p.job={id:'delivery',type:'delivery',progress:0,phase:'out',to:{x:4,z:4},carried:3};assert.match(playPrompt(p,T).title,/配送/);assert.equal(playPrompt(p,T).action,null);
});
test('later goals retain real actions while removing compressed prices and technical detail',async()=>{
 const {playPrompt}=await module();const p=currentProfile(ready());p.milestones.push('first-meal','walk-home');p.journey={discovered:LANDMARKS.map(l=>l.id)};
 const prompt=playPrompt(p,T);assert.equal(prompt.title,'给小家添点东西');assert.equal(prompt.label,'建东西');assert.equal(prompt.progress,'');assert.deepEqual(prompt.action,{kind:'development'});assert.doesNotMatch(Object.values(prompt).join(' '),/台12|区24|厂20/);
});
test('the scene marks the current care animal and removes the hint once care is underway',()=>{
 const p=currentProfile(ready());type CueWorld={data:EstateSnapshot;routeGroup:THREE.Group;effectGroup:THREE.Group;selected:string;drawRoutes:()=>void};
 const world=Object.create(EstateWorld.prototype) as CueWorld;Object.assign(world,{data:{profile:p,now:T},routeGroup:new THREE.Group(),effectGroup:new THREE.Group(),selected:''});world.drawRoutes();
 const marker=world.effectGroup.getObjectByName('next-care-target');assert.ok(marker,'the next animal needs a visible light circle');assert.equal(marker.userData.targetId,'pipi');assert.equal(marker.userData.pickThrough,true);
 p.job={id:'feed',type:'feed',target:'pipi',food:'milk',progress:0,phase:'walk',to:p.animals[0].position};world.drawRoutes();assert.equal(world.effectGroup.getObjectByName('next-care-target'),undefined);
});
test('the care bubble yields to an animal response and the marker follows its rendered position',()=>{
 const p=currentProfile(ready()),a=p.animals[0],document=new Window().document,body=makeSheep(legacyAnimal(a));
 const visual={...body,label:document.createElement('button'),bubble:document.createElement('span'),name:document.createElement('strong'),memory:document.createElement('small')};
 type CueWorld={data:EstateSnapshot;effectGroup:THREE.Group;drawRoutes:()=>void;updateSheep:(animal:typeof a,t:number,now:number,dt:number)=>void};
 const world=Object.create(EstateWorld.prototype) as CueWorld;Object.assign(world,{data:{profile:p,now:T},routeGroup:new THREE.Group(),effectGroup:new THREE.Group(),selected:'',enteredAt:0,reduced:false,sheep:new Map([[a.id,visual]]),animalMovers:new Map([[a.id,{root:body.root,distance:0}]]),moveVisual:()=>0,place:()=>{}});
 world.drawRoutes();body.root.position.set(2.2,0,3.3);world.updateSheep(a,1,T,.016);assert.equal(visual.bubble.textContent,'喂奶');assert.equal(visual.bubble.hidden,false);
 const marker=world.effectGroup.getObjectByName('next-care-target')!;assert.equal(marker.position.x,2.2);assert.equal(marker.position.z,3.3);
 p.lastVisual={id:'response',action:'love',target:a.id,at:T};world.updateSheep(a,1,T+500,.016);assert.equal(visual.bubble.textContent,'好耶，一起玩！');
 p.job={id:'feed',type:'feed',target:a.id,food:'milk',progress:1000,phase:'act',to:a.position};p.lastVisual=null;world.drawRoutes();world.updateSheep(a,1,T+1000,.016);assert.equal(visual.bubble.hidden,true);
});
