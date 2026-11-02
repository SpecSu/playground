import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatOutbox,mergeHeadChats} from '../lib/client/chat-outbox.js';
import {memoryD1} from './d1-helper.js';
import {SocialStore} from '../lib/server/social-store.js';
import {performCommand} from '../lib/server/service.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

test('corrupt and malformed chat storage cannot break initialization',()=>{
 for(const raw of ['{broken','null','{}','{"pending":[null,{}],"displayed":[false]}']){
  const storage=memory();storage.setItem('manor-next:chat-v7:qa-chat-user',raw);
  const q=createChatOutbox({uid:'qa-chat-user',storage,now:()=>1000});assert.equal(q.next('qa-home'),null);
 }
});
test('old-island queue entries cannot block a newer island message',()=>{
 const q=createChatOutbox({uid:'qa-chat-user',storage:memory(),now:()=>1000,newId:(()=>{let n=0;return()=>`qa-message-${++n}`;})()});
 q.enqueue('old island','qa-old-island');const current=q.enqueue('new island','qa-new-island');
 assert.equal(q.next('qa-new-island').id,current.id);assert.equal(q.entries().length,1);
});
test('own stable message ID keeps its local timestamp after a late cloud ACK and reload',()=>{
 let t=1000;const storage=memory(),q=createChatOutbox({uid:'qa-chat-user',storage,now:()=>t,newId:()=> 'qa-stable-chat-id'});
 const local=q.enqueue('hello','qa-home');t=10000;q.acknowledge(local.id);
 const reloaded=createChatOutbox({uid:'qa-chat-user',storage,now:()=>t});
 const merged=mergeHeadChats([{...local,createdAt:t}],reloaded.localMessages(),'qa-home');
 assert.equal(merged.length,1);assert.equal(merged[0].createdAt,1000);assert.equal(reloaded.next('qa-home'),null);
 assert.equal(mergeHeadChats([],reloaded.localMessages(),'qa-other-island').length,0);
});
test('expired unsent speech is dropped rather than replayed after a long absence',()=>{
 let t=1000;const q=createChatOutbox({uid:'qa-chat-user',storage:memory(),now:()=>t,newId:()=> 'qa-expired-chat-id'});
 q.enqueue('old speech','qa-home');t+=60001;assert.equal(q.next('qa-home'),null);
});
test('chat origin is mandatory and a changed server visit cannot redirect the message',async()=>{
 const db=memoryD1(),store=new SocialStore(db);try{
  const uid='qa-chat-origin',sessionId='qa-chat-session';for(const u of [uid,'qa-chat-other'])await store.ensure(u,1000);
  await store.visit(sessionId,uid,uid,1000);await store.visit(sessionId,uid,'qa-chat-other',1100);
  const send=command=>performCommand(store,{schemaVersion:1,uid,sessionId,opId:crypto.randomUUID(),command},1200);
  await assert.rejects(send({type:'chat',message:'not redirectable',islandUid:uid}),{code:'STALE_CHAT'});
  await assert.rejects(send({type:'chat',message:'unbound legacy chat'}),{code:'STALE_CHAT'});
  assert.equal((await store.messages('qa-chat-other',1200)).length,0);
  const r=await send({type:'chat',message:'bound correctly',islandUid:'qa-chat-other'});assert.ok(r.receipt.messageId);
  assert.equal((await store.messages('qa-chat-other',1200)).length,1);
 }finally{db.raw.close();}
});
test('an island change between validation and atomic chat commit is rejected on retry',async()=>{
 const db=memoryD1(),store=new SocialStore(db);try{
  const uid='qa-chat-atomic',sessionId='qa-atomic-session';for(const u of [uid,'qa-atomic-other'])await store.ensure(u,1000);
  await store.visit(sessionId,uid,uid,1000);const commit=store.commitChat.bind(store);let intercepted=false;
  store.commitChat=async(...args)=>{if(!intercepted){intercepted=true;await store.visit(sessionId,uid,'qa-atomic-other',1100);}return commit(...args);};
  await assert.rejects(performCommand(store,{schemaVersion:1,uid,sessionId,opId:'qa-atomic-message',command:{type:'chat',message:'never forwarded',islandUid:uid}},1200),{code:'STALE_CHAT'});
  assert.equal((await store.messages(uid,1200)).length,0);assert.equal((await store.messages('qa-atomic-other',1200)).length,0);
 }finally{db.raw.close();}
});
