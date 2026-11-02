import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadGeometry} from './helpers/load-rig.mjs';
import {createAvatarCreationStore} from '../src/avatar-creation.js';
import {createAvatarGeneration} from '../src/avatar-generation.js';
import {createInputMotionController} from '../src/input-motion.js';
import {versionCharacterManifest,ASSET_REVISION} from '../src/asset-revision.js';
const manifest=versionCharacterManifest(JSON.parse(fs.readFileSync(new URL('../public/assets/characters/manifest.json',import.meta.url))));
for(const quality of ['model','lowModel'])test(`Pharaoh ${quality}: real canonical rig load gates one unlock/debit and supports dancing`,async()=>{
 const asset=manifest.characters.jiaxin.outfits[1];assert.equal(asset.name,'埃及法老');assert.match(asset[quality],new RegExp(ASSET_REVISION));assert.deepEqual(asset.restPose,{bind:true});assert(fs.existsSync(new URL('../public/assets/thumbs/jiaxin-1.webp',import.meta.url)));
 let clock=0,loaded=false,rig,controller;const phases=[];const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const store=createAvatarCreationStore({storage,now:()=>clock});const base=store.beginAvatarCreation();clock=5000;store.completeOperation(base.token,{resultAvailable:true});
 const flow=createAvatarGeneration({store,now:()=>clock,wait:async ms=>{clock+=ms},isAvailable:(id,index)=>id==='jiaxin'&&index===1&&Boolean(asset[quality]),onState:s=>phases.push(s.phase),load:async(id,index)=>{
  assert.equal(store.getState().points,300);assert.deepEqual(store.getState().outfits,[0]);
  rig=await loadGeometry(`${id}-${index}`,{path:new URL('../public'+asset[quality].split('?')[0],import.meta.url)});
  assert.equal(rig.animations.length,3);let skinned=0;rig.scene.traverse(n=>{if(n.isSkinnedMesh){skinned++;assert.equal(n.skeleton.bones.length,23)}});assert.ok(skinned>0);
  controller=createInputMotionController(rig.scene,rig.animations,{restPose:asset.restPose});controller.setMode('playing');loaded=true;return true;
 }});
 const run=flow.generateOutfit(1);assert.equal(loaded,false);assert.equal(store.getState().points,300);const result=await run;
 assert.equal(clock,10000);assert.equal(loaded,true);assert.deepEqual(phases,['preparing','loading-model','idle']);assert.deepEqual(result.outfits,[0,1]);assert.equal(result.points,200);
 const bones=[];rig.scene.traverse(n=>{if(n.isBone)bones.push(n)});const before=bones.flatMap(n=>n.quaternion.toArray());controller.hit(0,'perfect');for(let i=0;i<40;i++)controller.update(1/60);assert.notDeepEqual(bones.flatMap(n=>n.quaternion.toArray()),before,'actual imported skin rig dances after successful input');controller.dispose();
 await flow.generateOutfit(1);assert.equal(store.getState().points,200);assert.deepEqual(createAvatarCreationStore({storage}).getState().outfits,[0,1]);
});
