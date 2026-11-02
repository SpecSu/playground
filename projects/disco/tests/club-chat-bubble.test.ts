import assert from 'node:assert/strict';
import test from 'node:test';
import { chatBubbleLayout } from '../lib/club-chat-bubble.ts';

test('projected bubbles keep full width in the phone and separate crowded heads', () => {
  const candidates = Array.from({ length: 3 }, (_, i) => ({ id: String(i), x: 195+i, y: 450+i, width: 160, height: 48, depth: 0.1*i }));
  const laid = chatBubbleLayout(candidates, 390, 758);
  assert.equal(laid.length, 3);
  for (const box of laid) { assert.ok(box.x-box.width/2>=12); assert.ok(box.x+box.width/2<=378); assert.ok(box.y-box.height>=144); }
  for (let i=0;i<laid.length;i++) for(let j=i+1;j<laid.length;j++) assert.ok(laid[i].y <= laid[j].y-laid[j].height-5 || laid[j].y <= laid[i].y-laid[i].height-5);
});
test('full panels are clamped and impossible collisions are omitted instead of stacking text', () => {
  const laid = chatBubbleLayout(Array.from({length:10}, (_,i)=>({id:String(i),x:i%2?10:380,y:155,width:200,height:90,depth:0.1*i})),390,758);
  assert.ok(laid.length < 10);
  assert.ok(laid.length > 0);
  assert.deepEqual(chatBubbleLayout([{id:'bad',x:NaN,y:200,width:100,height:40,depth:0}],390,758),[]);
});

test('scene chat uses plain text, server-clock expiry and cleans up removed participants', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
  assert.match(source, /const chat = chatAt\(rig\.participant, nowServer\)/);
  assert.match(source, /bubble\.textContent = chat\.text/);
  assert.doesNotMatch(source, /innerHTML|dangerouslySetInnerHTML/);
  assert.match(source, /if \(!ids\.has\(id\)\) \{ bubble\.remove\(\); chatBubbles\.delete\(id\); \}/);
  assert.match(source, /chatBubbles\.forEach\(bubble => bubble\.remove\(\)\)/);
  assert.match(source, /chatBubbles\.clear\(\)/);
  assert.match(source, /emotionBubbleAt\(rig\.participant, nowServer\)/);
  assert.match(source, /emotionBubbleAnchor\(rig\.root, rig\.model\.height, projected, rig\.preset, rig\.model\.groundLift, rig\.model\.root\)/);
  assert.match(source, /chatBubbleLayout\(chatCandidates, width, height\)/);
});
