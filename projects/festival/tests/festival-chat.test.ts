import test from 'node:test';
import assert from 'node:assert/strict';
async function chat(){ const api=await import('../lib/festival-chat.ts').catch(()=>null);assert.ok(api,'single-line chat normalization exists');return api; }
test('chat strips controls and bidi overrides, preserves emoji joiners and turns line breaks into spaces',async()=>{
 const {normalizeFestivalChat,limitFestivalDraft}=await chat();
 assert.equal(normalizeFestivalChat('  hi\n\t世界 👨‍👩‍👧‍👦\u202e\u0000  '),'  hi 世界 👨‍👩‍👧‍👦  ');
 assert.equal(limitFestivalDraft('😀'.repeat(81)),'😀'.repeat(80));
 assert.equal(normalizeFestivalChat('<script>alert(1)</script>'),'<script>alert(1)</script>');
});
test('send key handles native IME state, old keyCode and the composition-end boundary',async()=>{
 const {isFestivalSendKey}=await chat();
 assert.equal(isFestivalSendKey({key:'Enter'},false,1000,1201),true);
 for(const event of[{key:'x'},{key:'Enter',isComposing:true},{key:'Enter',keyCode:229},{key:'Enter',shiftKey:true}])assert.equal(isFestivalSendKey(event,false,-Infinity,2000),false);
 assert.equal(isFestivalSendKey({key:'Enter'},true,-Infinity,2000),false);
 assert.equal(isFestivalSendKey({key:'Enter'},false,1000,1199),false);
});

test('blank joiners, variation-only text and malformed Unicode are rejected without losing real emoji',async()=>{
 const api=await chat();assert.equal(typeof api.isValidFestivalChat,'function');
 for(const value of['',' \u200d\u200c ','\ufe0f','\ud800','\udfff','hello\ud800','😀'.repeat(81)])assert.equal(api.isValidFestivalChat(value),false,JSON.stringify(value));
 for(const value of['👨‍👩‍👧‍👦','❤️','你好','م\u200cن','<script>'])assert.equal(api.isValidFestivalChat(value),true,value);
});
