import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {signedInFarmServerResources} from '../server/signed-in-farm-resources.ts';
import type {ApprovedFarmResourceContext} from '../src/minimal/animal-resource-context.ts';
import {projectCanonicalState} from '../src/minimal/canonical-timeline.ts';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import {createMinimalState,minimalCommand,playerWalkRoute,advanceMinimalState,canPlaceEgg,validateMinimalSave,isWalkableTile,type MinimalState,type Point} from '../src/minimal/model.ts';
import {staticObstacleSegmentClear} from '../src/minimal/creative-obstacles.ts';
import {isSafeAnimalArrival,animalInteractionRadius} from '../src/minimal/interaction-motion.ts';
import {CREATIVE_CATALOG,type CreativeAsset} from '../src/minimal/creative-assets.ts';
import {CreativeScene} from '../src/minimal/creative-scene.ts';
import type {CanonicalFarm,MinimalRepository,MinimalTransaction,MinimalTable,MinimalRows} from '../src/minimal/cloud-contract.ts';
const NOW=1793000000000;
class Repository implements MinimalRepository{
 rows=new Map<string,unknown>();
 async transaction<T>(work:(tx:MinimalTransaction)=>Promise<T>):Promise<T>{const next=structuredClone(this.rows),tx:MinimalTransaction={get:async<K extends MinimalTable>(table:K,key:string)=>(structuredClone(next.get(`${table}:${key}`))??null) as MinimalRows[K]|null,put:async(table,key,value)=>{next.set(`${table}:${key}`,structuredClone(value));},listOpenOffers:async()=>[]};const result=await work(tx);this.rows=next;return result;}
 async change(fn:(f:CanonicalFarm)=>void){await this.transaction(async tx=>{const farm=(await tx.get('farms','a'))!;fn(farm);await tx.put('farms','a',farm);});}
}
const prop=(id='tree',at:Point={x:2,z:2}):CreativeAsset=>({id,kind:'prop',templateId:'wish-tree',name:'树',prompt:'固定样例',createdAt:NOW-1000,jobId:`job-${id}`,origin:'mock',location:'ground',position:at});
async function setup(assets:CreativeAsset[]=[prop()],animalResources?:ApprovedFarmResourceContext){const repo=new Repository();let req=0,now=NOW;const authority=new MinimalAuthority(repo,{clock:()=>now,newId:()=>`id_${++req}`,fingerprint:async v=>v,animalResources});await authority.bootstrap('a',{requestId:'new',mode:'new'});await repo.change(f=>{f.state.welcomeClaimed=true;f.state.hatchedCount=1;f.state.coins=100;f.state.player={x:1,z:2};f.creative={version:1,jobs:[],assets};});const send=async(route:'creative'|'command',command:unknown)=>authority[route]('a',{requestId:`req_${++req}`,expectedRevision:(await authority.get('a')).farm!.revision,command});return {repo,authority,send,advance:(ms:number)=>{now+=ms;}};}
const obstacles=(s:MinimalState)=>(s as MinimalState&{staticObstacles?:Point[]}).staticObstacles;

test('canonical read derives bounded obstacle coordinates without rewriting legacy stored state',async()=>{
 const h=await setup(),before=structuredClone(h.repo.rows),farm=(await h.authority.get('a')).farm!;assert.deepEqual(obstacles(farm.state),[{x:2,z:2}]);assert.deepEqual(h.repo.rows,before);assert.equal(canPlaceEgg(farm.state,{x:2,z:2}),false);
});
test('real pine triangles cannot intersect any accepted player route segment',async()=>{
 const h=await setup(),farm=(await h.authority.get('a')).farm!,route=playerWalkRoute(farm.state,{x:1,z:2},{x:3,z:2});assert.ok(route);assert.notDeepEqual(route,[{x:3,z:2}]);
 const loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEXTURE',loadTexture:async()=>new THREE.Texture()}));const template=CREATIVE_CATALOG.find(t=>t.id==='wish-tree')!;assert.equal(template.model.status,'ready');if(template.model.status!=='ready')return;
 const bytes=readFileSync(new URL(`../public${template.model.url}`,import.meta.url)),model=await loader.parseAsync(new Uint8Array(bytes).buffer,''),parent=new THREE.Group(),view=new CreativeScene(parent,CREATIVE_CATALOG,{loadModel:async()=>model,sizeForAsset:()=>1.45});
 try{view.update([{...prop(),position:{x:1,z:1}}]);for(let i=0;i<5;i++)await Promise.resolve();assert.equal(view.status('tree'),'ready');parent.updateMatrixWorld(true);let from=new THREE.Vector3(-1,.2,1);const oldRay=new THREE.Raycaster(from,new THREE.Vector3(1,0,0),0,4);assert.ok(oldRay.intersectObjects(parent.children,true).length>0,'real mesh intersects the old path');for(const p of route){const to=new THREE.Vector3((p.x-1.5)*2,.2,(p.z-1.5)*2),delta=to.clone().sub(from),ray=new THREE.Raycaster(from,delta.clone().normalize(),0,delta.length());assert.equal(ray.intersectObjects(parent.children,true).length,0);from=to;}}finally{view.dispose();}
});
test('shared domain rejects ordinary egg and arriving animal on canonical prop, pickup removes it',async()=>{
 const h=await setup(),s=(await h.authority.get('a')).farm!.state;s.eggs.push({id:'e',species:'sheep',source:'shop',location:'bag',sex:'female',size:'normal',boughtAt:NOW});assert.equal(minimalCommand(s,{type:'placeEgg',eggId:'e',at:{x:2,z:2}},NOW).accepted,false);
 const animal={id:'arrival',name:'羊',species:'sheep' as const,sex:'female' as const,size:'giant' as const,bornAt:NOW-200000,position:{x:3,z:3},activity:'idle' as const,activityUntil:NOW+10000,energy:80,bond:0};assert.equal(isSafeAnimalArrival(s,animal,NOW,{x:2,z:2},{free:()=>true,ground:()=>true}),false);
 const hatchState=structuredClone(s);hatchState.player={x:1,z:3};hatchState.eggs=[{id:'large',species:'cow',source:'shop',location:'ground',position:{x:2,z:3},sex:'female',size:'giant',boughtAt:NOW-20000,placedAt:NOW-20000,readyAt:NOW,growth:{version:1,scales:[2.1,2.15,2.2]}}];const hatch=minimalCommand(hatchState,{type:'hatch',eggId:'large'},NOW);assert.equal(hatch.accepted,true,hatch.message);const newborn=hatch.state.animals[0];assert.ok(staticObstacleSegmentClear(s,newborn.position,newborn.position,animalInteractionRadius(newborn,NOW)/2),'ordinary hatch finds a body-safe landing beside props');
 const picked=await h.send('creative',{type:'pickup',assetId:'tree'});assert.equal(picked.accepted,true);assert.equal(obstacles(picked.farm!.state),undefined);assert.equal(canPlaceEgg(picked.farm!.state,{x:2,z:2}),true);
});
test('new props may interrupt a future route but never move the current owner or seal a corridor',async()=>{
 const asset=prop();asset.location='bag';delete asset.position;const h=await setup([asset]);await h.repo.change(f=>{f.state.playerPath=[{x:3,z:2}];f.state.playerSpeed=.4;});const before=(await h.authority.get('a')).farm!.state.player;
 const placed=await h.send('creative',{type:'place',assetId:'tree',at:{x:2,z:2}});assert.equal(placed.accepted,true,placed.message);assert.deepEqual(placed.farm!.state.player,before);const advanced=advanceMinimalState(placed.farm!.state,NOW+100);assert.deepEqual(advanced.player,before);assert.deepEqual(advanced.playerPath,[]);
 const h2=await setup([asset]);await h2.repo.change(f=>{f.state.tiles=f.state.tiles.map(t=>({...t,owned:t.z===2&&t.x>=1&&t.x<=3||t.x<=1&&t.x>=0&&t.z<=1&&t.z>=0}));});assert.equal((await h2.send('creative',{type:'place',assetId:'tree',at:{x:2,z:2}})).accepted,false);
});
test('placing a prop over the current player or an adjacent animal body is rejected',async()=>{
 const asset=prop();asset.location='bag';delete asset.position;const h=await setup([asset]);assert.equal((await h.send('creative',{type:'place',assetId:'tree',at:{x:1,z:2}})).accepted,false);
 await h.repo.change(f=>{f.state.player={x:1,z:1};f.state.animals=[{id:'a',name:'羊',species:'sheep',sex:'female',size:'giant',bornAt:NOW-200000,position:{x:2.55,z:2},activity:'idle',activityUntil:NOW+10000,energy:80,bond:0}];});assert.equal((await h.send('creative',{type:'place',assetId:'tree',at:{x:2,z:2}})).accepted,false);
});
test('legacy overlap preserves the actor, permits an exit but forbids returning into the prop',async()=>{
 const h=await setup();await h.repo.change(f=>{f.state.player={x:2,z:2};});const s=(await h.authority.get('a')).farm!.state;assert.deepEqual(s.player,{x:2,z:2});assert.ok(playerWalkRoute(s,s.player,{x:1,z:2}));assert.equal(playerWalkRoute({...s,player:{x:1,z:2}},{x:1,z:2},{x:2,z:2}),null);assert.equal(validateMinimalSave(s),true);
});
for(const templateId of ['wish-tree','poop-pal'])test(`own custom egg can hatch as ${templateId} without ignoring another obstacle`,async()=>{
 const egg={...prop('egg'),kind:'custom-egg' as const,templateId,egg:{stage:'ready' as const,incubation:{requiredMs:15000,elapsedMs:15000,checkedAt:NOW}}},h=await setup([egg]);const result=await h.send('creative',{type:'hatch',assetId:'egg'});assert.equal(result.accepted,true,result.message);assert.equal(result.farm!.creative!.assets[0].id,'egg');assert.deepEqual(obstacles(result.farm!.state),templateId==='wish-tree'?[{x:2,z:2}]:undefined);
 const h2=await setup([egg,prop('other')]);assert.equal((await h2.send('creative',{type:'hatch',assetId:'egg'})).accepted,false);
});
test('import strips derived obstacles instead of trusting them or rejecting an otherwise valid snapshot',async()=>{
 const h=await setup([]),snapshot=Object.assign(createMinimalState(NOW),{staticObstacles:[{x:1,z:3}]}),before=structuredClone(snapshot);const result=await h.authority.bootstrap('b',{requestId:'import',mode:'import',legacySnapshot:snapshot});assert.equal(result.accepted,true,result.message);assert.equal(obstacles(result.farm!.state),undefined);assert.deepEqual(snapshot,before);assert.equal(isWalkableTile(result.farm!.state,{x:1,z:3}),true);
});
test('malformed derived obstacle coordinates do not become valid saves, absent old field remains valid',()=>{
 const s=createMinimalState(NOW);assert.equal(validateMinimalSave(s),true);for(const value of [[{x:2,z:2,assetId:'forged'}],[{x:2.1,z:2}],[{x:99,z:2}],Array(33).fill({x:2,z:2}),[{x:2,z:2},{x:2,z:2}],null])assert.equal(validateMinimalSave({...s,staticObstacles:value}),false);
});
test('legacy exit completes over repeated ticks at the closed tile boundary and cannot reenter',async()=>{
 const h=await setup();await h.repo.change(f=>{f.state.player={x:2,z:2};});let s=(await h.authority.get('a')).farm!.state;s.playerPath=playerWalkRoute(s,s.player,{x:3,z:2})!;s.playerSpeed=.5;for(let i=1;i<=12;i++)s=advanceMinimalState(s,NOW+i*250);assert.equal(s.player.x,3);assert.deepEqual(s.playerPath,[]);
 const s2=(await h.authority.get('a')).farm!.state;s2.player={x:2.49,z:2};s2.playerPath=[{x:2.7,z:2},{x:2.49,z:2}];s2.playerSpeed=.5;const stopped=advanceMinimalState(s2,NOW+2000);assert.deepEqual(stopped.player,s2.player,'invalid outward-and-back route is canceled, never integrated through prop');
});
test('custom creature hatch rejects a body-overlapping neighbor without consuming its same-ID egg',async()=>{
 const egg={...prop('egg'),kind:'custom-egg' as const,templateId:'poop-pal',egg:{stage:'ready' as const,incubation:{requiredMs:15000,elapsedMs:15000,checkedAt:NOW}}},h=await setup([egg]);await h.repo.change(f=>{f.state.animals=[{id:'a',name:'羊',species:'sheep',sex:'female',size:'giant',bornAt:NOW-200000,position:{x:2.51,z:2},activity:'idle',activityUntil:NOW+10000,energy:80,bond:0}];});const result=await h.send('creative',{type:'hatch',assetId:'egg'});assert.equal(result.accepted,false);assert.equal(result.farm!.creative!.assets[0].kind,'custom-egg');assert.equal(result.farm!.state.animals.length,1);
});
test('ordinary ground eggs count toward the owner escape route before placing a prop',async()=>{
 const asset=prop();asset.location='bag';delete asset.position;const h=await setup([asset]);await h.repo.change(f=>{f.state.player={x:3,z:3};f.state.eggs=[{id:'e',species:'sheep',source:'shop',location:'ground',position:{x:3,z:2},sex:'female',size:'normal',boughtAt:NOW-5000,placedAt:NOW-5000,readyAt:NOW+15000}];});const result=await h.send('creative',{type:'place',assetId:'tree',at:{x:2,z:3}});assert.equal(result.accepted,false);assert.match(result.message??'',/通路/);assert.deepEqual(result.farm!.state.player,{x:3,z:3});
});
test('formal resource dimensions are supplied to creative placement body clearance',async()=>{
 const asset=prop();asset.location='bag';delete asset.position;const resources=signedInFarmServerResources('https://fluffy-farm-companions.tangguozhou.chatgpt.site/api/minimal/farm','trusted-subject')!,h=await setup([asset],resources);await h.repo.change(f=>{f.state.player={x:1,z:1};f.state.animals=[{id:'a',name:'羊驼',species:'alpaca',sex:'female',size:'giant',bornAt:NOW-200000,position:{x:2.7,z:2},activity:'idle',activityUntil:NOW+10000,energy:80,bond:0}];});const result=await h.send('creative',{type:'place',assetId:'tree',at:{x:2,z:2}});assert.equal(result.accepted,false);assert.match(result.message??'',/伙伴太近/);
});
test('legacy ground creature and prop overlap keeps the original ground location during hydration',async()=>{
 const creature={...prop('legacy'),kind:'custom-creature' as const,templateId:'poop-pal',hatchedAt:NOW-1000},h=await setup([prop(),creature]),farm=(await h.authority.get('a')).farm!;assert.equal(farm.creative!.assets.find(a=>a.id==='legacy')!.location,'ground');assert.deepEqual(farm.state.animals.find(a=>a.id==='legacy')!.position,{x:2,z:2});
});
for(const kind of ['prop','custom-egg'] as const)test(`${kind} pickup settles the old obstacle layout before removing it`,async()=>{
 const asset={...prop(),kind,...(kind==='custom-egg'?{templateId:'poop-pal',egg:{stage:'ready' as const,incubation:{requiredMs:15000,elapsedMs:0,checkedAt:NOW}}}:{})},h=await setup([asset]);await h.repo.change(f=>{f.state.player={x:0,z:3};f.state.animals=[{id:'wander',name:'羊',species:'sheep',sex:'female',size:'normal',bornAt:NOW-200000,position:{x:1,z:2},activity:'idle',activityUntil:NOW+1000,energy:50,bond:0}];});const before=(await h.authority.get('a')).farm!.state,expected=projectCanonicalState(before,NOW+10000,[]);h.advance(10000);const result=await h.send('creative',{type:'pickup',assetId:'tree'});assert.equal(result.accepted,true);assert.equal(result.farm!.state.updatedAt,NOW+10000);assert.deepEqual(result.farm!.state.animals,expected.animals);assert.equal(obstacles(result.farm!.state),undefined);if(kind==='custom-egg')assert.equal(result.farm!.creative!.assets[0].egg!.incubation!.elapsedMs,10000);
});
test('moving custom creature pickup checks ownership before advance then bags its advanced actor',async()=>{
 const asset={...prop('pet',{x:1,z:2}),kind:'custom-creature' as const,templateId:'poop-pal',hatchedAt:NOW-1000},h=await setup([asset]);await h.authority.get('a');await h.repo.change(f=>{const a=f.state.animals[0];a.path=[{x:3,z:2}];a.target={x:3,z:2};a.activity='walk';});h.advance(500);const result=await h.send('creative',{type:'pickup',assetId:'pet'});assert.equal(result.accepted,true,result.message);assert.equal(result.farm!.state.animals.length,0);const bag=result.farm!.creative!.assets[0];assert.equal(bag.location,'bag');assert.ok(bag.animal!.position.x>1);assert.equal(result.farm!.state.updatedAt,NOW+500);
});
