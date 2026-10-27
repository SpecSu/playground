import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlantControl,stepPlantControl,controlHint,controlVisual} from '../src/plant-controls.js';
const event=(type,x=.5,y=.5,at=0)=>({type,x,y,at});
test('puffer holds build pressure then release gives a bounded elastic pop, cancellation never pops',()=>{
 let r=createPlantControl('puff',event('start',.5,.5,1000));r=stepPlantControl(r.state,event('hold',.5,.5,1600));assert.ok(r.state.pressure>.5);assert.equal(r.events.length,0);
 const v=controlVisual(r.state,1600);assert.ok(v.sx>1.15);const released=stepPlantControl(r.state,event('end',.5,.5,1700));assert.equal(released.events[0].type,'pop');assert.ok(released.events[0].strength<=1);
 const canceled=stepPlantControl(r.state,event('cancel',.5,.5,1700));assert.equal(canceled.events.length,0);
});
test('corn scrubs five real local keys without replaying the same key on stationary movement',()=>{
 let r=createPlantControl('keyboard',event('start',0,.5,1000));assert.equal(r.events[0].note,0);
 r=stepPlantControl(r.state,event('move',.45,.5,1050));assert.equal(r.events[0].note,2);
 r=stepPlantControl(r.state,event('move',.46,.5,1060));assert.equal(r.events.length,0);
 r=stepPlantControl(r.state,event('move',1,.5,1100));assert.equal(r.events[0].note,4);
});
test('drum and bell contact zones have distinct bounded pitches',()=>{
 assert.equal(createPlantControl('drum',event('start',.1,.5,1000)).events[0].zone,0);
 assert.equal(createPlantControl('drum',event('start',.9,.5,1000)).events[0].zone,1);
 assert.notEqual(createPlantControl('bell',event('start',.1,.5,1000)).events[0].note,createPlantControl('bell',event('start',.9,.5,1000)).events[0].note);
});
test('wave leaf responds continuously to horizontal drag and returns to rest on release',()=>{
 let r=createPlantControl('wave',event('start',.5,.5,1000));r=stepPlantControl(r.state,event('move',.95,.5,1200));assert.ok(r.state.displacement>.5);assert.ok(controlVisual(r.state,1200).rotation>.08);
 r=stepPlantControl(r.state,event('end',.95,.5,1300));assert.equal(r.state.active,false);assert.equal(controlVisual(r.state,2500).rotation,0);
});
test('glow stores local light toggle and three deliberate taps reveal a one-off firefly surprise',()=>{
 let s=null,events=[];for(const at of [1000,1300,1600]){const r=createPlantControl('glow',event('start',.5,.5,at),s);s=r.state;events.push(...r.events);s=stepPlantControl(s,event('end',.5,.5,at+80)).state;}
 assert.equal(events.filter(e=>e.type==='fireflies').length,1);assert.equal(s.lit,true);
 const later=createPlantControl('glow',event('start',.5,.5,5000),s);assert.equal(later.state.lit,false);assert.equal(later.events.some(e=>e.type==='fireflies'),false);
});
test('sleepy plant distinguishes one gentle hold from repeated pokes, with clear affordances',()=>{
 let r=createPlantControl('sleep',event('start',.5,.5,1000));r=stepPlantControl(r.state,event('hold',.5,.5,1800));assert.equal(r.events[0].type,'dream');
 const ended=stepPlantControl(r.state,event('end',.5,.5,1900));assert.equal(ended.events.length,0);
 assert.match(controlHint('keyboard'),/划/);assert.match(controlHint('puff'),/按住/);assert.match(controlHint('glow'),/点/);
});
test('giant moon cap toggles a local light and one gentle hold releases a dream without repeated hold rewards',()=>{
 let r=createPlantControl('moon',event('start',.5,.5,1000));assert.equal(r.events[0].type,'light');assert.equal(r.state.lit,true);
 r=stepPlantControl(r.state,event('hold',.5,.5,1800));assert.equal(r.events.some(e=>e.type==='dream'),true);
 r=stepPlantControl(r.state,event('hold',.5,.5,1900));assert.equal(r.events.some(e=>e.type==='dream'),false);
});
