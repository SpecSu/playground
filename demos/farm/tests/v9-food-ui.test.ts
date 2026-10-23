import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import QuickBuildPanel from '../src/v5/QuickBuildPanel.tsx';
import InventoryPanel from '../src/v7/InventoryPanel.tsx';
import {createEstate} from '../src/v5/estate.ts';
const now=1_800_000_000_000;
test('existing canteen exposes its current natural-resource rating in quick build',()=>{
 const p=createEstate('food-ui',now).profiles.home;p.threat=null;p.layout.buildings.push({id:'food-test',kind:'factory',x:0,z:0,rotation:0,paidCost:0,capacity:12,doors:[]});
 const html=renderToStaticMarkup(createElement(QuickBuildPanel,{profile:p,busy:false,send:()=>{},onGhost:()=>{},onClose:()=>{},onPlanner:()=>{}}));
 assert.match(html,/data-food-site="current"/);assert.match(html,/缺少/);assert.match(html,/营养/);assert.match(html,/淡水/);
});
test('inventory explains paid production grain is not care food',()=>{
 const p=createEstate('food-ui-inventory',now).profiles.home;
 const html=renderToStaticMarkup(createElement(InventoryPanel,{profile:p,busy:false,send:()=>{}}));
 assert.match(html,/亲自喂养/);assert.match(html,/不增加亲密/);assert.match(html,/生产粮/);
});

test('planned rating follows the actual drag coordinate and does not mutate live layout',async()=>{
 const {act}=await import('react');const {createRoot}=await import('react-dom/client');const {Window}=await import('happy-dom');const {foodSiteRating}=await import('../src/v5/food-resources.ts');
 const win=new Window();Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host as unknown as HTMLElement),p=createEstate('food-drag',now).profiles.home;p.threat=null;p.tutorial='done';const before=JSON.stringify(p.layout);
 const render=async(point?:{x:number;z:number})=>{await act(async()=>root.render(createElement(QuickBuildPanel,{profile:p,busy:false,placementPoint:point,send:()=>{},onGhost:()=>{},onClose:()=>{},onPlanner:()=>{}})));};
 try{await render();await act(async()=>{(host.querySelector('[data-quick-kind="factory"]') as unknown as HTMLElement).click();});for(const point of [{x:8,z:7},{x:0,z:0}]){await render(point);const factory={id:'preview',kind:'factory' as const,...point,rotation:0 as const,paidCost:0,capacity:12,doors:[]};assert.equal(host.querySelector('[data-food-site="planned"]')?.getAttribute('data-food-stars'),String(foodSiteRating(factory,p.layout).stars));}assert.equal(JSON.stringify(p.layout),before);}finally{await act(async()=>root.unmount());await win.happyDOM.close();}
});

test('planner shows current and moved ratings and passes actual rotation to scene ghost',async()=>{
 const {act}=await import('react');const {createRoot}=await import('react-dom/client');const {Window}=await import('happy-dom');const {BuildPanel}=await import('../src/v5/EstateView.tsx');const {foodSiteRating}=await import('../src/v5/food-resources.ts');
 const win=new Window();Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host as unknown as HTMLElement),p=createEstate('food-move',now).profiles.home;p.threat=null;p.layout.buildings=[{id:'food-test',kind:'factory',x:0,z:0,rotation:0,paidCost:0,capacity:12,doors:[]}];
 let ghost:{rotation?:number}|undefined;const onGhost=(g?:{rotation?:number})=>{ghost=g;};
 try{await act(async()=>root.render(createElement(BuildPanel,{profile:p,busy:false,initialMode:'move',send:()=>{},onGhost})));assert.equal(host.querySelector('[data-food-site="current"]')?.getAttribute('data-food-stars'),'0');
 const input=async(selector:string,value:string)=>{await act(async()=>{const el=host.querySelector(selector) as unknown as HTMLInputElement;assert.ok(el);el.value=value;el.dispatchEvent(new win.Event('change',{bubbles:true}) as unknown as Event);});};
 // Map click is the actual planner placement action.
 await act(async()=>{((host.querySelector('button[aria-label^="草场 8,7"]')??host.querySelector('button[aria-label*=" 8,7 "]')) as unknown as HTMLElement)?.click();});
 await input('.estate-coordinate-row select','90');assert.equal(ghost?.rotation,90);
 const expected=foodSiteRating({...p.layout.buildings[0],x:8,z:7,rotation:90},p.layout);assert.equal(host.querySelector('[data-food-site="planned"]')?.getAttribute('data-food-stars'),String(expected.stars));assert.ok(host.querySelector('.food-border'));assert.equal(p.layout.buildings[0].rotation,0);
 }finally{await act(async()=>root.unmount());await win.happyDOM.close();}
});

test('inventory shows FIFO stored meal quality, not the current factory site quality',()=>{
 const p=createEstate('food-stock',now).profiles.home;p.inventory.hand=2;p.foodLedger={hand:[{quality:'rich',count:1},{quality:'plain',count:1}],pantry:[],factory:[],carried:[],troughs:{}};
 const html=renderToStaticMarkup(createElement(InventoryPanel,{profile:p,busy:false,send:()=>{}}));assert.match(html,/下一份丰盛/);
});
