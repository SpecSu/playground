import test from 'node:test';
import assert from 'node:assert/strict';
import {createMinimalState,type MinimalAnimal} from '../src/minimal/model.ts';
import {getAnimalAtlasEntries,normalizeAnimalAtlasLedger,observeAnimalAtlas,recordAnimalAtlasReceipt} from '../src/minimal/animal-atlas.ts';

const now=1_793_000_000_000;
function animal(overrides:Partial<MinimalAnimal>={}):MinimalAnimal{return {id:'sheep-1',name:'云朵',species:'sheep',sex:'female',size:'normal',growth:{version:1,scales:[.6,.9,1.25]},position:{x:2,z:2},activity:'idle',energy:80,bond:0,bornAt:now,activityUntil:now,...overrides};}

test('old collection keeps sold discoveries without inventing sex or adult records',()=>{
 const state=createMinimalState(now);state.collection=['sheep','cow','sheep','unknown'];
 const entries=getAnimalAtlasEntries(state);
 assert.equal(entries.length,5);assert.equal(entries.filter(entry=>entry.discovered).length,2);
 const sheep=entries.find(entry=>entry.species==='sheep')!;assert.equal(sheep.ownedCount,0);assert.deepEqual(sheep.currentAnimals,[]);assert.equal(sheep.record,undefined);
 assert.equal(entries.find(entry=>entry.species==='duck')?.discovered,false);
 assert.deepEqual(observeAnimalAtlas(state).records,{});
});

test('observations are actual, monotone, immutable and survive selling an animal',()=>{
 const state=createMinimalState(now);state.animals=[animal()];state.collection=['sheep'];
 const before=structuredClone(state);const baby=observeAnimalAtlas(state,undefined,now);
 assert.deepEqual(baby.records.sheep,{sexes:['female'],adultSeen:false,maxObservedScale:.6,receivedViaWish:false});
 assert.deepEqual(state,before);assert.equal(getAnimalAtlasEntries(state,baby,now)[0].currentAnimals[0].stage,'baby');
 const adult=observeAnimalAtlas(state,baby,now+120_000);assert.equal(adult.records.sheep?.adultSeen,true);assert.equal(adult.records.sheep?.maxObservedScale,1.25);
 const rewound=observeAnimalAtlas(state,adult,now);assert.equal(rewound.records.sheep?.adultSeen,true);assert.equal(rewound.records.sheep?.maxObservedScale,1.25);
 state.animals=[];const sold=observeAnimalAtlas(state,adult,now+240_000);assert.deepEqual(sold,adult);assert.equal(getAnimalAtlasEntries(state,sold)[0].ownedCount,0);
 assert.equal(baby.records.sheep?.adultSeen,false,'a later observation never mutates the earlier ledger');
});

test('current animals and legitimate growthAgeMs are a conservative backwards-compatible discovery fallback',()=>{
 const state=createMinimalState(now);state.animals=[animal({growthAgeMs:120_000}),animal({id:'sheep-2',sex:'male'})];
 const ledger=observeAnimalAtlas(state,undefined,now);
 assert.deepEqual(ledger.records.sheep?.sexes,['male','female']);assert.equal(ledger.records.sheep?.adultSeen,true);
 const sheep=getAnimalAtlasEntries(state,ledger,now)[0];assert.equal(sheep.discovered,true);assert.equal(sheep.ownedCount,2);assert.deepEqual(sheep.currentAnimals.map(a=>a.stage),['adult','baby']);
});

test('a real observation keeps legacy missing-collection discoveries after sale, but empty or listing records do not',()=>{
 const state=createMinimalState(now);state.animals=[animal()];const ledger=observeAnimalAtlas(state);state.animals=[];
 assert.equal(getAnimalAtlasEntries(state,ledger)[0].discovered,true,'the saved observation survives even when the old collection omitted the species');
 for(const input of [{version:1,records:{sheep:{}}},{version:1,records:{sheep:{sexes:['unknown'],adultSeen:false,receivedViaWish:false}}},{version:1,records:{},offers:[animal()]},{version:1,records:{},receivedReceiptIds:['offer-only']}])assert.equal(getAnimalAtlasEntries(state,input)[0].discovered,false,'only an actual observed record can supplement collection');
});

test('unknown and malformed saved ledger fields are ignored without polluting prototypes',()=>{
 for(const input of [null,undefined,[],true,'{}',{}, {version:99,records:{sheep:{adultSeen:true}}}])assert.deepEqual(normalizeAnimalAtlasLedger(input),{version:1,records:{},receivedReceiptIds:[]});
 const raw=JSON.parse('{"version":1,"records":{"sheep":{"sexes":["female","fake","female"],"adultSeen":"true","maxObservedScale":99,"receivedViaWish":1},"pig":null,"dragon":{"adultSeen":true},"__proto__":{"adultSeen":true}},"receivedReceiptIds":["one","one","",33,"two"]}');
 const valid=normalizeAnimalAtlasLedger(raw);
 assert.deepEqual(valid.records,{sheep:{sexes:['female'],adultSeen:false,receivedViaWish:false}});assert.deepEqual(valid.receivedReceiptIds,['one','two']);assert.equal(Object.hasOwn(valid.records,'__proto__'),false);
 for(const bad of [NaN,Infinity,-1,0,2.3,'1'])assert.equal(normalizeAnimalAtlasLedger({version:1,records:{cow:{maxObservedScale:bad}}}).records.cow?.maxObservedScale,undefined);
 assert.equal(normalizeAnimalAtlasLedger({version:1,records:{cow:{maxObservedScale:2.2,adultSeen:true}}}).records.cow?.maxObservedScale,2.2);
});

test('wish discovery is recorded only from a completed receipt matching an actually owned animal and is idempotent',()=>{
 const state=createMinimalState(now);state.animals=[animal()];state.collection=['sheep'];const base=observeAnimalAtlas(state);
 for(const receipt of [null,{id:'offer-1',status:'open',receivedAnimalId:'sheep-1'},{id:'r1',status:'completed',receivedAnimalId:'other'},{id:'',status:'completed',receivedAnimalId:'sheep-1'}])assert.deepEqual(recordAnimalAtlasReceipt(state,base,receipt),base);
 const receipt={id:'receipt-1',status:'completed',receivedAnimalId:'sheep-1'};
 const received=recordAnimalAtlasReceipt(state,base,receipt,now);assert.equal(received.records.sheep?.receivedViaWish,true);assert.deepEqual(received.receivedReceiptIds,['receipt-1']);assert.equal(base.records.sheep?.receivedViaWish,false);
 assert.deepEqual(recordAnimalAtlasReceipt(state,received,receipt,now+120_000),received,'replaying a receipt does not observe unrelated later growth');
 state.animals=[];assert.deepEqual(recordAnimalAtlasReceipt(state,received,receipt),received,'selling after receipt does not erase its record');
});
