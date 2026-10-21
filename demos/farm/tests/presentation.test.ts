import {test} from 'node:test';import assert from 'node:assert/strict';
import {FarmWorld} from '../src/world.ts';import {createFarm,snapshot} from '../src/model.ts';
import {responseAt,sheepAnimationTime} from '../src/navigation.ts';
import {makeSheep} from '../src/sheep.ts';
import {persistenceReducer,initialPersistence} from '../src/persistence.ts';

test('changing target or motion preference with the same snapshot cannot rewind server time',()=>{
 const data=snapshot(createFarm('a',Date.now()-5000),Date.now()-5000);
 const world=Object.create(FarmWorld.prototype) as FarmWorld;
 Object.assign(world,{data,offset:12345,env:{stage:{visible:false}},lastEvent:'',cameraMode:'overview'});
 world.set(data,undefined,'momo',false);assert.equal(Reflect.get(world,'offset'),12345);
 world.set(data,undefined,'pipi',true);assert.equal(Reflect.get(world,'offset'),12345);
});
test('shy micro response has a moving clock during the full pre-action delay',()=>{
 const r=responseAt({id:'test',at:100000,kind:'action',action:'dance',reactions:[{animalId:'momo',action:'dance',delayMs:1600,distance:2.5,style:'tiny',micro:'ear',progressed:true,source:'action',text:'watching'}]},'momo',100100)!;
 assert.equal(r.micro,true);assert.equal(sheepAnimationTime(r,0),.1);
});
test('a returning GET cannot clear an unresolved failed save or hide its retry state',()=>{
 let s=persistenceReducer(initialPersistence,{type:'submit',command:{id:'command-1',type:'act'}});
 s=persistenceReducer(s,{type:'failed',message:'Connection lost'});s=persistenceReducer(s,{type:'readOK'});
 assert.equal(s.commandError,'Connection lost');assert.ok(s.pending);assert.equal(s.busy,false);
 s=persistenceReducer(s,{type:'saved'});assert.equal(s.commandError,'');assert.equal(s.pending,null);
});
test('restoring plain appearance returns to ordinary wool after choosing away the preview',()=>{
 const a=createFarm('a',100000).animals[0];a.growthEligible=true;a.appearance='plain';a.growthChoiceMade=true;
 const sheep=makeSheep(a);sheep.update(a,1,'dance',1,0,false,false,false);
 const stars=sheep.root.getObjectByName('growth-stars');assert.ok(stars);assert.equal(stars.visible,false);
});

test('late player success cannot conceal guardian load failure',async()=>{
 const {assetStatusText}=await import('../src/asset-status.ts');
 assert.match(assetStatusText('loading','error'),/奶蛙.*失败/);
 assert.match(assetStatusText('ready','error'),/奶蛙.*失败/);
 assert.match(assetStatusText('error','ready'),/分身.*失败/);
});
