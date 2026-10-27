import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {CREATIVE_SAMPLES} from '../src/catalogue.js';
import {footprintOf,footprintCells,occupiedTileIds,canPlacePlant,plantAtTile,plantCenter} from '../src/footprints.js';
import {validateState} from '../src/storage.js';
import {avatarStandPoint,isoPoint} from '../src/scene-math.js';
const NOW=Date.UTC(2026,9,26,2),act=(s,a,t=NOW)=>{const r=reduce(s,a,t);assert.equal(r.ok,true,r.message);assert.equal(validateState(r.state),true);return r.state;};
function giantState(){let s=createState(NOW,'giant-owner');s=act(s,{type:'CREATE_VARIETY',sampleId:'giant_piano_sunflower',requestId:'giant'});const v=Object.values(s.varieties).find(v=>v.authorId===s.uid);return {s,v};}
test('three new giant identities have genuine four-cell footprints; every v6 art key stays single-cell',()=>{
 for(const artKey of ['giant_piano_sunflower','giant_moon_mushroom','giant_bubble_lotus']){assert.ok(CREATIVE_SAMPLES.some(v=>v.artKey===artKey));assert.deepEqual(footprintOf({artKey}),[2,2]);}
 for(const artKey of ['piano_pumpkin','drum_pumpkin','glow_mushroom','cloud_lantern','sunflower','radish'])assert.deepEqual(footprintOf({artKey,footprint:[2,2]}),[1,1]);
});
test('planting giant reserves all four cells atomically and no nonanchor cell can be planted/moved/reclaimed',()=>{
 let {s,v}=giantState();s=act(s,{type:'PLANT',varietyId:v.id,tileId:'tile-0-0'});const p=s.plants[0];assert.equal(occupiedTileIds(s,p,v).length,4);assert.deepEqual(plantCenter(s,p,v),{x:.5,y:.5});
 for(const t of s.tiles){assert.equal(plantAtTile(s,t.id,s.varieties).id,p.id);for(const a of [{type:'PLANT',varietyId:'radish',tileId:t.id},{type:'RECLAIM',targetId:t.id},{type:'MOVE_BUILDING',targetId:t.id,x:2,y:0}]){const r=reduce(s,a,NOW);assert.equal(r.ok,false);assert.equal(r.state,s);}}
 s=act(s,{type:'SELL',plantId:p.id},p.readyAt);assert.equal(s.plants.length,0);assert.equal(s.coins,120+v.salePrice);assert.equal(s.crystals,2);for(const t of s.tiles)assert.equal(canPlacePlant(s,s.varieties.radish,t.id),true);
});
test('insufficient support, platform or occupied fourth cell rejects giant without consuming seed',()=>{
 const {s,v}=giantState();for(const tileId of ['tile-1-0','tile-0-1','missing']){const r=reduce(s,{type:'PLANT',varietyId:v.id,tileId},NOW);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(r.state.inventory[v.id],1);}
 for(const bad of [{...s,tiles:s.tiles.map(t=>t.id==='tile-1-1'?{...t,kind:'platform'}:t)},act(s,{type:'PLANT',varietyId:'radish',tileId:'tile-1-1'})])assert.equal(reduce(bad,{type:'PLANT',varietyId:v.id,tileId:'tile-0-0'},NOW).ok,false);
});
test('giant pack frees four cells and restore requires four-cell support while keeping identity and original maturity',()=>{
 let {s,v}=giantState();s=act(s,{type:'PLANT',varietyId:v.id,tileId:'tile-0-0'});const original=structuredClone(s.plants[0]);s=act(s,{type:'PACK_PLANT',plantId:original.id},original.readyAt);assert.equal(s.plants.length,0);
 s=act(s,{type:'RECLAIM',targetId:'tile-1-1'},original.readyAt+1);const fail=reduce(s,{type:'RESTORE_PLANT',plantId:original.id,tileId:'tile-0-0'},original.readyAt+100000);assert.equal(fail.ok,false);assert.equal(fail.state,s);
 s=act(s,{type:'BUILD',kind:'land',x:1,y:1},original.readyAt+100000);s=act(s,{type:'RESTORE_PLANT',plantId:original.id,tileId:'tile-0-0'},original.readyAt+103000);assert.deepEqual(s.plants,[original]);assert.equal(s.plantBag.length,0);
});
test('save validation rejects giant support gaps or overlapping nonanchor resident and preserves legacy four small plants',()=>{
 let {s,v}=giantState();s=act(s,{type:'PLANT',varietyId:v.id,tileId:'tile-0-0'});
 assert.equal(validateState({...s,plants:[...s.plants,{id:'overlap',tileId:'tile-1-1',varietyId:'radish',plantedAt:NOW,readyAt:NOW+15000}]}),false);
 assert.equal(validateState({...s,tiles:s.tiles.filter(t=>t.id!=='tile-1-1')}),false);
 const old=createState(NOW,'legacy-small');old.plants=old.tiles.map((t,i)=>({id:`old-${i}`,tileId:t.id,varietyId:'radish',plantedAt:NOW,readyAt:NOW+15000}));delete old.plantBag;assert.equal(validateState(old),true);
});
test('giant avatar stand point is beside whole footprint at an outer supported corner, not its center',()=>{
 const {s,v}=giantState(),p={id:'giant',tileId:'tile-0-0',varietyId:v.id},point=avatarStandPoint(s.tiles[0],[p],s.tiles,s.varieties),center=isoPoint(.5,.5),stand=isoPoint(point.x,point.y);
 assert.ok(Math.abs(stand.x-center.x)>90);assert.ok(s.tiles.some(t=>Math.abs(point.x-t.x)<=.5&&Math.abs(point.y-t.y)<=.5));
});
test('placement preview distinguishes all four support cells including missing or blocked land without mutating state',async()=>{
 const f=await import('../src/footprints.js');assert.equal(typeof f.placementPreview,'function');const {s,v}=giantState(),before=structuredClone(s);
 const okay=f.placementPreview(s,v,{x:0,y:0},s.varieties);assert.equal(okay.valid,true);assert.equal(okay.cells.length,4);assert.equal(okay.cells.every(c=>c.available),true);
 const bad=f.placementPreview(s,v,{x:1,y:1},s.varieties);assert.equal(bad.valid,false);assert.equal(bad.cells.filter(c=>!c.available).length,3);assert.deepEqual(s,before);
});
test('building placement ghost accepts mixed supports and rejects a blocked fourthcell; actor stands at supported outercorner',async()=>{
 const {buildingPlacementPreview}=await import('../src/footprints.js'),s=createState(NOW,'building-preview');s.tiles[3].kind='platform';assert.equal(buildingPlacementPreview(s,{x:0,y:0},s.varieties).valid,true);assert.equal(buildingPlacementPreview(s,{x:1,y:1},s.varieties).cells.filter(c=>!c.available).length,3);
 s.plants=[{id:'blocked',tileId:'tile-1-1',varietyId:'radish'}];assert.equal(buildingPlacementPreview(s,{x:0,y:0},s.varieties).valid,false);const point=avatarStandPoint(s.tiles[0],[],s.tiles,s.varieties,[{id:'house',tileId:'tile-0-0'}]);assert.deepEqual(point,{x:1.44,y:-.44});
});
test('relocation preview excludes only moving house, marks same anchor unchanged and preserves other occupancy',async()=>{
 const {buildingPlacementPreview}=await import('../src/footprints.js'),s=createState(NOW,'move-preview');s.tiles.push({id:'tile-2-0',x:2,y:0,kind:'platform'},{id:'tile-2-1',x:2,y:1,kind:'land'});s.buildings=[{id:'moving',tileId:'tile-0-0'}];
 assert.equal(buildingPlacementPreview(s,{x:1,y:0},s.varieties,NOW,'moving').valid,true);assert.equal(buildingPlacementPreview(s,{x:0,y:0},s.varieties,NOW,'moving').valid,false);assert.equal(buildingPlacementPreview(s,{x:0,y:0},s.varieties,NOW,'moving').unchanged,true);
 s.plants=[{id:'other',tileId:'tile-2-1',varietyId:'radish'}];assert.equal(buildingPlacementPreview(s,{x:1,y:0},s.varieties,NOW,'moving').valid,false);
});
