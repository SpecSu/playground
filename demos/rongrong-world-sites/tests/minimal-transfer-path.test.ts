import test from 'node:test';
import assert from 'node:assert/strict';
import * as motion from '../src/minimal/interaction-motion.ts';
type P={x:number;y:number;z:number};
const distance=(a:P,b:P)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('transfer raises clear before horizontal travel and settles only at its endpoint',()=>{
 const fn=(motion as unknown as {animalTransferPoint?:(from:P,to:P,clearance:number,ms:number)=>P}).animalTransferPoint;assert.equal(typeof fn,'function','bounded transfer path exists');const from={x:0,y:.3,z:0},to={x:2,y:1,z:1},clearance=1.8;
 assert.deepEqual(fn!(from,to,clearance,0),from);assert.deepEqual(fn!(from,to,clearance,650),to);
 assert.deepEqual(fn!(from,to,clearance,650-1e-7),to,'frame-clock roundoff shares the exact lifecycle endpoint');assert.ok(motion.animalTransferProgress(649.999)<1,'a real sub-millisecond remainder is not discarded');
 for(const t of [16,50,100,190]){const p=fn!(from,to,clearance,t);assert.equal(p.x,from.x);assert.equal(p.z,from.z);assert.ok(p.y>=from.y);}
 for(const t of [200,300,400,490])assert.equal(fn!(from,to,clearance,t).y,clearance);
 for(const t of [500,550,600]){const p=fn!(from,to,clearance,t);assert.equal(p.x,to.x);assert.equal(p.z,to.z);assert.ok(p.y>=to.y);}
 for(const hz of [30,60,120]){let last=from;for(let t=1000/hz;t<=650;t+=1000/hz){const p=fn!(from,to,clearance,t);assert.ok(distance(last,p)<.4,'no frame-sized teleport');assert.ok(Object.values(p).every(Number.isFinite));last=p;}}
});
