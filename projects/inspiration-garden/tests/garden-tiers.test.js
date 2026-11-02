import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEMO_GARDENS,allCatalogueVarieties,DEMO_VARIETIES} from '../src/catalogue.js';
import {footprintCells,buildingCells} from '../src/footprints.js';
import {createTileWalker} from '../src/visual-walk.js';
import {walkableTerrain,tileRoute,safeActorPoint} from '../src/navigation.js';
const source=JSON.parse(fs.readFileSync(new URL('../assets/garden-compositions.json',import.meta.url),'utf8')).gardens;
const tiers={anime:[36,2,14,3],music:[28,1,11,12],toy:[36,2,14,28],tech:[36,3,14,32]};
test('friend courtyards preserve deliberate area and level tiers with denser low planting',()=>{
 assert.equal(source.length,4);for(const g of source){const [tiles,houses,plants,level]=tiers[g.theme];assert.equal(g.cells.length,tiles,g.theme);assert.equal(g.buildings.length,houses,g.theme);assert.equal(g.plants.length,plants,g.theme);assert.equal(g.progression.level,level);assert.match(g.progression.disclosure,/示范/);}
});
test('every authored island remains a connected exterior walk graph with safe arrivals and accessible targets',()=>{
 const varieties=allCatalogueVarieties();
 for(const g of DEMO_GARDENS){const walk=walkableTerrain(g.tiles,g.exhibits,1),spawn=walk.find(t=>t.id===g.spawnTileId);assert.ok(spawn,g.id);assert.ok(walk.some(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y));
 for(const t of walk)assert.ok(tileRoute(walk,spawn.id,t.id).length,`${g.id} disconnected ${t.id}`);
 for(const target of [...g.plants,...g.exhibits]){const cells=target.varietyId?footprintCells(g.tiles.find(t=>t.id===target.tileId),varieties[target.varietyId]):buildingCells(g,target);assert.ok(cells.length);const outside=walk.filter(t=>!cells.some(c=>c.x===t.x&&c.y===t.y)&&cells.some(c=>Math.abs(c.x-t.x)+Math.abs(c.y-t.y)===1));assert.ok(outside.some(t=>tileRoute(walk,spawn.id,t.id).length),`${target.id} has no exterior approach`);}
 }
});
test('removing a displayed specimen preserves every old catalogue species and its immutable original attribution',()=>{
 const required=['keyboard_corn','drum_pumpkin','singing_eggplant','gramophone_flower','whisper_radish','giant_piano_sunflower','glow_mushroom','cloud_lantern','sleepy_sunflower','giant_moon_mushroom','puffer_tomato','bubble_teapot','painter_tomato','wave_cabbage','giant_bubble_lotus'];
 for(const art of required)assert.ok(DEMO_VARIETIES['demo-'+art],art);
 const retained={'sea-puffer':'puffer_tomato','sea-painter':'painter_tomato','jiji-controller-bud':'controller_sprout','music-keyboard':'keyboard_corn','music-drum':'drum_pumpkin','music-gramophone':'gramophone_flower','music-giant-canopy':'giant_piano_sunflower','toy-plush-canopy':'plush_cotton_tree','moon-lantern-north':'cloud_lantern','lx-circuit-canopy':'circuit_bonsai','lx-evergreen-screen':'evergreen_fir_tree','lx-radar-west':'radar_succulent','lx-pace-east':'pace_meter_bamboo'};for(const p of source.flatMap(g=>g.plants))if(retained[p.id])assert.equal(p.art,retained[p.id],p.id);
 assert.equal(DEMO_VARIETIES['demo-giant_bubble_lotus'].authorId,'demo-frog');assert.equal(DEMO_VARIETIES['demo-bubble_teapot'].authorId,'demo-frog');
 const bear=source.find(g=>g.id==='demo-bear-moon');assert.ok(bear.plants.some(p=>p.art==='bear_foldbud'));const lx=source.find(g=>g.id==='demo-lx-tech');assert.ok(lx.plants.some(p=>p.art==='lx_bio_vault'));
});

test('owner and visitor approaches stay on real supports outside every house for the full animated route',()=>{
 const varieties=allCatalogueVarieties();
 for(const g of DEMO_GARDENS){const owner=g.tiles.find(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y);
  for(const start of [g.spawnTileId,owner.id])for(const target of [...g.plants.map(p=>p.tileId),...g.exhibits.map(e=>g.tiles.find(t=>t.x===e.x&&t.y===e.y).id)]){
   const walker=createTileWalker({clock:()=>1});walker.reset(g.tiles,start,g.plants,varieties,g.exhibits);assert.equal(walker.go(g.tiles,target,0,g.plants,varieties,g.exhibits),true,`${g.id} cannot approach ${target}`);
   for(let at=0;at<=15000;at+=25)assert.ok(safeActorPoint(g.tiles,g.exhibits,walker.sample(at),1),`${g.id} unsafe approach ${target} at ${at}`);
   assert.equal(walker.sample(15000).moving,false);
  }
 }
});
test('each garden has one global coherent land palette rather than independently colored cells',()=>{
 const expected={anime:'#b9ccd3',music:'#b9d1a0',toy:'#ddc4bf',tech:'#e2dcc8'};
 for(const g of source){assert.equal(g.palette.land,expected[g.theme]);for(const field of ['side','sideDark','wood','woodSide','woodDark'])assert.match(g.palette[field],/^#[0-9a-f]{6}$/);assert.ok(g.cells.every(c=>!('color' in c)&&!('palette' in c)&&!('landColor' in c)));}
 assert.equal(new Set(source.map(g=>g.palette.land)).size,4);
});

test('visible Jiji host is separate from immutable legacy creator identity and themed hobby houses never invent a photo',()=>{
 const s=source.find(g=>g.id==='demo-frog-sea');const runtime=DEMO_GARDENS.find(g=>g.id===s.id);assert.equal(runtime.hostId,'demo-jiji');assert.equal(runtime.hostName,'吉吉');assert.equal(runtime.avatarKey,'human-jiji');assert.equal(runtime.authorId,'demo-frog');assert.equal(runtime.authorName,'奶蛙');assert.equal(s.owner.id,'demo-frog');assert.equal(s.owner.name,'奶蛙');assert.deepEqual(s.displayHost,{id:'demo-jiji',name:'吉吉',avatar:'human-jiji'});
 assert.equal(DEMO_VARIETIES['demo-puffer_tomato'].authorId,'demo-frog');assert.equal(DEMO_VARIETIES['demo-puffer_tomato'].authorName,'奶蛙');
 const hobby=source.flatMap(g=>g.buildings).filter(b=>b.sourceType==='hobby');assert.equal(hobby.length,7);for(const b of hobby){assert.equal(b.sourceFrameId,null);assert.match(b.sourceDisclosure,/兴趣灵感/);assert.ok(b.sourceStory.length>15);}
 const lx=source.find(g=>g.theme==='tech');assert.equal(lx.buildings.some(b=>['calico_reading_den','camping_dog_workshop','fluffy_cat_cottage'].includes(b.artKey)),false);assert.equal(lx.plants.filter(p=>p.art==='radar_succulent').length,0);assert.equal(lx.plants.filter(p=>p.art==='pace_meter_bamboo').length,0);
});
