import test from 'node:test';
import assert from 'node:assert/strict';
import { installationBurn, seededRandom, countdownLabel, shaderTimeSeconds } from '../src/desert/visual-math.ts';
test('art burns, chars, collapses, then becomes ash on a shared timeline', () => {
 const burn=10000, ash=45000;
 assert.deepEqual(installationBurn(0,burn,ash),{progress:0,flame:0,char:0,collapse:0,ash:0,smoke:0,visible:true});
 const early=installationBurn(15000,burn,ash),middle=installationBurn(26000,burn,ash),late=installationBurn(41000,burn,ash);
 assert.ok(early.flame>0.9); assert.ok(middle.char>early.char); assert.ok(late.collapse>0.95); assert.ok(late.ash>0.95);
 assert.equal(installationBurn(45000,burn,ash).visible,false);
 assert.deepEqual(installationBurn(31000,burn,ash,7),installationBurn(31000,burn,ash,7));
});
test('countdown is never negative, supports a full five minutes and rounds up',()=>{
 assert.equal(countdownLabel(300000),'05:00');assert.equal(countdownLabel(1),'00:01');assert.equal(countdownLabel(-5),'00:00');
});
test('environment random generator is seeded and bounded',()=>{
 const a=seededRandom(2),b=seededRandom(2);for(let i=0;i<100;i++){const v=a();assert.equal(v,b());assert.ok(v>=0&&v<1);}
});

test('epoch shader times retain sub-frame precision in GLSL float32',()=>{
 const epoch=Date.parse('2026-10-14T03:50:00Z');
 const a=shaderTimeSeconds(epoch),b=shaderTimeSeconds(epoch+16);
 assert.ok(a>=0&&a<4096);assert.ok(b>=0&&b<4096);
 assert.ok(Math.fround(b)>Math.fround(a));assert.ok(Math.abs((Math.fround(b)-Math.fround(a))-.016)<.001);
 assert.equal(shaderTimeSeconds(epoch),shaderTimeSeconds(epoch+4096000));
});
