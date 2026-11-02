import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEMO_GARDENS,DEMO_VARIETIES,allCatalogueVarieties} from '../src/catalogue.js';
import {buildingCells,footprintCells} from '../src/footprints.js';
import {tileRoute} from '../src/navigation.js';

const source=JSON.parse(fs.readFileSync(new URL('../assets/garden-compositions.json',import.meta.url))).gardens;
const targets={anime:{tiles:36,houses:2,plants:14,free:16},music:{tiles:28,houses:1,plants:11,free:10},toy:{tiles:36,houses:2,plants:14,free:16},tech:{tiles:36,houses:3,plants:14,free:15}};
const key=t=>`${t.x}:${t.y}`;
function emptyCells(g){const vars=allCatalogueVarieties();for(const p of g.plants)assert.ok(vars[p.varietyId],`${g.id} unknown canonical variety ${p.varietyId}`);const blocked=new Set([...g.exhibits.flatMap(b=>buildingCells(g,b)),...g.plants.flatMap(p=>footprintCells(g.tiles.find(t=>t.id===p.tileId),vars[p.varietyId]))].map(key));return g.tiles.filter(t=>!blocked.has(key(t)));}
function squares(cells){const has=new Set(cells.map(key));return cells.filter(t=>[[1,0],[0,1],[1,1]].every(([dx,dy])=>has.has(`${t.x+dx}:${t.y+dy}`)));}

test('curated courtyards keep progression scale while replacing empty plazas with low planting',()=>{
 for(const g of DEMO_GARDENS){const t=targets[g.theme];assert.equal(g.tiles.length,t.tiles,g.id);assert.equal(g.exhibits.length,t.houses,g.id);assert.equal(g.plants.length,t.plants,g.id);const clear=emptyCells(g);assert.equal(clear.length,t.free,`${g.id}: wrong clear walkway size`);}
});
test('every genuinely empty courtyard cell is connected without walking through a plant or building',()=>{
 for(const g of DEMO_GARDENS){const clear=emptyCells(g),arrival=clear.find(t=>t.id===g.spawnTileId),host=clear.find(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y);assert.ok(arrival,`${g.id} arrival`);assert.ok(host,`${g.id} host`);assert.notEqual(arrival.id,host.id);for(const t of clear)assert.ok(tileRoute(clear,arrival.id,t.id).length,`${g.id} empty cell ${t.id} is isolated`);}
});
test('arrival and host share a connected narrow walkway to every outside entrance without an empty 2x2 plaza',()=>{
 for(const g of DEMO_GARDENS){const clear=emptyCells(g),arrival=clear.find(t=>t.id===g.spawnTileId),host=clear.find(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y);assert.equal(squares(clear).length,0,`${g.id} retains an empty plaza`);assert.ok(tileRoute(clear,arrival.id,host.id).length);for(const b of g.exhibits){const entry=clear.find(t=>t.x===b.entranceCell[0]&&t.y===b.entranceCell[1]);assert.ok(entry,`${b.id} planted entrance`);assert.ok(tileRoute(clear,arrival.id,entry.id).length,`${b.id} unreachable entrance`);}}
});
test('all curated objects have a reachable genuinely empty interaction bay and disjoint supported schema footprints',()=>{
 const vars=allCatalogueVarieties();for(const g of DEMO_GARDENS){const clear=emptyCells(g),used=new Set(),sourceGarden=source.find(s=>s.id===g.id);for(const target of [...g.plants,...g.exhibits]){const footprint=target.varietyId?footprintCells(g.tiles.find(t=>t.id===target.tileId),vars[target.varietyId]):buildingCells(g,target);for(const c of footprint){assert.ok(g.tiles.some(t=>t.x===c.x&&t.y===c.y),`${target.id} unsupported ${key(c)}`);assert.equal(used.has(key(c)),false,`${target.id} overlaps ${key(c)}`);used.add(key(c));}assert.ok(clear.some(t=>footprint.some(c=>Math.abs(c.x-t.x)+Math.abs(c.y-t.y)===1)),`${target.id} has no clear exterior stance`);}
  assert.equal(sourceGarden.cells.length,g.tiles.length);assert.deepEqual(sourceGarden.spawn,g.tiles.filter(t=>t.id===g.spawnTileId).flatMap(t=>[t.x,t.y]));}
});
test('signature buildings are exclusive to their theme and removed displays never mutate saved catalogue authors',()=>{
 const houses=source.flatMap(g=>g.buildings.map(b=>b.artKey));assert.equal(new Set(houses).size,houses.length);assert.ok(houses.every(k=>!['calico_reading_den','camping_dog_workshop','fluffy_cat_cottage'].includes(k)));assert.deepEqual(source.find(g=>g.theme==='music').buildings.map(b=>b.artKey),['portrait_rehearsal_pavilion']);assert.deepEqual(source.find(g=>g.theme==='toy').buildings.map(b=>b.artKey),['bear_fold_gallery','bear_loop_rest']);const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/v6-demo-varieties.json',import.meta.url)));for(const [id,v]of Object.entries(baseline))assert.deepEqual({...DEMO_VARIETIES[id],seedPrice:v.seedPrice,salePrice:v.salePrice,growMs:v.growMs},v,id);
});

test('authored occasional animal stops are clear supports, distinct from both greeting actors and linked without crossing a footprint',()=>{
 for(const g of DEMO_GARDENS){const authored=source.find(s=>s.id===g.id),clear=emptyCells(g),arrival=clear.find(t=>t.id===g.spawnTileId);assert.ok(authored.animalVisitorSpawns.length>=2);const seen=new Set();for(const [x,y]of authored.animalVisitorSpawns){const t=clear.find(t=>t.x===x&&t.y===y);assert.ok(t,`${g.id} animal visitor on occupied/unsupported cell`);assert.notEqual(t.id,arrival.id);assert.ok(x!==g.ownerPosition.x||y!==g.ownerPosition.y);assert.ok(!seen.has(t.id));seen.add(t.id);assert.ok(tileRoute(clear,arrival.id,t.id).length);}}
});
test('LX retains its proven visible host and player starts on the connected narrow walkway',()=>{const lx=source.find(g=>g.theme==='tech');assert.deepEqual(lx.ownerPosition,[2,3]);assert.deepEqual(lx.spawn,[2,4]);for(const [x,z]of [lx.ownerPosition,lx.spawn]){assert.ok(lx.cells.some(t=>t.x===x&&t.z===z&&t.kind==='platform'));assert.ok(!lx.plants.some(p=>p.x===x&&p.z===z));}});

test('each island uses a curated theme-matching plant set, not relocated filler from unrelated gardens',()=>{
 const expected={anime:['jiji_crimson_rose_bush','oxblood_bellflower','silver_veil_willow'],music:['drum_pumpkin','giant_piano_sunflower','gramophone_flower','keyboard_corn','radish','tomato'],toy:['bear_bubble_leaf','bear_foldbud','bear_plush_bloom'],tech:['lx_bio_vault','lx_orbital_bloom','lx_silver_biofern']};for(const g of source)assert.deepEqual([...new Set(g.plants.map(p=>p.art))].sort(),expected[g.theme],g.id);for(const art of ['plush_button_sprout','yarn_ball_flower']){assert.equal(DEMO_VARIETIES['demo-'+art]?.authorId,'demo-bear');assert.equal(DEMO_VARIETIES['demo-'+art]?.artKey,art);}
});
