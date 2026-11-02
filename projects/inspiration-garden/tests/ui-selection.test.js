import test from 'node:test';
import assert from 'node:assert/strict';
import {createSelectionLoader} from '../src/ui-state.js';
test('slow older avatar load cannot overwrite a newer ready choice',async()=>{
 const loader=createSelectionLoader(),committed=[];let finishOld;
 const old=loader.select(()=>new Promise(r=>finishOld=r),()=>committed.push('old'));
 const newest=await loader.select(async()=>true,()=>committed.push('new'));assert.equal(newest.ok,true);finishOld(true);
 const stale=await old;assert.equal(stale.stale,true);assert.deepEqual(committed,['new']);
});
test('missing image keeps existing avatar choice intact and allows a later retry',async()=>{
 const loader=createSelectionLoader();let avatar='original';const failed=await loader.select(async()=>false,()=>avatar='missing');assert.equal(failed.ok,false);assert.equal(avatar,'original');
 await loader.select(async()=>true,()=>avatar='ready');assert.equal(avatar,'ready');
});
import {plantGesturePhase} from '../src/ui-state.js';
test('first contact locks layout and defers context until release, with cancellation preserving previous selection',()=>{
 const initial={panel:'visit',selection:null,activePlantGesture:null};const down=plantGesturePhase(initial,'start','puffer');assert.equal(down.activePlantGesture,'puffer');assert.equal(down.panel,'visit');assert.equal(down.selection,null);
 const held=plantGesturePhase(down,'hold','puffer');assert.equal(held,down);
 const released=plantGesturePhase(held,'end','puffer');assert.equal(released.activePlantGesture,null);assert.equal(released.panel,null);assert.deepEqual(released.selection,{kind:'plant',id:'puffer'});
 const canceled=plantGesturePhase(down,'cancel','puffer');assert.equal(canceled.activePlantGesture,null);assert.equal(canceled.panel,'visit');assert.equal(canceled.selection,null);
});
import {preparePlantContact} from '../src/ui-state.js';
test('external sale of a held plant cannot leave the terminal contact layout-locked forever',()=>{
 const held={activePlantGesture:'sold',selection:null,panel:null};const result=preparePlantContact(held,'end','sold',[]);
 assert.equal(result.ui.activePlantGesture,null);assert.equal(result.ui.selection,null);assert.equal(result.plant,undefined);
 const canceled=preparePlantContact(held,'cancel','sold',[]);assert.equal(canceled.ui.activePlantGesture,null);
});
test('canceling a selector route invalidates its pending choice even if the selector is reopened before completion',async()=>{
 const loader=createSelectionLoader(),committed=[];let finish;const pending=loader.select(()=>new Promise(r=>finish=r),()=>committed.push('old'));assert.equal(typeof loader.cancel,'function');loader.cancel();finish(true);assert.equal((await pending).stale,true);assert.deepEqual(committed,[]);await loader.select(async()=>true,()=>committed.push('new'));assert.deepEqual(committed,['new']);
});
