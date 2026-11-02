import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('join unlock precedes awaited request, and public scene has one direct accessible speaker',()=>{
 const feed=read('components/DesertFeed.tsx');
 assert.match(feed,/useFestivalAudio\(page==='feed'&&ready,getSnapshot,serverTime\)/);
 const join=feed.slice(feed.indexOf('const join=async'),feed.indexOf('const startCreate='));
 assert.ok(join.indexOf('audio.requestFromGesture()')>=0);
 assert.ok(join.indexOf('audio.requestFromGesture()')<join.indexOf('await send'));
 assert.equal((feed.match(/className="festival-sound-toggle"/g)||[]).length,1);
 assert.match(feed,/onClick=\{audio.toggleFromGesture\}/);assert.match(feed,/aria-pressed=\{audio.playing\}/);
 assert.match(read('components/DesertFeed.css'),/festival-sound-toggle[^}]*min-width:44px[^}]*height:44px/);
});
test('audio lifecycle follows visibility, pagehide, navigation, connection and disposal',()=>{
 const hook=read('hooks/useFestivalAudio.ts');
 for(const event of ['visibilitychange','pagehide','pageshow'])assert.ok(hook.includes(event));
 assert.ok(hook.includes('audio.dispose()'));assert.ok(hook.includes('festivalSceneState(snapshot, now)'));
 assert.ok(hook.includes('getSnapshot'));assert.ok(hook.includes('serverTime'));
 assert.ok(hook.includes('buildTask.arrivalAt'));assert.ok(hook.includes('buildTask.finishAt'));
});
