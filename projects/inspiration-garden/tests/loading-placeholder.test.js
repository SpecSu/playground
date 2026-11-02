import test from 'node:test';
import assert from 'node:assert/strict';
import {drawLoadingPlaceholder,createLoadingReveal} from '../src/loading-placeholder.js';
function context(){const paths=[],fills=[],stack=[];let path=[];return {paths,fills,globalAlpha:.6,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){paths.push(path);fills.push({color:this.fillStyle,alpha:this.globalAlpha});},stroke(){},setLineDash(){}};}
test('loading volume projects its ground footprint in 2:1 perspective and never paints a white square or disk',()=>{
 const ctx=context();drawLoadingPlaceholder(ctx,{x:200,y:300,footprint:[2,2],time:100});assert.equal(ctx.globalAlpha,.6);assert.equal(ctx.paths.length,6);for(const path of ctx.paths)for(const p of path)assert.ok(p.every(Number.isFinite));
 // Last three filled paths are left/right walls and diamond roof.
 const top=ctx.paths.at(-1);assert.equal(top.length,4);const xs=top.map(p=>p[0]),ys=top.map(p=>p[1]);assert.ok(Math.abs((Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys))-2)<1e-10);
 assert.ok(ctx.fills.every(f=>!/^#fff|white/i.test(f.color)));assert.ok(ctx.fills.every(f=>f.alpha>0&&f.alpha<=.6));
});
test('rectangular and single-cell silhouettes respect camera scale and preserve anchor',()=>{
 for(const footprint of [[1,1],[2,2],[1,2],[2,1]]){const a=context(),b=context();drawLoadingPlaceholder(a,{x:0,y:0,footprint,zoom:1,reduceMotion:true});drawLoadingPlaceholder(b,{x:40,y:70,footprint,zoom:2,reduceMotion:true});for(let i=0;i<a.paths.length;i++)for(let j=0;j<a.paths[i].length;j++){assert.ok(Math.abs(b.paths[i][j][0]-(a.paths[i][j][0]*2+40))<1e-10);assert.ok(Math.abs(b.paths[i][j][1]-(a.paths[i][j][1]*2+70))<1e-10);}}
});
test('breathing changes only subtle opacity; reduced motion stays fixed and plants remain smaller',()=>{
 const a=context(),b=context(),c=context(),d=context(),plant=context();drawLoadingPlaceholder(a,{x:0,y:0,time:0});drawLoadingPlaceholder(b,{x:0,y:0,time:1700});assert.deepEqual(a.paths,b.paths);assert.notDeepEqual(a.fills,b.fills);
 drawLoadingPlaceholder(c,{x:0,y:0,time:0,reduceMotion:true});drawLoadingPlaceholder(d,{x:0,y:0,time:1700,reduceMotion:true});assert.deepEqual(c.fills,d.fills);
 drawLoadingPlaceholder(plant,{x:0,y:0,footprint:[1,1],kind:'plant'});assert.ok(Math.abs(plant.paths.at(-1)[0][1])<Math.abs(a.paths.at(-1)[0][1]));
});
test('art reveal only fades entities observed missing, caps memory, and resets on world change',()=>{
 const r=createLoadingReveal();assert.equal(r.opacity('cached',true,10),1);assert.equal(r.opacity('a',false,20),0);assert.equal(r.opacity('a',false,500),0);assert.equal(r.opacity('a',true,600),0);assert.equal(r.opacity('a',true,725),.5);assert.equal(r.opacity('a',true,850),1);assert.equal(r.opacity('a',true,900),1);
 assert.equal(r.opacity('reduced',false,0,true),0);assert.equal(r.opacity('reduced',true,1,true),1);r.opacity('b',false,0);r.clear();assert.equal(r.opacity('b',true,1),1);
 for(let i=0;i<5000;i++)r.opacity(`many-${i}`,false,0);assert.ok(r.size<=128);
});
