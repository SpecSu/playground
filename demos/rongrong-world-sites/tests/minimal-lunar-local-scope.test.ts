import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import named from '../src/minimal/named-demo-resource-deployment.json' with {type:'json'};
import formal from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedDemoResourceContext} from '../src/minimal/named-demo-resources.ts';
import {createApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
import {createLunarShowcaseScope,lunarShowcaseScopeInfo} from '../src/minimal/lunar-showcase-resources.ts';
import {LunarShowcaseAssetLibrary} from '../src/minimal/lunar-showcase-assets.ts';
import {LUNAR_SHOWCASE_CATALOG} from '../src/minimal/lunar-showcase-catalog.ts';
test('exact loopback named-demo capability admits the same five pinned visitor-only skins',async()=>{
 for(const origin of ['http://127.0.0.1:5190','http://localhost:5190']){
  const context=createApprovedDemoResourceContext(named,origin),scope=createLunarShowcaseScope(context,origin);
  assert.deepEqual(lunarShowcaseScopeInfo(scope),{origin,scope:'named-demo',purpose:'visitor-showcase-only'});
  const library=new LunarShowcaseAssetLibrary(scope,undefined,{textureMode:'headers-only',loadBytes:async url=>readFileSync(new URL('../public'+url.split('?')[0],import.meta.url))});
  const actors=await Promise.all(LUNAR_SHOWCASE_CATALOG.map(r=>library.instantiate(r.id)));assert.equal(actors.length,5);
  for(const [i,actor]of actors.entries()){assert.equal(actor.definition.model.sha256,LUNAR_SHOWCASE_CATALOG[i].model.sha256);assert.ok(actor.animations.some(c=>c.name==='walk'));actor.release();}library.dispose();
 }
});
test('local lunar approval cannot be forged or rebound from hosted or another origin',()=>{
 const local=createApprovedDemoResourceContext(named,'http://127.0.0.1:5190'),hosted=createApprovedDemoResourceContext(named,formal.target.id),signed=createApprovedSignedInFarmResourceContext(formal,formal.target.id);
 for(const forged of [null,{}, {name:'twx'}, {scope:'named-demo'}])assert.throws(()=>createLunarShowcaseScope(forged,'http://127.0.0.1:5190'));
 for(const bad of ['http://127.0.0.1:5191','http://localhost.evil:5190','http://127.0.0.1:5190/','http://127.0.0.1:5190?name=twx','https://localhost:5190','http://[::1]:5190'])assert.throws(()=>createLunarShowcaseScope(local,bad));
 assert.throws(()=>createLunarShowcaseScope(hosted,'http://localhost:5190'));assert.throws(()=>createLunarShowcaseScope(signed,'http://localhost:5190'));assert.throws(()=>createLunarShowcaseScope(local,formal.target.id));
});
