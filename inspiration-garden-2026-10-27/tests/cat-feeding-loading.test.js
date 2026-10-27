import test from 'node:test';import assert from 'node:assert/strict';import {ArtAssets} from '../src/assets.js';
test('cat queue waits for assets and coalesces taps into one fresh complete sequence',async()=>{
 const mod=await import('../src/cat-feeding-queue.js').catch(()=>({}));assert.equal(typeof mod.createCatFeedingQueue,'function');let finish,at=100,loads=0;const played=[],status=[],queue=mod.createCatFeedingQueue({load:()=>{loads++;return new Promise(r=>finish=r);},clock:()=>at,onReady:(id,time)=>played.push([id,time]),onStatus:(id,phase)=>status.push([id,phase])});queue.request('cat');queue.request('cat');assert.equal(loads,1);assert.deepEqual(played,[]);at=2200;finish(true);await Promise.resolve();await Promise.resolve();assert.deepEqual(played,[['cat',2200]]);assert.equal(status[0][1],'loading');
});
test('cat loading failure is retryable but cancelled, removed, hidden and disposed queues never replay',async()=>{
 const mod=await import('../src/cat-feeding-queue.js').catch(()=>({}));assert.equal(typeof mod.createCatFeedingQueue,'function');let finish;const played=[],statuses=[],queue=mod.createCatFeedingQueue({load:()=>new Promise(r=>finish=r),clock:()=>500,onReady:id=>played.push(id),onStatus:(id,phase)=>statuses.push(phase)});queue.request('cat');finish(false);await Promise.resolve();await Promise.resolve();assert.ok(statuses.includes('failed'));queue.request('cat');queue.cancel();finish(true);await Promise.resolve();await Promise.resolve();assert.deepEqual(played,[]);queue.request('cat');queue.retain(new Set());finish(true);await Promise.resolve();await Promise.resolve();assert.deepEqual(played,[]);queue.request('cat');queue.dispose();finish(true);await Promise.resolve();await Promise.resolve();queue.request('cat');assert.deepEqual(played,[]);
});
test('cat interaction atlas retries only on explicit request, and is ready only when face and fish both loaded',async()=>{
 const a=new ArtAssets();a.manifest={sprites:{cat_feed_anticipation:{image:'face'},cat_feed_fish:{image:'fish'}}};assert.equal(typeof a.interactionReady,'function');assert.equal(a.interactionReady('fluffy_cat_cottage'),false);const calls=[];a.loadImage=async(path,options)=>{calls.push([path,options]);const ready=!!options?.retry;a.images.set(path,{ready,status:ready?'ready':'failed'});return ready?{}:null;};assert.equal(await a.requestInteraction('fluffy_cat_cottage'),false);assert.equal(await a.requestInteraction('fluffy_cat_cottage'),false);assert.equal(calls.length,2);assert.equal(await a.requestInteraction('fluffy_cat_cottage',{retry:true}),true);assert.equal(calls.length,4);assert.equal(a.interactionReady('fluffy_cat_cottage'),true);
});
test('restored-cat prewarm before manifest loading cannot poison later real image loading or explicit retry',async()=>{
 const {readFileSync}=await import('node:fs'),manifest=JSON.parse(readFileSync('assets/art-manifest.json')),requested=[],oldFetch=globalThis.fetch;
 // Only the browser transport/decode boundary is substituted: use real load(), requestInteraction() and loadImage().
 class LoadedImage{set src(value){this.url=value;requested.push(value);queueMicrotask(()=>this.onload());}}
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url.replace(/^\.\//,'')))});
 try{
  const a=new ArtAssets(()=>{},{ImageCtor:LoadedImage});assert.equal(await a.requestInteraction('fluffy_cat_cottage'),false);assert.equal(a.images.size,0);
  await a.load({requiredArtKeys:['radish','fluffy_cat_cottage'],avatarKey:'human-subeike'});
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.equal(a.interactionReady('fluffy_cat_cottage'),true,'startup prewarm resumes once the manifest exists');
  assert.equal(await a.requestInteraction('fluffy_cat_cottage',{retry:true}),true);
  for(const key of ['cat_feed_anticipation','cat_feed_fish'])assert.equal(requested.filter(src=>src===manifest.sprites[key].image).length,1);
 }finally{globalThis.fetch=oldFetch;}
});
test('ordinary startup without a visible-cat prewarm keeps the cat face and fish lazy',async()=>{
 const {readFileSync}=await import('node:fs'),requested=[],oldFetch=globalThis.fetch;
 class LoadedImage{set src(value){requested.push(value);queueMicrotask(()=>this.onload());}}
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url.replace(/^\.\//,'')))});
 try{const a=new ArtAssets(()=>{},{ImageCtor:LoadedImage});await a.load({requiredArtKeys:['radish'],avatarKey:'human-subeike'});assert.equal(requested.some(src=>/cat-feeding|fish-treat/.test(src)),false);}finally{globalThis.fetch=oldFetch;}
});
