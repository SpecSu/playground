import './view-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
test('Sites can render the V8 shell without any browser globals',async()=>{
 assert.equal(typeof window,'undefined');
 const {default:Page}=await import('../app/page.tsx');
 const html=renderToStaticMarkup(createElement(Page));
 assert.match(html,/id="root"/);assert.match(html,/role="status"/);assert.match(html,/正在准备绒绒世界/);
});
test('Sites retains original framing and declares cloud storage without claiming Mac synchronization',()=>{
 const view=readFileSync(new URL('../src/v5/EstateView.tsx',import.meta.url),'utf8');
 assert.match(view,/本站云端/);assert.match(view,/Mac 本地存档独立/);assert.doesNotMatch(view,/记录保存在这台Mac/);
 const viewport=readFileSync(new URL('../src/feed/phone-viewport.ts',import.meta.url),'utf8');assert.match(viewport,/390/);assert.match(viewport,/844/);
});
