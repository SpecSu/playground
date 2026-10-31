import test from 'node:test';
import assert from 'node:assert/strict';
import {installFixture} from './helpers/network-motion-fixture.mjs';
import {createMinimalState} from '../src/minimal/model.ts';
import {createCreativeAnimal} from '../src/minimal/creative-lifecycle.ts';
import {projectCreativeObstacles,staticObstacleSegmentClear} from '../src/minimal/creative-obstacles.ts';
import {animalInteractionRadius} from '../src/minimal/interaction-motion.ts';
import {animalWorldSpeed,ANIMAL_VISIBLE_CORRECTION} from '../src/minimal/animal-motion.ts';
const flush=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,0));};
const grid=p=>({x:p.x/2+1.5,z:p.z/2+1.5});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
for(const custom of [false,true])test(`actual ${custom?'custom':'sheep'} GLB reconciliation detours around newly placed pine without teleport`,async()=>{
 const f=await installFixture();let world;
 try{
  const {MinimalWorld}=await import('../src/minimal/World.ts'),state=createMinimalState(f.now),asset={id:'actor',kind:'custom-creature',templateId:'poop-pal',name:'伙伴',prompt:'碰撞测试',createdAt:f.now-100000,hatchedAt:f.now-100000,jobId:'job',origin:'mock',location:'ground',position:{x:.75,z:2}},a=custom?createCreativeAnimal(asset):{id:'actor',name:'羊',species:'sheep',sex:'female',size:'normal',bornAt:f.now-200000,growthAgeMs:60000,energy:80,bond:0,position:{x:.75,z:2},activity:'idle',activityUntil:f.now+20000};state.animals=[a];state.tiles=state.tiles.map(t=>({...t,owned:t.x>=0&&t.x<=4&&t.z>=0&&t.z<=4,terrain:'meadow'}));state.player={x:0,z:3};
  const host=f.w.document.createElement('div');f.w.document.body.append(host);world=new MinimalWorld(host,state,{select(){},arrive(){},now:()=>f.now});if(custom)world.setCreativeAssets([asset]);else await world.animals.get(a.id).art.root.userData.animationReady;await flush();
  const root=custom?world.creativeScene.rootForAsset(a.id):world.animals.get(a.id).art.root,start=root.position.clone(),tree={...asset,id:'tree',kind:'prop',templateId:'wish-tree',position:{x:2,z:2}},next=projectCreativeObstacles(structuredClone(state),[tree]);next.animals[0].position={x:3.25,z:2};world.update(next);world.setCreativeAssets(custom?[tree,{...asset,position:{x:3.25,z:2}}]:[tree]);assert.equal(distance(root.position,start),0,'authority correction and prop placement do not snap the visual');
  let previous=root.position.clone(),maximum=0;const radius=animalInteractionRadius(a,f.now)/2;
  for(let frame=0;frame<2400;frame++){f.advance(1000/60);world.animate(f.mono);const current=root.position.clone();maximum=Math.max(maximum,distance(previous,current));assert.ok(staticObstacleSegmentClear(next,grid(previous),grid(current),radius),`frame ${frame} crosses pine body envelope: ${JSON.stringify(grid(current))}`);previous=current;}
  assert.ok(distance(root.position,start)>.25,'visible reconciliation makes safe progress rather than freezing');assert.ok(distance(root.position,{x:3.5,z:1})<.05,`reaches canonical target around obstacle: ${JSON.stringify(grid(root.position))}`);assert.ok(maximum<=animalWorldSpeed(a,f.now,root.scale.x)*ANIMAL_VISIBLE_CORRECTION/60+1e-6);
  const beforePickup=root.position.clone();world.update({...next,staticObstacles:undefined});world.setCreativeAssets(custom?[asset]:[]);assert.equal(distance(root.position,beforePickup),0,'pickup removal never repositions an actor');
 }finally{world?.dispose();await f.dispose();}
});
test('actual World stops a newly blocked player route at its existing fractional root',async()=>{
 const f=await installFixture();let world;
 try{const {MinimalWorld}=await import('../src/minimal/World.ts'),state=createMinimalState(f.now);state.player={x:1.2,z:2};const host=f.w.document.createElement('div');f.w.document.body.append(host);let cancels=0;world=new MinimalWorld(host,state,{select(){},arrive(){throw Error('blocked route arrived');},interactionCancel(){cancels++;},now:()=>f.now});await flush();world.path=[world.playerRoot.position.clone().set(3,0,1)];world.destination={x:3,z:2};world.playerSpeed=.8;const start=world.playerRoot.position.clone();world.update({...state,staticObstacles:[{x:2,z:2}]});assert.equal(distance(world.playerRoot.position,start),0);f.advance(1000/60);world.animate(f.mono);assert.equal(distance(world.playerRoot.position,start),0);assert.deepEqual(world.path,[]);assert.equal(cancels,1);}finally{world?.dispose();await f.dispose();}
});
test('actual sample VisitorSession/World keeps real theme props outside walkable land and rejects placement without home writes',async()=>{
 const f=await installFixture();let world;
 try{
  const THREE=await import('three'),{MinimalWorld}=await import('../src/minimal/World.ts'),{VisitorSession}=await import('../src/minimal/visitor-session.ts'),{sampleFarm}=await import('../src/minimal/sample-farms.ts');const home=createMinimalState(f.now);home.coins=777;const homeBytes=JSON.stringify(home);f.w.localStorage.setItem('canonical-home-test',homeBytes);let minimumMargin=Infinity,totalMeshes=0;
  for(const id of ['forest','glacier','oasis','lunar']){
   const visit=VisitorSession.sample(id,f.now),host=f.w.document.createElement('div');f.w.document.body.append(host);world=new MinimalWorld(host,visit.state,{select(){},arrive(){},now:()=>f.now});world.setVisitorScenery(sampleFarm(id,f.now));await flush();const scenery=world.visitorScenery.environment.root;scenery.updateMatrixWorld(true);assert.equal(scenery.children.length,4,'all four real theme GLBs load');const bounds=scenery.children.map(o=>new THREE.Box3().setFromObject(o,true));
   for(const box of bounds){assert.ok(box.min.x>=-10&&box.max.x<=10&&box.min.z>=-10&&box.max.z<=10,'actual GLB must rest above the existing terrain floor');assert.ok(box.max.x< -4||box.min.x>8,'actual rotated GLB stays outside owned grid footprint');minimumMargin=Math.min(minimumMargin,box.max.x< -4?-4-box.max.x:box.min.x-8);}scenery.traverse(o=>{if(o.isMesh)totalMeshes++;});
   for(const p of world.visitorScenery.landmarks){const to=grid(p);assert.equal(visit.command({type:'move',to},f.now).accepted,false,'visitor cannot walk into off-farm decor');}
   const before=visit.state;assert.equal(visit.command({type:'place',assetId:'forged-tree',at:{x:2,z:2}},f.now).accepted,false);assert.equal(visit.command({type:'placeEgg',eggId:'forged-egg',at:{x:2,z:2}},f.now).accepted,false);assert.deepEqual(visit.state,before);
   for(const to of [{x:5,z:1},{x:5,z:4},{x:0,z:5}]){const reply=visit.command({type:'move',to},f.now);assert.equal(reply.accepted,true);world.update(reply.state);assert.equal(world.walkTo(to),true);for(let frame=0;frame<900&&world.path.length;frame++){f.advance(1000/60);world.animate(f.mono);if(frame%15===0)world.update(visit.tick(f.now,world.playerMotionSnapshot()));const p=world.playerRoot.position;for(const box of bounds){const dx=Math.max(0,box.min.x-p.x,p.x-box.max.x),dz=Math.max(0,box.min.z-p.z,p.z-box.max.z);assert.ok(Math.hypot(dx,dz)>.3,'visitor root/body clears actual perimeter GLB bounds');}}assert.ok(distance(grid(world.playerRoot.position),to)<.01,'visitor reaches safe perimeter route');}
   visit.dispose();world.dispose();world=undefined;host.remove();assert.equal(f.w.localStorage.getItem('canonical-home-test'),homeBytes);assert.equal(JSON.stringify(home),homeBytes);
  }
  assert.ok(totalMeshes>=16);assert.ok(minimumMargin>.3,'all real props leave at least the visitor-body clearance');console.log(JSON.stringify({scenario:'sample-real-glb-perimeter',minimumMargin,totalMeshes,homeUnchanged:true}));
 }finally{world?.dispose();await f.dispose();}
});
