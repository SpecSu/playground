import './view-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {ConvoySnapshot} from '../src/v7/convoy.ts';
test('convoy polling and pause wait for the successful room identity acknowledgment',async()=>{
 const {convoyIdentityReady}=await import('../src/v7/ConvoyApp.tsx');
 assert.equal(convoyIdentityReady(null,'invite-room'),false);
 const snapshot={room:{id:'invite-room'}} as ConvoySnapshot;
 assert.equal(convoyIdentityReady(snapshot,'invite-room'),true);
 assert.equal(convoyIdentityReady(snapshot,'different-room'),false);
 const source=readFileSync(new URL('../src/v7/ConvoyApp.tsx',import.meta.url),'utf8');
 assert.match(source,/if\(!convoyIdentityReady\(current.current,roomId.current\)\|\|document.hidden/);
 assert.match(source,/const pause=\(\)=>\{if\(convoyIdentityReady\(current.current,roomId.current\)\)navigator.sendBeacon/);
});
