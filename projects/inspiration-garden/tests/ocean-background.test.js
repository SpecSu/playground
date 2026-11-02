import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene} from '../src/scene.js';
const selected='assets/backgrounds/ocean-b-cloud-emerald-v1.webp';
test('sea is the original solid pale aqua with no decorative image reference or runtime asset',()=>{
 const css=fs.readFileSync('styles.css','utf8'),shell=css.match(/\.garden-shell\{([^}]+)\}/)[1];assert.match(shell,/background:#b9dfdc(?:;|$)/);assert.doesNotMatch(shell,/url\(/);
 assert.equal(fs.existsSync(selected),false);assert.doesNotMatch(fs.readFileSync('scripts/build.mjs','utf8'),/ocean-b-cloud|assets\/backgrounds/);
});
test('flat sea renders one opaque uniform fill and no decorative strokes even when images fail',()=>{
 const keys=['window','document','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','matchMedia','devicePixelRatio','Image'],old=new Map(keys.map(k=>[k,globalThis[k]])),frames=[],fills=[],clears=[],options=[],events={};
 let strokes=0;const base={globalAlpha:1,stroke(){strokes++;},clearRect:(...args)=>clears.push(args),fillRect(...args){fills.push({args,style:this.fillStyle});},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})};
 const ctx=new Proxy(base,{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)}),canvas={getContext(_kind,opts){options.push(opts);return ctx;},getBoundingClientRect:()=>({left:0,top:0,width:440,height:757}),addEventListener:(k,f)=>events[k]=f,removeEventListener(){}};
 Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){}},document:{hidden:false},requestAnimationFrame:f=>(frames.push(f),frames.length),cancelAnimationFrame(){},ResizeObserver:class{observe(){}disconnect(){}},matchMedia:()=>({matches:false}),devicePixelRatio:1,Image:class{constructor(){throw new Error('decorative image unavailable');}}});
 let scene;try{
  scene=createScene(canvas,{assets:{sprite(){},draw(){return false;},drawAvatar(){return false;}}});assert.equal(options[0].alpha,true);frames.shift()(100);assert.deepEqual(fills[0],{args:[0,0,440,757],style:'#b9dfdc'});assert.equal(strokes,0);
  scene.setWorld({id:'decorative-failure',tiles:[{id:'a',x:0,y:0,kind:'land'}],edges:[],plants:[],avatarTileId:'a'},{});const before=scene.getCamera();scene.zoomBy(1.1);frames.shift()(160);assert.notEqual(scene.getCamera().zoom,before.zoom);assert.ok(fills.length>=2);
  assert.ok(fills.filter(f=>f.args.join(',')==='0,0,440,757').every(f=>f.style==='#b9dfdc'));
 }finally{scene?.dispose();for(const [k,v]of old)if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
