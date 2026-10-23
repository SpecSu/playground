import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {Window} from 'happy-dom';
import MarketPanel from '../src/v7/MarketPanel.tsx';
import {createEstate,type Profile} from '../src/v5/estate.ts';
import {ensureV7,v7Command} from '../src/v5/v7-economy.ts';
import {DEFAULT_PATTERN,workshopCommand} from '../src/v5/workshop.ts';
import {restoreWool} from '../src/v5/herd-economy.ts';
const now=1_800_000_000_000;
function profile(){const p=createEstate('inventory-ui',now).profiles.home;p.tutorial='done';p.threat=null;ensureV7(p,now);return p;}
async function mount(p:Profile){
 const win=new Window();Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host as unknown as HTMLElement);const calls:{type:string;extra?:Record<string,unknown>}[]=[];
 const render=async(next=p,busy=false)=>{p=next;await act(async()=>root.render(createElement(MarketPanel,{profile:p,now,busy,send:(type,extra)=>calls.push({type,extra})})));};
 await render();
 const find=(selector:string)=>{const el=host.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;};
 const click=async(selector:string)=>{await act(async()=>{(find(selector) as unknown as HTMLElement).click();});};
 return {host,calls,render,find,click,close:async()=>{await act(async()=>root.unmount());await win.happyDOM.close();}};
}

test('inventory shows owned wool separately from unclaimed production with pictorial icons and non-colour quality labels',async()=>{
 const p=profile();p.economy=restoreWool(p.economy!,[{id:'owned-blue',tier:'blue',amount:7,version:'v7',source:'test',animalId:null}]);p.production!.pending.push({id:'pending-blue',tier:'blue',amount:9,version:'v7',source:'test',animalId:p.animals[0].id,cycle:1});
 const ui=await mount(p);try{const tile=ui.find('[data-wool-tier="blue"]');assert.match(tile.textContent,/7份/);assert.doesNotMatch(tile.textContent,/16份/);assert.ok(tile.querySelector('svg path'),'wool must have a recognizable SVG, not a text badge');assert.match(tile.textContent,/稀有|Ⅲ|III/);await ui.click('[data-wool-tier="blue"]');assert.equal(ui.find('[data-wool-tier="blue"]').getAttribute('aria-pressed'),'true');assert.match(ui.find('[data-inventory-detail]').textContent,/狗盾/);}finally{await ui.close();}
});

test('supply filter keeps paid production feed separate from free care food and purchases a real pack',async()=>{
 const p=profile();p.v7!.productionFeed=17;p.inventory.hand=2;p.inventory.pantry=5;const ui=await mount(p);try{await ui.click('[data-inventory-group="supplies"]');assert.equal(ui.host.querySelector('[data-wool-tier]'),null);await ui.click('[data-inventory-item="production-feed"]');assert.match(ui.find('[data-inventory-detail]').textContent,/17份/);await ui.click('[data-inventory-buy-feed]');assert.deepEqual(ui.calls,[{type:'v7-buy-feed',extra:{packs:1}}]);const result=v7Command(p,{id:'buy-from-grid',type:ui.calls[0].type,...ui.calls[0].extra},now);assert.equal(result?.accepted,true);assert.equal(p.v7!.productionFeed,27);assert.equal(p.materials,50);assert.equal(p.inventory.hand,2);assert.equal(p.inventory.pantry,5);await ui.render(structuredClone(p));assert.match(ui.find('[data-inventory-detail]').textContent,/27份/);}finally{await ui.close();}
});

test('free food actions send the selected real trough and never claim a delivery succeeded locally',async()=>{
 const p=profile();p.inventory.hand=0;p.factory.stock=6;p.troughFood={'initial-trough':2};const ui=await mount(p);try{await ui.click('[data-inventory-group="supplies"]');await ui.click('[data-inventory-item="trough-food"]');await ui.click('[data-inventory-refill-trough]');assert.deepEqual(ui.calls,[{type:'refill',extra:{source:'trough',target:'initial-trough'}}]);assert.equal(p.inventory.hand,0);assert.equal(p.troughFood['initial-trough'],2);await ui.render(structuredClone(p));await ui.click('[data-inventory-item="factory-food"]');await ui.click('[data-inventory-deliver]');assert.deepEqual(ui.calls[1],{type:'delivery',extra:{target:'initial-trough'}});assert.equal(p.factory.stock,6);}finally{await ui.close();}
});

test('owned cape equips through the workshop contract, updates only on a snapshot, and cannot double-submit',async()=>{
 const p=profile();const w=p.workshop!;w.assets.push({id:'cape-art',version:1,source:'official',pattern:structuredClone(DEFAULT_PATTERN),createdAt:now});w.items.push({id:'my-cape',recipe:'cape',assetId:'cape-art',assetVersion:1,createdAt:now,paid:{materials:0,wool:[]},gift:true,destroyed:false});const ui=await mount(p);try{await ui.click('[data-inventory-group="equipment"]');await ui.click('[data-inventory-item="equipment:my-cape"]');await act(async()=>{(ui.find('[data-inventory-equip]') as unknown as HTMLElement).click();(ui.find('[data-inventory-equip]') as unknown as HTMLElement).click();});assert.equal(ui.calls.length,1);assert.deepEqual(ui.calls[0],{type:'workshop-apply',extra:{itemId:'my-cape',workshopVersion:0,worldVersion:p.layout.version}});assert.equal(p.workshop!.equipment.cape,undefined);assert.equal(workshopCommand(p,{id:'equip-from-grid',type:ui.calls[0].type,...ui.calls[0].extra},now)?.accepted,true);await ui.render(structuredClone(p));assert.match(ui.find('[data-inventory-detail]').textContent,/已装配/);await ui.click('[data-inventory-equip]');assert.equal(ui.calls[1].type,'workshop-unequip');assert.equal(ui.calls[1].extra?.slot,'cape');}finally{await ui.close();}
});

test('empty supplies cannot refill and destroyed equipment never reappears as owned inventory',async()=>{
 const p=profile();p.inventory.hand=0;p.inventory.pantry=0;p.factory.stock=0;p.troughFood={};p.workshop!.items.push({id:'gone',recipe:'shield',assetId:'gone-art',assetVersion:1,createdAt:now,paid:{materials:16,wool:[]},gift:false,destroyed:true});const ui=await mount(p);try{await ui.click('[data-inventory-group="supplies"]');await ui.click('[data-inventory-item="pantry-food"]');assert.equal(ui.find('[data-inventory-refill]').hasAttribute('disabled'),true);await ui.click('[data-inventory-group="equipment"]');assert.equal(ui.host.querySelector('[data-inventory-item="equipment:gone"]'),null);assert.match(ui.host.textContent,/还没有作品|暂无装备/);}finally{await ui.close();}
});

test('workshop recipe and motif choices show objects rather than single-character placeholders',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server');const {default:WorkshopPanel}=await import('../src/v5/WorkshopPanel.tsx');
 const win=new Window();try{win.document.body.innerHTML=renderToStaticMarkup(createElement(WorkshopPanel,{profile:profile(),busy:false,send:()=>{},onPreview:()=>{},onGhost:()=>{}}));for(const kind of ['cape','banner','shield'])assert.ok(win.document.querySelector(`.workshop-choice [data-resource-icon="${kind}"]`),`recognizable ${kind} recipe`);assert.ok(win.document.querySelector('[aria-label="小羊纹样"] svg path'));assert.equal(win.document.querySelector('[aria-label="小羊纹样"]')!.textContent,'');}finally{await win.happyDOM.close();}
});

test('shield equipment respects an active threat and sends a legal anchor after the threat ends',async()=>{
 const p=profile(),w=p.workshop!;w.assets.push({id:'shield-art',version:1,source:'official',pattern:structuredClone(DEFAULT_PATTERN),createdAt:now});w.items.push({id:'my-shield',recipe:'shield',assetId:'shield-art',assetVersion:1,createdAt:now,paid:{materials:16,wool:[]},gift:false,destroyed:false});p.threat=createEstate('shield-threat',now).profiles.home.threat;
 const ui=await mount(p);try{await ui.click('[data-inventory-group="equipment"]');assert.equal(ui.find('[data-inventory-equip]').hasAttribute('disabled'),true);await ui.click('[data-inventory-equip]');assert.equal(ui.calls.length,0);p.threat=null;await ui.render(structuredClone(p));await ui.click('[data-inventory-equip]');assert.deepEqual(ui.calls[0],{type:'workshop-apply',extra:{itemId:'my-shield',position:{x:5,z:4},workshopVersion:0,worldVersion:p.layout.version}});assert.equal(workshopCommand(p,{id:'shield-from-grid',type:ui.calls[0].type,...ui.calls[0].extra},now)?.accepted,true);assert.equal(p.workshop!.equipment.shield,'my-shield');assert.deepEqual(p.workshop!.tacticalAnchor,{x:5,z:4});}finally{await ui.close();}
});

test('a busy snapshot disables supplement purchases, sales and synthesis instead of changing stock',async()=>{
 const p=profile();p.economy=restoreWool(p.economy!,[{id:'busy-wool',tier:'white',amount:3,version:'v7',source:'test',animalId:null}]);const ui=await mount(p);try{await ui.render(p,true);assert.equal(ui.find('[data-v7-sell]').hasAttribute('disabled'),true);assert.equal(ui.find('[data-v7-synthesize]').hasAttribute('disabled'),true);await ui.click('[data-inventory-group="supplies"]');await ui.click('[data-inventory-item="production-feed"]');assert.equal(ui.find('[data-inventory-buy-feed]').hasAttribute('disabled'),true);await ui.click('[data-inventory-buy-feed]');assert.equal(ui.calls.length,0);assert.equal(p.v7!.productionFeed,24);assert.equal(p.economy!.warehouse.white,3);}finally{await ui.close();}
});
