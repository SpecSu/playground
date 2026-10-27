import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPanel} from '../src/ui.js';
import {createState} from '../src/state.js';
import {newCreation,newBlueprintCreation} from '../src/ui-state.js';

test('both creators expose a small local photo picker directly after the idea form',()=>{
 const state=createState(1,'photo-ui');
 for(const panel of ['create','blueprint-create']){
  const html=renderPanel(state,{panel,creation:newCreation(),blueprintCreation:newBlueprintCreation()},{});
  assert.match(html,/<\/form><div class="creation-photo/);
  assert.match(html,/data-action="creation-photo-add"/);
  assert.match(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),/id="creation-photo-input" type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
  assert.doesNotMatch(html,/type="file"/);
  assert.match(html,/＋ 添加照片/);
 }
});

const module=await import('../src/creation-photo.js').catch(()=>({}));
const fixture=()=>{assert.equal(typeof module.createCreationPhoto,'function');let next=0,changes=0;const revoked=[],waiters=[];const view=module.createCreationPhoto({createURL:()=>`blob:photo-${++next}`,revokeURL:url=>revoked.push(url),decode:()=>new Promise((resolve,reject)=>waiters.push({resolve,reject})),onChange:()=>changes++});view.sync('create');return {view,revoked,waiters,changes:()=>changes};};
const file=(type='image/jpeg',size=1024)=>({type,size,name:'my cat.jpg'});
test('photo is local ephemeral and cancel keeps prior selection',async()=>{const h=fixture(),p=h.view.select(file());h.waiters[0].resolve({width:100,height:80});assert.equal(await p,true);assert.equal(h.view.snapshot().url,'blob:photo-1');await h.view.select(null);assert.equal(h.view.snapshot().url,'blob:photo-1');h.view.sync('create');assert.equal(h.view.snapshot().url,'blob:photo-1');h.view.sync('blueprint-create');assert.equal(h.view.snapshot().url,null);assert.deepEqual(h.revoked,['blob:photo-1']);});
test('replacement releases old URL only after successful load; errors preserve selected preview',async()=>{const h=fixture();let p=h.view.select(file());h.waiters[0].resolve({width:100,height:80});await p;p=h.view.select(file());h.waiters[1].reject(Error('bad'));assert.equal(await p,false);assert.equal(h.view.snapshot().url,'blob:photo-1');p=h.view.select(file());h.waiters[2].resolve({width:100,height:80});await p;assert.equal(h.view.snapshot().url,'blob:photo-3');assert.deepEqual(h.revoked,['blob:photo-2','blob:photo-1']);});
test('remove, close, and newer selection invalidate pending image callbacks',async()=>{const h=fixture();let p=h.view.select(file());h.view.remove();h.waiters[0].resolve({width:100,height:80});assert.equal(await p,false);assert.equal(h.view.snapshot().url,null);p=h.view.select(file());h.view.sync(null);h.waiters[1].resolve({width:100,height:80});assert.equal(await p,false);h.view.sync('blueprint-create');const a=h.view.select(file()),b=h.view.select(file());h.waiters[3].resolve({width:100,height:80});await b;h.waiters[2].resolve({width:100,height:80});await a;assert.equal(h.view.snapshot().url,'blob:photo-4');assert.deepEqual(h.revoked,['blob:photo-1','blob:photo-2','blob:photo-3']);});
test('unsupported, empty, oversized and corrupt dimensions rejected without persistent state',async()=>{const h=fixture();for(const f of [file('image/svg+xml'),file('image/heic'),file('image/jpeg',0),file('image/png',11*1024*1024)])assert.equal(await h.view.select(f),false);assert.equal(h.waiters.length,0);const p=h.view.select(file());h.waiters[0].resolve({width:9000,height:9000});assert.equal(await p,false);assert.equal(h.view.snapshot().url,null);assert.deepEqual(h.revoked,['blob:photo-1']);});
test('selected photo renders escaped accessible preview with local-only explanation',()=>{const html=renderPanel(createState(1,'photo-ui'),{panel:'create',creation:newCreation(),creationPhoto:{url:'blob:test',name:'<cat>',loading:false}},{});assert.match(html,/<img[^>]*src="blob:test"[^>]*alt="所选照片预览"/);assert.match(html,/更换照片/);assert.match(html,/移除照片/);assert.match(html,/仅本地预览/);assert.doesNotMatch(html,/<cat>/);});
test('file-picker tickets reject late return after a creator was closed and reopened',async()=>{const h=fixture();assert.equal(typeof h.view.pickToken,'function');const ticket=h.view.pickToken();h.view.sync(null);h.view.sync('create');assert.equal(await h.view.select(file(),ticket),false);assert.equal(h.waiters.length,0);});
test('browser decoder uses local Image dimensions and clears handlers on load or failure',async()=>{
 const original=globalThis.Image;const images=[];globalThis.Image=class{constructor(){images.push(this);}set src(value){this.source=value;}};
 try{const loaded=module.decodeLocalPhoto('blob:local');const image=images[0];assert.equal(image.source,'blob:local');image.naturalWidth=120;image.naturalHeight=90;image.onload();assert.deepEqual(await loaded,{width:120,height:90});assert.equal(image.source,'');assert.equal(image.onload,null);assert.equal(image.onerror,null);
 const failed=module.decodeLocalPhoto('blob:corrupt');images[1].onerror();await assert.rejects(failed,/Invalid image/);assert.equal(images[1].source,'');}finally{if(original===undefined)delete globalThis.Image;else globalThis.Image=original;}
});
