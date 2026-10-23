import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {EstateWorld} from '../src/v5/EstateWorld.ts';
import {createEstate,estateSnapshot,type EstateAnimal} from '../src/v5/estate.ts';
import {makeSheep} from '../src/sheep.ts';
import {legacyAnimal} from '../src/v5/estate-scene.ts';
const T=1_800_000_000_000;
test('a completed milk receipt gives feedback without a second eating timeline or grass in the lamb mouth',()=>{
 const data=estateSnapshot(createEstate('feeding-feedback',T),T),p=data.profile,a=p.animals[0];p.threat=null;p.tutorial='done';p.job=null;p.lastVisual={id:'milk-receipt',action:'eat',target:a.id,at:T};
 const document=new Window().document,body=makeSheep(legacyAnimal(a)),visual={...body,label:document.createElement('button'),bubble:document.createElement('span'),name:document.createElement('strong'),memory:document.createElement('small')};
 const world=Object.create(EstateWorld.prototype) as {updateSheep:(animal:EstateAnimal,t:number,now:number,dt:number)=>void};
 Object.assign(world,{data,selected:'',enteredAt:0,reduced:false,sheep:new Map([[a.id,visual]]),animalMovers:new Map([[a.id,{root:body.root,distance:0}]]),routeGroup:new THREE.Group(),moveVisual:()=>0,place:()=>{}});
 for(const after of [500,1500,3000,6000]){world.updateSheep(a,after/1000,T+after,.016);assert.equal(body.root.getObjectByName('feeding-grass')!.visible,false,`no second feeding at ${after}`);}
 assert.equal(p.lastVisual.id,'milk-receipt');assert.equal(p.lastVisual.action,'eat');
});
