import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {installFixture} from './helpers/network-motion-fixture.mjs';
import {createMinimalState} from '../src/minimal/model.ts';
import {projectCanonicalState,canonicalFarmLocks} from '../src/minimal/canonical-presentation.ts';
import {animalWorldSpeed,ANIMAL_VISIBLE_CORRECTION} from '../src/minimal/animal-motion.ts';
import {AccountClient} from '../src/minimal/account-client.ts';
import {createCreativeAnimal} from '../src/minimal/creative-lifecycle.ts';
const flush=async()=>{for(let n=0;n<15;n++)await new Promise(r=>setTimeout(r,0));};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function stateAt(now){const s=createMinimalState(now);s.welcomeClaimed=true;s.animals=['wished','boarded','free'].map((id,i)=>({id,name:id,species:'sheep',sex:'female',size:'normal',bornAt:now-200000,growthAgeMs:60000,energy:80,bond:0,position:{x:1,z:i+1},path:[{x:3,z:i+1}],target:{x:3,z:i+1},activity:'walk',activityUntil:now+20000}));return s;}

test('actual sheep GLBs freeze both copied display locks, keep free motion, and unlock without a jump',async()=>{
 const f=await installFixture();let world;
 try{
  const {MinimalWorld}=await import('../src/minimal/World.ts'),state=stateAt(f.now),before=structuredClone(state),host=f.w.document.createElement('div');f.w.document.body.append(host);
  world=new MinimalWorld(host,state,{select(){},arrive(){},now:()=>f.now});const locks=['wished','boarded'];world.setAnimalLocks?.(locks);locks.length=0;await Promise.all([...world.animals.values()].map(v=>v.art.root.userData.animationReady));await flush();
  for(const id of ['wished','boarded','free'])assert.equal(world.animals.get(id).art.root.userData.animationStatus,'ready','actual sheep GLB loaded');
  const root=id=>world.animals.get(id).art.root,starts=new Map(state.animals.map(a=>[a.id,root(a.id).position.clone()]));let lockedDrift=0;
  for(let frame=1;frame<=120;frame++){f.advance(1000/60);if(frame%15===0)world.update(projectCanonicalState(state,f.now,['wished','boarded']));world.animate(f.mono);for(const id of ['wished','boarded'])lockedDrift=Math.max(lockedDrift,distance(root(id).position,starts.get(id)));}
  assert.ok(lockedDrift<1e-9,`locked GLBs drifted ${lockedDrift} world units`);assert.ok(distance(root('free').position,starts.get('free'))>.1);assert.deepEqual(state,before,'display does not delete canonical paths or mutate input');
  const unlocked=projectCanonicalState(state,f.now,['wished','boarded']),atUnlock=root('boarded').position.clone();world.setAnimalLocks(['wished']);assert.equal(distance(atUnlock,root('boarded').position),0,'changing display locks never teleports');let maximumStep=0,previous=atUnlock;
  for(let frame=1;frame<=120;frame++){f.advance(1000/60);if(frame%15===0)world.update(projectCanonicalState(unlocked,f.now,['wished']));world.animate(f.mono);const position=root('boarded').position.clone();maximumStep=Math.max(maximumStep,distance(previous,position));previous=position;}
  assert.ok(distance(root('boarded').position,atUnlock)>.1,'unlocked retained path resumes');assert.ok(distance(root('wished').position,starts.get('wished'))<1e-9);
  const limit=animalWorldSpeed(unlocked.animals[1],f.now,root('boarded').scale.x)*ANIMAL_VISIBLE_CORRECTION/60;assert.ok(maximumStep<=limit+1e-6,`unlock step ${maximumStep} exceeds ${limit}`);
 }finally{world?.dispose();await f.dispose();}
});

test('wishing-locked actual custom GLB cannot extrapolate its retained canonical path',async()=>{
 const f=await installFixture();let world;
 try{
  const {MinimalWorld}=await import('../src/minimal/World.ts'),state=createMinimalState(f.now),asset={id:'locked-poop',kind:'custom-creature',templateId:'poop-pal',name:'布丁',prompt:'锁显示测试',createdAt:f.now-100000,hatchedAt:f.now-100000,jobId:'job',origin:'mock',location:'ground',position:{x:1,z:2}},animal=createCreativeAnimal(asset);animal.path=[{x:3,z:2}];animal.target={x:3,z:2};animal.activity='walk';state.animals=[animal];const before=structuredClone(state),host=f.w.document.createElement('div');f.w.document.body.append(host);
  world=new MinimalWorld(host,state,{select(){},arrive(){},now:()=>f.now});world.setAnimalLocks?.([animal.id]);world.setCreativeAssets([asset]);await flush();assert.ok(f.geometry().triangles>=17500);const root=world.creativeScene.rootForAsset(asset.id),start=root.position.clone();let drift=0;
  for(let frame=1;frame<=120;frame++){f.advance(1000/60);if(frame%15===0)world.update(projectCanonicalState(state,f.now,[animal.id]));world.animate(f.mono);drift=Math.max(drift,distance(root.position,start));}
  assert.ok(drift<1e-9,`locked custom GLB drifted ${drift}`);assert.deepEqual(state,before);
 }finally{world?.dispose();await f.dispose();}
});

test('actual App synchronizes wishing and boarding display locks on initial scene and canonical acceptance',async()=>{
 const f=await installFixture();let root,client;
 try{
  const uid=`uid_${'a'.repeat(64)}`,account={uid,handle:'锁测试',createdAt:f.now},state=stateAt(f.now);
  let farm={accountId:uid,farmId:'farm-lock',revision:1,state,activeOfferId:'wish',boardingAnimalId:'boarded',activeBoardingId:'boarding',initializedAt:f.now,origin:'server-created',assetProvenance:{}};
  const offer={offerId:'wish',ownerAccountId:uid,animalId:'wished',revision:1,status:'open',createdAt:f.now,expiresAt:f.now+600000,tradeId:null};
  const view=()=>({serverTime:f.now,dayKey:'2027-01-15',resetAt:f.now+86400000,farm,ownOffer:offer,usedToday:false,serviceGate:'client-migration-required'});
  client=new AccountClient(account,view(),async()=>Response.json({account,view:view()}),f.w.localStorage);
  const {default:App}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(App,{session:client}));await flush();});
  const world=f.world(),position=id=>world.animals.get(id).art.root.position.clone(),initial=position('boarded'),wish=position('wished');
  const frames=async count=>{for(let frame=1;frame<=count;frame++)await act(async()=>{f.advance(1000/60);world.animate(f.mono);if(frame%15===0)await flush();});};
  await frames(120);assert.ok(distance(position('boarded'),initial)<1e-9,'App initial boarding lock reaches World');assert.ok(distance(position('wished'),wish)<1e-9,'App initial wishing lock reaches World');
  farm={...farm,revision:2,state:projectCanonicalState(state,f.now,canonicalFarmLocks(farm,offer)),boardingAnimalId:null,activeBoardingId:null};
  await act(async()=>{await client.refresh();await flush();});assert.equal(distance(position('boarded'),initial),0,'canonical acceptance changes locks without teleport');await frames(120);
  assert.ok(distance(position('boarded'),initial)>.1,'canonical unlock resumes World');assert.ok(distance(position('wished'),wish)<1e-9,'remaining wishing lock retained');
 }finally{if(root)await act(async()=>root.unmount());client?.dispose();await f.dispose();}
});
