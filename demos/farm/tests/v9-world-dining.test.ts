import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {EstateWorld} from '../src/v5/EstateWorld.ts';
import {createEstate,estateSnapshot,type EstateAnimal} from '../src/v5/estate.ts';
import {makeSheep} from '../src/sheep.ts';
import {legacyAnimal} from '../src/v5/estate-scene.ts';
const T=1_800_000_000_000;
function setup(){
 const data=estateSnapshot(createEstate('dining-render',T),T),p=data.profile,a=p.animals[0];p.threat=null;p.tutorial='done';p.job=null;p.lastPulseAt=T;
 const document=new Window().document,body=makeSheep(legacyAnimal(a)),visual={...body,label:document.createElement('button'),bubble:document.createElement('span'),name:document.createElement('strong'),memory:document.createElement('small')};
 const world=Object.create(EstateWorld.prototype) as {updateSheep:(animal:EstateAnimal,t:number,now:number,dt:number)=>void};
 Object.assign(world,{data,selected:'',enteredAt:0,reduced:false,sheep:new Map([[a.id,visual]]),animalMovers:new Map([[a.id,{root:body.root,distance:0}]]),routeGroup:new THREE.Group(),moveVisual:()=>0,place:()=>{}});
 a.dining={troughId:p.layout.buildings.find(b=>b.kind==='trough')!.id,to:{...a.position},phase:'eat',elapsedMs:1000};return{world,a,p,visual,body};
}
test('autonomous dining displays feeding motion only during authoritative eating phase',()=>{
 const {world,a,visual,body}=setup();a.life.stage='adult';world.updateSheep(a,1,T+100,.016);
 assert.equal(body.root.getObjectByName('feeding-grass')!.visible,true);assert.match(visual.memory.textContent,/自助吃饭/);
 a.dining!.phase='walk';world.updateSheep(a,2,T+200,.016);assert.equal(body.root.getObjectByName('feeding-grass')!.visible,false);assert.match(visual.memory.textContent,/去食槽/);
});
test('baby autonomous meal never renders grass and a stale eating snapshot stops its action',()=>{
 const {world,a,body,visual}=setup();a.life.stage='baby';world.updateSheep(a,1,T+100,.016);assert.equal(body.root.getObjectByName('feeding-grass')!.visible,false);assert.match(visual.memory.textContent,/自助吃饭/);
 a.life.stage='adult';world.updateSheep(a,3,T+3000,.016);assert.equal(body.root.getObjectByName('feeding-grass')!.visible,false);assert.doesNotMatch(visual.memory.textContent,/自助吃饭/);
});
