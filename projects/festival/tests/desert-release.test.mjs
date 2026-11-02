import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
test('the archived festival is detached from production identity with consistent v0.3.3 release',()=>{
 const pkg=json('package.json'),lock=json('package-lock.json'),build=json('public/build-info.json'),hosting=json('.openai/hosting.json');
 assert.equal(pkg.name,'dreamina-desert-festival');assert.equal(pkg.version,'0.3.3');assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);assert.equal(build.version,pkg.version);
 assert.equal(hosting.project_id,undefined,'archive must not retain a production deployment identity');assert.equal(hosting.d1,'DB');
 assert.match(fs.readFileSync(new URL('app/page.tsx',root),'utf8'),/<DesertFeed/);assert.ok(fs.existsSync(new URL('app/api/festival/route.ts',root)));
});
test('unrequested audio recordings and obsolete nightclub HTTP routes are not shipped',()=>{
 const assets=fs.readdirSync(new URL('public/audio/',root));assert.equal(assets.filter(name=>/\.(mp3|wav|ogg|m4a)$/i.test(name)).length,0);
 assert.equal(fs.existsSync(new URL('app/api/room/route.ts',root)),false);assert.equal(fs.existsSync(new URL('app/api/room/move/route.ts',root)),false);
 const feed=fs.readFileSync(new URL('components/DesertFeed.tsx',root),'utf8');assert.doesNotMatch(feed,/ClubAudio|requestPlayback|<audio/);
});
test('published preview and all twelve art thumbnails are present and use the PNG format',()=>{
 const paths=['public/festival-preview.png',...fs.readdirSync(new URL('public/installation-previews/',root)).map(p=>'public/installation-previews/'+p)];assert.equal(paths.length,13);
 for(const path of paths){const bytes=fs.readFileSync(new URL(path,root));assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.ok(bytes.length>1000);}
});
