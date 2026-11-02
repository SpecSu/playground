import test from 'node:test';
import assert from 'node:assert/strict';
import {soundPlan,interactionLine} from '../src/interactions.js';
test('authored tactile interactions use distinct bounded sonic signatures',()=>{
 const drum=soundPlan('drum',0),bell=soundPlan('bell',0),keyboard=soundPlan('keyboard',0);
 assert.ok(drum.length);assert.notDeepEqual(drum,bell);assert.notDeepEqual(bell,keyboard);
 for(const k of ['drum','bell','keyboard','puff','wave','sleep','glow','float','bubble','paint','gramophone','whisper'])for(const n of soundPlan(k,0)){
  assert.ok(n.frequency>=50&&n.frequency<=1800);assert.ok(n.duration>0&&n.duration<=1.3);assert.ok(n.gain<=.12);
 }
});
test('whisper uses authored rotating lines, never live chat or microphone claims',()=>{
 assert.notEqual(interactionLine('whisper',0),interactionLine('whisper',1));assert.equal(interactionLine('whisper',0),interactionLine('whisper',3));
 assert.match(interactionLine('drum',0),/咚/);
});
import {gestureSoundPlan} from '../src/interactions.js';
test('scrubbed keys, bell zones, and drum pads produce single distinct playable notes',()=>{
 const left=gestureSoundPlan({type:'drum',zone:0}),right=gestureSoundPlan({type:'drum',zone:1});assert.notEqual(left[0].frequency,right[0].frequency);
 const notes=[0,1,2,3,4].map(note=>gestureSoundPlan({type:'key',note}));assert.ok(notes.every(x=>x.length===1));assert.equal(new Set(notes.map(x=>x[0].frequency)).size,5);
 assert.equal(gestureSoundPlan({type:'bell',note:2}).length,2);assert.equal(gestureSoundPlan({type:'unknown'}).length,0);
});
test('memory buildings have bounded distinct ensemble purr camp and page signatures',()=>{
 const plans=['ensemble','purr','camp','page','breeze'].map(type=>gestureSoundPlan({type,note:1,strength:.7,lit:true}));assert.ok(plans.every(p=>p.length));assert.notDeepEqual(plans[0],plans[1]);assert.notDeepEqual(plans[1],plans[2]);
 for(const plan of plans)for(const n of plan){assert.ok(n.frequency>=50&&n.frequency<=1800);assert.ok(n.duration>0&&n.duration<=1.3);assert.ok(n.gain<=.08);}
});
