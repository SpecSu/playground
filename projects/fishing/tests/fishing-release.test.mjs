import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';
test('independent fishing release has its own version, route, cookie and asset payload',()=>{const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');assert.equal(JSON.parse(read('package.json')).name,'dreamina-yacht-fishing');assert.equal(JSON.parse(read('public/build-info.json')).version,'0.3.5');assert.equal(existsSync(new URL('../public/audio/solace-scott-buckley.mp3',import.meta.url)),true);assert.equal(existsSync(new URL('../app/api/room',import.meta.url)),false);assert.match(read('app/page.tsx'),/FishingFeed/);assert.match(read('lib/fishing-d1.ts'),/fishing_device/);assert.doesNotMatch(read('components/fishing/FishingFeed.tsx'),/ClubAudio|new Audio|AudioContext/);assert.match(read('components/fishing/FishingProfilePage.tsx'),/yacht-preview\.png/);});

test('published build metadata reports ten human places and two ambient companions',()=>{
 const info=JSON.parse(readFileSync(new URL('../public/build-info.json',import.meta.url),'utf8'));
 assert.equal(info.capacity,10);
 assert.equal(info.ambientCharacters,2);
});

test('Solace asset is exact, licensed, full length and below the five-megabyte download bound',async()=>{
 const {createHash}=await import('node:crypto');const manifest=JSON.parse(readFileSync(new URL('../public/audio/manifest.json',import.meta.url),'utf8'));
 const bytes=readFileSync(new URL('../public'+manifest.path,import.meta.url));assert.equal(bytes.length,manifest.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert.ok(bytes.length<5*1024*1024);assert.ok(manifest.durationSeconds>355&&manifest.durationSeconds<358);assert.equal(manifest.originalSpeed,true);
 const credits=readFileSync(new URL('../public/audio/CREDITS.txt',import.meta.url),'utf8');for(const text of ['Solace','Scott Buckley','https://www.scottbuckley.com.au/library/solace/','https://creativecommons.org/licenses/by/4.0/','transcoded','fade'])assert.ok(credits.includes(text));
 const feed=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');assert.match(feed,/Solace — Scott Buckley/);assert.doesNotMatch(feed,/5[–-]30|waitSeconds/);assert.match(feed,/等鱼上钩/);
});
