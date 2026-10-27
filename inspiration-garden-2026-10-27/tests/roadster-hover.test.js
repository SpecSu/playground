import test from 'node:test';
import assert from 'node:assert/strict';
import {createExhibitControl,stepExhibitControl} from '../src/exhibit-controls.js';
import {gestureSoundPlan} from '../src/interactions.js';

const event=(at,type='start')=>({at,type,x:.5,y:.5});
test('Roadster starts one bounded hover and repeated taps do not extend or stack its flight',()=>{
 const start=createExhibitControl('hover',event(100));
 assert.deepEqual(start.events,[{type:'hover'}]);
 assert.equal(start.state.hoverAt,100);
 const released=stepExhibitControl(start.state,event(180,'end'));
 assert.equal(released.state.hoverAt,100,'normal release lets the short flight land');
 const again=createExhibitControl('hover',event(1100),released.state);
 assert.deepEqual(again.events,[]);
 assert.equal(again.state.hoverAt,100);
 assert.equal(createExhibitControl('hover',event(1900),again.state).state.hoverAt,1900);
});
test('cancel lands Roadster immediately and cancelled holds cannot restart it',()=>{
 const start=createExhibitControl('hover',event(100));
 const cancelled=stepExhibitControl(start.state,event(600,'cancel'));
 assert.equal(cancelled.state.hoverAt,-Infinity);
 assert.deepEqual(stepExhibitControl(cancelled.state,event(700,'hold')).events,[]);
});
test('Roadster has a quiet nonempty cold-gas gesture sound, independent from shoe footsteps',()=>{
 const notes=gestureSoundPlan({type:'hover'});
 assert.ok(notes.length>0);
 assert.ok(notes.every(n=>n.gain<=.025&&n.duration<=.4));
 assert.notDeepEqual(notes,gestureSoundPlan({type:'stride'}));
});

test('pure hover sample rises only 12 CSS pixels, holds, then returns to its exact grounded pose by 1.8 seconds',async()=>{
 const mod=await import('../src/roadster-hover.js').catch(()=>({}));
 assert.equal(typeof mod.roadsterHoverSample,'function');
 const sample=mod.roadsterHoverSample,ground=sample(-1);
 assert.equal(ground.lift,0);assert.equal(ground.jetAlpha,0);
 assert.equal(sample(0).lift,0);assert.equal(sample(250).lift,0);assert.ok(sample(450).lift>0);
 assert.equal(sample(650).lift,12);assert.equal(sample(1100).lift,12);
 assert.ok(sample(1500).lift>0&&sample(1500).lift<12);
 assert.deepEqual(sample(1800),ground);assert.deepEqual(sample(Infinity),ground);assert.deepEqual(sample(NaN),ground);assert.equal(sample(1650).lift,0);
 for(let at=0;at<1800;at+=10){const s=sample(at);assert.ok(s.lift>=0&&s.lift<=12);assert.ok(s.jetAlpha>=0&&s.jetAlpha<=1);assert.ok(s.shadowScale>=.8&&s.shadowScale<=1);assert.ok(s.shadowAlpha>=.5&&s.shadowAlpha<=1);}
 assert.ok(sample(600).jetAlpha>0);assert.ok(sample(600).shadowScale<ground.shadowScale);assert.ok(sample(600).shadowAlpha<ground.shadowAlpha);
});
test('reduced motion keeps Roadster grounded with only a short stationary feedback window',async()=>{
 const mod=await import('../src/roadster-hover.js').catch(()=>({}));
 assert.equal(typeof mod.roadsterHoverSample,'function');
 const sample=mod.roadsterHoverSample;
 for(let at=0;at<=1800;at+=20){const s=sample(at,true);assert.equal(s.jetAlpha,0);assert.equal(s.lift,0);assert.equal(s.shadowScale,1);assert.equal(s.shadowAlpha,1);}
 assert.equal(sample(120,true).jetAlpha,0);assert.equal(sample(650,true).jetAlpha,0);
});
