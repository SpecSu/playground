import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {createMinimalState} from '../src/minimal/model.ts';
test('formal FarmEntry verifies account before model preparation and never clears the loaded scope on reconnect',async()=>{
 const w=new Window({url:'https://fluffy-farm-companions.tangguozhou.chatgpt.site/'}),events=[];Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,localStorage:w.localStorage,IS_REACT_ACT_ENVIRONMENT:true,__formalEvents:events});
 const uid=`uid_${'f'.repeat(64)}`,now=1793000000000,oldFetch=globalThis.fetch;globalThis.fetch=async()=>{events.push('account');return Response.json({account:{uid,handle:'formal',createdAt:now},view:{serverTime:now,dayKey:'2026-10-26',resetAt:now+86400000,farm:{accountId:uid,farmId:'formal-farm',revision:1,state:createMinimalState(now),activeOfferId:null,initializedAt:now,origin:'server-created',assetProvenance:{}},ownOffer:null,usedToday:false,serviceGate:'client-migration-required'},capabilities:{importLegacy:false,animalResources:{scope:'signed-in-farm'}}});};
 const hooks=registerHooks({load(url,c,next){
  if(url.endsWith('/minimal/MinimalApp.tsx'))return {format:'module',shortCircuit:true,source:"import {createElement} from 'react';export default function App(){return createElement('p',{},'formal ready');}"};
  if(url.endsWith('/minimal/signed-in-farm-models.ts'))return {format:'module',shortCircuit:true,source:"export async function prepareSignedInFarmAnimalModels(o){if(o.origin!=='https://fluffy-farm-companions.tangguozhou.chatgpt.site'||o.sessionMode!=='signed-in-farm')throw Error('wrong scope');globalThis.__formalEvents.push('verified-models');}"};
  if(url.endsWith('/minimal/alpaca-provider.ts'))return {format:'module',shortCircuit:true,source:"export async function prepareConfiguredAlpacaProvider(){globalThis.__formalEvents.push('legacy-provider-clear');}"};
  if(url.endsWith('/minimal/penguin-provider.ts'))return {format:'module',shortCircuit:true,source:"export async function prepareConfiguredPenguinProvider(){globalThis.__formalEvents.push('legacy-provider-clear');}"};
  if(url.endsWith('/feed/PhoneViewport.tsx'))return {format:'module',shortCircuit:true,source:'export default function P({children}){return children;}'};
  return next(url,c);
 }});
 const host=w.document.createElement('div');w.document.body.append(host);let root=createRoot(host);const flush=async()=>{for(let n=0;n<8;n++)await new Promise(r=>setTimeout(r,0));};
 try{const {default:Entry}=await import('../src/minimal/FarmEntry.tsx');for(let n=0;n<2;n++){await act(async()=>{root.render(createElement(Entry));await flush();});assert.match(host.textContent,/formal ready/);assert.deepEqual(events,Array.from({length:n+1},()=>['account','verified-models']).flat());await act(async()=>root.unmount());if(n===0)root=createRoot(host);}}
 finally{hooks.deregister();globalThis.fetch=oldFetch;delete globalThis.__formalEvents;delete globalThis.IS_REACT_ACT_ENVIRONMENT;await w.happyDOM.close();}
});
