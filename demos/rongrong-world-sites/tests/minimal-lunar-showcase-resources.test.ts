import test from 'node:test';import assert from 'node:assert/strict';
import formal from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import named from '../src/minimal/named-demo-resource-deployment.json' with {type:'json'};
import {createApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
import {createApprovedDemoResourceContext} from '../src/minimal/named-demo-resources.ts';
import {createLunarShowcaseScope,lunarShowcaseScopeInfo} from '../src/minimal/lunar-showcase-resources.ts';
import {LUNAR_SHOWCASE_CATALOG} from '../src/minimal/lunar-showcase-catalog.ts';
const origin=formal.target.id;
test('lunar static scope requires an existing issued origin-bound farm capability, never query/save JSON',()=>{
 for(const forged of [null,{}, {scope:'signed-in-farm'}, {name:'twx'}, {demoIdentity:{name:'twx'}}])assert.throws(()=>createLunarShowcaseScope(forged,origin));
 const f=createApprovedSignedInFarmResourceContext(formal,origin),d=createApprovedDemoResourceContext(named,origin);
 assert.deepEqual(lunarShowcaseScopeInfo(createLunarShowcaseScope(f,origin)),{origin,scope:'signed-in-farm',purpose:'visitor-showcase-only'});
 assert.equal(lunarShowcaseScopeInfo(createLunarShowcaseScope(d,origin)).scope,'named-demo');
 for(const wrong of ['http://localhost:5190','https://evil.example',origin+'/',origin+'?name=twx'])assert.throws(()=>createLunarShowcaseScope(f,wrong));
 assert.throws(()=>lunarShowcaseScopeInfo({}));
});
test('compressed zero-clip candidates are not admitted by presence, naming or current farm scope',()=>{
 assert.equal(LUNAR_SHOWCASE_CATALOG.length,5);assert.ok(LUNAR_SHOWCASE_CATALOG.every(r=>r.source.compactSha256!==r.model.sha256&&r.profile.actions.length>0));assert.equal(Object.isFrozen(LUNAR_SHOWCASE_CATALOG),true);
});
