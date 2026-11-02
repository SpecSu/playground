import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const chat=await import('../lib/fishing-chat.ts');
test('single-line draft counts Unicode characters and IME confirmation never submits',()=>{
 assert.equal(chat.normalizeFishingChatDraft('海风\n\r\t舒服'), '海风 舒服');assert.equal([...chat.normalizeFishingChatDraft('🐟'.repeat(100))].length,80);
 for(const [event,composing,end,now] of [[{key:'Enter',isComposing:true},false,0,1000],[{key:'Enter',keyCode:229},false,0,1000],[{key:'Enter'},true,0,1000],[{key:'Enter'},false,950,1000],[{key:'Enter',shiftKey:true},false,0,1000]])assert.equal(chat.shouldSendFishingChatKey(event,composing,end,now),false);
 assert.equal(chat.shouldSendFishingChatKey({key:'Enter'},false,0,1000),true);
});
test('joined UI has chat and emoji; visitors keep only the large join CTA and viewing controls',()=>{
 const src=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');
 assert.match(src,/FishingChatComposer/);assert.match(src,/joined&&<button[^>]*fishing-avatar-control/);assert.match(src,/joined&&<button[^>]*fishing-emote-control/);
 assert.match(src,/className="fishing-top-strip"/);assert.doesNotMatch(src,/className="ocean-title"|className="empty-yacht-note"/);
 assert.match(src,/628\+Number\(liked\)/);
 assert.ok(existsSync(new URL('../components/fishing/FishingChatComposer.tsx',import.meta.url)));
});
test('bubble layout keeps owner first, bounds edges and never overlaps accepted speech rectangles',()=>{
 assert.equal(typeof chat.layoutFishingSpeech,'function');
 const layout=chat.layoutFishingSpeech([{id:'peer',x:40,y:300,width:160,height:50,priority:1},{id:'self',x:40,y:300,width:160,height:50,priority:10},{id:'top',x:300,y:130,width:170,height:60,priority:1}],390,140,555);
 assert.equal(layout.find(p=>p.id==='self').visible,true);assert.equal(layout.find(p=>p.id==='top').visible,false);
 const visible=layout.filter(p=>p.visible);for(const p of visible){assert.ok(p.left>=12&&p.right<=378&&p.top>=140&&p.bottom<=555);}
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);}
});
