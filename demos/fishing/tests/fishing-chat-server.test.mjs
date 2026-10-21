import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const {createFishingService,validateFishingCommand}=await import('../lib/fishing-server.ts');
class Store {
 rooms=new Map();visits=new Map();
 async ensureRoom(id,state){if(!this.rooms.has(id))this.rooms.set(id,structuredClone(state));}
 async ensureVisit(room,actor,state){if(!this.visits.has(room+actor))this.visits.set(room+actor,structuredClone(state));}
 async readState(room,actor){return {room:structuredClone(this.rooms.get(room)??null),visit:structuredClone(this.visits.get(room+actor)??null)};}
 async commit(room,revision,next,actor,sequence,visit){if(this.rooms.get(room).revision!==revision||visit&&this.visits.get(room+actor).lastSequence!==sequence)return false;this.rooms.set(room,structuredClone(next));if(visit)this.visits.set(room+actor,structuredClone(visit));return true;}
}
const command=(type,extra={},sequence=1)=>({roomId:'ocean',requestId:`chat-request-${sequence}`,sequence,type,...extra});
function setup(){let now=1800000000000,sequence=0;const store=new Store(),service=createFishingService(store,{now:()=>now,random:()=>0});return {service,store,now:()=>now,advance:ms=>now+=ms,send:(type,extra={},actor='alice')=>service.command(actor,command(type,extra,++sequence))};}
const join={name:'小浪',preset:'cat'};
test('chat normalizes to one plain-text line, accepts 80 Unicode characters and rejects forged fields',()=>{
 assert.equal(validateFishingCommand(command('chat',{text:'  海风\n 好舒服 🐟  '})).text,'海风 好舒服 🐟');
 assert.equal(validateFishingCommand(command('chat',{text:'🐟'.repeat(80)})).text,'🐟'.repeat(80));
 assert.equal(validateFishingCommand(command('chat',{text:'<img src=x onerror=alert(1)>'})).text,'<img src=x onerror=alert(1)>');
 for(const text of ['', ' \n ', '🐟'.repeat(81), null,42,'hello\u0000world','hello\u202Eworld'])assert.throws(()=>validateFishingCommand(command('chat',{text})),{code:'INVALID_COMMAND'});
 for(const extra of [{actorId:'bob'},{createdAt:0},{expiresAt:Infinity},{html:'x'}])assert.throws(()=>validateFishingCommand(command('chat',{text:'hello',...extra})),{code:'INVALID_COMMAND'});
});
test('server-owned chat reaches observers, expires at eight seconds and receipt replay never extends it',async()=>{
 const x=setup();await x.send('join',join);const request=command('chat',{text:'大家好 🐟'},20),first=await x.service.command('alice',request),message=first.participants[0].chat;
 assert.equal(message.text,'大家好 🐟');assert.equal(message.createdAt,x.now());assert.equal(message.expiresAt,x.now()+8000);assert.ok(message.id);
 const observer=await x.service.snapshot('ocean','observer');assert.deepEqual(observer.participants[0].chat,message);assert.equal(observer.self.inventory.total,0);
 x.advance(7999);assert.deepEqual((await x.service.command('alice',request)).participants[0].chat,message);
 x.advance(1);assert.equal((await x.service.snapshot('ocean','observer')).participants[0].chat,undefined);assert.equal((await x.service.command('alice',request)).participants[0].chat,undefined);
});
test('visitor, full-room spectator, expired and NPC identities cannot send chat or emoji',async()=>{
 const x=setup();for(const type of ['chat','emote'])await assert.rejects(x.send(type,type==='chat'?{text:'hello'}:{emoji:'🐟'}),{code:'NOT_PARTICIPANT'});
 for(let i=0;i<10;i++)await x.send('join',join,`guest-${i}`);assert.equal((await x.send('join',join)).self.role,'spectator');
 await assert.rejects(x.send('chat',{text:'hello'}),{code:'NOT_PARTICIPANT'});await assert.rejects(x.send('emote',{emoji:'🐟'},'ambient:ocean:0'),{code:'FORBIDDEN'});
 x.advance(60000);await assert.rejects(x.send('chat',{text:'hello'},'guest-0'),{code:'NOT_PARTICIPANT'});
});
test('emoji uses bounded catalog and four seconds, keeps chat and fishing state intact',async()=>{
 const x=setup();await x.send('join',join);const cast=await x.send('cast');await x.send('chat',{text:'好运！'});const sent=await x.send('emote',{emoji:'🐟'});const p=sent.participants[0];
 assert.equal(p.emote.emoji,'🐟');assert.equal(p.emote.expiresAt-x.now(),4000);assert.equal(p.chat.text,'好运！');assert.deepEqual(sent.self.fishing,cast.self.fishing);
 for(const emoji of ['🙂','<svg>',null,'🐟🐟'])assert.throws(()=>validateFishingCommand(command('emote',{emoji})),{code:'INVALID_COMMAND'});
 x.advance(4000);let s=await x.service.snapshot('ocean','viewer');assert.equal(s.participants[0].emote,undefined);assert.ok(s.participants[0].chat);
 x.advance(1000);s=await x.send('reel');assert.equal(s.self.fishing.phase,'holding','social actions preserve five-second bite and reel window');
 await x.send('leave');await x.send('join',join);s=await x.service.snapshot('ocean','alice');assert.equal(s.participants[0].chat,undefined);assert.equal(s.participants[0].emote,undefined);
});
test('chat respects existing room rate limit and retries idempotently',async()=>{
 const x=setup();await x.send('join',join);for(let i=0;i<15;i++)await x.send('chat',{text:`hello ${i}`});
 const request=command('chat',{text:'retry'},30);await assert.rejects(x.service.command('alice',request),{code:'RATE_LIMITED'});x.advance(350);
 const sent=await x.service.command('alice',request);assert.equal(sent.participants[0].chat.text,'retry');assert.equal((await x.service.command('alice',request)).revision,sent.revision);
});
test('blank invisible text and malformed Unicode are rejected while valid joined emoji stays intact',()=>{
 for(const text of ['\u200b','\u200d','\u2060','\ufe0f','\ud800','x\udc00'])assert.throws(()=>validateFishingCommand(command('chat',{text})),{code:'INVALID_COMMAND'});
 assert.equal(validateFishingCommand(command('chat',{text:'一起钓鱼 👩‍👩‍👧‍👦'})).text,'一起钓鱼 👩‍👩‍👧‍👦');
});
test('chat receipt stores a digest, and ordinary room writes scrub expired speech content',async()=>{
 const x=setup();await x.send('join',join);await x.send('chat',{text:'private ephemeral sentence'});await x.send('emote',{emoji:'🐟'});
 const receipts=x.store.visits.get('oceanalice').receipts;assert.ok(!JSON.stringify(receipts).includes('private ephemeral sentence'));assert.match(receipts.find(r=>r.requestId==='chat-request-2').fingerprint,/^sha256:/);
 x.advance(8000);await x.send('heartbeat');const stored=x.store.rooms.get('ocean').participants[0];assert.equal(stored.chat,undefined);assert.equal(stored.emote,undefined);
});
