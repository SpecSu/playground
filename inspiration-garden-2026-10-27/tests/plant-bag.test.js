import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {DEMO_GARDENS} from '../src/catalogue.js';
import {validateState,loadGame,saveGame,SAVE_KEY} from '../src/storage.js';
const NOW=Date.UTC(2026,9,26,1),fresh=()=>createState(NOW,'bag-owner');
const act=(s,a,t=NOW)=>{const r=reduce(s,a,t);assert.equal(r.ok,true,r.message);assert.equal(validateState(r.state),true);return r.state;};
test('packing rejects a growing plant atomically just before maturity and accepts the exact maturity boundary',()=>{
 const s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'}),plant=s.plants[0],snapshot=structuredClone(s);
 const rejected=reduce(s,{type:'PACK_PLANT',plantId:plant.id},plant.readyAt-1);
 assert.equal(rejected.ok,false);assert.equal(rejected.state,s);assert.deepEqual(s,snapshot);assert.match(rejected.message,/成熟|长大/);
 const packed=act(s,{type:'PACK_PLANT',plantId:plant.id},plant.readyAt);assert.deepEqual(packed.plantBag,[plant]);assert.deepEqual(packed.plants,[]);
 assert.deepEqual([packed.coins,packed.crystals,packed.inventory],[s.coins,s.crystals,s.inventory]);
 const seenMature={...s,lastSeenAt:plant.readyAt};assert.equal(reduce(seenMature,{type:'PACK_PLANT',plantId:plant.id},plant.readyAt-1).ok,true,'injected clock cannot rewind observed maturity');
});
test('legacy growing specimens already in the bag keep their save bytes, identity and growth when restored',()=>{
 const planted=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'}),plant=structuredClone(planted.plants[0]);
 const legacy={...planted,plants:[],plantBag:[plant]},map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.equal(saveGame(store,legacy,NOW).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store,NOW+1);
 assert.equal(loaded.status,'loaded');assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.deepEqual(loaded.state,legacy);
 const restored=act(loaded.state,{type:'RESTORE_PLANT',plantId:plant.id,tileId:'tile-1-1'},NOW+1);
 assert.deepEqual(restored.plants,[{...plant,tileId:'tile-1-1'}]);assert.deepEqual(restored.plantBag,[]);assert.equal(restored.plants[0].readyAt>restored.lastSeenAt,true);
 const repack=reduce(restored,{type:'PACK_PLANT',plantId:plant.id},plant.readyAt-1);assert.equal(repack.ok,false);assert.equal(repack.state,restored);
 assert.deepEqual([restored.coins,restored.crystals,restored.inventory],[legacy.coins,legacy.crystals,legacy.inventory]);
 assert.equal(saveGame(store,restored,NOW+1,{expectedHead:raw}).ok,true);assert.deepEqual(loadGame(store,NOW+1).state,restored);
});
test('mature packing stores the identical whole plant without seed, coin or crystal changes',()=>{
 let s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'});const plant=structuredClone(s.plants[0]),balances=[s.coins,s.crystals,s.inventory.radish];
 s=act(s,{type:'PACK_PLANT',plantId:plant.id},plant.readyAt);assert.deepEqual(s.plantBag,[plant]);assert.equal(s.plants.length,0);assert.deepEqual([s.coins,s.crystals,s.inventory.radish],balances);
 assert.equal(reduce(s,{type:'PACK_PLANT',plantId:plant.id},plant.readyAt+1).ok,false);assert.equal(reduce(s,{type:'SELL',plantId:plant.id},NOW+20000).ok,false);
 s=act(s,{type:'RESTORE_PLANT',plantId:plant.id,tileId:'tile-1-1'},NOW+20000);assert.deepEqual(s.plants[0],{...plant,tileId:'tile-1-1'});assert.equal(s.plantBag.length,0);
 assert.equal(reduce(s,{type:'RESTORE_PLANT',plantId:plant.id,tileId:'tile-1-0'},NOW+20000).ok,false);
 s=act(s,{type:'SELL',plantId:plant.id},NOW+20000);assert.equal(s.coins,134);assert.equal(reduce(s,{type:'SELL',plantId:plant.id},NOW+20000).ok,false);
});
test('restore into occupied or platform cell fails atomically and never consumes the packed instance',()=>{
 let s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'});const id=s.plants[0].id;s=act(s,{type:'PACK_PLANT',plantId:id},s.plants[0].readyAt);s=act(s,{type:'PLANT',tileId:'tile-1-1',varietyId:'radish'});s=act(s,{type:'BUILD',kind:'platform',x:2,y:1});
 for(const tileId of ['tile-1-1','tile-2-1','missing']){const r=reduce(s,{type:'RESTORE_PLANT',plantId:id,tileId},NOW);assert.equal(r.ok,false);assert.equal(r.state,s);}
});
test('mature shake is one deterministic same-variety seed per Beijing day across home copies and pack/restore',()=>{
 let s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'}),id=s.plants[0].id;
 assert.equal(reduce(s,{type:'SHAKE_SEED',plantId:id},NOW+14000).ok,false);s=act(s,{type:'SHAKE_SEED',plantId:id},NOW+15000);assert.equal(s.inventory.radish,2);
 s=act(s,{type:'PACK_PLANT',plantId:id},NOW+15001);s=act(s,{type:'RESTORE_PLANT',plantId:id,tileId:'tile-1-1'},NOW+15002);assert.equal(reduce(s,{type:'SHAKE_SEED',plantId:id},NOW+15003).ok,false);
 s=act(s,{type:'SHAKE_SEED',plantId:id},NOW+86400000);assert.equal(s.inventory.radish,3);assert.equal(s.coins,120);assert.equal(s.crystals,3);
});
test('demo claim and own shake share quota and never allow packing or selling demo assets',()=>{
 const g=DEMO_GARDENS[0],p=g.plants.find(p=>p.varietyId==='demo-drum_pumpkin');let s=fresh(),args={gardenId:g.id,plantId:p.id};
 assert.equal(reduce(s,{type:'SHAKE_SEED',...args},NOW).ok,false);s=act(s,{type:'INTERACT_DEMO',...args});s=act(s,{type:'SHAKE_SEED',...args});
 s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:p.varietyId});assert.equal(reduce(s,{type:'SHAKE_SEED',plantId:s.plants[0].id},NOW+100000).ok,false);
 assert.equal(reduce(s,{type:'PACK_PLANT',...args},NOW+100000).ok,false);assert.equal(reduce(s,{type:'SELL',...args},NOW+100000).ok,false);
});
test('old checksummed save validates before optional bag defaults and preserves the original expected head',()=>{
 const old=fresh();delete old.plantBag;const serialized=JSON.stringify(old);let h=2166136261;for(let i=0;i<serialized.length;i++)h=Math.imul(h^serialized.charCodeAt(i),16777619);
 const raw=JSON.stringify({format:1,state:old,checksum:(h>>>0).toString(16)}),map=new Map([[SAVE_KEY,raw]]),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const loaded=loadGame(store,NOW);assert.equal(loaded.status,'loaded');assert.deepEqual(loaded.state,{...old,plantBag:[]});assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);
 assert.equal(saveGame(store,loaded.state,NOW,{expectedHead:raw}).ok,true);
 const broken=JSON.parse(raw);broken.state.coins=999;store.setItem(SAVE_KEY,JSON.stringify(broken));store.setItem(SAVE_KEY+':recovery','bad');assert.equal(loadGame(store,NOW).status,'corrupt');
});
test('bag validation rejects duplicate instance IDs, unknown varieties and malformed optional values',()=>{
 const s=fresh(),p={id:'packed',tileId:'removed-tile',varietyId:'radish',plantedAt:NOW,readyAt:NOW+15000};
 assert.equal(validateState({...s,plantBag:[p]}),true);
 for(const plantBag of [null,{},[p,p],[{...p,varietyId:'missing'}],[{...p,readyAt:NOW-1}]])assert.equal(validateState({...s,plantBag}),false);
 const onLand={...p,tileId:'tile-0-0'};assert.equal(validateState({...s,plants:[onLand],plantBag:[p]}),false);
});
test('placed and packed references require bounded own string variety IDs, never coerced or prototype keys',()=>{
 const s=fresh(),p={id:'malformed',tileId:'tile-0-0',plantedAt:NOW,readyAt:NOW+1000};
 for(const varietyId of ['constructor','toString','__proto__',['radish'],{toString:()=> 'radish'},'', 'x'.repeat(181)])for(const place of ['plants','plantBag'])assert.equal(validateState({...s,[place]:[{...p,varietyId}]}),false,`${place}: ${String(varietyId)}`);
});
test('selling a packed mature instance pays its trusted price once, counts a sale and preserves same-variety neighbors/quota',()=>{
 let s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'});const p=s.plants[0],other={...p,id:'same-variety-other',tileId:'removed'};s={...s,lastSeenAt:p.readyAt,plants:[],plantBag:[p,other],claims:{radish:'2026-10-26'}};const claims=structuredClone(s.claims),inventory=structuredClone(s.inventory);
 const sold=act(s,{type:'SELL_PACKED_PLANT',plantId:p.id,salePrice:999999},p.readyAt);assert.equal(sold.coins,134);assert.equal(sold.sales,1);assert.deepEqual(sold.plantBag,[other]);assert.deepEqual(sold.claims,claims);assert.deepEqual(sold.inventory,inventory);assert.equal(sold.crystals,3);assert.equal(reduce(sold,{type:'SELL_PACKED_PLANT',plantId:p.id},p.readyAt).state,sold);
 const map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};assert.equal(saveGame(store,sold,p.readyAt).ok,true);assert.deepEqual(loadGame(store).state,sold);
});
test('packed sale rejects legacy growing, on-ground/missing/demo and exhausted save counters atomically',()=>{
 const s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'}),p=s.plants[0],bagged={...s,plants:[],plantBag:[p]};
 for(const [state,a,time] of [[bagged,{plantId:p.id},p.readyAt-1],[s,{plantId:p.id},p.readyAt],[bagged,{plantId:'missing'},p.readyAt],[bagged,{plantId:p.id,gardenId:'music'},p.readyAt],[{...bagged,coins:10000000},{plantId:p.id},p.readyAt],[{...bagged,sales:10000000},{plantId:p.id},p.readyAt]]){const before=structuredClone(state),r=reduce(state,{type:'SELL_PACKED_PLANT',...a},time);assert.equal(r.ok,false);assert.equal(r.state,state);assert.deepEqual(state,before);}
 assert.equal(reduce(bagged,{type:'SELL_PACKED_PLANT',plantId:p.id},p.readyAt).ok,true);
});
