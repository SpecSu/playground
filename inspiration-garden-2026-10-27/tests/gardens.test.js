import {footprintCells,footprintOf} from '../src/footprints.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_GARDENS,DEMO_VARIETIES,OFFICIAL_VARIETIES,BUILDINGS} from '../src/catalogue.js';
import {connected} from '../src/state.js';
test('four authored gardens have distinct silhouettes and clear connected arrival/owner positions',()=>{
 assert.equal(DEMO_GARDENS.length,4);const silhouettes=[];
 for(const g of DEMO_GARDENS){assert.equal(connected(g.tiles),true);assert.equal(g.plants.length,{music:11,toy:14,anime:14,tech:14}[g.theme]);assert.ok(g.tiles.length<=36);
  const spawn=g.tiles.find(t=>t.id===g.spawnTileId);assert.ok(spawn);assert.equal(g.plants.some(p=>p.tileId===spawn.id),false);
  const owner=g.tiles.find(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y);assert.ok(owner);assert.equal(g.plants.some(p=>p.tileId===owner.id),false);
  assert.ok(g.tiles.every(t=>Object.hasOwn(BUILDINGS,t.kind)));silhouettes.push(g.tiles.map(t=>`${t.x}:${t.y}`).sort().join(','));
 }assert.equal(new Set(silhouettes).size,4);
});
test('all authored residents grow on land and scenery never becomes another construction or input blocker',()=>{
 let props=0;for(const g of DEMO_GARDENS){const used=new Set();for(const p of g.plants){assert.equal(used.has(p.tileId),false);used.add(p.tileId);assert.equal(g.tiles.find(t=>t.id===p.tileId)?.kind,'land');assert.ok(DEMO_VARIETIES[p.varietyId]||OFFICIAL_VARIETIES.some(v=>v.id===p.varietyId));}
  props+=g.props.length;assert.ok(g.props.every(p=>p.artKey&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&!Object.hasOwn(BUILDINGS,p.artKey)));
 }assert.ok(props===1);assert.equal(Object.keys(BUILDINGS).length,4);
});

test('authored progression tiers reserve disjoint supported footprints and source-linked exhibits',()=>{
 const all={...Object.fromEntries(OFFICIAL_VARIETIES.map(v=>[v.id,v])),...DEMO_VARIETIES};
 for(const g of DEMO_GARDENS){const giants=g.plants.filter(p=>footprintOf(all[p.varietyId])[0]===2);assert.equal(giants.length,{anime:0,music:1,toy:0,tech:0}[g.theme]);assert.equal(g.exhibits.length,{anime:2,music:1,toy:2,tech:3}[g.theme]);const occupied=new Set();
  for(const p of g.plants){const anchor=g.tiles.find(t=>t.id===p.tileId);for(const c of footprintCells(anchor,all[p.varietyId])){const tile=g.tiles.find(t=>t.x===c.x&&t.y===c.y);assert.equal(tile?.kind,'land');assert.equal(occupied.has(tile.id),false);occupied.add(tile.id);}}
  for(const e of g.exhibits){assert.equal(e.purchasable,false);assert.equal(e.economy,'none');if(e.sourceType==='hobby'){assert.equal(e.sourceFrameId,null);assert.match(e.sourceDisclosure,/兴趣灵感/);}else assert.ok(e.sourceFrameId);for(let x=0;x<e.footprint[0];x++)for(let y=0;y<e.footprint[1];y++){const tile=g.tiles.find(t=>t.x===e.x+x&&t.y===e.y+y);assert.ok(['land','platform'].includes(tile?.kind));assert.equal(occupied.has(tile.id),false);occupied.add(tile.id);}const entry=g.tiles.find(t=>t.x===e.entranceCell[0]&&t.y===e.entranceCell[1]);assert.ok(entry);assert.equal(occupied.has(entry.id),false);}
  assert.equal(occupied.has(g.spawnTileId),false);const owner=g.tiles.find(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y);assert.equal(occupied.has(owner.id),false);
 }
});
