import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Window} from 'happy-dom';
import EstateView,{isSceneCardSheet,type EstateSheet,type EstateViewProps} from '../src/v5/EstateView.tsx';
import {createEstate,estateSnapshot} from '../src/v5/estate.ts';
import {initialOpening} from '../src/v5/opening.ts';
const T=1_800_000_000_000;
function markup(sheet:EstateSheet=null){const data=estateSnapshot(createEstate('v7-view',T),T);data.profile.tutorial='done';data.profile.opening=initialOpening('done');data.profile.threat=null;data.profile.guardian='dog';const props:EstateViewProps={data,target:'pipi',sheet,camera:'overview',reduced:false,busy:false,message:'',error:'',assetStatus:'ready',worldRef:{current:null},onCommand:()=>{},onSheet:()=>{},onInspect:()=>{},onCamera:()=>{},onMove:()=>{},onStop:()=>{},onReduced:()=>{},onGhost:()=>{}};return renderToStaticMarkup(createElement(EstateView,props));}
test('V7 market remains a bounded nonmodal scene card with the world reachable',async()=>{assert.equal(isSceneCardSheet('cycle'),true);const w=new Window();try{w.document.body.innerHTML=markup('cycle');assert.equal(w.document.querySelector('[data-scene-card="cycle"]')?.getAttribute('aria-modal'),'false');assert.equal(w.document.querySelector('.app-page')?.hasAttribute('inert'),false);assert.ok(w.document.querySelector('[data-farm-cycle]'));}finally{await w.happyDOM.close();}});
test('V7 exposes an encounter entry and real local collaboration without claiming online friends',async()=>{const w=new Window();try{w.document.body.innerHTML=markup();assert.ok(w.document.querySelector('[data-open-encounter]'));w.document.body.innerHTML=markup('visits');assert.equal(w.document.querySelector('[data-open-convoy]')?.getAttribute('href'),'/?convoy=new');assert.match(w.document.body.textContent,/本机双窗口/);assert.ok(w.document.querySelector('[data-open-harvest]'));}finally{await w.happyDOM.close();}});
test('V7 guardian information explains production pressure and limited losses',()=>{const html=markup('guardian');assert.match(html,/数量.*稀有度/);assert.match(html,/20%/);assert.match(html,/已入库.*保护/);assert.doesNotMatch(html,/稀有收藏或财富增加狼群/);});
test('five wool qualities keep distinct visible border colours in the market',async()=>{const w=new Window();try{w.document.body.innerHTML=markup('cycle');const colours=[...w.document.querySelectorAll('[data-wool-tier]')].map(el=>el.getAttribute('style'));assert.equal(colours.length,5);assert.ok(colours.every(c=>c?.includes('--wool-color')));assert.equal(new Set(colours).size,5);}finally{await w.happyDOM.close();}});
