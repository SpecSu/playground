import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=()=>JSON.parse(fs.readFileSync('assets/art-manifest.json')),album=()=>JSON.parse(fs.readFileSync('assets/memory-album-manifest.json'));
const baseline=JSON.parse(fs.readFileSync('tests/fixtures/sculptural-preserved-baseline.json'));
test('personal update preserves yellow LAMY source, real cat source provenance and original estate catalogue byte for byte',()=>{
 assert.equal(manifest().sprites.lamy_memory_column.width,50);assert.deepEqual(album().frames['lamy-pen-memory-photo'],baseline.penSource);assert.deepEqual(album().frames['fluffy-cat-real-photo'],baseline.catSource);
 for(const [path,hash]of Object.entries(baseline.sha256))assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,path);
});
test('complete minimal cat and historical silver pendant use approved art and measured reaction landmarks',()=>{
 const m=manifest(),cat=m.sprites.fluffy_cat_cottage,pendant=m.sprites.necklace_memory_monument;
 assert.match(cat.image,/minimal/);assert.deepEqual(cat.catFeeding.faceCenter,[405,435]);assert.equal(cat.catFeeding.faceWidth,320);assert.deepEqual(cat.catFeeding.fishMouth,[360,489]);
 for(const id of ['anticipation','bite','chew','chew-b','lick','settled']){const s=m.sprites['cat_feed_'+id];assert.match(s.image,/minimal-v1/);assert.equal(s.frame.w,288);assert.equal(s.frame.h,207);assert.equal(s.preload,false);assert.ok(fs.existsSync(s.image));}
 assert.match(pendant.image,/sculptural/);assert.deepEqual(pendant.pendantAnchor,[0.5741626794258373,0.5007974481658692]);assert.equal(pendant.width,188);
 assert.match(album().frames['necklace-memory-photo'].image,/silver/);assert.doesNotMatch(JSON.stringify(album().frames['necklace-memory-photo']),/金色链环|personal-necklace-source-v1/);
});
test('Roadster replaces the obsolete shoe runtime source with clearly illustrative car inspiration',()=>{
 const m=manifest(),a=album(),car=m.sprites.airforce_memory_house;assert.match(car.image,/roadster/);assert.deepEqual(car.footprint,[2,1]);assert.equal(car.interaction,'hover');assert.equal(car.jetAnchors.length,3);assert.ok(!a.frames['airforce-shoes-memory-photo']);assert.ok(fs.existsSync(a.frames['roadster-rocket-memory-photo'].image));assert.match(a.frames['roadster-rocket-memory-photo'].disclosure,/非用户/);assert.doesNotMatch(JSON.stringify(a),/personal-airforce-source-v1|personal-necklace-source-v1/);
});
test('new personal trio has approved measured art, landmarks and separately disclosed source images',()=>{
 const m=manifest(),a=album();for(const [id,width,fp,source,landmark]of [['xt50_memory_camera',89,[1,1],'xt50-memory-photo','lensAnchor'],['scallop_shell_house',200,[2,2],'scallop-shell-memory-photo','ribGlowAnchors'],['camping_tarp_pavilion',155,[2,2],'camping-tarp-memory-photo','lanternAnchor']]){const s=m.sprites[id];assert.ok(s,id);assert.equal(s.width,width);assert.deepEqual(s.footprint,fp);assert.equal(s.preload,false);assert.ok(s[landmark]);assert.ok(s.alphaBounds.w>0);assert.ok(fs.existsSync(s.image));assert.ok(fs.existsSync(a.frames[source].image));assert.match(a.frames[source].disclosure,/非用户/);assert.equal(a.frames[source].preload,false);}
});
