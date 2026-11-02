import test from 'node:test';import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';import {renderPanel} from '../src/ui.js';import {matchBuildingIdeas,DEMO_BLUEPRINTS} from '../src/blueprints.js';import * as flow from '../src/ui-state.js';
const fresh=()=>createState(Date.now(),'polish-ui');
const exact=flow.BUILDING_EXAMPLES.map(e=>e.text);
test('building dice fills only exact supported examples, never repeats immediately and excludes identical remix parent',()=>{
 assert.equal(typeof flow.rollBuildingExample,'function');const s=fresh(),before=structuredClone(s);let c={parentId:null,idea:'',error:'old',reuseId:'old'},last=null;for(let i=0;i<20;i++){c=flow.rollBuildingExample(s,c,()=>0);assert.ok(exact.includes(c.idea));assert.notEqual(c.idea,last);assert.ok(matchBuildingIdeas(c.idea).length);assert.equal(c.error,'');assert.equal(c.reuseId,null);last=c.idea;}assert.deepEqual(s,before);
 const parent=Object.values(DEMO_BLUEPRINTS).find(b=>b.sampleId==='calico_reading_den');c={parentId:parent.id,idea:''};for(let i=0;i<10;i++){c=flow.rollBuildingExample(s,c,()=>0);assert.notEqual(matchBuildingIdeas(c.idea)[0].id,parent.sampleId);}
});
test('empty building idea differs from unsupported and points to dice without charging',()=>{
 const s=fresh(),c={parentId:null};const empty=flow.resolveBlueprintIdea(s,c,''),unsupported=flow.resolveBlueprintIdea(s,c,'火锅大象');assert.notEqual(empty.error,unsupported.error);assert.match(empty.error,/🎲/);assert.equal(empty.sample,null);assert.equal(s.crystals,3);
});
test('normal bag has seed and plant tabs with all known seeds, positive stock first, zero stock honest and detail reachable',()=>{
 const s=fresh(),html=renderPanel(s,{panel:'bag',bagTab:'seeds'},{});assert.equal((html.match(/data-action="bag-tab-/g)??[]).length,2);assert.doesNotMatch(html,/种子册|bag-tab-collection|已用完/);assert.match(html,/库存 0/);assert.match(html,/data-action="detail"/);assert.match(html,/data-action="buy-seed"/);assert.ok(html.indexOf('data-id="radish"')<html.indexOf('data-id="tomato"'));assert.doesNotMatch(html,/向日葵|奶油蘑菇/);
});
test('zero-stock friend variety routes to its source and unrevealed personal seed remains sealed',()=>{
 let s=fresh();s=reduce(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'sealed'},Date.now()).state;const own=Object.values(s.varieties).find(v=>v.authorId===s.uid);s.inventory[own.id]=0;const friend={...own,id:'friend-variety',authorId:'friend',authorName:'朋友',artKey:'puffer_tomato',interaction:'puff'};s.varieties[friend.id]=friend;s.inventory[friend.id]=0;s.discovered.push(friend.id);const html=renderPanel(s,{panel:'bag',bagTab:'seeds'},{});assert.match(html,/data-action="visit-seed-source"/);assert.doesNotMatch(html,/data-art="cloud_lantern"/);assert.match(html,/data-action="detail"/);
});
test('stocked seed card is one native whole-content plant button with an independent sibling detail action',()=>{
 const html=renderPanel(fresh(),{panel:'bag',bagTab:'seeds'},{}),stocked=html.match(/<div class="item-card seed-card has-stock[^\"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];assert.ok(stocked);
 const main=stocked.match(/<button type="button" class="seed-main" data-action="choose-seed"[^>]*data-id="radish"[^>]*>([\s\S]*?)<\/button>/);assert.ok(main);assert.match(main[0],/aria-label="种下白萝卜，现有2颗"/);assert.match(main[1],/data-art="radish"/);assert.match(main[1],/×2/);assert.match(main[1],/白萝卜/);assert.match(main[1],/种下/);
 assert.doesNotMatch(main[1],/<button|data-action="detail"/);assert.match(stocked.slice(stocked.indexOf(main[0])+main[0].length),/data-action="detail"/);
 const zero=html.match(/<div class="item-card seed-card no-stock[^\"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];assert.ok(zero);assert.match(zero,/库存 0/);assert.match(zero,/data-action="buy-seed"/);assert.doesNotMatch(zero,/data-action="choose-seed"|seed-main/);
 let depth=0;for(const token of html.match(/<\/?button\b[^>]*>/g)??[]){if(token.startsWith('</'))depth--;else{assert.equal(depth,0,'native buttons must not nest');depth++;}}assert.equal(depth,0);
});
test('bag stock color contrast follows positive count, while new creative artwork remains sealed',async()=>{
 const fs=await import('node:fs');const css=fs.readFileSync('styles.css','utf8');assert.match(css,/\.seed-card\.has-stock\{[^}]*background:#dcebc4[^}]*border-color:#bace9e/);assert.match(css,/\.seed-card\.no-stock\{[^}]*background:#ece9e2[^}]*border-color:#dfdbd1/);assert.match(css,/\.seed-main\{[^}]*width:100%[^}]*flex:1/);
 let s=reduce(fresh(),{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'card-sealed'},Date.now()).state;let html=renderPanel(s,{panel:'bag',bagTab:'seeds'},{});assert.match(html,/seed-card has-stock is-new/);assert.doesNotMatch(html,/data-art="cloud_lantern"/);
 const v=Object.values(s.varieties).find(v=>v.authorId===s.uid);s.inventory[v.id]=0;html=renderPanel(s,{panel:'bag',bagTab:'seeds'},{});assert.match(html,/seed-card no-stock is-new/);assert.doesNotMatch(html,/data-art="cloud_lantern"/);
});
test('three primary entries lead with planting and its fixed seed action rail opens original creation with explicit1crystal',async()=>{
 const {renderDock}=await import('../src/ui.js'),dock=renderDock(null);assert.equal((dock.match(/data-action="panel-/g)??[]).length,3);assert.ok(dock.indexOf('panel-bag')<dock.indexOf('panel-build'));assert.ok(dock.indexOf('panel-build')<dock.indexOf('panel-visit'));assert.doesNotMatch(dock,/panel-shop|panel-create/);assert.match(dock,/>种植</);
 const s={...fresh(),crystals:0},bag=renderPanel(s,{panel:'bag',bagTab:'seeds'},{});assert.match(bag,/data-action="panel-create"/);assert.match(bag,/创造新种子/);assert.match(bag,/1 水晶/);assert.ok(bag.indexOf('data-action="panel-create"')>bag.indexOf('<div class="tray-content">'));assert.equal((bag.match(/data-action="panel-create"/g)??[]).length,1);assert.match(renderPanel(s,{panel:'shop'},{}),/我的种植/);
});
test('buyable stocked cards offer a separate +1 without a purchase confirmation rail',()=>{
 const s=fresh(),normal=renderPanel(s,{panel:'bag',bagTab:'seeds'},{});const main=normal.match(/class="seed-main"[^>]*>[\s\S]*?<\/button>/)[0];assert.doesNotMatch(main,/buy-seed/);assert.match(normal,/data-action="buy-seed" data-id="radish"/);
 const session=renderPanel(s,{panel:'bag',bagTab:'seeds',purchaseSession:{varietyId:'radish'}},{});assert.doesNotMatch(session,/inert|repeat-buy-seed|finish-purchase|purchase-rail/);assert.match(session,/data-action="buy-seed" data-id="radish"/);
});
