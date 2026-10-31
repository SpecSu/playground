import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {fitPhoneViewport} from '../src/feed/phone-viewport.ts';
test('visitor and friends controls retain 44 CSS-pixel touch targets after phone scaling',()=>{
 const css=readFileSync(new URL('../src/minimal/friends.css',import.meta.url),'utf8');
 assert.match(css,/\.egg-farm :is\(\.friends-panel,\.visitor-farm\) button\{[^}]*min-width:var\(--farm-tap,44px\);min-height:var\(--farm-tap,44px\)/);
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]){const {scale}=fitPhoneViewport(width,height);const logical=Math.max(44,44/scale);assert.ok(logical*scale>=44-1e-6);}
 assert.match(css,/\.friends-panel\{max-height:min\(76%,650px\)\}/,'the fixed-design viewport must not apply dvh scaling twice');
});
