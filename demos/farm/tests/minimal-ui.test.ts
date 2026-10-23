import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {createMinimalState,MINIMAL_STORAGE_KEY,type MinimalState} from '../src/minimal/model.ts';
type StubWorld={handlers:{select:(target:{kind:'tile';x:number;z:number}|{kind:'animal';id:string})=>void;arrive:(p:{x:number;z:number})=>void};state:MinimalState;path:{x:number;z:number}|null;actions:string[];disposed:boolean};
const pause=()=>new Promise(r=>setTimeout(r,25));

test('minimal UI: visible terrain expands, care waits for arrival, gift display/sale persists collection',async()=>{
 const hooks=registerHooks({load(url,context,next){
  if(url.endsWith('/minimal/World.ts'))return {format:'module',shortCircuit:true,source:`export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;this.actions=[];globalThis.__minimalTestWorld=this;}update(s){this.state=s;}walkTo(p){this.path=p;return true;}focus(){}zoom(){}cancelWalk(){this.path=null;}perform(a){this.actions.push(a);}dispose(){this.disposed=true;}screenPoint(){return {x:100,y:100};}}`};
  if(url.endsWith('/feed/PhoneViewport.tsx'))return {format:'module',shortCircuit:true,source:'export default function PhoneViewport({children}){return children;}'};
  return next(url,context);
 }});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});
 const now=Date.now(),initial=createMinimalState(now);initial.gifts.push({id:'gift-test',kind:'wool',location:'ground',createdAt:now,animalId:'sheep-1',rare:false});initial.player={x:1,z:1};initial.animals[0].activityUntil=now+60_000;initial.nextWolfAt=now+60_000;
 w.localStorage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(initial));
 const {default:MinimalApp}=await import('../src/minimal/MinimalApp.tsx');
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host as unknown as HTMLElement);
 const buttons=()=>Array.from(host.querySelectorAll<HappyButton>('button'));
 const click=async(text:string)=>{const b=buttons().find(b=>b.textContent?.includes(text));assert.ok(b,`button ${text} exists`);assert.equal(b.disabled,false,`${text} enabled`);b.click();await pause();};
 const saved=()=>JSON.parse(w.localStorage.getItem(MINIMAL_STORAGE_KEY)!) as MinimalState;
 try{
  root.render(createElement(MinimalApp));await pause();await pause();
  const scene=(globalThis as unknown as {__minimalTestWorld:StubWorld}).__minimalTestWorld;assert.ok(scene);assert.match(host.textContent!,/本机保存/);assert.match(host.textContent!,/演示加速/);
  scene.handlers.select({kind:'tile',x:6,z:6});await pause();assert.equal(buttons().find(b=>b.textContent?.includes('先开辟一块相邻土地'))?.disabled,true);
  scene.handlers.select({kind:'tile',x:4,z:1});await pause();assert.match(host.textContent!,/还没开辟的小溪/);await click('开辟这里');assert.equal(saved().coins,40);assert.equal(saved().tiles.filter(t=>t.owned).length,17);
  await click('换一种风景');await click('丘陵');assert.equal(saved().coins,20);assert.equal(saved().tiles.find(t=>t.x===4&&t.z===1)?.terrain,'hill');
  scene.handlers.select({kind:'animal',id:'sheep-1'});await pause();assert.equal(buttons().some(b=>b.textContent?.includes('亲自喂一点')),false,'care not visible before arrival');assert.ok(scene.path);scene.handlers.arrive(scene.path);await pause();await click('亲自喂一点');assert.equal(saved().animals[0].bond,1);assert.deepEqual(scene.actions,['feed']);
  scene.handlers.select({kind:'animal',id:'sheep-2'});await pause();const staleArrival=scene.path!;await click('背包');scene.handlers.arrive(staleArrival);await pause();assert.equal(host.querySelector('[aria-label="场景动作"]'),null,'stale arrival cannot reopen card behind panel');await click('收下地上的');assert.equal(saved().gifts[0].location,'bag');await click('摆出来');assert.equal(saved().gifts[0].location,'display');await click('出售 20');assert.equal(saved().coins,40);assert.equal(saved().gifts.length,0);assert.deepEqual(saved().collection,['wool']);
  root.unmount();assert.equal(scene.disposed,true);
 }finally{hooks.deregister();await w.happyDOM.close();}
});
