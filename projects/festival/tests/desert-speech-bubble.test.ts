import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api = await import('../src/desert/speech-bubble.ts');
const graphemes = new Intl.Segmenter(undefined,{granularity:'grapheme'});
const measure=(text:string)=>Array.from(graphemes.segment(text),({segment})=>/^\s+$/.test(segment)?8:/^[a-zA-Z]$/.test(segment)?17:34).reduce((a,b)=>a+b,0);
test('speech width follows measured glyphs with constant padding and scale',()=>{
 assert.equal(typeof api.speechBubbleLayout,'function');
 const short=api.speechBubbleLayout('Hi',measure),cjk=api.speechBubbleLayout('你好',measure);
 assert.equal(short.width,34+56);assert.equal(cjk.width,68+56);
 assert.equal(short.worldWidth/short.width,cjk.worldWidth/cjk.width);
 assert.deepEqual(short.lines,['Hi']);assert.ok(short.worldWidth<1);
});
test('long mixed text and unbroken words wrap inside a 5.5-unit maximum',()=>{
 for(const text of ['中文 hello '.repeat(20),'W'.repeat(100),'🏜️👨‍👩‍👧‍👦👍🏽é'.repeat(20)]){
  const result=api.speechBubbleLayout(text,measure);
  assert.ok(result.lines.length>1);assert.ok(result.worldWidth<=5.5);
  assert.ok(result.lines.every(line=>measure(line)<=494));
  assert.equal(result.lines.join('').replaceAll(' ',''),text.replaceAll(' ',''));
  assert.equal(result.height,48*result.lines.length+62);
  assert.equal(result.worldHeight/result.height,.01);
 }
 const emoji=api.speechBubbleLayout('👨‍👩‍👧‍👦'.repeat(30),measure);
 assert.ok(emoji.lines.every(line=>Array.from(graphemes.segment(line)).every(({segment})=>segment==='👨‍👩‍👧‍👦')));
 assert.deepEqual(api.speechBubbleLayout('hello\n世界',measure).lines,['hello','世界']);
});
test('latest explicit emote shows the exact picker emoji and suppresses older speech after expiry',()=>{
 for(const [emote,icon] of Object.entries({wave:'👋',love:'❤️',laugh:'🤣',spin:'💫',dance:'🪩'})){
  const actor={emote:emote as 'wave',emoteAt:2000,message:{text:'old phrase',at:1000,expiresAt:20000}};
  assert.equal(api.festivalBubbleContent(actor,3000),icon);
  assert.equal(api.festivalBubbleContent(actor,7000),'');
 }
});
test('newer speech wins; timestamp ties preserve NPC speech and prioritize explicit user emotes',()=>{
 const actor={emote:'laugh' as const,emoteAt:2000,message:{text:'这个梦，刚刚搭好了',at:2000,expiresAt:10000}};
 assert.equal(api.festivalBubbleContent(actor,3000),'🤣');
 assert.equal(api.festivalBubbleContent({...actor,ambient:true},3000),actor.message.text);
 assert.equal(api.festivalBubbleContent({...actor,message:{...actor.message,at:3000}},4000),actor.message.text);
 assert.equal(api.festivalBubbleContent({...actor,message:{...actor.message,at:3000,expiresAt:4000}},4500),'');
 assert.equal(api.festivalBubbleContent({emote:'dance',emoteAt:0},3000),'');
});
test('scene keeps measured white speech bubbles distinct from transparent nicknames',()=>{
 const scene=readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');
 assert.match(scene,/speechBubbleLayout\(text,value=>measure.measureText\(value\).width\)/);
 assert.match(scene,/festivalBubbleContent\(p,now\)/);
 assert.doesNotMatch(scene,/bubble\?768|chars.slice\(i\*20|EMOTE_GLYPHS/);
 assert.match(scene,/roundRect/);
 assert.match(scene,/rgba\(255,255,255,.9\)/);
 assert.doesNotMatch(scene,/rgba\(24,18,16,.35\)/);
 assert.match(scene,/shadowColor/);
 assert.match(scene,/configureScreenSpaceText/);
});
test('single emoji uses larger readable typography in a compact bubble',()=>{
 assert.match(api.speechBubbleFont('🤣'),/64px/);
 assert.match(api.speechBubbleFont('❤️'),/64px/);
 assert.match(api.speechBubbleFont('👨‍👩‍👧‍👦'),/64px/);
 assert.match(api.speechBubbleFont('Hi 👋'),/34px/);
 const emoji=api.speechBubbleLayout('🤣',()=>64);
 assert.equal(emoji.width,120);assert.equal(emoji.lineHeight,80);assert.equal(emoji.height,142);
});
