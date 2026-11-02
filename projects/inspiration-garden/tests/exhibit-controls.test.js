import test from 'node:test';
import assert from 'node:assert/strict';
import * as controls from '../src/exhibit-controls.js';
const e=(type,x=.5,y=.5,at=1000)=>({type,x,y,at});
test('portrait pavilion has two glasses-window zones and a distinct lower piano zone with no stationary note spam',()=>{
 let r=controls.createExhibitControl('rehearsal',e('start',.2,.3));assert.equal(r.events[0].note,0);
 r=controls.stepExhibitControl(r.state,e('move',.8,.3,1100));assert.equal(r.events[0].note,1);
 r=controls.stepExhibitControl(r.state,e('move',.5,.7,1200));assert.equal(r.events[0].note,2);
 r=controls.stepExhibitControl(r.state,e('hold',.5,.7,1400));assert.equal(r.events.length,0);
});
test('reading den gentle hold warms a purr and turns one page; cancellation silences further repeats',()=>{
 let r=controls.createExhibitControl('purr',e('start'));assert.equal(r.events[0].type,'purr');
 r=controls.stepExhibitControl(r.state,e('hold',.5,.5,1500));assert.ok(r.state.warmth>.4);assert.equal(r.events.filter(e=>e.type==='purr').length,1);
 r=controls.stepExhibitControl(r.state,e('hold',.5,.5,2100));assert.equal(r.events.filter(e=>e.type==='page').length,1);
 r=controls.stepExhibitControl(r.state,e('hold',.5,.5,2300));assert.equal(r.events.some(e=>e.type==='page'),false);
 r=controls.stepExhibitControl(r.state,e('cancel',.5,.5,2400));assert.equal(r.state.active,false);assert.equal(controls.stepExhibitControl(r.state,e('hold',.5,.5,3000)).events.length,0);
});
test('camp workshop lantern remembers its toggle and horizontal drag makes bounded breeze without an invented wheel',()=>{
 let r=controls.createExhibitControl('camp',e('start',.5,.5));assert.equal(r.state.lit,true);assert.equal(r.events[0].type,'camp');
 r=controls.stepExhibitControl(r.state,e('move',1,.5,1200));assert.equal(r.state.breeze,1);assert.equal(r.events[0].type,'breeze');
 r=controls.stepExhibitControl(r.state,e('end',1,.5,1300));const again=controls.createExhibitControl('camp',e('start',.5,.5,1800),r.state);assert.equal(again.state.lit,false);
});
test('exhibit visual return is bounded and released motion settles while lantern state stays local',()=>{
 const state={kind:'purr',active:false,releasedAt:1000,warmth:1,pageTurned:true,breeze:1,lit:true,note:2};const v=controls.exhibitVisual(state,2000);assert.equal(v.warmth,0);assert.equal(v.breeze,0);assert.equal(v.page,false);assert.equal(v.note,null);assert.equal(v.lit,true);
});
test('portrait zones follow measured illustrated glasses windows, not an arbitrary left/right roof split',()=>{
 assert.equal(controls.createExhibitControl('rehearsal',e('start',.49,.37)).events[0].note,1);
 assert.equal(controls.createExhibitControl('rehearsal',e('start',.31,.33)).events[0].note,0);
});
