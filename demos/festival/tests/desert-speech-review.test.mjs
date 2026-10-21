import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {speechBubbleLayout,festivalBubbleContent,speechBubbleFont} from '../src/desert/speech-bubble.ts';
import {nameplateLayout,fitNameplateText} from '../src/desert/artwork-focus.ts';
import {configureScreenSpaceText} from '../src/desert/screen-space-text.ts';
const {createFestivalService}=await import('../lib/festival-server.ts');
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const measure=text=>[...segmenter.segment(text)].reduce((n,{segment})=>n+(/^\s+$/.test(segment)?9:/^[\x00-\x7f]+$/.test(segment)?18:36),0);
const scene=fs.readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');
const drawSource=scene.slice(scene.indexOf('function textSprite('),scene.indexOf('export default function DesertScene('));
const drawing=ts.transpileModule(drawSource+';globalThis.draw=textSprite;globalThis.replace=replaceText;globalThis.dispose=disposeSprite;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

test('independent bubble QA: production canvas matches measured content without text compression or clipping',()=>{
 for(const text of ['Hi','你好','🤣','❤️','hello world '.repeat(6),'中文内容'.repeat(20),'W'.repeat(80),'👨‍👩‍👧‍👦👍🏽é'.repeat(8),'第一行\nSecond line'])for(const self of [false,true]){
  const fontSize=Number(speechBubbleFont(text).match(/(\d+)px/)[1]),actualMeasure=s=>measure(s)*fontSize/34;
  const calls=[],plates=[],fills=[],tail=[],ctx={measureText:s=>({width:actualMeasure(s)}),clearRect(){},beginPath(){},roundRect(...args){plates.push(args);},fill(){fills.push(this.fillStyle);},moveTo(...args){tail.push(args);},lineTo(...args){tail.push(args);},fillText(...args){calls.push(args);}};
  const canvas={width:0,height:0,getContext:()=>ctx};
  const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document:{createElement:()=>canvas}});vm.runInContext(drawing,context);
  const sprite=context.draw(text,true,self),layout=speechBubbleLayout(text,actualMeasure);
  assert.equal(canvas.width,layout.width);assert.equal(canvas.height,layout.height);assert.ok(canvas.width<=550);
  assert.ok(sprite.userData.screenSpaceText,'production sprite has CSS-pixel dimensions');assert.equal(sprite.userData.screenSpaceText.width,canvas.width*.34);assert.equal(sprite.userData.screenSpaceText.height,canvas.height*.34);
  assert.ok(Math.abs(sprite.userData.screenSpaceText.width/(canvas.width*.4)-.85)<1e-12,'speech text, padding and tail shrink uniformly by 15%');
  assert.ok(fontSize*.34>=11.5,'text remains readable');if(fontSize===64)assert.ok(fontSize*.34>21,'single emoji stays comfortably larger than text');
  assert.deepEqual(plates,[[4,4,canvas.width-8,canvas.height-25,Math.min(24,(canvas.width-8)/2)]],'speech restores its previous rounded plate');
  assert.deepEqual(tail,[[canvas.width/2-17,canvas.height-25],[canvas.width/2,canvas.height-3],[canvas.width/2+17,canvas.height-25]],'speech restores its previous centered tail');
  assert.deepEqual(fills,['rgba(255,255,255,.9)','rgba(255,255,255,.9)']);
  assert.equal(ctx.fillStyle,'#44332a');assert.ok(!ctx.shadowBlur,'dark bubble text needs no nickname shadow');
  assert.equal(ctx.font,speechBubbleFont(text));
  assert.equal(calls.length,layout.lines.length);
  for(const [line,x,y,...extra]of calls){assert.equal(extra.length,0,'canvas must not horizontally compress text');assert.ok(x-actualMeasure(line)/2>=28);assert.ok(x+actualMeasure(line)/2<=canvas.width-28);assert.ok(y-fontSize*.8>=4);assert.ok(y+fontSize*.2<canvas.height-21);}
  sprite.material.map.dispose();sprite.material.dispose();
 }
});

test('independent bubble QA: exact picker glyph survives server emote state and chronological message arbitration',async()=>{
 const feed=fs.readFileSync(new URL('../components/DesertFeed.tsx',import.meta.url),'utf8');
 const picker=[...feed.matchAll(/\{id:'(wave|love|laugh|spin|dance)',name:'[^']+',icon:'([^']+)'\}/g)];assert.equal(picker.length,5);
 const store={room:null,visit:null,async readState(){return structuredClone({room:this.room,visit:this.visit});},async ensureRoom(r){this.room??=structuredClone(r);},async ensureVisit(_id,v){this.visit??=structuredClone(v);},async commit(_rev,room,_id,_seq,visit){this.room=structuredClone(room);if(visit)this.visit=structuredClone(visit);return true;}};
 let now=1800000000000,sequence=0;const service=createFestivalService(store,{now:()=>now});
 const command=(type,fields={})=>service.command('review',{type,sequence:++sequence,requestId:`speech-review-${sequence}`,...fields});
 await command('join',{name:'review',preset:'cat'});await command('say',{text:'earlier speech'});
 for(const[,emote,icon]of picker){now+=400;const state=await command('emote',{emote}),actor=state.participants[0];assert.equal(actor.emote,emote);assert.equal(festivalBubbleContent(actor,now),icon);assert.equal(festivalBubbleContent(actor,now+5000),'','expired newer emoji never resurrects earlier chat');}
 now+=4000;const newer=await command('say',{text:'newer speech'});assert.equal(festivalBubbleContent(newer.participants[0],now),'newer speech');
 assert.equal(festivalBubbleContent(newer.participants[0],now+8000),'');
});


test('text replacement updates measured screen size and releases only its old GPU resources',()=>{
 const contexts=[];const document={createElement:()=>{const ctx={measureText:text=>({width:measure(text)}),clearRect(){},beginPath(){},roundRect(){},fill(){},moveTo(){},lineTo(){},fillText(){}};contexts.push(ctx);return{width:0,height:0,getContext:()=>ctx};}};
 const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document});vm.runInContext(drawing,context);
 const sprite=context.draw('Hi',true),scene=new THREE.Scene();scene.add(sprite);
 const initialWidth=sprite.userData.screenSpaceText.width;let oldReleased=0,newReleased=0;
 sprite.material.addEventListener('dispose',()=>oldReleased++);sprite.material.map.addEventListener('dispose',()=>oldReleased++);
 context.replace(sprite,'你好，荒原',true);
 assert.equal(oldReleased,2);assert.ok(sprite.userData.screenSpaceText.width>initialWidth);assert.equal(sprite.userData.screenSpaceText.bottomOffset,23);
 assert.equal(sprite.material.sizeAttenuation,false);assert.equal(sprite.material.depthTest,false);
 const camera=new THREE.PerspectiveCamera(55,1,.25,1600);camera.position.z=30;camera.updateMatrixWorld();
 sprite.onBeforeRender({getViewport:v=>v.set(0,0,390,390)},scene,camera);
 assert.ok(Math.abs(sprite.scale.y*camera.projectionMatrix.elements[5]*390/2-sprite.userData.screenSpaceText.height)<1e-8);
 sprite.material.addEventListener('dispose',()=>newReleased++);sprite.material.map.addEventListener('dispose',()=>newReleased++);
 context.dispose(sprite);assert.equal(newReleased,2);assert.equal(oldReleased,2);assert.equal(scene.children.length,0);
 assert.ok(contexts.every(ctx=>ctx.fillStyle==='#44332a'&&!ctx.shadowBlur));
});

test('nickname typography stays regular, fit-width and softly shadowed with white self and pale-yellow visitors',()=>{
 for(const text of ['LX','苏贝壳','👨‍👩‍👧‍👦','长昵称'.repeat(10)])for(const self of [false,true]){
  const calls=[],ctx={measureText:text=>({width:measure(text)}),clearRect(){},fillText(...args){calls.push(args);}};
  const canvas={width:0,height:0,getContext:()=>ctx};
  const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document:{createElement:()=>canvas}});vm.runInContext(drawing,context);
  const sprite=context.draw(text,false,self);assert.equal(calls.length,1);assert.equal(calls[0].length,3,'name glyphs are never stretched to fit a plate');
  assert.equal(sprite.userData.screenSpaceText.width,canvas.width*.25);assert.equal(sprite.userData.screenSpaceText.height,20);assert.equal(sprite.userData.screenSpaceText.bottomOffset,0);
  assert.equal(calls[0][0],fitNameplateText(text,measure));assert.equal(ctx.fillStyle,self?'#fff':'#fff0cc');
  assert.match(ctx.font,/^400 48px /);assert.equal(ctx.shadowColor,'rgba(20,14,10,.45)');assert.equal(ctx.shadowBlur,6);assert.equal(ctx.shadowOffsetY,2);
  context.dispose(sprite);
 }
});

test('production text and emoji sprites are excluded from photos while nickname sprites remain visible',async()=>{
 const {captureFestivalCeremonyPhoto}=await import('../src/desert/ceremony-capture.ts');
 const ctx={measureText:text=>({width:measure(text)}),clearRect(){},beginPath(){},roundRect(){},fill(){},moveTo(){},lineTo(){},fillText(){}};
 const document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
 const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document});vm.runInContext(drawing,context);
 const name=context.draw('苏贝壳',false),text=context.draw('一起看火光',true),emoji=context.draw('🤣',true),hidden=context.draw('',true);
 hidden.visible=false;context.replace(text,'新的消息',true);context.replace(emoji,'❤️',true);
 const scene=new THREE.Scene(),live=new THREE.Camera(),renders=[];scene.add(name,text,emoji,hidden);
 const renderer={domElement:{width:390,height:758},getPixelRatio:()=>1,getViewport:target=>target.set(0,0,390,758),setViewport(){},render(_scene,camera){renders.push({live:camera===live,visible:scene.children.map(node=>node.visible)});}};
 const original=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,REALFRAME'})};
 try{
  assert.ok(captureFestivalCeremonyPhoto(renderer,scene,live,7,322000));
  assert.deepEqual(renders,[{live:false,visible:[true,false,false,false]},{live:true,visible:[true,true,true,false]}]);
  assert.deepEqual(scene.children.map(node=>node.visible),[true,true,true,false]);
 }finally{globalThis.document=original;for(const sprite of [name,text,emoji,hidden])context.dispose(sprite);}
});


test('speech ink is vertically centered in the rounded body, excluding the tail',()=>{
 for(const text of ['Hi','你好','gyp','🤣','❤️','First line\ngyp','hello world '.repeat(6),'你好\n👋']){
  const calls=[],plates=[];
  const metrics=line=>({width:measure(line),actualBoundingBoxAscent:/[\p{Extended_Pictographic}]/u.test(line)?51:/[a-z]/i.test(line)?25:29,actualBoundingBoxDescent:/[\p{Extended_Pictographic}]/u.test(line)?7:/[gyp]/.test(line)?8:2});
  const ctx={measureText:metrics,clearRect(){},beginPath(){},roundRect(...args){plates.push(args);},fill(){},moveTo(){},lineTo(){},fillText(...args){calls.push(args);}};
  const canvas={width:0,height:0,getContext:()=>ctx};
  const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document:{createElement:()=>canvas}});vm.runInContext(drawing,context);
  const sprite=context.draw(text,true);
  assert.equal(ctx.textBaseline,'alphabetic','centering uses actual glyph bounds rather than em-square middle');
  const top=Math.min(...calls.map(([line,,y])=>y-metrics(line).actualBoundingBoxAscent));
  const bottom=Math.max(...calls.map(([line,,y])=>y+metrics(line).actualBoundingBoxDescent));
  const [,bodyTop,,bodyHeight]=plates[0];
  assert.ok(Math.abs((top-bodyTop)-(bodyTop+bodyHeight-bottom))<1e-9,`${text}: equal visible top/bottom padding`);
  assert.match(ctx.font,/^400 /,'speech uses regular weight');
  context.dispose(sprite);
 }
});

test('single emoji centers asymmetric visible bounds on both axes without splitting variation selectors',()=>{
 for(const text of ['❤️','👋','🤣','💫','🪩','👨‍👩‍👧‍👦']){
  const calls=[],metrics={width:64,actualBoundingBoxLeft:23,actualBoundingBoxRight:35,actualBoundingBoxAscent:50,actualBoundingBoxDescent:8};
  const ctx={measureText:()=>metrics,clearRect(){},beginPath(){},roundRect(){},fill(){},moveTo(){},lineTo(){},fillText(...args){calls.push(args);}};
  const canvas={width:0,height:0,getContext:()=>ctx};
  const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document:{createElement:()=>canvas}});vm.runInContext(drawing,context);
  const sprite=context.draw(text,true);
  assert.equal(calls.length,1);assert.equal(calls[0][0],text);
  const [,x,y]=calls[0];
  assert.equal(x+(metrics.actualBoundingBoxRight-metrics.actualBoundingBoxLeft)/2,canvas.width/2);
  assert.equal(y+(metrics.actualBoundingBoxDescent-metrics.actualBoundingBoxAscent)/2,(canvas.height-17)/2);
  context.dispose(sprite);
 }
});

test('emoji zero, missing and non-finite metrics use finite centered font fallbacks',()=>{
 for(const broken of [{},{actualBoundingBoxLeft:0,actualBoundingBoxRight:0,actualBoundingBoxAscent:0,actualBoundingBoxDescent:0},{actualBoundingBoxLeft:NaN,actualBoundingBoxRight:Infinity,actualBoundingBoxAscent:NaN,actualBoundingBoxDescent:Infinity}]){
  const calls=[],ctx={measureText:()=>({width:64,...broken}),clearRect(){},beginPath(){},roundRect(){},fill(){},moveTo(){},lineTo(){},fillText(...args){calls.push(args);}};
  const canvas={width:0,height:0,getContext:()=>ctx};
  const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document:{createElement:()=>canvas}});vm.runInContext(drawing,context);
  const sprite=context.draw('❤️',true),[,x,y]=calls[0];
  assert.equal(x,canvas.width/2);assert.ok(Math.abs(y-((canvas.height-17)/2+64*.3))<1e-9);
  context.dispose(sprite);
 }
});

test('emoji uses painted alpha bounds when color-font metrics describe a padded bitmap',()=>{
 const calls=[],metrics={width:64,actualBoundingBoxLeft:32,actualBoundingBoxRight:32,actualBoundingBoxAscent:50,actualBoundingBoxDescent:14};
 const ctx={measureText:()=>metrics,clearRect(){},beginPath(){},roundRect(){},fill(){},moveTo(){},lineTo(){},fillText(...args){calls.push(args);}};
 const canvas={width:0,height:0,getContext:()=>ctx};let created=0;
 const probe={width:0,height:0,getContext:()=>({font:'',textAlign:'',textBaseline:'',fillText(){},getImageData:()=>{
  const data=new Uint8ClampedArray(probe.width*probe.height*4),origin=probe.width/2;
  // Painted bounds relative to the center-baseline origin: x=-25..35, y=-47..7.
  for(let y=origin-47;y<origin+7;y++)for(let x=origin-25;x<origin+35;x++)data[(y*probe.width+x)*4+3]=255;
  return {data};
 }})};
 const context=vm.createContext({THREE,configureScreenSpaceText,speechBubbleLayout,festivalBubbleContent,speechBubbleFont,nameplateLayout,fitNameplateText,document:{createElement:()=>created++?probe:canvas}});vm.runInContext(drawing,context);
 const sprite=context.draw('❤️',true),[,x,y]=calls[0];
 assert.equal(x+5,canvas.width/2);assert.equal(y-20,(canvas.height-17)/2);
 context.dispose(sprite);
});
