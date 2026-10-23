import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryD1} from './d1-helper.js';
import {SocialStore} from '../lib/server/social-store.js';
import {readGame,performCommand} from '../lib/server/service.js';
import {planLocalOperation} from '../lib/game/local-operations.js';
import {createGameClient} from '../lib/client/api.js';
import {createLocalJournal} from '../lib/client/local-journal.js';

const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
async function fixture(t){
 const saved={fetch:globalThis.fetch,document:globalThis.document,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
 globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
 const db=memoryD1(),store=new SocialStore(db),uid='qa-stale-batch',oldSession='qa-original-session',key=`manor-next:pending:${uid}`;let now=100000;
 const base=await readGame(store,{uid,sessionId:oldSession},now),planned=planLocalOperation(base.game,{type:'move',point:{x:.6,z:.6}},{id:'qa-old-confirmed-move',now:100100});
 const {motion,...op}=planned;now=op.at+2000;
 const body={schemaVersion:1,uid,sessionId:oldSession,opId:`batch-${op.id}`,command:{type:'sync-local',operations:[op]}},raw=JSON.stringify(body),calls=[];
 let mode='normal';globalThis.fetch=async(url,options={})=>{calls.push({method:options.method??'GET',body:options.body});if(options.method==='POST'){
  if(mode==='offline')return{ok:false,status:503,json:async()=>({error:{code:'UNAVAILABLE',message:'offline'}})};
  if(mode==='incomplete')return{ok:true,status:200,json:async()=>({...base,serverNow:now,receipt:{type:'sync-local',results:[]}})};
  if(mode==='rejected')return{ok:true,status:200,json:async()=>({...base,serverNow:now,receipt:{type:'sync-local',results:[{id:op.id,status:'rejected',code:'DRAW_CONFLICT'}]}})};
  return{ok:true,status:200,json:async()=>performCommand(store,JSON.parse(options.body),now)};
 }const q=new URL(url,'http://qa.local').searchParams;return{ok:true,status:200,json:async()=>readGame(store,{uid:q.get('uid'),islandUid:q.get('island'),sessionId:q.get('session')},now)};};
 let journal;const client=createGameClient(uid,data=>journal?.observe(data),()=>{});journal=createLocalJournal({uid,sessionId:client.sessionId,storage:localStorage,now:()=>now,newId:()=> 'qa-new-session-seed-buy'});journal.observe(base);
 t.after(()=>{client.stop();db.raw.close();Object.assign(globalThis,saved)});
 return{db,store,uid,key,body,raw,op,base,client,journal,calls,now,mode:value=>mode=value};
}
test('confirmed old-session move is reconciled with exact body and releases new journal without duplicating resources',async t=>{
 const h=await fixture(t);await performCommand(h.store,h.body,h.now);const oldReceipt=await h.store.receipt(h.uid,h.op.id);localStorage.setItem(h.key,h.raw);h.journal.enqueue({type:'buy-input',kind:'seed',tier:1});
 await h.client.recover();assert.deepEqual(h.calls.map(x=>x.method),['GET','POST']);assert.equal(h.calls[1].body,h.raw);assert.equal(localStorage.getItem(h.key),null);
 await h.journal.pump(h.client);const game=await h.store.read(h.uid);assert.equal(game.coins,16);assert.equal(game.seeds[0],2);assert.equal(h.journal.entries().length,0);assert.deepEqual(await h.store.receipt(h.uid,h.op.id),oldReceipt);assert.equal(h.db.raw.prepare('SELECT COUNT(*) AS n FROM manor_operations WHERE uid=? AND op_id=?').get(h.uid,h.op.id).n,1);
});
test('unknown old-session batch retains original bytes on outage and later settles once',async t=>{
 const h=await fixture(t);localStorage.setItem(h.key,h.raw);h.mode('offline');await assert.rejects(h.client.recover());assert.equal(localStorage.getItem(h.key),h.raw);assert.equal(await h.store.receipt(h.uid,h.op.id),null);
 h.mode('normal');await h.client.recover();assert.equal(localStorage.getItem(h.key),null);assert.equal((await h.store.receipt(h.uid,h.op.id)).receipt.status,'confirmed');assert.equal(h.calls.filter(x=>x.method==='POST').every(x=>x.body===h.raw),true);
});
test('incomplete or rejected cross-session recovery keeps body and does not claim it confirmed',async t=>{
 const h=await fixture(t);localStorage.setItem(h.key,h.raw);h.mode('incomplete');await assert.rejects(h.client.recover());assert.equal(localStorage.getItem(h.key),h.raw);
 h.mode('rejected');await assert.rejects(h.client.recover());assert.equal(localStorage.getItem(h.key),h.raw);assert.equal(await h.store.receipt(h.uid,h.op.id),null);
});
test('foreign UID or unsupported social pending is not replayed by another session',async t=>{
 const h=await fixture(t);for(const body of [{...h.body,uid:'qa-not-this-owner'},{...h.body,command:{type:'finish-social',intentId:'qa-other-visit-intent'}}]){const raw=JSON.stringify(body);localStorage.setItem(h.key,raw);await h.client.recover();assert.equal(localStorage.getItem(h.key),raw);}assert.deepEqual(h.calls.map(x=>x.method),['GET','GET']);
});
