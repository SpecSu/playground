import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PyramidInteriorMotion,PYRAMID_WALK_BOUNDS} from '../src/minimal/pyramid-interior-motion.ts';
import {loadPyramidGeometry,PYRAMID_INTERIOR} from '../src/minimal/pyramid-interior-asset.ts';
const bytes=readFileSync(new URL('../public/models/interiors/pyramid.spz',import.meta.url));
test('third-person player walking really translates, normalizes diagonals and cannot escape reviewed corridor',()=>{
 const m=new PyramidInteriorMotion();const start=m.snapshot();m.move(1,0,.1);assert.ok(m.snapshot().x>start.x+.1);assert.equal(m.snapshot().y,0);
 const a=new PyramidInteriorMotion(),b=new PyramidInteriorMotion();a.move(1,0,.1);b.move(1,1,.1);assert.ok(Math.abs(Math.hypot(b.snapshot().x,b.snapshot().z)-a.snapshot().x)<1e-8);
 for(let i=0;i<1000;i++)m.move(1,1,.1);const p=m.snapshot();assert.equal(p.x,PYRAMID_WALK_BOUNDS.maxX);assert.ok(p.z>=PYRAMID_WALK_BOUNDS.minZ&&p.z<=PYRAMID_WALK_BOUNDS.maxZ);
 const before=m.snapshot();m.move(1,0,100);m.move(NaN,0,.1);assert.deepEqual(m.snapshot(),before);
});
test('look is bounded and reset restores entrance, not an orbit camera',()=>{const m=new PyramidInteriorMotion();m.look(0,1000);assert.equal(m.snapshot().pitch,Math.PI*.38);m.look(NaN,NaN);assert.ok(Number.isFinite(m.snapshot().yaw));m.move(1,0,.1);m.reset();assert.deepEqual(m.snapshot(),{x:0,y:0,z:0,yaw:-Math.PI/2,pitch:0});});
test('exact uploaded SPZ parses to all 723426 gaussian covariances without invented mesh',async()=>{
 const progress:number[]=[];const g=await loadPyramidGeometry(new AbortController().signal,n=>progress.push(n),{fetcher:async()=>new Response(bytes)});
 assert.equal(g.getAttribute('position').count,723426);assert.equal(g.getAttribute('covariance').itemSize,6);assert.equal(g.index,null);assert.equal(progress.at(-1),1);assert.equal(bytes.length,PYRAMID_INTERIOR.bytes);g.dispose();
});
test('wrong bytes fail closed before decode; late decode after cancellation is disposed',async()=>{
 let decoded=0;await assert.rejects(loadPyramidGeometry(new AbortController().signal,()=>{},{fetcher:async()=>new Response(new Uint8Array(bytes.length)),decode:()=>{decoded++;throw Error('unreachable');}}),/identity/);assert.equal(decoded,0);
 const controller=new AbortController();let release:(value:import('three').BufferGeometry)=>void=()=>{},started=()=>{};const begun=new Promise<void>(r=>started=r);
 const pending=loadPyramidGeometry(controller.signal,()=>{},{fetcher:async()=>new Response(bytes),decode:()=>{started();return new Promise(r=>release=r);}});await begun;controller.abort();const {BufferGeometry}=await import('three');const g=new BufferGeometry();let disposed=0;g.addEventListener('dispose',()=>disposed++);release(g);await assert.rejects(pending,{name:'AbortError'});assert.equal(disposed,1);
});
test('return during streaming cancels reader and never decodes late bytes',async()=>{const c=new AbortController();let cancel=0,decoded=0;const stream=new ReadableStream<Uint8Array>({start(ctrl){ctrl.enqueue(bytes.subarray(0,10));},cancel(){cancel++;}});const pending=loadPyramidGeometry(c.signal,()=>c.abort(),{fetcher:async()=>new Response(stream),decode:()=>{decoded++;throw Error('unreachable');}});await assert.rejects(pending,{name:'AbortError'});assert.equal(decoded,0);assert.equal(cancel,1);});
test('third-person camera remains behind a visible player and inside separately reviewed camera bounds at every yaw/edge',async()=>{const {pyramidThirdPersonCamera,PYRAMID_CAMERA_BOUNDS,pyramidFloorHeight}=await import('../src/minimal/pyramid-interior-motion.ts');for(const x of [PYRAMID_WALK_BOUNDS.minX,0,PYRAMID_WALK_BOUNDS.maxX])for(const z of [PYRAMID_WALK_BOUNDS.minZ,0,PYRAMID_WALK_BOUNDS.maxZ])for(let i=0;i<72;i++){const yaw=i*Math.PI/36,c=pyramidThirdPersonCamera({x,y:0,z,yaw,pitch:0});assert.ok(c.x>=PYRAMID_CAMERA_BOUNDS.minX-1e-10&&c.x<=PYRAMID_CAMERA_BOUNDS.maxX+1e-10);assert.ok(c.z>=PYRAMID_CAMERA_BOUNDS.minZ-1e-10&&c.z<=PYRAMID_CAMERA_BOUNDS.maxZ+1e-10);assert.ok(Math.hypot(c.x-x,c.z-z)>=.449,'camera never becomes first person');assert.ok((c.x-x)*Math.sin(yaw)+(c.z-z)*Math.cos(yaw)>.44,'behind view direction');assert.ok(c.y>pyramidFloorHeight(x)+1.5);assert.equal(c.target.x,x);assert.equal(c.target.z,z);}});
