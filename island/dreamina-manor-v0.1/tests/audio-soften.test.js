import test from'node:test';import assert from'node:assert/strict';import{actionSound}from'../lib/client/action-sounds.js';import{SFX_LEVEL,softLimitSfx}from'../lib/client/ocean-audio.js';
const energy=a=>a.reduce((s,v)=>s+v*v,0)/a.length;
test('effects bus is moderately below v18, not back to nearly silent wave gain',()=>{const db=20*Math.log10(SFX_LEVEL/1.8);assert.ok(db<=-4&&db>=-6);assert.ok(SFX_LEVEL>.8);});
test('purchase uses the user inventory recording with nonzero bounded output',()=>{const a=actionSound('buy');assert.notDeepEqual(a,actionSound('bag'));assert.ok(energy(a)>.0005);assert.ok(Math.max(...a.map(Math.abs))<.5);});
test('sale uses a bounded actual recorded coin sample with no tail click',()=>{const a=actionSound('sell');assert.ok(a.length>=22050*.65&&a.length<=22050*.75);const out=a.map(v=>softLimitSfx(v*SFX_LEVEL)),db=20*Math.log10(Math.sqrt(energy(out)));assert.ok(db>-30&&db<-23,db);assert.ok(Math.abs(a.at(-1))<.002);});
