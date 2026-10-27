import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {renderPanel,renderContext} from '../src/ui.js';
import {getBlueprint,DEMO_BLUEPRINTS} from '../src/blueprints.js';
const NOW=Date.now(),fresh=()=>{const s=createState(NOW,'blueprint-ui');s.tiles.push({id:'outside',x:0,y:2,kind:'land'});s.avatarTileId='outside';return s;};
test('build has dedicated blueprint entrance and one-input creator discloses both1crystal and60coin stages',()=>{
 const s=fresh(),build=renderPanel(s,{panel:'build'},{});assert.match(build,/data-action="blueprint-create"/);
 const html=renderPanel(s,{panel:'blueprint-create',blueprintCreation:{idea:'',parentId:null}},{});assert.equal((html.match(/<input /g)??[]).length,1);assert.match(html,/1 水晶/);assert.match(html,/60 金币/);assert.match(html,/永久图纸/);assert.match(html,/离线样例/);assert.doesNotMatch(html,/create-remix|<select|choose-sample/);
 assert.doesNotMatch(renderPanel(s,{panel:'create',creation:{path:'invent',idea:''}},{}),/blueprint-create|建筑.*植物|植物.*建筑/);
});
test('owned blueprint collection and legacy building recovery are distinct and retain source lineage',()=>{
 let s=reduce(fresh(),{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'ui-blueprint'},NOW).state;const id=Object.keys(s.blueprints)[0];assert.match(renderPanel(s,{panel:'build'},{}),/data-action="choose-blueprint"/);s=reduce(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'},NOW).state;s={...s,lastSeenAt:NOW+15000,buildingBag:s.buildings,buildings:[]};const bag=renderPanel(s,{panel:'build'},{});assert.match(bag,/data-action="restore-building"/);assert.doesNotMatch(bag.split('待安置建筑')[1],/data-action="choose-blueprint"/);
});
test('personal building context offers paid move/demolition/remix; demo never offers economic actions',()=>{
 const s=fresh(),demo=Object.values(DEMO_BLUEPRINTS)[0],exhibit={...getBlueprint(s,demo.id),id:'demo-building',blueprintId:demo.id,displayName:'朋友肖像排练亭'};
 const html=renderContext(s,{visitId:'demo',selection:{kind:'exhibit',id:exhibit.id}},{plants:[],exhibits:[exhibit]});assert.match(html,/data-action="remix-building"/);assert.doesNotMatch(html,/pack-building|sell-building/);
 const own={...exhibit,id:'my-building',personal:true};const personal=renderContext(s,{selection:{kind:'exhibit',id:own.id}},{plants:[],exhibits:[own]});assert.match(personal,/data-action="relocate-building"/);assert.match(personal,/data-action="demolish-building"/);assert.match(personal,/50/);
});
test('nonanchor building support in editing context is visibly protected, not only rejected by reducer',()=>{
 let s=reduce(fresh(),{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'edit-blueprint'},NOW).state;const id=Object.keys(s.blueprints)[0];s=reduce(s,{type:'CONSTRUCT_BUILDING',blueprintId:id,tileId:'tile-0-0'},NOW).state;const html=renderContext(s,{editing:true,selection:{kind:'tile',id:'tile-1-1'}},{tiles:s.tiles,plants:[],buildings:s.buildings});assert.match(html,/data-action="move-selected" disabled/);assert.match(html,/data-action="reclaim-selected" disabled/);
});
test('actual authored demo building context resolves canonical author credit instead of generic garden fallback',async()=>{
 const {DEMO_GARDENS}=await import('../src/catalogue.js');for(const g of DEMO_GARDENS){const e=g.exhibits[0],html=renderContext(fresh(),{visitId:g.id,selection:{kind:'exhibit',id:e.id}},g);assert.match(html,new RegExp(`原作 ${getBlueprint(fresh(),e.blueprintId).authorName}`));}
});
test('unfinished personal building context shows progress only until the exact completion boundary',()=>{
 const s=fresh();s.lastSeenAt=Date.now()+20000;const e={id:'pending-home',blueprintId:Object.keys(DEMO_BLUEPRINTS)[0],personal:true,startedAt:s.lastSeenAt-1000,readyAt:s.lastSeenAt+14000,displayName:'书屋工地'},u={selection:{kind:'exhibit',id:e.id}},world={plants:[],exhibits:[e]};let html=renderContext(s,u,world);assert.match(html,/建设中|施工中/);assert.match(html,/progress-bar/);assert.doesNotMatch(html,/pack-building|sell-building|relocate-building|demolish-building|remix-building|data-source/);s.lastSeenAt=e.readyAt;html=renderContext(s,u,world);assert.match(html,/relocate-building/);
});
test('blueprint creator stays in a compact bottom shelf after scrolling construction content with breathing room',async()=>{
 const html=renderPanel(fresh(),{panel:'build'},{});assert.match(html,/<footer class="panel-action-rail"><button[^>]*data-action="blueprint-create"/);assert.ok(html.indexOf('data-action="blueprint-create"')>html.indexOf('<div class="tray-content">'));assert.equal((html.match(/data-action="choose-build"/g)??[]).length,4);assert.equal((html.match(/data-action="blueprint-create"/g)??[]).length,1);
 const fs=await import('node:fs'),css=fs.readFileSync('styles.css','utf8');assert.match(css,/\.panel-action-rail\{[^}]*flex:none[^}]*padding:10px 0 0[^}]*border-top:1px solid/);assert.doesNotMatch(css,/\.panel-action-rail\{[^}]*min-height:/);
});
test('completed personal house offers paid relocation/demolition and explicit cost confirmation, never pack/sale',()=>{
 const s=fresh(),blueprintId=Object.keys(DEMO_BLUEPRINTS)[0],e={...getBlueprint(s,blueprintId),id:'own-house',blueprintId,personal:true},selection={kind:'exhibit',id:e.id},world={plants:[],exhibits:[e]};
 const html=renderContext(s,{selection},world);assert.match(html,/data-action="relocate-building"/);assert.match(html.replace(/<[^>]*>/g,'').replace(/\s+/g,' '),/搬迁 · 20/);assert.match(html,/data-action="demolish-building"/);assert.match(html.replace(/<[^>]*>/g,'').replace(/\s+/g,' '),/拆除 · 50/);assert.doesNotMatch(html,/pack-building|sell-building|卖出|收进背包/);
 const confirm=renderContext(s,{selection,demolishId:e.id},world);assert.match(confirm.replace(/<[^>]*>/g,'').replace(/\s+/g,' '),/确认拆除 · 50/);assert.match(confirm,/data-action="confirm-demolition"/);assert.match(confirm,/data-action="cancel-demolition"/);assert.match(confirm,/图纸.*保留/);assert.doesNotMatch(confirm,/data-action="relocate-building"/);
});
test('normal bag hides buildings while legacy leftovers alone expose a one-time recovery route',()=>{
 const s=fresh();let html=renderPanel(s,{panel:'bag',bagTab:'buildings'},{});assert.doesNotMatch(html,/bag-tab-buildings|restore-building/);assert.match(html,/data-action="choose-seed"/);
 const own=reduce(s,{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'legacy-ui'},NOW).state,id=Object.keys(own.blueprints)[0];own.buildingBag=[{id:'legacy-house',blueprintId:id,tileId:'removed'}];html=renderPanel(own,{panel:'build'},{});assert.match(html,/待安置建筑/);assert.match(html,/旧版|以前/);assert.match(html,/data-action="restore-building"/);assert.doesNotMatch(html,/pack-building|sell-building/);
});
