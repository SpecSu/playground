import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {renderPanel,renderContext,renderMode,esc} from '../src/ui.js';
const NOW=Date.now();const state=()=>createState(NOW,'ui-visitor');
const ui=()=>({panel:'shop',bagTab:'seeds',detailId:null,visitId:null,mode:null,selection:null,creation:{path:'invent',sampleId:'cloud_lantern',parentId:'radish',idea:'',matches:null,searched:false}});
test('shop exposes unlocked seeds rather than leaking future base names',()=>{
 const html=renderPanel(state(),ui(),{});assert.match(html,/白萝卜/);assert.match(html,/小番茄/);assert.doesNotMatch(html,/奶油蘑菇|向日葵/);
});
test('unrevealed created seed stays sealed while still offering actionable planting',()=>{
 const s=reduce(state(),{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'ui-create'},NOW).state;
 const u={...ui(),panel:'bag'};const html=renderPanel(s,u,{});assert.match(html,/待揭晓/);assert.match(html,/data-action="choose-seed"/);assert.doesNotMatch(html,/data-art="cloud_lantern"/);
});
test('author text is escaped before entering delivered HTML',()=>{
 const s=state(),v={...s.varieties.radish,id:'custom',kind:'creative',authorId:'other',authorName:'<img src=x onerror=bad()>',name:'<b>seed</b>',artKey:'radish'};
 s.varieties.custom=v;s.inventory.custom=1;s.discovered.push('custom');const html=renderPanel(s,{...ui(),panel:'bag',bagTab:'collection'},{});
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.equal(esc('"<&'), '&quot;&lt;&amp;');
});
test('mature home resident offers whole-plant sale while growing crop has disabled premature sale',()=>{
 let s=reduce(state(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'},NOW).state;
 const u={...ui(),selection:{kind:'plant',id:s.plants[0].id}},world={tiles:s.tiles,plants:s.plants};
 assert.match(renderContext(s,u,world),/data-action="sell-plant"[^>]*disabled/);
 s.plants[0].readyAt=NOW-1;assert.doesNotMatch(renderContext(s,u,world),/data-action="play-plant"/);assert.match(renderContext(s,u,world).replace(/<[^>]*>/g,'').replace(/\s+/g,' '),/卖出 \+14/);
});
test('simple creation makes offline matching and the exact current balance explicit',()=>{
 const html=renderPanel({...state(),crystals:0},{...ui(),panel:'create'},{});assert.match(html,/离线样例/);assert.match(html,/(?:不是|非)实时 AI/);assert.match(html,/剩余 0 颗/);assert.match(html,/成功才扣除/);
});
test('creative confirmation and cost live outside scrolling content so narrow-screen action stays visible',()=>{
 const html=renderPanel(state(),{...ui(),panel:'create'},{});const scrollEnd=html.indexOf('</div><footer class="tray-footer"');
 assert.ok(scrollEnd>0);assert.ok(html.indexOf('data-action="confirm-create"')>scrollEnd);
 const invent=renderPanel(state(),{...ui(),panel:'create'},{});assert.match(invent,/placeholder="比如：会漂浮的云朵灯"/);
});
import {resolveCreationIdea,newCreation} from '../src/ui-state.js';
test('new contextual entry clears a previous unsupported submission without retaining a stale charge choice',()=>{
 const selected=newCreation('invent');assert.equal(selected.error,'');assert.equal(selected.reuseId,null);assert.equal(selected.parentId,null);
 const html=renderPanel(state(),{...ui(),panel:'create',creation:selected},{});assert.doesNotMatch(html,/这个想法还不在/);assert.match(html,/data-action="confirm-create"/);
});
test('remix UI lists only compatible family and explains when a known resident has no further offline direction',()=>{
 const s=state(),u={...ui(),panel:'create',creation:{...ui().creation,path:'remix',parentId:'radish',sampleId:null}};
 const html=renderPanel(s,u,{});assert.match(html,/悄悄话萝卜/);assert.doesNotMatch(html,/data-id="drum_pumpkin"/);
 const created=reduce(s,{type:'CREATE_VARIETY',sampleId:'whisper_radish',parentId:'radish',requestId:'whisper-ui'},NOW).state,v=Object.values(created.varieties).find(v=>v.authorId===created.uid);
 const none=renderPanel(created,{...u,creation:{...u.creation,parentId:v.id}},{});assert.match(none,/暂无更多离线改造方向/);assert.doesNotMatch(none,/用 1 颗水晶，创造一颗新种子/);
});
test('existing personal sample preview offers coin-seed reuse instead of another crystal confirmation',()=>{
 const s=reduce(state(),{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'owned-ui'},NOW).state;
 const match=resolveCreationIdea(s,newCreation(),'云朵提灯'),html=renderPanel(s,{...ui(),panel:'create',creation:{...newCreation(),idea:'云朵提灯',reuseId:match.reuseId}},{});assert.match(html,/这个离线样例你已经有了，可以直接再种/);assert.match(html,/data-action="reuse-seed"/);assert.doesNotMatch(html,/data-action="confirm-create"/);
});
test('first plot and growth wait offer the existing friend-garden route without forced onboarding',()=>{
 const s=state(),initial=renderContext(s,{...ui(),selection:{kind:'tile',id:'tile-0-0'}},{tiles:s.tiles,plants:s.plants});assert.match(initial,/data-action="panel-visit"/);assert.match(initial,/先去朋友家/);
 const growing=reduce(s,{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'},NOW).state;const html=renderContext(growing,{...ui(),selection:{kind:'plant',id:growing.plants[0].id}},{tiles:growing.tiles,plants:growing.plants});assert.match(html,/去朋友花园看看/);
});
test('reusing an owned sample never pretends to relabel its existing provenance to the newly selected parent',()=>{
 let s=state();s=reduce(s,{type:'CREATE_VARIETY',sampleId:'painter_tomato',requestId:'paint-owned'},NOW).state;
 const parent={...s.varieties.tomato,id:'foreign-tomato',kind:'creative',artKey:'puffer_tomato',interaction:'puff',authorId:'foreign',authorName:'朋友原作者',parentId:null,rootId:'foreign-tomato'};s.varieties[parent.id]=parent;s.discovered.push(parent.id);
 const match=resolveCreationIdea(s,newCreation('remix',parent.id),'调色盘番茄'),c={...newCreation('remix',parent.id),idea:'调色盘番茄',reuseId:match.reuseId};const html=renderPanel(s,{...ui(),panel:'create',creation:c},{});
 assert.match(html,/保留已有品种原来的作者与来源/);assert.doesNotMatch(html,/保留 朋友原作者 的来源署名/);
});

test('only own growing countdown exposes the demo shortcut, never the entire plant or friend countdown',()=>{
 const old=Date.now;Date.now=()=>NOW;try{let s=reduce(createState(NOW,'growth-hint'),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'},NOW).state;const p=s.plants[0],u={selection:{kind:'plant',id:p.id},visitId:null},world={plants:s.plants};
 assert.match(renderContext(s,u,world),/data-growth-plant=/);assert.match(renderContext(s,u,world),/双击倒计时，演示立即成熟/);
 s.plants[0].readyAt=NOW;assert.doesNotMatch(renderContext(s,u,world),/data-growth-plant=/);
 s.plants[0].readyAt=NOW+10000;assert.doesNotMatch(renderContext(s,{...u,visitId:'friend'},world),/data-growth-plant=/);
 }finally{Date.now=old;}
});
