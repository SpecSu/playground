import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLayout} from '../src/v5/layout.ts';
import {WorkshopScene} from '../src/v5/world-workshop.ts';
const pattern={motif:'star' as const,color:'#abcdef',scale:1,rotation:0,crop:{x:0,y:0,width:1,height:1}};
const cape={id:'cape',recipe:'cape' as const,assetId:'asset',assetVersion:1,destroyed:false};
const assets=[{id:'asset',version:1,pattern:{...pattern,motif:'star' as const}}];
const state=(items=[cape],equipment:{cape?:string}={cape:'cape'},placements:Record<string,{x:number;z:number}>={})=>({items,assets,equipment,placements});
test('real Three attachments preserve guardian and transform; draft cancel restores persisted cape',()=>{
 const scene=new THREE.Group(),guardian=new THREE.Group(),actor=new THREE.Group();guardian.add(actor);guardian.position.set(3,0,2);scene.add(guardian);
 const view=new WorkshopScene(scene);view.sync(state(),createLayout(),guardian,'dog');
 const fitted=guardian.getObjectByName('workshop-cape');assert.ok(fitted);assert.equal(actor.parent,guardian);assert.equal(guardian.position.x,3);
 view.preview({recipe:'cape',pattern:{...pattern,color:'#ff0000',scale:1.5,rotation:45,crop:{x:.2,y:.1,width:.5,height:.5}}});
 assert.equal(guardian.getObjectByName('workshop-cape')!.userData.itemId,'draft');
 const mark=guardian.getObjectByName('workshop-pattern')!;assert.equal(mark.userData.rotationDegrees,45);assert.equal(mark.userData.pattern.crop.width,.5);
 view.preview(null);assert.equal(guardian.getObjectByName('workshop-cape')!.userData.itemId,'cape');
 view.sync(state([cape],{}),createLayout(),guardian,'dog');assert.equal(guardian.getObjectByName('workshop-cape'),undefined);assert.equal(actor.parent,guardian);
});
test('world items validate saved ground position, update visual version, dispose resources and support all guardians',()=>{
 const scene=new THREE.Group(),guardian=new THREE.Group(),view=new WorkshopScene(scene),layout=createLayout();
 for(const kind of ['dog','cat','frog'] as const){view.sync(state(),layout,guardian,kind);assert.equal(guardian.getObjectByName('workshop-cape')!.userData.guardianKind,kind);}
 const banner={...cape,id:'flag',recipe:'banner' as const};view.sync({items:[banner],assets,equipment:{},placements:{flag:{x:5,z:5}}},layout,guardian,'dog');
 const flag=scene.getObjectByName('workshop-banner')!;assert.ok(flag);assert.equal(flag.position.x,-.5);
 let disposed=false;(flag.children[0] as THREE.Mesh).geometry.addEventListener('dispose',()=>{disposed=true;});
 view.sync({items:[banner],assets,equipment:{},placements:{flag:{x:1,z:1}}},layout,guardian,'dog');assert.equal(scene.getObjectByName('workshop-banner'),undefined);assert.equal(disposed,true);
 view.dispose();assert.equal(guardian.getObjectByName('workshop-cape'),undefined);
});
test('ground draft preview cancels without saving and actual shield entity expires at six seconds',()=>{
 const scene=new THREE.Group(),guardian=new THREE.Group(),view=new WorkshopScene(scene),layout=createLayout(),saved=state([cape],{}),before=JSON.stringify(saved);view.sync(saved,layout,guardian,'dog');
 view.preview({recipe:'signpost',pattern},{x:5,z:5});assert.ok(scene.getObjectByName('workshop-signpost'));assert.equal(JSON.stringify(saved),before);view.preview(null);assert.equal(scene.getObjectByName('workshop-signpost'),undefined);
 view.syncShield(undefined,layout,0,{x:5,z:4});assert.ok(scene.getObjectByName('shield-anchor'));
 const shield={kind:'folding-shield' as const,anchor:{x:5,z:4},status:'active' as const,startedAt:2,until:8,remaining:6,reason:'',waitingActorIds:[]};view.syncShield(shield,layout,2);assert.ok(scene.getObjectByName('shield-barrier'));view.syncShield(shield,layout,5);assert.equal((scene.getObjectByName('shield-barrier') as THREE.Mesh).userData.remaining,3);assert.ok(scene.getObjectByName('shield-duration'));view.syncShield(shield,layout,8);assert.equal(scene.getObjectByName('shield-barrier'),undefined);
});
test('asset-version replacement changes the real clipped geometry and retains actor identity',()=>{
 const scene=new THREE.Group(),guardian=new THREE.Group(),actor=new THREE.Group(),view=new WorkshopScene(scene),layout=createLayout();guardian.add(actor);view.sync(state(),layout,guardian,'cat');const first=guardian.getObjectByName('workshop-cape');
 view.sync(state(),layout,guardian,'cat');assert.equal(guardian.getObjectByName('workshop-cape'),first);
 const changed={items:[{...cape,assetVersion:2}],assets:[...assets,{id:'asset',version:2,pattern:{...pattern,motif:'leaf' as const,rotation:35,scale:2,crop:{x:.2,y:.2,width:.5,height:.5}}}],equipment:{cape:'cape'},placements:{}};
 view.sync(changed,layout,guardian,'cat');const next=guardian.getObjectByName('workshop-cape');assert.notEqual(next,first);assert.equal(actor.parent,guardian);const mark=guardian.getObjectByName('workshop-pattern') as THREE.Mesh;const positions=mark.geometry.attributes.position;assert.ok(positions.count>0);for(let i=0;i<positions.count;i++){assert.ok(Math.abs(positions.getX(i))<=.30001);assert.ok(Math.abs(positions.getY(i))<=.48401);}
});
