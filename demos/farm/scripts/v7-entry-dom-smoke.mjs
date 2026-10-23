/** Production entry routing, under Node DOM only. Uses an isolated SQLite fixture. */
import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {createEstate} from '../src/v5/estate.ts';
const base=process.env.FARM_URL,file=process.env.FARM_DB,dist=resolve(process.env.FARM_DIST||'dist');
if(!base||new URL(base).port==='5190'||!file||resolve(file)===resolve('.local/farm.sqlite'))throw new Error('Explicit isolated URL/database required');
const owner=randomUUID(),state=createEstate(owner,Date.now()),p=state.profiles.home;
p.tutorial='done';p.opening.stage='done';p.guardian='dog';p.threat=null;
p.production.pending=[{id:'entry-dom-white',animalId:p.animals[0].id,tier:'white',amount:10,version:'v7',source:'isolated-entry-fixture',batchId:'fixture-period',cycle:1}];
const db=new DatabaseSync(file);db.prepare('INSERT INTO estates(device,state) VALUES (?,?)').run(owner,JSON.stringify(state));
const realFetch=globalThis.fetch,opened=await(await realFetch(base+'/api/harvest',{method:'POST',headers:{Cookie:`farm_device=${owner}`,'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),type:'open'})})).json();assert.equal(opened.accepted,true);
const token=opened.share.token,window=new Window({url:base+'/?harvest='+token});window.document.body.innerHTML='<div id="root"></div>';
for(const key of ['window','document','navigator','HTMLElement','MutationObserver','matchMedia','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','self','location','Event','CustomEvent','getComputedStyle','HTMLCanvasElement']){const value=key==='window'||key==='self'?window:window[key];if(value)Object.defineProperty(globalThis,key,{value:typeof value==='function'&&!/^[A-Z]/.test(key)?value.bind(window):value,configurable:true});}
let cookie='';const calls=[],errors=[];process.on('uncaughtException',e=>errors.push(String(e)));process.on('unhandledRejection',e=>errors.push(String(e)));
globalThis.fetch=async(url,options={})=>{const address=new URL(String(url),base);assert.equal(address.origin,new URL(base).origin);calls.push([address.pathname,options.method||'GET']);const r=await realFetch(address,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};
const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await delay(30);}throw new Error(window.document.body.textContent.slice(0,1200));};
try{
 const html=readFileSync(dist+'/index.html','utf8'),entry=html.match(/type="module"[^>]*src="([^"]+\.js)"/)[1];await import(pathToFileURL(dist+entry));
 await until(()=>window.document.querySelector('[data-harvest-take]')&&!window.document.querySelector('[data-harvest-take]').disabled);
 assert.ok(window.document.querySelector('[data-harvest-visit]'));assert.equal(window.document.querySelector('.farm-world'),null);assert.equal(window.document.querySelector('[data-opening-stage]'),null);assert.ok(calls.every(([path])=>path==='/api/harvest'));
 const button=window.document.querySelector('[data-harvest-take]');button.click();button.click();await until(()=>window.document.querySelector('[role="status"]')?.textContent.includes('已采收1份'));
 const visitor=JSON.parse(db.prepare('SELECT state FROM estates WHERE device=?').get(cookie.split('=')[1]).state).profiles.home;
 assert.equal(visitor.tutorial,'choose');assert.equal(visitor.onlineMs,0);assert.equal(visitor.guardian,null);assert.equal(visitor.economy.warehouse.white,1);assert.equal(calls.filter(([,method])=>method==='POST').length,1);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({actualBuiltReactEntry:true,standaloneHarvestRoute:true,freshVisitorNoOwnOpening:true,actualApiTakeOnce:true,ownTutorialAndClockUntouched:true,webgl:'not verified (Node DOM)'}));db.close();await window.happyDOM.close();process.exit(0);
}catch(e){console.error(e,errors);db.close();process.exit(1);}
