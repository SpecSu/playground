import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import BoardingPanel from '../src/minimal/BoardingPanel.tsx';

const official='https://fluffy-farm-companions.tangguozhou.chatgpt.site/';
function markup(hostname,client){
 const old=globalThis.window;
 globalThis.window={location:{hostname,search:'?name=twx&uid=must-not-transfer&save=private'}};
 try{return renderToStaticMarkup(createElement(BoardingPanel,{client,onClose(){}}));}
 finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
}
test('actual local boarding gate offers the online formal farm without copying test identity or save query',()=>{
 for(const host of ['127.0.0.1','localhost'])for(const client of [undefined,{demoName:'twx',now:()=>0,account:{uid:'must-not-transfer'}}]){
  const html=markup(host,client);
  assert.ok(html.includes(`data-production-entry="true" href="${official}"`),host);
  assert.match(html,/真人寄养在在线牧场使用/);
  assert.ok(!html.includes('must-not-transfer'));assert.ok(!html.includes('save=private'));
 }
});
test('actual hosted boarding gates retain their same-site clean formal entry',()=>{
 for(const host of ['fluffy-farm-companions.tangguozhou.chatgpt.site','farm.example','localhost.attacker.example']){
  const html=markup(host,undefined);assert.ok(html.includes('data-production-entry="true" href="/"'),host);
  assert.ok(!html.includes('真人寄养在在线牧场使用'));
 }
});
