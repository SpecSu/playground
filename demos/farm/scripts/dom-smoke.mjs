/** Node DOM interaction check of the actual production entry. This does not exercise WebGL or a browser. */
import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const base=process.env.FARM_URL;
if(!base||new URL(base).port==='5190')throw new Error('FARM_URL must point to an isolated test server/database, not5190');
const window=new Window({url:base+'/'});window.document.body.innerHTML='<div id="root"></div>';
for(const key of ['window','document','navigator','HTMLElement','MutationObserver','matchMedia','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','self','Event','CustomEvent','getComputedStyle','HTMLCanvasElement']){
 const value=key==='window'||key==='self'?window:window[key];if(value)Object.defineProperty(globalThis,key,{value:typeof value==='function'&&!/^[A-Z]/.test(key)?value.bind(window):value,configurable:true});
}
const actualFetch=globalThis.fetch;let cookie='',loseFeedResponse=false;const posted=[],entryErrors=[];
process.on('uncaughtException',e=>entryErrors.push(String(e.stack||e)));process.on('unhandledRejection',e=>entryErrors.push(String(e.stack||e)));
globalThis.fetch=async(url,options={})=>{
 const address=new URL(String(url),base);assert.equal(address.origin,new URL(base).origin);
 let command;if(options.method==='POST'&&address.pathname==='/api/farm'){command=JSON.parse(options.body);posted.push(command);}
 const response=await actualFetch(address,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});
 if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 if(loseFeedResponse&&command?.type==='feed'){loseFeedResponse=false;await response.text();throw new Error('TEST: response lost after save');}
 return response;
};
const doc=window.document;
async function until(check,message){for(let i=0;i<150;i++){if(await check())return;await delay(20);}throw new Error(message+'\n'+doc.body.textContent.slice(0,1500));}
function click(selector){const element=doc.querySelector(selector);assert.ok(element,selector);assert.equal(element.disabled,false,selector+' disabled');element.click();return element;}
const read=async()=>{const r=await actualFetch(base+'/api/farm',{headers:{Cookie:cookie}});return r.json();};
setTimeout(()=>{console.error('DOM test timed out',JSON.stringify({commands:posted.map(c=>c.type),entryErrors,body:doc.body.textContent.slice(0,900)}));process.exit(1);},15000).unref();
try{
 const html=readFileSync('dist/index.html','utf8'),entry=html.match(/type="module"[^>]*src="([^"]+\.js)"/)[1];await import(pathToFileURL(process.cwd()+'/dist'+entry));
 await until(()=>doc.querySelector('[aria-label="住民关系与记忆"]'),'initial feed not mounted');
 await until(async()=>!(await read()).company&&doc.body.textContent.includes('已保存'),'initial visit not saved');
 const worldHost=doc.querySelector('.farm-world');assert.equal((await read()).avatar,'human-lx');
 click('[aria-label="住民关系与记忆"]');await until(()=>doc.querySelector('[data-resident-id="pipi"]'),'pipi card not opened');
 click('[aria-label="查看茉茉的卡片"]');click('[aria-label="查看豆豆的卡片"]');
 await until(()=>doc.querySelector('[data-resident-id="doudou"]'),'rapid switch chose wrong card');
 await until(async()=>(await read()).book.met.length===3,'rapid inspection lost an animal');
 console.log('DOM: all three card inspections saved');
 assert.ok(doc.querySelector('.farm-world')===worldHost);
 click('[aria-label="查看皮皮的卡片"]');await until(()=>doc.querySelector('[data-resident-id="pipi"]'),'pipi switch failed');
 loseFeedResponse=true;click('[role="dialog"] [data-command="feed"]');
 await until(()=>doc.body.textContent.includes('TEST: response lost'),'failed save did not remain visible');
 click('[aria-label="住民关系与记忆"]');await until(()=>doc.querySelector('[aria-label="查看茉茉的卡片"]'),'pending card not mounted');click('[aria-label="查看茉茉的卡片"]');
 await until(()=>doc.querySelector('[data-resident-id="momo"]'),'readonly card switch failed');
 assert.equal(doc.querySelector('[role="dialog"] [data-command="feed"]').disabled,true);
 click('[role="dialog"] .farm-sheet-error button');
 await until(()=>!doc.body.textContent.includes('TEST: response lost'),'retry did not resolve');
 const feeds=posted.filter(c=>c.type==='feed');assert.equal(feeds.length,2);assert.equal(feeds[0].id,feeds[1].id);assert.equal(feeds[1].target,'pipi');
 let saved=await read();assert.equal(saved.animals[0].care.feedCount,1);assert.equal(saved.animals[1].care.feedCount,0);
 console.log('DOM: lost response retried original command and target once');
 click('[role="dialog"] [aria-label="关闭面板"]');
 await until(()=>!doc.querySelector('[role="dialog"]'),'card did not close before joystick');
 const pad=doc.querySelector('[aria-label="移动摇杆"]'),captures=new Set();pad.setPointerCapture=id=>captures.add(id);pad.hasPointerCapture=id=>captures.has(id);pad.releasePointerCapture=id=>captures.delete(id);pad.getBoundingClientRect=()=>({left:0,top:0,width:64,height:64,right:64,bottom:64});
 for(const [type,x] of [['pointerdown',32],['pointermove',60],['pointerup',60]])pad.dispatchEvent(new window.PointerEvent(type,{bubbles:true,button:0,isPrimary:true,pointerId:7,clientX:x,clientY:32}));
 assert.ok(!doc.querySelector('[role="dialog"]'),'joystick drag opened a card');
 click('[aria-label="管理我的分身"]');await until(()=>doc.querySelector('[data-command="avatar"]'),'avatar drawer not mounted');
 const chooseAvatar=label=>{const button=[...doc.querySelectorAll('[role="dialog"] [data-command="avatar"]')].find(b=>b.textContent===label);assert.ok(button);assert.equal(button.disabled,false);button.click();};
 const owner=saved.playerId;chooseAvatar('香蕉猫');await until(async()=>(await read()).avatar==='banana-cat','avatar change failed');await until(()=>!doc.querySelector('[data-command="avatar"]').disabled,'avatar save not resolved');chooseAvatar('LX');await until(async()=>(await read()).avatar==='human-lx','LX restore failed');
 click('[role="dialog"] [aria-label="关闭面板"]');await until(()=>!doc.querySelector('[role="dialog"]'),'avatar did not close');click('[aria-label="打开相处手账"]');
 await until(()=>{const button=doc.querySelector('[data-command="questClaim"]');return button&&!button.disabled;},'reward not ready');const row=[...doc.querySelectorAll('.farm-quest')].find(e=>e.textContent.includes('认识三位住民')),button=row.querySelector('button');button.click();button.click();
 await until(async()=>(await read()).book.claimed.includes('meet'),'milestone reward not saved');saved=await read();assert.equal(saved.wool,1);assert.equal(saved.playerId,owner);assert.equal(posted.filter(c=>c.type==='questClaim'&&c.quest==='meet').length,1);
 const modal=doc.querySelector('[role="dialog"]'),focusables=[...modal.querySelectorAll('button:not(:disabled),[tabindex="0"]')];focusables.at(-1).focus();doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.ok(doc.activeElement===focusables[0],'Tab should wrap to the close button');
 doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!doc.querySelector('[role="dialog"]'),'Escape did not close sheet');assert.ok(doc.querySelector('.farm-world')===worldHost);
 assert.deepEqual(entryErrors,[]);console.log(JSON.stringify({actualBuiltEntry:true,defaultLX:true,threeIndividualCards:true,rapidSwitchSaved:true,worldHostRetained:true,joystickDoesNotPick:true,pendingModalRetry:true,responseLossRetrySameIdAndTarget:true,avatarIdentity:true,rewardDoubleClickOnce:true,focusAndEscape:true,webgl:'not verified (Node DOM)'}));
 await window.happyDOM.close();process.exit(0);
}catch(error){console.error(error);await window.happyDOM.close();process.exit(1);}
