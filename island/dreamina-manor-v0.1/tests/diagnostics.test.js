import test from 'node:test';import assert from 'node:assert/strict';
import {observeStore,serviceFailure} from '../lib/server/diagnostics.js';
const correlation='ec6d543f-d9ae-4d44-84e1-5767eb696e14';
test('service diagnostics expose only anonymous fixed classifications',()=>{
 const e=new Error('D1_ERROR: database is locked; uid=private-player nickname secret chat body');e.name='private-name';e.stack='private-stack';
 const out=serviceFailure(e,{correlation,stage:'service.read',failureStage:'store.read'});
 assert.deepEqual(out,{event:'manor_service_error',correlation,stage:'store.read',errorClass:'D1_BUSY'});
 assert.ok(!JSON.stringify(out).includes('private'));
 assert.equal(serviceFailure(e,{correlation:'private-token',stage:'private-body'}).correlation,'unavailable');
});
test('store observation keeps successful values and original errors, recording innermost fixed stage',async()=>{
 const trace={correlation,stage:'service.read'},failure=new TypeError('private-state');
 const store=observeStore({async visit(){return this.read();},async read(){throw failure;},async ensure(){return 12;}},trace);
 assert.equal(await store.ensure('private-uid'),12);
 await assert.rejects(store.visit('private-session'),e=>e===failure);
 assert.equal(trace.failureStage,'store.read');
 assert.equal(serviceFailure(failure,trace).errorClass,'TYPE_ERROR');
});
