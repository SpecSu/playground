import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene} from '../src/scene.js';
import {DEMO_GARDENS,DEMO_VARIETIES,BASIC_VARIETIES} from '../src/catalogue.js';
test('selecting an authored music resident highlights it without ghosting a neighboring readable plant',()=>{
 const keys=['window','document','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','matchMedia','devicePixelRatio'],old=new Map(keys.map(k=>[k,globalThis[k]])),frames=[],drawn=[];
 const stack=[],base={globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()??1;},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:20})};
 const ctx=new Proxy(base,{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
 const canvas={width:0,height:0,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:440,height:757}),addEventListener(){},removeEventListener(){}};
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.document={hidden:false};globalThis.requestAnimationFrame=callback=>(frames.push(callback),frames.length);globalThis.cancelAnimationFrame=()=>{};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/art-manifest.json',import.meta.url),'utf8'));
 const assets={sprite:key=>manifest.sprites[key],draw(_ctx,key){drawn.push({key,alpha:ctx.globalAlpha});return true;},drawAvatar(){return true;},hasInteractionFrame(){return false;}};
 let scene;
 try{
  scene=createScene(canvas,{assets});const garden=DEMO_GARDENS.find(g=>g.theme==='music');scene.setWorld({...garden,avatarTileId:garden.spawnTileId,avatarKey:'niulai'},{...Object.fromEntries(BASIC_VARIETIES.map(v=>[v.id,v])),...DEMO_VARIETIES});scene.setSelection({kind:'plant',id:'music-drum'});
  frames.shift()(100);const neighbor=drawn.find(d=>d.key==='keyboard_corn');assert.ok(neighbor);assert.equal(neighbor.alpha,1);
  drawn.length=0;scene.setWorld({id:'head-occlusion',tiles:[{id:'back',x:0,y:0,kind:'land'},{id:'front',x:1,y:0,kind:'land'}],edges:[],plants:[{id:'back-crop',tileId:'back',varietyId:'radish',plantedAt:0,readyAt:0},{id:'front-bell',tileId:'front',varietyId:'demo-singing_eggplant',plantedAt:0,readyAt:0}],avatarTileId:'back',avatarKey:'niulai'},{...Object.fromEntries(BASIC_VARIETIES.map(v=>[v.id,v])),...DEMO_VARIETIES});frames.shift()(150);const covering=drawn.find(d=>d.key==='singing_eggplant');assert.equal(covering.alpha,.55);
 }finally{scene?.dispose();for(const [key,value]of old)if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
