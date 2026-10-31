import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import {AccountClient} from '../src/minimal/account-client.ts';
import {createMinimalState,advanceMinimalState,validateMinimalSave} from '../src/minimal/model.ts';
import {createCreativeAnimal,syncCreativeAnimals} from '../src/minimal/creative-lifecycle.ts';
import {animalWorldSpeed,ANIMAL_VISIBLE_CORRECTION} from '../src/minimal/animal-motion.ts';
import {installFixture,MemoryRepository} from './helpers/network-motion-fixture.mjs';

const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const assetAt=now=>({id:'fixed-poop',kind:'custom-creature',templateId:'poop-pal',name:'布丁',prompt:'运动回归',createdAt:now-100_000,hatchedAt:now-100_000,jobId:'fixed-job',origin:'mock',location:'ground',position:{x:1,z:2}});

test('actual World and actual poop GLB bound every snapshot correction frame',async()=>{
 const f=await installFixture();let world;
 try{
  const {MinimalWorld}=await import('../src/minimal/World.ts');
  const state=createMinimalState(f.now),asset=assetAt(f.now),a=createCreativeAnimal(asset);state.player={x:1,z:1};a.path=[{x:3,z:2}];a.target={x:3,z:2};a.activity='walk';state.animals=[a];
  const host=f.w.document.createElement('div');f.w.document.body.append(host);world=new MinimalWorld(host,state,{select(){},arrive(){}});world.setCreativeAssets([asset]);await flush();
  assert.ok(f.geometry().triangles>1000,'actual authored GLB triangles loaded, not a primitive stand-in');
  let maxAnimalStep=0,previous=world.creativeScene.rootForAsset(asset.id).position.clone();
  for(let frame=1;frame<=60;frame++){
   f.advance(1000/60);if(frame%15===0){const next=advanceMinimalState(state,f.now);world.update(next);}
   world.animate(f.mono);const p=world.creativeScene.rootForAsset(asset.id).position.clone();maxAnimalStep=Math.max(maxAnimalStep,distance(previous,p));previous=p;
  }
  const rootBefore=world.creativeScene.rootForAsset(asset.id);world.setCreativeAssets(structuredClone([asset]));assert.equal(world.creativeScene.rootForAsset(asset.id),rootBefore,'metadata refresh keeps actual GLB instance');
  const animalLimit=animalWorldSpeed(a,f.now)*ANIMAL_VISIBLE_CORRECTION/60;
  console.log(JSON.stringify({scenario:'ugc-250ms-ticks',maxAnimalStep,animalLimit,geometry:f.geometry()}));

  world.walkTo({x:3,z:1});for(let i=0;i<90;i++){f.advance(1000/60);world.animate(f.mono);if(i===20){const same=world.playerMotionSnapshot();world.walkTo({x:3,z:1});assert.deepEqual(world.playerMotionSnapshot().position,same.position,'same-target reissue does not reset origin');}}
  const before=world.playerMotionSnapshot().position;world.reconcilePlayer(state);const after=world.playerMotionSnapshot().position;
  console.log(JSON.stringify({scenario:'delayed-player-reconcile',immediateGridJump:distance(before,after)}));

  let maxPlayerStep=0,last=after;for(let i=0;i<240;i++){f.advance(1000/60);world.animate(f.mono);const p=world.playerMotionSnapshot().position;maxPlayerStep=Math.max(maxPlayerStep,distance(last,p));last=p;}
  assert.ok(distance(before,after)<1e-9,'a network reconcile must not instantly overwrite rendered position');
  assert.ok(maxAnimalStep<=animalLimit+1e-5,`UGC jumps ${maxAnimalStep} world units/frame; limit ${animalLimit}`);
  assert.ok(maxPlayerStep<=.5/60+1e-6);assert.ok(distance(last,state.player)<1e-5,'authority correction eventually converges');
  const explicit={...state,player:{x:3,z:3}};world.reconcilePlayer(explicit,{teleport:true});assert.deepEqual(world.playerMotionSnapshot().position,explicit.player,'explicit authorized teleport remains immediate');
  world.dispose();const newHost=f.w.document.createElement('div');f.w.document.body.append(newHost);world=new MinimalWorld(newHost,explicit,{select(){},arrive(){}});assert.deepEqual(world.playerMotionSnapshot().position,explicit.player,'fresh World/account mounts at its own canonical origin');
 }finally{world?.dispose();await f.dispose();}
});

test('real React App, AccountClient and authority preserve motion through 1.2s ACK and 3.4s GET',async()=>{
 const f=await installFixture();const repo=new MemoryRepository();let root,client;
 const uid=`uid_${'9'.repeat(64)}`,account={uid,handle:'演示 · twx',createdAt:f.now};let id=0;
 const authority=new MinimalAuthority(repo,{clock:()=>Math.round(f.now),newId:()=>`network_${++id}`,fingerprint:async x=>createHash('sha256').update(x).digest('hex')});
 const deliveries=[],posted=[],results=[];let getDelay=3400,rejectNextMove=false;
 try{
  await authority.bootstrap(uid,{requestId:'new',mode:'new'});await authority.command(uid,{requestId:'welcome',expectedRevision:1,command:{type:'welcome'}});
  const asset=assetAt(f.now);await repo.transaction(async tx=>{const farm=await tx.get('farms',uid);farm.state.player={x:1,z:1};const animal=createCreativeAnimal(asset);animal.path=[{x:3,z:2}];animal.target={x:3,z:2};animal.activity='walk';farm.state.animals=[animal];farm.creative={version:1,jobs:[],assets:[asset]};farm.assetProvenance[animal.id]='server-created';syncCreativeAnimals(farm);await tx.put('farms',uid,farm);});
  client=new AccountClient(account,await authority.get(uid),async(_url,init)=>{
   let value,delay;if(init?.method==='POST'){const body=JSON.parse(init.body);posted.push(body.command.type);value=await authority.command(uid,rejectNextMove&&body.command.type==='move'?(rejectNextMove=false,{...body,expectedRevision:0}):body);results.push(value);delay=1200;}else{value={account,view:await authority.get(uid)};delay=getDelay;}
   return new Promise(resolve=>deliveries.push({at:f.mono+delay,resolve:()=>resolve(Response.json(value))}));
  },f.w.localStorage,'twx');
  const {default:App}=await import('../src/minimal/MinimalApp.tsx');const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(App,{session:client}));await flush();});
  const world=f.world();assert.ok(world,'actual World mounted');await flush();assert.ok(f.geometry().triangles>=17500,'actual released asset GLB loaded');
  let previousPlayer=world.playerMotionSnapshot().position,previousAnimal=world.creativeScene.rootForAsset(asset.id).position.clone(),maxPlayerStep=0,maxAnimalStep=0,maxAnimalRatio=0,maxCameraStep=0,previousCamera=world.camera.position.clone();const trace=[];
  const frames=async count=>{for(let frame=0;frame<count;frame++)await act(async()=>{f.advance(1000/60);for(const d of [...deliveries])if(d.at<=f.mono+1e-6){deliveries.splice(deliveries.indexOf(d),1);d.resolve();}await Promise.resolve();await Promise.resolve();await Promise.resolve();world.animate(f.mono);await Promise.resolve();const player=world.playerMotionSnapshot().position,animal=world.creativeScene.rootForAsset(asset.id).position.clone();const dp=distance(player,previousPlayer),da=distance(animal,previousAnimal),dc=distance(world.camera.position,previousCamera);if(f.mono>2000)maxCameraStep=Math.max(maxCameraStep,dc);previousCamera=world.camera.position.clone();maxPlayerStep=Math.max(maxPlayerStep,dp);maxAnimalStep=Math.max(maxAnimalStep,da);const actor=world.state.animals.find(a=>a.id===asset.id),limit=animalWorldSpeed(actor,Math.max(f.now,world.state.updatedAt),world.creativeScene.rootForAsset(asset.id).scale.x)*ANIMAL_VISIBLE_CORRECTION/60;maxAnimalRatio=Math.max(maxAnimalRatio,da/(limit+1e-8));if(dp>.02||da>.02)trace.push({at:f.mono,dp,da,revision:client.farm.revision,serverTime:client.view.serverTime,updatedAt:client.farm.state.updatedAt,player,target:world.playerMotionSnapshot().path.at(-1)});previousPlayer=player;previousAnimal=animal;if(frame%15===14)await flush();});};
  await act(async()=>{world.handlers.select({kind:'tile',x:3,z:1});await flush();});
  await frames(390);await act(flush);
  assert.deepEqual(posted,['move']);assert.ok(results.every(x=>x.accepted));assert.equal(client.pending,null);
  console.log(JSON.stringify({scenario:'react-account-1200-3400ms',maxPlayerGridStep:maxPlayerStep,maxAnimalWorldStep:maxAnimalStep,maxAnimalSpeedRatio:maxAnimalRatio,maxCameraWorldStep:maxCameraStep,geometry:f.geometry(),trace}));
  assert.ok(maxPlayerStep<=.5/60+1e-5,`player teleports ${maxPlayerStep} grid cells in one rendered frame`);
  assert.ok(maxAnimalRatio<=1.001,`UGC exceeds its own allowed speed by ratio ${maxAnimalRatio}`);
  assert.ok(distance(world.playerMotionSnapshot().position,{x:3,z:1})<1e-4,'same revision delayed GET cannot undo arrival');
  const firstPosted=posted.length;
  await act(async()=>{world.handlers.select({kind:'tile',x:1,z:1});await flush();});
  await frames(20);
  await act(async()=>{world.handlers.select({kind:'tile',x:2,z:3});world.handlers.select({kind:'tile',x:3,z:3});await flush();});
  await frames(420);assert.equal(posted.length,firstPosted+2,'latest target coalesces while immutable first POST is pending');
  assert.ok(distance(world.playerMotionSnapshot().position,{x:3,z:3})<1e-4);
  await act(async()=>{world.handlers.select({kind:'tile',x:1,z:3});await flush();});await frames(30);
  await act(async()=>{world.handlers.interactionCancel();await flush();});await frames(240);
  assert.equal(posted.at(-1),'stopMove');assert.equal(client.pending,null);assert.equal(world.playerMotionSnapshot().path.length,0);assert.equal(client.farm.state.playerPath.length,0);
  const beforeCare=posted.length;
  // A valid care POST still travels through the same live AccountClient/subscription.
  // Settle an explicit external revision near LX, then ensure it is routed, not snapped.
  let oldRead;await act(async()=>{oldRead=client.refresh();oldRead.catch(()=>{});await flush();});const previousRevision=client.farm.revision;
  await repo.transaction(async tx=>{const farm=await tx.get('farms',uid);farm.state.animals[0].position={...farm.state.player};delete farm.state.animals[0].path;delete farm.state.animals[0].target;delete farm.state.animals[0].targetActivity;delete farm.state.animals[0].drinkAnchor;farm.state.animals[0].activity='idle';farm.state.animals[0].activityUntil=Math.round(f.now+120000);farm.state.updatedAt=Math.round(f.now);farm.revision++;syncCreativeAnimals(farm);assert.equal(validateMinimalSave(farm.state),true,'external authoritative fixture is valid');await tx.put('farms',uid,farm);});
  getDelay=200;const refresh=client.refresh();refresh.catch(()=>{});await frames(240);await refresh;await oldRead;getDelay=3400;assert.equal(client.farm.revision,previousRevision+1,'higher revision survives older delayed GET arriving afterwards');
  await act(async()=>{world.handlers.select({kind:'animal',id:asset.id});await flush();});
  const careButton=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('打招呼'));assert.ok(careButton,'actual care UI available');await act(async()=>{careButton.click();await flush();});await frames(300);assert.equal(results.at(-1).accepted,true);assert.equal(posted.length,beforeCare+1);assert.equal(posted.at(-1),'care');
  const beforeReject=posted.length,authorityOrigin={...client.farm.state.player};rejectNextMove=true;
  await act(async()=>{world.handlers.select({kind:'tile',x:1,z:1});await flush();});await frames(20);
  await act(async()=>{world.handlers.select({kind:'tile',x:3,z:1});await flush();});await frames(300);
  assert.equal(results.at(-1).accepted,false,'real authority rejects the obsolete command');assert.equal(posted.length,beforeReject+1,'rejection clears queued follow-on action');assert.equal(client.pending,null);assert.equal(world.playerMotionSnapshot().path.length,0);assert.ok(distance(world.playerMotionSnapshot().position,authorityOrigin)<1e-5,'late rejection smoothly converges to authority rather than canceling its correction');
  console.log(JSON.stringify({scenario:'latest-target-stop-care-rejection',posted,maxPlayerGridStep:maxPlayerStep,maxAnimalWorldStep:maxAnimalStep,maxAnimalSpeedRatio:maxAnimalRatio,maxCameraWorldStep:maxCameraStep,trace}));
  assert.ok(maxPlayerStep<=.5/60+1e-5);assert.ok(maxAnimalRatio<=1.001);assert.ok(maxCameraStep<.2,'camera is smooth, not a jumped actor following a new origin');
 }catch(error){console.error('Original App fixture failure',error);throw error;}finally{for(const d of deliveries)d.resolve();if(root)await act(async()=>root.unmount());client?.dispose();await f.dispose();}
});

test('early actual arrival survives slow ACK once; expired online intents never revive on retry',async t=>{
 for(const mode of ['early-place','expired-place','expired-care'])await t.test(mode,async()=>{
  const f=await installFixture(),repo=new MemoryRepository();let root,client,id=0,loseFirst=mode.startsWith('expired');const uid=`uid_${'8'.repeat(64)}`,account={uid,handle:'演示 · twx',createdAt:f.now},posted=[],requestIds=[],deliveries=[];
  const authority=new MinimalAuthority(repo,{clock:()=>Math.round(f.now),newId:()=>`early_${++id}`,fingerprint:async x=>createHash('sha256').update(x).digest('hex')});
  try{
   await authority.bootstrap(uid,{requestId:'new',mode:'new'});await authority.command(uid,{requestId:'welcome',expectedRevision:1,command:{type:'welcome'}});
   await repo.transaction(async tx=>{const farm=await tx.get('farms',uid);farm.state.player={x:1,z:1};await tx.put('farms',uid,farm);});
   assert.equal((await authority.command(uid,{requestId:'buy',expectedRevision:2,command:{type:'buyEgg'}})).accepted,true);
   const asset=assetAt(f.now);
   await repo.transaction(async tx=>{const farm=await tx.get('farms',uid);farm.state.player=mode==='expired-care'?{x:1.35,z:2}:{x:2,z:2.9};if(mode==='expired-care'){asset.position={x:3,z:2};const animal=createCreativeAnimal(asset);animal.activityUntil=f.now+300000;farm.state.animals=[animal];farm.creative={version:1,jobs:[],assets:[asset]};farm.assetProvenance[asset.id]='server-created';syncCreativeAnimals(farm);}assert.ok(validateMinimalSave(farm.state));await tx.put('farms',uid,farm);});
   client=new AccountClient(account,await authority.get(uid),async(_url,init)=>{if(init?.method!=='POST')return Response.json({account,view:await authority.get(uid)});const body=JSON.parse(init.body);posted.push(body.command.type);requestIds.push(body.requestId);const result=await authority.command(uid,body);if(loseFirst){loseFirst=false;throw new Error('fixture lost only the response after canonical commit');}return new Promise(resolve=>deliveries.push({at:f.mono+1200,resolve:()=>resolve(Response.json(result))}));},f.w.localStorage,'twx');
   const {default:App}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(App,{session:client}));await flush();});const world=f.world();
   const button=label=>{const found=[...host.querySelectorAll('button')].find(b=>b.textContent.includes(label)||b.getAttribute('aria-label')===label);assert.ok(found,label);return found;};
   const frames=async count=>{for(let n=0;n<count;n++)await act(async()=>{f.advance(1000/60);for(const d of [...deliveries])if(d.at<=f.mono+1e-6){deliveries.splice(deliveries.indexOf(d),1);d.resolve();}await Promise.resolve();await Promise.resolve();world.animate(f.mono);if(n%15===14)await flush();});};
   if(mode==='expired-care'){await act(async()=>world.handlers.select({kind:'animal',id:asset.id}));await act(async()=>{button('打招呼').click();await flush();});}
   else{await act(async()=>button('蛋袋，1颗蛋').click());await act(async()=>button('神秘动物蛋').click());await act(async()=>{world.handlers.select({kind:'tile',x:2,z:2});await flush();});}
   await frames(45);assert.deepEqual(posted,['move']);assert.ok(client.pending,'immutable move is still awaiting its authenticated receipt');
   if(mode==='early-place'){assert.equal(world.playerMotionSnapshot().path.length,0,'real short walk arrived before 1.2s ACK');assert.equal(client.farm.state.eggs[0].location,'bag');await frames(180);assert.deepEqual(posted,['move','placeEgg']);assert.equal(client.farm.state.eggs[0].location,'ground');assert.equal(client.pending,null);}
   else{await act(async()=>{f.advance(121000);world.animate(f.mono);await flush();});assert.equal(world.playerMotionSnapshot().path.length,0,'expired online job stops its visual route while receipt is unknown');let retried;await act(async()=>{retried=client.retry();retried.catch(()=>{});await flush();});await frames(180);assert.equal((await retried).accepted,true);assert.deepEqual(posted,['move','move'],'retry settles the old request but cannot perform its expired action');assert.equal(requestIds[0],requestIds[1],'retry preserves original immutable request ID');assert.equal(client.farm.state.eggs[0].location,'bag');assert.equal(client.farm.state.animals[0]?.bond??0,0);}
   console.log(JSON.stringify({scenario:mode,posted,requestCount:requestIds.length,pending:!!client.pending}));
  }finally{for(const d of deliveries)d.resolve();if(root)await act(async()=>root.unmount());client?.dispose();await f.dispose();}
 });
});

test('actual UGC GLB continuously follows a safe detour to a fractional target across a pond',async()=>{
 const f=await installFixture();let world;
 try{
  const {MinimalWorld}=await import('../src/minimal/World.ts'),{animalNavigation,clearPlayerSegment}=await import('../src/minimal/model.ts');
  const state=createMinimalState(f.now),asset=assetAt(f.now);for(const tile of state.tiles)if(tile.owned)tile.terrain='meadow';const pond=state.tiles.find(t=>t.x===2&&t.z===2);pond.terrain='pond';asset.position={x:1,z:2};const animal=createCreativeAnimal(asset);animal.activityUntil=f.now+300000;state.animals=[animal];state.player={x:1,z:1};assert.ok(validateMinimalSave(state));
  const host=f.w.document.createElement('div');f.w.document.body.append(host);world=new MinimalWorld(host,state,{select(){},arrive(){}});world.setCreativeAssets([asset]);await flush();
  const target={x:3.2,z:2.1},updated=structuredClone(state);updated.animals[0].position=target;assert.ok(validateMinimalSave(updated));const navigation=animalNavigation(updated);assert.equal(clearPlayerSegment(navigation,asset.position,target),false,'fixture really requires a pond detour');const origin=world.creativeScene.rootForAsset(asset.id).position.clone();world.update(updated);assert.ok(distance(origin,world.creativeScene.rootForAsset(asset.id).position)<1e-9,'snapshot cannot skip directly across the pond before rendering');
  const root=world.creativeScene.rootForAsset(asset.id),grid=()=>({x:root.position.x/2+1.5,z:root.position.z/2+1.5});let previous=grid(),maxStep=0,frames=0;
  for(;frames<1800&&distance(previous,target)>.00001;frames++){f.advance(1000/60);world.animate(f.mono);const point=grid();assert.equal(clearPlayerSegment(navigation,previous,point),true,'every real rendered segment stays on lawful ground');maxStep=Math.max(maxStep,distance(previous,point));previous=point;}
  assert.ok(distance(previous,target)<.00001,`fractional correction must converge, ended at ${JSON.stringify(previous)}`);assert.ok(maxStep<=animalWorldSpeed(animal,f.now,root.scale.x)*ANIMAL_VISIBLE_CORRECTION/120+1e-6);console.log(JSON.stringify({scenario:'ugc-fractional-pond-detour',frames,maxGridStep:maxStep,end:previous,target,geometry:f.geometry()}));
 }finally{world?.dispose();await f.dispose();}
});
