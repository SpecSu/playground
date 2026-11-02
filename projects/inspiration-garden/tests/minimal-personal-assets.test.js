import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildingSample,DEMO_BLUEPRINTS} from '../src/blueprints.js';
const read=p=>JSON.parse(fs.readFileSync(p)),baseline=read('tests/fixtures/minimal-personal-baseline.json'),manifest=()=>read('assets/art-manifest.json');
const hash=value=>createHash('sha256').update(value).digest('hex');
test('six simpler personal heroes replace ornate art without changing frame registration identities or gameplay geometry',()=>{
 const m=manifest();for(const id of baseline.activePersonalIDs){const old=baseline.sprites[id],s=m.sprites[id];assert.notEqual(s.image,old.image,id);for(const key of ['width','footprint','renderPivotCell','depthPivotCell','kind','preload'])assert.deepEqual(s[key],old[key],id+': '+key);assert.equal(s.interaction??buildingSample(id).interaction,buildingSample(id).interaction);assert.equal(fs.existsSync(s.image),true);assert.ok(s.frame.w>0&&s.frame.h>0);assert.ok(s.alphaBounds.w>0&&s.alphaBounds.h>0);assert.ok(s.alphaBounds.x>=0&&s.alphaBounds.y>=0);assert.ok(s.alphaBounds.x+s.alphaBounds.w<=s.frame.w&&s.alphaBounds.y+s.alphaBounds.h<=s.frame.h);assert.ok(s.anchor.every(x=>Number.isFinite(x)&&x>=0&&x<=1));}
});
test('approved Roadster registers the flat car at 180px with its measured three jet sockets',()=>{
 const s=manifest().sprites.airforce_memory_house;assert.equal(s.image,'assets/heroes/tesla-roadster-simplified-v1-runtime.webp');assert.equal(s.width,180);assert.deepEqual(s.anchor,[0.4458850056369786,0.7102593010146562]);assert.deepEqual(s.jetAnchors,[[0.21702367531003383,0.6144306651634723],[0.6144306651634723,0.8883878241262683],[0.8511837655016911,0.8500563697857948]]);
});
test('source cards, Kelly restore, Santa, other art, and reaction lifecycle modules are unchanged',()=>{
 const m=manifest(),album=read('assets/memory-album-manifest.json');for(const [id,frame]of Object.entries(baseline.sourceFrames))assert.deepEqual(album.frames[id],frame,id);// Garden composition is intentionally updated by dense-friend-beds; its landmark/identity invariants have dedicated coverage.
 for(const [file,sha]of Object.entries({...baseline.sourceFileSHA256,...baseline.preserveFileSHA256}).filter(([file])=>file!=='assets/garden-compositions.json'))assert.equal(hash(fs.readFileSync(file)),sha,file);
 const filtered={...m,sprites:Object.fromEntries(Object.entries(m.sprites).filter(([k])=>!baseline.allowedSpriteKeys.includes(k))),atlases:Object.fromEntries(Object.entries(m.atlases).filter(([k])=>!baseline.allowedAtlasKeys.includes(k)))};assert.equal(hash(JSON.stringify(filtered)),baseline.unrelatedArtManifestSHA256);
 for(const [id,old]of Object.entries(baseline.samples)){const current=buildingSample(id);for(const key of ['id','artKey','interaction','footprint','sourceFrameId','sourceType','sourceDate','sourceDateLabel','sourceDisclosure','sourceTitle','authorId','authorName','preferredApproachCellOffset'])assert.deepEqual(current[key],old[key],id+': '+key);}
 assert.deepEqual(DEMO_BLUEPRINTS['demo-blueprint-necklace_memory_monument'],baseline.necklaceDemoRecord);
});
test('all six matching cat expression stages remain lazy in one atlas while the existing fish texture stays separate',()=>{
 const m=manifest(),keys=['anticipation','bite','chew','chew-b','lick','settled'].map(k=>'cat_feed_'+k),images=new Set(keys.map(k=>m.sprites[k].image));assert.equal(images.size,1);assert.equal([...images][0],m.atlases.cat_feeding_atlas.image);assert.notEqual([...images][0],m.sprites.cat_feed_fish.image);for(const key of keys){assert.equal(m.sprites[key].preload,false);assert.ok(fs.existsSync(m.sprites[key].image));}assert.equal(m.atlases.cat_feeding_atlas.preload,false);
});
