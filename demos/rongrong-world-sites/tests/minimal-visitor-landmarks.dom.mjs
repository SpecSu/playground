import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import * as THREE from 'three';
import {installFixture} from './helpers/network-motion-fixture.mjs';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
test('actual home World loads zero landmarks; each visit loads only its supplied model, preserves ground picking and late disposal',async t=>{
 const f=await installFixture(),oldFetch=globalThis.fetch;let world,hook;
 try{
  hook=registerHooks({load(url,c,next){if(url.endsWith('/visitor-landmark-scene.ts'))return{format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8').replace('this.options=options;','this.options={...options,textureMode:"headers-only"};'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};return next(url,c);}});
  const calls=[],held=[];let hold=false;
  globalThis.fetch=async url=>{const path=new URL(String(url),'http://local').pathname;if(!path.startsWith('/models/landmarks/'))throw new Error('Unexpected fixture fetch '+path);calls.push(path);if(hold)await new Promise(r=>held.push(r));return new Response(readFileSync(new URL('../public'+path,import.meta.url)));};
  const {MinimalWorld}=await import('../src/minimal/World.ts'),{createMinimalState}=await import('../src/minimal/model.ts'),{sampleFarm}=await import('../src/minimal/sample-farms.ts'),{VISITOR_LANDMARKS}=await import('../src/minimal/visitor-landmark-catalog.ts');
  const host=f.w.document.createElement('div');f.w.document.body.append(host);world=new MinimalWorld(host,createMinimalState(f.now),{select(){},arrive(){}});await flush();assert.equal(calls.length,0,'home must not prefetch user landmark collection');world.dispose();world=undefined;
  const projections=[];
  for(const id of ['oasis','glacier','forest','lunar']){
   const farm=sampleFarm(id,f.now),snapshot=JSON.stringify(farm.state),prior=calls.length;world=new MinimalWorld(host,farm.state,{select(){},arrive(){}});world.setVisitorScenery(farm);await world.visitorScenery.suppliedLandmark.ready;assert.equal(world.visitorScenery.suppliedLandmark.status,'ready');assert.deepEqual(calls.slice(prior),[VISITOR_LANDMARKS[id].url]);
   world.zoom(-.95);if(id==='lunar')world.frameLunarShowcase();world.scene.updateMatrixWorld(true);world.camera.updateMatrixWorld(true);world.renderer.domElement.getBoundingClientRect=()=>({left:0,top:0,width:390,height:844});
   const target=new THREE.Vector3(1,.03,3).project(world.camera),hit=world.targetFromPointer({clientX:(target.x+1)*195,clientY:(1-target.y)*422});assert.equal(hit?.kind,'tile');assert.ok(world.walkTo({x:2,z:3}));const before=world.playerRoot.position.clone();for(let i=0;i<60;i++){f.advance(50);world.animate(f.mono);}assert.ok(world.playerRoot.position.distanceTo(before)>1.8,'static landmark cannot block player');assert.equal(JSON.stringify(farm.state),snapshot);assert.equal(f.w.localStorage.length,0);
   const b=new THREE.Box3().setFromObject(world.visitorScenery.suppliedLandmark.root,true),ps=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])ps.push(new THREE.Vector3(x,y,z).project(world.camera));projections.push({id,maxAbsX:Math.max(...ps.map(p=>Math.abs(p.x))),maxAbsY:Math.max(...ps.map(p=>Math.abs(p.y)))});world.dispose();world=undefined;
  }
  t.diagnostic('Pre-integration camera projections (main owns framing union): '+JSON.stringify(projections));
  hold=true;const farm=sampleFarm('lunar',f.now);world=new MinimalWorld(host,farm.state,{select(){},arrive(){}});world.setVisitorScenery(farm);const late=world.visitorScenery.suppliedLandmark;assert.equal(held.length,1);world.setVisitorScenery(null);held.splice(0).forEach(r=>r());await late.ready;assert.equal(late.root.parent,null);assert.equal(late.root.children.length,0);assert.equal(world.scene.getObjectByName('visitor-user-landmark'),undefined);assert.equal(f.w.localStorage.length,0);
 }finally{world?.dispose();hook?.deregister();globalThis.fetch=oldFetch;await f.dispose();}
});
