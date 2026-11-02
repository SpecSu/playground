import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce,isMature} from '../src/state.js';
import {validateState,saveGame,loadGame} from '../src/storage.js';
const NOW=1793062800000;
const apply=(s,action,at=NOW)=>{const r=reduce(s,action,at);assert.equal(r.ok,true,r.message);return r.state;};
const fixture=()=>{let s=createState(NOW,'demo-growth-owner');s=apply(s,{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'});return apply(s,{type:'PLANT',tileId:'tile-1-0',varietyId:'radish'});};
const action=p=>({type:'DEMO_READY_PLANT',plantId:p.id,tileId:p.tileId,varietyId:p.varietyId,plantedAt:p.plantedAt,readyAt:p.readyAt});
const reject=(s,a,at=NOW+1000)=>{const before=structuredClone(s),r=reduce(s,a,at);assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);};

test('explicit demo skip matures only the exact selected growing plant without spending or granting anything',()=>{
 const s=fixture();s.coins=0;s.crystals=0;const before=structuredClone(s),r=reduce(s,action(s.plants[0]),NOW+1000);
 assert.equal(r.ok,true,r.message);assert.equal(r.state.plants[0].readyAt,NOW+1000);assert.equal(isMature(r.state.plants[0],NOW+1000),true);assert.equal(isMature(r.state.plants[1],NOW+1000),false);
 const expected={...before,lastSeenAt:NOW+1000,discovered:['radish'],plants:[{...before.plants[0],readyAt:NOW+1000},before.plants[1]]};assert.deepEqual(r.state,expected);assert.deepEqual(s,before);assert.equal(validateState(r.state),true);
 assert.equal(reduce(r.state,{type:'REVEAL',plantId:s.plants[0].id},NOW+1001).state,r.state,'discovery happens atomically, not in a second automatic write');
});

test('duplicate demo-ready actions and naturally mature plants are read-only no-ops',()=>{
 const s=fixture(),a=action(s.plants[0]),mature=apply(s,a,NOW+1000);reject(mature,a,NOW+1001);reject(mature,action(mature.plants[0]),NOW+1001);reject(s,a,NOW+15000);
});

test('friend, missing, packed, stale identity and stale plot actions cannot complete a plant',()=>{
 const s=fixture(),p=s.plants[0],a=action(p);
 for(const patch of [{gardenId:'demo-friend'},{gardenId:''},{plantId:'missing'},{tileId:'tile-1-1'},{varietyId:'tomato'},{plantedAt:NOW-1},{readyAt:NOW+15001}])reject(s,{...a,...patch});
 for(const key of ['tileId','varietyId','plantedAt','readyAt']){const incomplete={...a};delete incomplete[key];reject(s,incomplete);}
 reject({...s,plants:s.plants.slice(1),plantBag:[p]},a);
 reject({...s,tiles:s.tiles.filter(t=>t.id!==p.tileId)},a);
 reject({...s,tiles:s.tiles.map(t=>t.id===p.tileId?{...t,kind:'platform'}:t)},a);
 reject({...s,tiles:s.tiles.map(t=>t.id===p.tileId?{...t,startedAt:NOW,readyAt:NOW+3000}:t)},a);
});

test('demo skip uses observed monotonic time and never writes readyAt before plantedAt',()=>{
 const s=fixture(),observed={...s,lastSeenAt:NOW+5000},a=action(s.plants[0]);const next=apply(observed,a,NOW-5000);assert.equal(next.lastSeenAt,NOW+5000);assert.equal(next.plants[0].readyAt,NOW+5000);assert.equal(validateState(next),true);
 const future={...s,plants:s.plants.map((p,i)=>i===0?{...p,plantedAt:NOW+10000,readyAt:NOW+25000}:p)};reject(future,action(future.plants[0]));
});

test('demo maturity survives validated save reload with the other growing plant and economy unchanged',()=>{
 const s=fixture(),next=apply(s,{...action(s.plants[0]),gardenId:null},NOW+1234),data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
 assert.equal(saveGame(storage,next,NOW+1234).ok,true);const reload=loadGame(storage,NOW+2000);assert.equal(reload.status,'loaded');assert.deepEqual(reload.state,next);assert.equal(isMature(reload.state.plants[0],NOW+2000),true);assert.equal(reload.state.plants[1].readyAt,NOW+45000);assert.equal(reload.state.coins,120);assert.equal(reload.state.crystals,3);assert.equal(reload.state.inventory.radish,0);
});
