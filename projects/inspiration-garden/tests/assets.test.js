import test from 'node:test';
import assert from 'node:assert/strict';
import {ArtAssets} from '../src/assets.js';
const manifest={atlases:{a:{image:'assets/a.png',preload:true},b:{image:'assets/b.png',preload:true},c:{image:'assets/c.png',preload:false}},sprites:{radish:{kind:'plant',image:'assets/a.png'},tomato:{kind:'plant',image:'assets/b.png'},cloud_lantern:{kind:'plant',image:'assets/c.png'}}};
async function loadWith(outcomes,options,afterLoad,avatarManifest=null){
 const oldFetch=globalThis.fetch,OldImage=globalThis.Image;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('avatar')?(avatarManifest??{default:'niulai',avatars:{niulai:{front:{image:'assets/front.png'},back:{image:'assets/back.png'},portrait:'assets/portrait.webp'},'human-kelly':{front:{image:'assets/kelly-front.png'},back:{image:'assets/kelly-back.png'},portrait:'assets/kelly-portrait.webp'}}}):manifest});
 globalThis.Image=class {set src(value){this.url=value;queueMicrotask(()=>outcomes[value]?this.onload?.():this.onerror?.());}};
 try{const assets=new ArtAssets(),result=await assets.load(options);if(afterLoad)await afterLoad(assets);return {assets,result};}finally{globalThis.fetch=oldFetch;globalThis.Image=OldImage;}
}
test('failed essential images cannot be reported ready merely because the atlas manifest is populated',async()=>{
 const {assets,result}=await loadWith({});assert.equal(assets.failures.size,5);assert.equal(result.plants,false);assert.equal(result.partial,false);
});
test('partially loaded art reports incomplete readiness while keeping successful images available',async()=>{
 const {assets,result}=await loadWith({'assets/a.png':true,'assets/front.png':true});assert.equal(result.plants,false);assert.equal(result.partial,true);assert.equal(assets.images.get('assets/a.png').ready,true);
});
test('all essential plant images ready reports normal playable artwork state',async()=>{
 const {result}=await loadWith({'assets/a.png':true,'assets/b.png':true,'assets/front.png':true,'assets/back.png':true,'assets/portrait.webp':true});assert.equal(result.plants,true);assert.equal(result.partial,true);
});

test('fresh first paint waits only for basic art and the selected original avatar, not unrelated common atlases',async()=>{
 const {assets,result}=await loadWith({'assets/a.png':true,'assets/kelly-front.png':true,'assets/kelly-back.png':true,'assets/kelly-portrait.webp':true},{requiredArtKeys:['radish'],avatarKey:'human-kelly'});
 assert.equal(result.plants,true);assert.equal(result.avatar,true);assert.deepEqual([...assets.images.keys()].sort(),['assets/a.png','assets/kelly-back.png','assets/kelly-front.png','assets/kelly-portrait.webp']);
});
test('restored creative art must complete first paint even when its atlas is explicitly lazy',async()=>{
 const {assets,result}=await loadWith({'assets/a.png':true,'assets/c.png':true,'assets/front.png':true,'assets/back.png':true,'assets/portrait.webp':true},{requiredArtKeys:['radish','cloud_lantern'],avatarKey:'niulai'});
 assert.equal(result.plants,true);assert.equal(assets.images.get('assets/c.png').ready,true);assert.equal(assets.images.has('assets/b.png'),false);
});
test('failed or missing explicitly restored art cannot yield a false-ready blank garden',async()=>{
 const failed=await loadWith({'assets/a.png':true},{requiredArtKeys:['radish','cloud_lantern']});assert.equal(failed.result.plants,false);assert.equal(failed.result.partial,true);
 const missing=await loadWith({'assets/a.png':true},{requiredArtKeys:['radish','unavailable-restored-key']});assert.equal(missing.result.plants,false);assert.deepEqual(missing.result.missingArtKeys,['unavailable-restored-key']);
});
test('required selected avatar failure is reported independently without claiming it is ready',async()=>{
 const {result}=await loadWith({'assets/a.png':true},{requiredArtKeys:['radish'],avatarKey:'human-kelly'});assert.equal(result.plants,true);assert.equal(result.avatar,false);
});

test('idle warming fetches remaining common art without making optional family art a first-paint dependency',async()=>{
 const {assets,result}=await loadWith({'assets/a.png':true,'assets/b.png':true,'assets/front.png':true,'assets/back.png':true,'assets/portrait.webp':true},{requiredArtKeys:['radish']},assets=>assets.warmSecondary());
 assert.equal(result.plants,true);assert.equal(assets.images.get('assets/b.png').ready,true);assert.equal(assets.images.has('assets/c.png'),false);
});
test('idle warm never loads optional giant or memory-building heroes before their garden is viewed',async()=>{
 manifest.sprites.pavilion={kind:'building',image:'assets/pavilion.png'};manifest.sprites.giant={kind:'plant',image:'assets/giant.png'};
 try{const {assets}=await loadWith({'assets/a.png':true},{requiredArtKeys:['radish']},a=>a.warmSecondary());assert.equal(assets.images.has('assets/pavilion.png'),false);assert.equal(assets.images.has('assets/giant.png'),false);}finally{delete manifest.sprites.pavilion;delete manifest.sprites.giant;}
});
test('fictional photo manifest and source strip are lazy and cropped from the declared source frame',async()=>{
 const previousFetch=globalThis.fetch,PreviousImage=globalThis.Image,oldDpr=globalThis.devicePixelRatio,requests=[],draws=[];
 globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({image:'assets/album/fictional.png',frames:{photo:{frame:{x:25,y:40,w:200,h:150},label:'虚构猫照片'}}})};};globalThis.Image=class{set src(value){requests.push(value);queueMicrotask(()=>this.onload());}};globalThis.devicePixelRatio=1;
 const canvas={clientWidth:100,clientHeight:75,classList:{toggle(){}},getContext:()=>({scale(){},fillRect(){},drawImage(...args){draws.push(args);}})};
 try{const a=new ArtAssets();assert.equal(requests.length,0);assert.equal(typeof a.sourceThumb,'function');a.sourceThumb(canvas,'photo');for(let i=0;i<8;i++)await Promise.resolve();a.sourceThumb(canvas,'photo');for(let i=0;i<8;i++)await Promise.resolve();a.sourceThumb(canvas,'photo');assert.equal(requests.filter(x=>x.includes('manifest')).length,1);assert.equal(requests.filter(x=>x.includes('fictional.png')).length,1);assert.deepEqual(draws.at(-1).slice(1,5),[25,40,200,150]);}
 finally{globalThis.fetch=previousFetch;globalThis.Image=PreviousImage;globalThis.devicePixelRatio=oldDpr;}
});
test('portrait fictional source card contains the entire original frame without cropping its top or bottom',()=>{
 const oldDpr=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;const drawn=[],a=new ArtAssets();a.album={image:'photo.png',frames:{friend:{frame:{x:40,y:153,w:474,h:706}}}};a.images.set('photo.png',{ready:true,image:{}});
 const canvas={clientWidth:84,clientHeight:112,classList:{toggle(){}},getContext:()=>({scale(){},fillRect(){},drawImage(...args){drawn.push(args);}})};
 try{a.sourceThumb(canvas,'friend');const [,sx,sy,sw,sh,dx,dy,dw,dh]=drawn[0];assert.deepEqual([sx,sy,sw,sh],[40,153,474,706]);assert.ok(dx>=0&&dy>=0);assert.ok(dx+dw<=84.00001);assert.ok(dy+dh<=112.00001);assert.ok(Math.abs(dw/dh-474/706)<.00001);}finally{globalThis.devicePixelRatio=oldDpr;}
});
test('selected illustrated avatar first paint needs one shared atlas, including structured portrait',async()=>{
 const cast={default:'niulai',avatars:{niulai:{front:{image:'assets/cast.png'},back:{image:'assets/cast.png'},portrait:{image:'assets/cast.png',frame:{x:0,y:0,w:100,h:100}}}}};
 const {assets,result}=await loadWith({'assets/a.png':true,'assets/cast.png':true},{requiredArtKeys:['radish']},null,cast);assert.equal(result.avatar,true);assert.deepEqual([...assets.images.keys()],['assets/a.png','assets/cast.png']);
});
test('framed portrait Canvas rendering uses its own source rect and contains the whole silhouette',()=>{
 const old=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;const a=new ArtAssets(),drawn=[];a.avatars={avatars:{niulai:{portrait:{image:'cast.png',frame:{x:200,y:50,w:80,h:100}}}}};a.images.set('cast.png',{ready:true,image:{}});const canvas={clientWidth:40,clientHeight:40,classList:{toggle(){}},getContext:()=>({scale(){},drawImage(...args){drawn.push(args);}})};
 try{assert.equal(typeof a.portraitThumb,'function');a.portraitThumb(canvas,'niulai');assert.deepEqual(drawn[0].slice(1,5),[200,50,80,100]);assert.deepEqual(drawn[0].slice(5),[4,0,32,40]);}finally{globalThis.devicePixelRatio=old;}
});
test('scene portrait fallback uses the new framed portrait when body is not ready, never a guessed old webp URL',()=>{
 const a=new ArtAssets(),drawn=[],ctx={save(){},restore(){},beginPath(){},arc(){},clip(){},drawImage(...args){drawn.push(args);}};a.avatars={avatars:{niulai:{front:{image:'body.png'},back:{image:'body.png'},portrait:{image:'atlas.png',frame:{x:300,y:10,w:100,h:100}}}}};a.images.set('body.png',{ready:false});a.images.set('atlas.png',{ready:true,image:{}});
 assert.equal(a.drawAvatar(ctx,'niulai','front',50,80),true);assert.deepEqual(drawn[0].slice(1,5),[300,10,100,100]);assert.deepEqual([...a.images.keys()],['body.png','atlas.png']);
});
test('unchanged HUD portrait canvas is not cleared or redrawn on each instrument-note render',()=>{
 const old=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;const a=new ArtAssets();a.avatars={avatars:{niulai:{portrait:{image:'cast.png',frame:{x:0,y:0,w:50,h:50}}}}};a.images.set('cast.png',{ready:true,image:{}});let draws=0,resizes=0;const canvas={clientWidth:40,clientHeight:40,set width(v){resizes++;this._width=v;},get width(){return this._width;},set height(v){resizes++;this._height=v;},get height(){return this._height;},classList:{toggle(){}},getContext:()=>({scale(){},drawImage(){draws++;}})};
 try{for(let i=0;i<20;i++)a.portraitThumb(canvas,'niulai');assert.equal(draws,1);assert.equal(resizes,2);canvas.clientWidth=50;a.portraitThumb(canvas,'niulai');assert.equal(draws,2);}finally{globalThis.devicePixelRatio=old;}
});
test('resident-overlap alpha probe samples exactly one already-loaded sprite pixel, never loads artwork or throws on unavailable readback',()=>{const old=globalThis.OffscreenCanvas,calls=[];globalThis.OffscreenCanvas=class{constructor(w,h){assert.equal(w,1);assert.equal(h,1);}getContext(){return {clearRect(){},drawImage(...args){calls.push(args);},getImageData(){return {data:[10,20,30,0]};}};}};try{const a=new ArtAssets();a.manifest={sprites:{test:{image:'x.png',frame:{x:20,y:30,w:100,h:200}}}};a.images.set('x.png',{ready:true,image:{}});assert.equal(a.spriteAlphaAt('test',.5,.25),0);assert.deepEqual(calls[0].slice(1),[70,80,1,1,0,0,1,1]);assert.equal(a.spriteAlphaAt('test',-1,.2),0);assert.equal(a.spriteAlphaAt('missing',.5,.5),null);a.images.get('x.png').ready=false;assert.equal(a.spriteAlphaAt('test',.5,.5),null);assert.equal(a.images.size,1);}finally{if(old===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=old;}});
test('host body alpha uses the requested front/back frame and does not mistake a transparent portrait or unloaded art for visible body',()=>{const old=globalThis.OffscreenCanvas,calls=[];globalThis.OffscreenCanvas=class{getContext(){return {clearRect(){},drawImage(...args){calls.push(args);},getImageData(){return {data:[0,0,0,255]};}};}};try{const a=new ArtAssets();a.avatars={avatars:{kelly:{front:{image:'body',frame:{x:10,y:20,w:100,h:200}},back:{image:'body',frame:{x:300,y:40,w:80,h:160}},portrait:{image:'portrait'}}}};a.images.set('body',{ready:true,image:{}});assert.equal(a.avatarAlphaAt('kelly','back',.4,.45),255);assert.deepEqual(calls[0].slice(1),[332,112,1,1,0,0,1,1]);assert.equal(a.avatarAlphaAt('unknown','front',.4,.45),null);}finally{if(old===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=old;}});
test('idle warming fetches only lightweight friend portraits, never their whole body atlases or optional island art',async()=>{const cast={default:'niulai',avatars:{niulai:{front:{image:'assets/front.png'},back:{image:'assets/back.png'},portrait:'assets/portrait.webp'},'human-kelly':{front:{image:'assets/large-kelly.png'},back:{image:'assets/large-kelly.png'},portrait:{image:'assets/large-kelly.png'},portraitPreview:{image:'assets/tiny-kelly.webp'}}}};const {assets}=await loadWith({'assets/a.png':true,'assets/front.png':true,'assets/back.png':true,'assets/portrait.webp':true,'assets/tiny-kelly.webp':true},{requiredArtKeys:['radish']},a=>a.warmSecondary(),cast);assert.ok(assets.images.has('assets/tiny-kelly.webp'));assert.equal(assets.images.has('assets/large-kelly.png'),false);assert.equal(assets.images.has('assets/c.png'),false);});
