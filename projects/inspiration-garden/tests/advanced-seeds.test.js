import test from 'node:test';import assert from 'node:assert/strict';
import {createState,reduce,getVariety,availableBasics,isValidVariety} from '../src/state.js';import {BASIC_VARIETIES,CREATIVE_SAMPLES,ADVANCED_VARIETIES} from '../src/catalogue.js';import {validateState,saveGame,loadGame,SAVE_KEY} from '../src/storage.js';import {footprintOf,occupiedTileIds} from '../src/footprints.js';import {renderPanel,knownVarieties} from '../src/ui.js';
const NOW=Date.UTC(2026,9,26,6),fresh=()=>createState(NOW,'advanced-owner'),memory=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const act=(s,a,t=NOW)=>{const r=reduce(s,a,t);assert.equal(r.ok,true,r.message);assert.equal(validateState(r.state),true);return r.state;};
test('four exact official tiers progressively unlock without changing any original eight basic identities',()=>{
 assert.equal(BASIC_VARIETIES.length,8);assert.equal(ADVANCED_VARIETIES.length,4);assert.deepEqual(ADVANCED_VARIETIES.map(v=>[v.seedPrice,v.salePrice,v.growMs/1000,v.unlockSales]),[[500,760,5400,12],[800,1200,10800,24],[1200,1800,21600,40],[1800,2700,43200,60]]);
 for(const v of ADVANCED_VARIETIES){assert.deepEqual(footprintOf(v),[2,2]);assert.equal(availableBasics({...fresh(),sales:v.unlockSales-1}).some(x=>x.id===v.id),false);assert.equal(availableBasics({...fresh(),sales:v.unlockSales}).some(x=>x.id===v.id),true);assert.equal(isValidVariety(v),true);assert.equal(isValidVariety({...v,seedPrice:v.seedPrice+1}),false);}
 const high={...CREATIVE_SAMPLES[0],id:'too-rich',authorId:'friend',authorName:'Friend',rootId:'too-rich',parentId:null,seedPrice:240,salePrice:360,growMs:360000};assert.equal(isValidVariety(high),false);
});
test('legacy save without advanced records loads byte-for-byte; unlocked absent official is visible and inserted on buy only',()=>{
 let s={...fresh(),sales:60,coins:20000};for(const v of ADVANCED_VARIETIES)delete s.varieties[v.id];const store=memory();assert.equal(saveGame(store,s,NOW).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store);assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.deepEqual(loaded.state,s);
 for(const v of ADVANCED_VARIETIES){assert.deepEqual(getVariety(s,v.id),v);assert.ok(knownVarieties(s).some(x=>x.id===v.id));assert.equal(Object.hasOwn(s.varieties,v.id),false);}
 const v=ADVANCED_VARIETIES[0];s=act(s,{type:'BUY_SEED',varietyId:v.id});assert.deepEqual(s.varieties[v.id],v);assert.equal(s.inventory[v.id],1);assert.equal(s.coins,20000-v.seedPrice);assert.equal(s.crystals,3);assert.equal(saveGame(store,s,NOW,{expectedHead:raw}).ok,true);
 const locked=renderPanel(fresh(),{panel:'bag',bagTab:'seeds'},{});for(const v of ADVANCED_VARIETIES){assert.doesNotMatch(locked,new RegExp(v.name));assert.doesNotMatch(locked,new RegExp(`data-art="${v.artKey}"`));}
});
test('every advanced seed reserves4cells, retains own identity through mature pack/restore and sells exactly once at trusted value',()=>{
 for(const v of ADVANCED_VARIETIES){let s={...fresh(),sales:v.unlockSales,coins:20000,firstBasicPlanted:true};s=act(s,{type:'BUY_SEED',varietyId:v.id});s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:v.id});const p=s.plants[0];assert.equal(p.readyAt-NOW,v.growMs);assert.equal(occupiedTileIds(s,p,v).length,4);for(const tile of s.tiles){assert.equal(reduce(s,{type:'PLANT',tileId:tile.id,varietyId:'radish'},NOW).ok,false);assert.equal(reduce(s,{type:'RECLAIM',targetId:tile.id},NOW).ok,false);}
 s=act(s,{type:'PACK_PLANT',plantId:p.id},p.readyAt);s=act(s,{type:'RESTORE_PLANT',plantId:p.id,tileId:'tile-0-0'},p.readyAt);assert.deepEqual(s.plants[0],p);s=act(s,{type:'SELL',plantId:p.id},p.readyAt);assert.equal(s.coins,20000-v.seedPrice+v.salePrice);assert.equal(reduce(s,{type:'SELL',plantId:p.id},p.readyAt).state,s);assert.equal(saveGame(memory(),s).ok,true);}
});
test('a schema-valid old creative colliding with a new official ID keeps its art price attribution and raw save head',()=>{
 const official=ADVANCED_VARIETIES[0],s={...fresh(),sales:27},v={...CREATIVE_SAMPLES.find(v=>v.id==='cloud_lantern'),id:official.id,authorId:s.uid,authorName:s.profileName,parentId:null,rootId:official.id};s.varieties[v.id]=v;s.inventory[v.id]=1;const store=memory();assert.equal(validateState(s),true);assert.equal(saveGame(store,s).ok,true);const raw=store.getItem(SAVE_KEY),loaded=loadGame(store);assert.deepEqual(loaded.state.varieties[v.id],v);assert.equal(loaded.head,raw);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(availableBasics(s).some(x=>x.id===official.id),false);assert.deepEqual(getVariety(s,v.id),v);assert.deepEqual(footprintOf(v),[1,1]);
});
test('locked poor and exhausted-stock purchases never debit or add optional official records',()=>{
 const v=ADVANCED_VARIETIES[0];for(const s of [fresh(),{...fresh(),sales:v.unlockSales,coins:v.seedPrice-1},{...fresh(),sales:v.unlockSales,coins:20000,varieties:{...fresh().varieties,[v.id]:v},inventory:{radish:2,[v.id]:10000000}}]){const before=structuredClone(s),r=reduce(s,{type:'BUY_SEED',varietyId:v.id},NOW);assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);}
});
test('exact advanced economics do not bypass shared identity/description/gesture shape checks',()=>{
 const v=ADVANCED_VARIETIES[0];for(const change of [{description:{}},{gesture:[]},{keywords:[null]},{authorName:[]}])assert.equal(isValidVariety({...v,...change}),false);
});
test('advanced first-ever official plant always keeps its quoted duration and never consumes the original tutorial shortcut',()=>{
 for(const firstBasicPlanted of [false,true])for(const v of ADVANCED_VARIETIES){let s={...fresh(),sales:v.unlockSales,coins:20000,firstBasicPlanted};s=act(s,{type:'BUY_SEED',varietyId:v.id});s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:v.id});assert.equal(s.plants[0].readyAt-NOW,v.growMs);assert.equal(s.firstBasicPlanted,firstBasicPlanted);}
});
test('selling only creative crops can unlock a tree without granting it15second starter growth',()=>{
 let s=act(fresh(),{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'creative-path'}),v=Object.values(s.varieties).find(v=>v.authorId===s.uid),time=NOW;
 for(let i=0;i<12;i++){if(!s.inventory[v.id])s=act(s,{type:'BUY_SEED',varietyId:v.id},time);s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:v.id},time);time=s.plants[0].readyAt;s=act(s,{type:'SELL',plantId:s.plants[0].id},time);}
 assert.equal(s.firstBasicPlanted,false);const tree=ADVANCED_VARIETIES[0];s=act(s,{type:'BUY_SEED',varietyId:tree.id},time);s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:tree.id},time);assert.equal(s.plants[0].readyAt-time,tree.growMs);
});
test('only final selected willow ginkgo fir and ancient-star art is wired, all lazy with measured4cell roots',async()=>{
 const fs=await import('node:fs'),m=JSON.parse(fs.readFileSync(new URL('../assets/art-manifest.json',import.meta.url)));assert.deepEqual(ADVANCED_VARIETIES.map(v=>v.id),['weeping_willow_tree','golden_ginkgo_tree','evergreen_fir_tree','ancient_star_tree']);
 for(const v of ADVANCED_VARIETIES){const s=m.sprites[v.artKey];assert.ok(s);assert.deepEqual(s.footprint,[2,2]);assert.deepEqual(s.renderPivotCell,[.5,.5]);assert.equal(Object.values(m.atlases).find(a=>a.image===s.image)?.preload,false);assert.ok(fs.existsSync(s.image));}for(const key of ['giant_hydrangea_tree','wisteria_tree'])assert.equal(Object.hasOwn(m.sprites,key),false);
});
