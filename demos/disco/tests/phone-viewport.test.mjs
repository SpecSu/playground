import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function viewportModule() {
  const url=new URL('../lib/phone-viewport.ts',import.meta.url);
  assert.equal(await readFile(url,'utf8').then(()=>true,()=>false),true,'Fixed-ratio viewport sizing must exist');
  return import(url.href);
}

test('reference screen preserves the approved 390-by-844 portrait ratio',async()=>{
  const {PHONE_SCREEN,fitPhoneViewport}=await viewportModule();
  assert.equal(PHONE_SCREEN.width,390);
  assert.equal(PHONE_SCREEN.height,844);
  const fit=fitPhoneViewport(1170,2532);
  assert.equal(fit.scale,3);
  assert.equal(fit.width/fit.height,195/422);
});

test('desktop frame fits available height with uniform x and y scaling',async()=>{
  const {fitPhoneViewport}=await viewportModule();
  const fit=fitPhoneViewport(1400,860);
  assert.equal(fit.height,860);
  assert.ok(Math.abs(fit.width-390*860/844)<1e-8);
  assert.equal(fit.scale,860/844);
});

test('narrow mobile and landscape viewports always fit without stretching or clipping',async()=>{
  const {fitPhoneViewport}=await viewportModule();
  for(const [width,height] of [[390,844],[320,568],[844,390],[280,420],[1920,1040]]){
    const fit=fitPhoneViewport(width,height);
    assert.ok(fit.width<=width+1e-8&&fit.height<=height+1e-8);
    assert.ok(Math.abs(fit.width/fit.height-195/422)<1e-12);
    assert.ok(Math.abs(fit.width/390-fit.scale)<1e-12);
    assert.ok(Math.abs(fit.height/844-fit.scale)<1e-12);
  }
});

test('unfocused fit primitive fits small containers; editable sessions use the held-scale path',async()=>{
  const {fitPhoneViewport}=await viewportModule();
  const fit=fitPhoneViewport(390,330);
  assert.equal(fit.height,330);
  assert.ok(fit.width<160);
  assert.equal(fit.scale,330/844);
});

test('unmeasured and invalid sizes cannot create negative or non-finite transforms',async()=>{
  const {fitPhoneViewport}=await viewportModule();
  for(const size of [0,-10,NaN,Infinity])assert.deepEqual(fitPhoneViewport(size,800),{scale:0,width:0,height:0});
});

test('CSS fixes the canonical screen and scrolls sheets instead of using viewport-height redesigns',async()=>{
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8') + await readFile(new URL('../components/FeedInterface.css',import.meta.url),'utf8');
  const scoped=(await readFile(new URL('../components/FeedInterface.css',import.meta.url),'utf8')).replace(/\s+/g,'');
  assert.ok(/\.feed-v020\.feed-window\{[^}]*width:390px;[^}]*height:844px;/.test(scoped));
  assert.ok(/transform:scale\(var\(--phone-scale\)\)/.test(css));
  assert.ok(/\.sheet\{[^}]*max-height:560px;[^}]*overflow-y:auto/.test(scoped));
  assert.equal(css.includes('@media(max-height:'),false,'Physical viewport height must not reflow the reference canvas');
  assert.ok(css.includes('env(safe-area-inset-top,0px)'));
  assert.ok(css.includes('env(safe-area-inset-bottom,0px)'));
});

test('unfocused fit primitive centers inside supplied visible bounds',async()=>{
  const viewport=await viewportModule();
  assert.equal(typeof viewport.fitVisiblePhoneViewport,'function');
  const fit=viewport.fitVisiblePhoneViewport({left:0,top:0,width:390,height:844},{left:0,top:0,width:390,height:330});
  assert.equal(fit.height,330);
  assert.equal(fit.offsetY,-257);
  const visualTop=(844-fit.height)/2+fit.offsetY;
  assert.equal(visualTop,0);
  assert.equal(visualTop+fit.height,330);
});

test('safe-area and panned visual bounds preserve the ratio inside their intersection',async()=>{
  const viewport=await viewportModule();
  assert.equal(typeof viewport.fitVisiblePhoneViewport,'function');
  const host={left:0,top:59,width:402,height:781};
  const fit=viewport.fitVisiblePhoneViewport(host,{left:0,top:120,width:402,height:360});
  const top=host.top+(host.height-fit.height)/2+fit.offsetY;
  assert.equal(top,120);
  assert.equal(top+fit.height,480);
  assert.ok(Math.abs(fit.width/fit.height-195/422)<1e-12);
});

test('chat keyboard preserves pre-focus scale and keeps composer in the visible safe intersection', async () => {
  const { fitChatPhoneViewport, fitVisiblePhoneViewport } = await viewportModule();
  assert.equal(typeof fitChatPhoneViewport, 'function');
  for (const [host, visible] of [
    [{left:0,top:0,width:390,height:844},{left:0,top:0,width:390,height:330}],
    [{left:0,top:0,width:390,height:330},{left:0,top:0,width:390,height:330}],
    [{left:0,top:59,width:402,height:781},{left:0,top:120,width:402,height:360}],
  ]) {
    const previous = fitVisiblePhoneViewport({...host,height:844});
    const fit = fitChatPhoneViewport(host, visible, previous);
    assert.equal(fit.scale, previous.scale);
    const top = host.top + (host.height - fit.height) / 2 + fit.offsetY;
    const composerBottom = top + Math.min(677, fit.visibleHeight - 12) * fit.scale;
    assert.ok(composerBottom <= visible.top + visible.height + 1e-9);
    assert.ok(composerBottom > visible.top + 40);
    assert.equal(fit.width/fit.height,195/422);
  }
});

test('iOS focus scroll cannot erase the scene or move the composer below the keyboard',async()=>{
 const {layoutPhoneViewport,fitChatPhoneViewport}=await viewportModule();
 const insets={left:0,top:0,right:0,bottom:0};
 const visible={left:0,top:500,width:390,height:300};
 // Old measurement: Safari scrolled the document by 500 while also panning its
 // visual viewport. The shifted client rect and offsetTop are different spaces.
 const broken=fitChatPhoneViewport({left:0,top:-500,width:390,height:844},visible,1);
 assert.equal(broken.visibleHeight,0,'fixture must reproduce the previous empty intersection');
 const fit=layoutPhoneViewport(390,844,insets,visible,true,1);
 assert.equal(fit.scale,1);assert.equal(fit.offsetY,500);assert.equal(fit.visibleHeight,300);
 const composerTop=Math.max(0,Math.min(633,fit.visibleHeight-68));
 const composerBottom=fit.offsetY+(composerTop+44)*fit.scale;
 assert.ok(composerBottom<=visible.top+visible.height);
 assert.ok(composerTop>=100,'a useful section of the live scene remains above the input');
});

test('keyboard open, pan, resize, rotation, and close stay finite and within visible bounds',async()=>{
 const {layoutPhoneViewport}=await viewportModule();
 const insets={left:0,top:0,right:0,bottom:0};
 for(const sample of [
  {w:390,h:844,v:{left:0,top:0,width:390,height:330},scale:1},
  {w:390,h:844,v:{left:0,top:270,width:390,height:330},scale:1},
  {w:390,h:844,v:{left:0,top:500,width:390,height:220},scale:1},
  {w:390,h:330,v:{left:0,top:500,width:390,height:220},scale:1},
  {w:390,h:330,v:{left:0,top:329,width:390,height:330},scale:1},
  {w:844,h:390,v:{left:0,top:0,width:844,height:140},scale:390/844},
  {w:320,h:568,v:{left:0,top:280,width:320,height:180},scale:568/844},
 ]) {
  const fit=layoutPhoneViewport(sample.w,sample.h,insets,sample.v,true,sample.scale);
  for(const number of Object.values(fit))assert.ok(Number.isFinite(number));
  assert.ok(fit.scale>0);assert.ok(fit.visibleHeight>=sample.v.height/sample.scale-1e-8);
  assert.ok(fit.offsetY>=sample.v.top);
  assert.ok(fit.offsetY+fit.visibleHeight*fit.scale<=sample.v.top+sample.v.height+1e-8);
  assert.ok(fit.offsetX>=sample.v.left);
  assert.ok(fit.offsetX+fit.width<=sample.v.left+sample.v.width+1e-8);
 }
 const closed=layoutPhoneViewport(390,844,insets,{left:0,top:0,width:390,height:844},false,1);
 assert.deepEqual(closed,{scale:1,width:390,height:844,offsetX:0,offsetY:0,visibleHeight:844});
});

test('safe-area padding and desktop centering retain canonical geometry',async()=>{
 const {layoutPhoneViewport}=await viewportModule();
 const desktop=layoutPhoneViewport(1440,900,{left:20,right:20,top:20,bottom:20},undefined,false,1);
 assert.equal(desktop.offsetY,20);assert.equal(desktop.height,860);
 assert.equal(desktop.offsetX,(1440-desktop.width)/2);
 const mobile=layoutPhoneViewport(390,844,{left:0,right:0,top:47,bottom:34},{left:0,top:300,width:390,height:330},true,763/844);
 assert.equal(mobile.offsetY,300);
 assert.ok(Math.abs(mobile.visibleHeight*mobile.scale-330)<1e-8);
});

test('fixed layout does not read scroll-shifted client bounds or resize against pinch zoom',async()=>{
 const source=await readFile(new URL('../components/PhoneViewport.tsx',import.meta.url),'utf8');
 assert.equal(source.includes('getBoundingClientRect'),false);
 assert.match(source,/visualViewport\.scale > 1\.01/);
 assert.match(source,/position: 'fixed'/);
 assert.match(source,/cancelAnimationFrame\(raf\)/);
 assert.match(source,/window\.addEventListener\('scroll'/);
});


test('pinch preserves canvas transform while keyboard resize and close update the crop',async()=>{
 const {layoutPhoneViewport,updateZoomedPhoneViewport}=await viewportModule();
 const initial=layoutPhoneViewport(390,844,{left:0,right:0,top:0,bottom:0},undefined,false,1);
 const zoomed=updateZoomedPhoneViewport(initial,{left:50,top:100,width:260,height:240},true);
 assert.equal(zoomed.scale,initial.scale);assert.equal(zoomed.width,initial.width);
 assert.equal(zoomed.offsetX,initial.offsetX);assert.equal(zoomed.offsetY,initial.offsetY);
 assert.equal(zoomed.visibleHeight,340);
 const panned=updateZoomedPhoneViewport(zoomed,{left:70,top:120,width:260,height:200},true);
 assert.equal(panned.offsetY,initial.offsetY);assert.equal(panned.visibleHeight,320);
 const closed=updateZoomedPhoneViewport(panned,{left:70,top:120,width:260,height:500},false);
 assert.equal(closed.visibleHeight,844);assert.equal(closed.scale,1);
});
