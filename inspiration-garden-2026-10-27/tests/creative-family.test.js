import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce,compatibleRemixSamples,reusablePersonalVariety,familyOf} from '../src/state.js';
import {CREATIVE_SAMPLES,DEMO_VARIETIES,DEMO_GARDENS} from '../src/catalogue.js';
import {validateState} from '../src/storage.js';
const NOW=1792942800000,fresh=()=>createState(NOW,'family-visitor');
const act=(s,a)=>{const r=reduce(s,a,NOW);assert.equal(r.ok,true,r.message);return r.state;};
test('remix rejects incompatible botanical families atomically, including a forged untrusted family field',()=>{
 for(const sampleId of ['drum_pumpkin','cloud_lantern','singing_eggplant']){
  const s=fresh();s.varieties.radish.family='pumpkin';const r=reduce(s,{type:'CREATE_VARIETY',sampleId,parentId:'radish',requestId:`bad-${sampleId}`},NOW);assert.equal(r.ok,false);assert.deepEqual(r.state,s);assert.equal(r.state.crystals,3);
 }assert.equal(familyOf({artKey:'whisper_radish',family:'pumpkin'}),'radish');
});
test('same parent art and interaction is not sold as a newly paid result',()=>{
 let s=act(fresh(),{type:'CREATE_VARIETY',sampleId:'whisper_radish',parentId:'radish',requestId:'first'});const v=Object.values(s.varieties).find(v=>v.authorId===s.uid);
 const r=reduce(s,{type:'CREATE_VARIETY',sampleId:'whisper_radish',parentId:v.id,requestId:'same-parent'},NOW);assert.equal(r.ok,false);assert.deepEqual(r.state,s);assert.equal(r.state.crystals,2);
 assert.equal(compatibleRemixSamples(s,v.id).length,0);
});
test('repeated personal offline sample offers reusable coin seed rather than another crystal debit or identity merge',()=>{
 let s=act({...fresh(),coins:1000},{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'cloud-first'});const existing=reusablePersonalVariety(s,'cloud_lantern');assert.ok(existing);
 const duplicate=reduce(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'cloud-again'},NOW);assert.equal(duplicate.ok,false);assert.deepEqual(duplicate.state,s);
 s=act(s,{type:'BUY_SEED',varietyId:existing.id});assert.equal(s.inventory[existing.id],2);assert.equal(s.crystals,2);assert.equal(s.coins,820);
});
test('foreign tomato lineage keeps its family and provenance when remixed into distinct painter tomato',()=>{
 let s=fresh();s=act(s,{type:'RECEIVE_SEED',variety:structuredClone(DEMO_VARIETIES['demo-puffer_tomato']),transferId:'legacy-puffer'});const original=s.varieties['demo-puffer_tomato'];
 assert.ok(compatibleRemixSamples(s,original.id).some(v=>v.id==='painter_tomato'));assert.equal(compatibleRemixSamples(s,original.id).some(v=>v.id==='drum_pumpkin'),false);
 s=act(s,{type:'CREATE_VARIETY',sampleId:'painter_tomato',parentId:original.id,requestId:'paint-remix'});const created=Object.values(s.varieties).find(v=>v.authorId===s.uid);
 assert.equal(familyOf(created),'tomato');assert.equal(created.parentId,original.id);assert.equal(created.rootId,original.rootId);assert.equal(created.parentAuthorName,original.authorName);assert.equal(s.varieties[original.id].authorId,original.authorId);assert.equal(validateState(s),true);
});
test('legacy varieties stay loadable even when old demo allowed a cross-family parent',()=>{
 const s=fresh(),sample=CREATIVE_SAMPLES.find(x=>x.id==='cloud_lantern');s.varieties.legacy={...sample,id:'legacy',authorId:s.uid,authorName:'我',parentId:'radish',rootId:'radish',parentAuthorName:'花园原生种'};s.inventory.legacy=1;
 assert.equal(validateState(s),true);assert.equal(familyOf(s.varieties.legacy),'cloud_lantern');
});
test('friend drum pumpkin can become a piano pumpkin while remaining a pumpkin and retaining the true source',()=>{
 let s=fresh();const g=DEMO_GARDENS.find(g=>g.theme==='music'),p=g.plants.find(p=>p.varietyId==='demo-drum_pumpkin');
 s=act(s,{type:'INTERACT_DEMO',gardenId:g.id,plantId:p.id});s=act(s,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id});const source=s.varieties[p.varietyId];
 assert.ok(compatibleRemixSamples(s,source.id).some(v=>v.id==='piano_pumpkin'));assert.equal(compatibleRemixSamples(s,source.id).some(v=>v.id==='drum_pumpkin'),false);
 s=act(s,{type:'CREATE_VARIETY',sampleId:'piano_pumpkin',parentId:source.id,requestId:'piano-child'});const piano=Object.values(s.varieties).find(v=>v.authorId===s.uid);
 assert.equal(piano.artKey,'piano_pumpkin');assert.equal(piano.interaction,'keyboard');assert.equal(familyOf(piano),'pumpkin');assert.equal(piano.parentId,source.id);assert.equal(piano.rootId,source.rootId);assert.equal(piano.parentAuthorName,'Kelly');assert.equal(s.crystals,2);assert.equal(validateState(s),true);
 const repeat=reduce(s,{type:'CREATE_VARIETY',sampleId:'piano_pumpkin',parentId:source.id,requestId:'piano-again'},NOW);assert.equal(repeat.ok,false);assert.deepEqual(repeat.state,s);
});
