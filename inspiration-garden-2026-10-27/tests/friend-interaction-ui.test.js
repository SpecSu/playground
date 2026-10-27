import test from 'node:test';import assert from 'node:assert/strict';import {createState} from '../src/state.js';import {renderContext,renderPanel,renderPhotoContent} from '../src/ui.js';import {DEMO_GARDENS} from '../src/catalogue.js';
const s=createState(Date.now()),g=DEMO_GARDENS.find(g=>g.id==='demo-kelly-music'),session={gardenId:g.id,residentId:g.hostId,name:'Kelly',nonce:1,ready:true};
test('selected actual host context offers only selfie and gifting, with local demo meaning',()=>{const html=renderContext(s,{visitId:g.id,friendSession:session,selection:{kind:'resident',id:g.hostId}},g);assert.match(html,/data-action="friend-photo"/);assert.match(html,/data-action="friend-gift"/);assert.doesNotMatch(html,/打招呼|一起逛|sell|shake|remix|confirm-gift/);assert.match(html,/示范/);});
test('gift picker seals unknown seed art and has explicit recipient and deduction disclosure before send',()=>{const html=renderPanel(s,{panel:'gift',friendSession:session,giftTab:'seeds',giftSelection:{kind:'seed',id:'radish'}},{});assert.match(html,/送给 Kelly/);assert.match(html,/扣除本机库存/);assert.match(html,/不会.*真实好友/);assert.match(html,/data-action="confirm-gift"/);assert.match(html,/送出 1 颗/);assert.doesNotMatch(html,/水晶.*送出|金币.*送出/);});
test('photo caption shows only fixed Su and the selected friend across all preview states',()=>{
 for(const name of ['Kelly','Bear熊','吉吉','LX'])for(const status of ['loading','ready','error']){
  const html=renderPhotoContent({friendSession:{...session,name},photoState:{status,previewURL:'blob:local',error:'请重试'}});
  assert.equal(html.match(/<p class="offline-note">(.*?)<\/p>/)?.[1],`苏贝壳 × ${name}`);
  assert.doesNotMatch(html,/固定主角|未接实时生成|非当前角色实时拍摄|截图成功|拍摄成功/);
 }
});
test('photo caption escapes the selected friend name without adding markup',()=>{
 const html=renderPhotoContent({friendSession:{name:'<LX> & Kelly'},photoState:{status:'loading'}});
 assert.equal(html.match(/<p class="offline-note">(.*?)<\/p>/)?.[1],'苏贝壳 × &lt;LX&gt; &amp; Kelly');
});
test('photo alone has contained non-scrolling preview with a reserved native save footer and stable close',async()=>{const html=renderPanel(s,{panel:'photo',friendSession:session,photoState:{status:'ready',previewURL:'blob:local'}},{});assert.match(html,/id="photo-view"/);const content=html.slice(html.indexOf('id="photo-view"'),html.indexOf('<footer'));assert.doesNotMatch(content,/data-action="photo-download"/);assert.match(html,/<footer class="tray-footer photo-footer">/);assert.match(html,/id="photo-download"/);assert.ok(html.indexOf('data-action="photo-download"')>html.indexOf('<footer'));assert.match(html,/data-action="close-panel"/);const css=await (await import('node:fs/promises')).readFile('styles.css','utf8');assert.match(css,/#tray\[data-panel="photo"\]\{[^}]*72dvh/);assert.match(css,/#tray\[data-panel="photo"\] \.offline-selfie\{[^}]*object-fit:contain/);assert.match(css,/#tray\[data-panel="photo"\] \.tray-content\{[^}]*overflow:hidden/);});

test('memorial date is clear beneath names for all friends and stays on the opening Beijing day',()=>{
 const before=Date.parse('2026-10-27T15:59:59.999Z'),after=before+1;
 for(const name of ['Kelly','Bear熊','吉吉','LX'])for(const status of ['loading','ready','error']){
  const html=renderPhotoContent({friendSession:{name},photoState:{status,openedAt:before,previewURL:'blob:local',error:'请重试'}});
  assert.match(html,/<time class="photo-memorial-date" datetime="2026-10-27">2026年10月27日<\/time>/);
  assert.ok(html.indexOf(`苏贝壳 × ${name}`)<html.indexOf('<time'));
  assert.doesNotMatch(html,/固定主角|未接实时生成|非当前角色实时拍摄/);
 }
 assert.match(renderPhotoContent({photoState:{openedAt:after}}),/2026年10月28日/);
 for(const openedAt of [undefined,null,NaN,Infinity,'<script>',9e20])assert.doesNotMatch(renderPhotoContent({photoState:{openedAt}}),/<time|Invalid Date|NaN|<script>/);
});
