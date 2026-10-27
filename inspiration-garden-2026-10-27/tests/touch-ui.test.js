import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {renderPanel,renderContext,renderDock} from '../src/ui.js';
import * as flows from '../src/ui-state.js';
const NOW=Date.now(),fresh=()=>createState(NOW,'touch-ui');
const creation=(path='invent',parentId=null)=>({path,parentId,idea:'',error:'',reuseId:null});
test('creation is one text input and one visible crystal action without mode tabs, sample grid or parent dropdown',()=>{
 const s=fresh(),html=renderPanel(s,{panel:'create',creation:creation()},{});
 assert.equal((html.match(/<input /g)??[]).length,1);assert.equal((html.match(/data-action="confirm-create"/g)??[]).length,1);assert.match(html,/1 水晶/);assert.match(html,/离线样例/);
 assert.doesNotMatch(html,/<select|create-invent|create-remix|choose-sample|idea-chips|sample-preview|找找样例/);assert.doesNotMatch(renderDock(null),/panel-create/);
});
test('fixed-parent remix is contextual and unsupported submit yields concise no-charge result',()=>{
 assert.equal(typeof flows.newCreation,'function');assert.equal(typeof flows.resolveCreationIdea,'function');
 const s=fresh(),c=flows.newCreation('remix','radish'),html=renderPanel(s,{panel:'create',creation:c},{});assert.match(html,/改造.*白萝卜/);assert.doesNotMatch(html,/<select|create-invent/);
 const before=structuredClone(s),no=flows.resolveCreationIdea(s,c,'会煮火锅的大象');assert.equal(no.sample,null);assert.match(no.error,/未消耗水晶/);assert.deepEqual(s,before);
 const compatible=flows.resolveCreationIdea(s,c,'会说悄悄话');assert.equal(compatible.sample.id,'whisper_radish');const wrong=flows.resolveCreationIdea(s,c,'打鼓南瓜');assert.equal(wrong.sample,null);
});
test('duplicate match offers the exact existing instance variety for reuse, never a new paid identity',()=>{
 const s=reduce(fresh(),{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'touch-duplicate'},NOW).state;
 assert.equal(typeof flows.resolveCreationIdea,'function');const result=flows.resolveCreationIdea(s,creation(),'云朵提灯');assert.ok(result.reuseId);assert.equal(s.varieties[result.reuseId].artKey,'cloud_lantern');
 const html=renderPanel(s,{panel:'create',creation:{...creation(),idea:'云朵提灯',reuseId:result.reuseId}},{});assert.match(html,/data-action="reuse-seed"/);assert.doesNotMatch(html,/data-action="confirm-create"/);
});
test('growing plant context has no pack action until exact maturity and keeps the other actions unchanged',t=>{
 let time=NOW;t.mock.method(Date,'now',()=>time);
 const s=reduce(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'},NOW).state,p=s.plants[0],ui={selection:{kind:'plant',id:p.id}},world={tiles:s.tiles,plants:s.plants};
 time=p.readyAt-1;const growing=renderContext(s,ui,world);assert.doesNotMatch(growing,/data-action="pack-plant"|收好也会继续长大/);
 for(const action of ['shake-seed','sell-plant','remix'])assert.match(growing,new RegExp(`data-action="${action}"`));
 time=p.readyAt;assert.match(renderContext(s,ui,world),/data-action="pack-plant"/);
});
test('mature direct-touch context offers compact pack/shake/sell with quiet remix and no replay',()=>{
 let s=reduce(createState(NOW-60000,'touch-ui'),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'},NOW-60000).state;const p=s.plants[0];
 const html=renderContext(s,{selection:{kind:'plant',id:p.id}},{tiles:s.tiles,plants:s.plants});
 for(const action of ['pack-plant','shake-seed','sell-plant','remix'])assert.match(html,new RegExp(`data-action="${action}"`));
 assert.doesNotMatch(html,/play-plant|再玩一下/);assert.match(html,/收进背包/);assert.match(html,/摇出种子/);
 const packed=reduce(s,{type:'PACK_PLANT',plantId:p.id},NOW).state,bag=renderPanel(packed,{panel:'bag',bagTab:'plants'},{});assert.match(bag,/data-action="restore-plant"/);assert.match(bag,new RegExp(p.id));
});
test('demo exhibit detail uses a neutral source album caption and short transformation story, not sale or replay controls',()=>{
 const s=fresh(),world={tiles:[],plants:[],exhibits:[{id:'pavilion',displayName:'眼镜窗排练屋',sourceFrameId:'portrait',sourceStory:'照片里的眼镜变成了两扇会发声的窗。',interaction:'rehearsal'}]};
 const html=renderContext(s,{visitId:'music',selection:{kind:'exhibit',id:'pavilion'}},world);assert.match(html,/data-source="portrait"/);assert.match(html,/灵感相册/);assert.doesNotMatch(html,/虚构照片/);assert.match(html,/照片/);assert.doesNotMatch(html,/sell-plant|pack-plant|play-plant|再玩/);
});
test('a legacy creative whole plant that matures while packed is revealed consistently in the bag and seed details',()=>{
 let s=createState(NOW-2000000,'packed-reveal');s=reduce(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'packed-cloud'},NOW-2000000).state;const v=Object.values(s.varieties).find(v=>v.authorId===s.uid);s=reduce(s,{type:'PLANT',varietyId:v.id,tileId:'tile-0-0'},NOW-2000000).state;s={...s,plantBag:[s.plants[0]],plants:[]};
 const html=renderPanel(s,{panel:'bag',bagTab:'collection',detailId:v.id},{});assert.match(html,/data-art="cloud_lantern"/);assert.match(html,/云朵提灯/);
});
test('harvest bag sells exact instances at trusted price, disabling legacy growing sales and showing current total',t=>{
 t.mock.method(Date,'now',()=>NOW);const s=fresh(),mature={id:'packed-mature',varietyId:'radish',tileId:'removed',plantedAt:NOW-15000,readyAt:NOW},growing={...mature,id:'legacy-growing',readyAt:NOW+1};s.plantBag=[mature,growing];const html=renderPanel(s,{panel:'bag',bagTab:'plants'},{});assert.match(html,/收获 · 2/);assert.match(html,/data-action="sell-packed-plant" data-id="packed-mature"/);assert.match(html.replace(/<[^>]*>/g,'').replace(/\s+/g,' '),/卖出 \+14/);assert.match(html,/data-action="sell-packed-plant" data-id="legacy-growing" disabled/);
});
