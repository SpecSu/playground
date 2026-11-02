import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const selectors=[".feed-v020 .fishing-chat-composer", ".feed-v020 .fishing-chat-composer input", ".fishing-chat-composer input::placeholder", ".feed-v020 .fishing-chat-composer .chat-send", ".feed-v020 .fishing-chat-composer .chat-send:disabled"];
const rule=selector=>Object.fromEntries([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,s])=>s.trim().split(',').map(s=>s.trim()).includes(selector)).flatMap(([, ,body])=>body.split(';').filter(s=>s.includes(':')).map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim(),s.slice(i+1).trim()];})));
const rgb=value=>value.startsWith('#')?value.slice(1).match(/../g).map(v=>parseInt(v,16)):[...value.matchAll(/[\d.]+/g)].map(m=>Number(m[0]));
const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
const luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('composer text, placeholder and send remain legible over bright and dark scenes',()=>{
 const [surface,input,placeholder,send,disabled]=selectors.map(rule);
 assert.match(surface.background,/^rgba\(8,18,24,\.72\)$/,'dark translucent protection is present even while idle');
 assert.equal(input['font-size'],'16px');
 assert.equal(placeholder.opacity,'1','placeholder alpha is applied once, through its color');
 for(const backdrop of [[255,255,255],[0,0,0],[193,220,229],[255,226,183]]){
  const bg=blend(rgb(surface.background),backdrop);
  assert.ok(contrast(blend(rgb(input.color),bg),bg)>=4.5,'typed text contrast');
  // The requested subdued empty hint is translucent; composite it over the capsule.
  assert.ok(contrast(blend(rgb(placeholder.color),bg),bg)>=4.5,'subdued placeholder contrast');
  assert.ok(contrast(rgb(surface.color),bg)>=3,'composer icon contrast');
  for(const style of [send,disabled])assert.ok(contrast(rgb(style.color),rgb(style.background))>=4.5,'send icon contrast');
  assert.ok(contrast(rgb(send.background),bg)>=3,'enabled send boundary contrast');
 }
 assert.notEqual(send.background,disabled.background,'disabled send stays visibly distinct');
 assert.equal(disabled.opacity,'1','disabled icon never fades into the scene');
 assert.equal(input['caret-color'],'#ffffff');
 const selection=rule(selectors[1]+'::selection');
 assert.ok(contrast(rgb(selection.color),rgb(selection.background))>=4.5,'selected text contrast');
});

test('send uses a solid white circle and blue arrow',()=>{const send=rule(selectors[3]);assert.equal(send.background,'#ffffff');assert.equal(send.color,'#1967d2');});

test('focused composer retains idle protection without a larger opaque plate',()=>{
 const idle=rule(selectors[0]);
 for(const selector of [".feed-v020 .fishing-chat-composer.is-focused", ".feed-v020.fishing-feed.chat-focused .fishing-chat-composer"]){
  const focused={...idle,...rule(selector)};
  assert.equal(focused.background,idle.background);
  assert.equal(focused.color,idle.color);
 }
});

test('pressed composer controls stay opaque so capsule and arrow contrast never fade',()=>{
 for(const selector of [".feed-v020 .fishing-chat-composer .chat-send:active", ".feed-v020 .fishing-chat-composer .chat-dismiss:active"])assert.equal(rule(selector).opacity,'1',selector);
});
