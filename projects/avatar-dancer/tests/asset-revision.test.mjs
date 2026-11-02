import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Dynamic import keeps the pre-implementation failure an explicit assertion.
const assets=await import('../src/asset-revision.js').catch(()=>({}));
test('asset revision replaces stale revision and preserves query/hash with stable cache keys',()=>{
 assert.equal(typeof assets.versionedAssetUrl,'function');
 const url=assets.versionedAssetUrl('/assets/a.glb?quality=low&v=old#part');
 assert.equal(url,`/assets/a.glb?quality=low&v=${assets.ASSET_REVISION}#part`);
 assert.equal(assets.versionedAssetUrl(url),url);
 assert.equal(assets.versionedAssetUrl('/assets/a.glb'),assets.versionedAssetUrl('/assets/a.glb'));
});
test('all sixteen model URLs are versioned without changing original manifest paths',()=>{
 assert.equal(typeof assets.versionCharacterManifest,'function');
 const raw=JSON.parse(fs.readFileSync(new URL('../public/assets/characters/manifest.json',import.meta.url)));
 const before=JSON.stringify(raw),next=assets.versionCharacterManifest(raw);
 assert.equal(JSON.stringify(raw),before);
 let count=0;for(const [id,character] of Object.entries(next.characters))for(const [i,outfit] of character.outfits.entries()){
 for(const key of ['model','lowModel']){assert.equal(outfit[key],`${raw.characters[id].outfits[i][key]}?v=${assets.ASSET_REVISION}`);count++;}
 assert.equal(outfit.height,raw.characters[id].outfits[i].height);
 }assert.equal(count,16);
});
