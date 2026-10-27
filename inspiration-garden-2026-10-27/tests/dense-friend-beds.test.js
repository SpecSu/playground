import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEMO_GARDENS,allCatalogueVarieties,BASIC_VARIETIES} from '../src/catalogue.js';
import {buildingCells,footprintCells,footprintOf} from '../src/footprints.js';
import {walkableTerrain,tileRoute} from '../src/navigation.js';
import {createAnimalVisitor} from '../src/animal-visitor.js';
import {plantApproachRoute} from '../src/plant-approach.js';
const source=JSON.parse(fs.readFileSync('assets/garden-compositions.json')).gardens;
const before=JSON.parse(fs.readFileSync('tests/fixtures/pre-kelly-wonderland.json')).gardens;
const varieties=allCatalogueVarieties(),key=t=>`${t.x}:${t.y}`,expected={music:7,toy:6,anime:4,tech:5};
const lowArt={music:['radish','tomato'],toy:['bear_bubble_leaf','bear_plush_bloom'],anime:['oxblood_bellflower','jiji_crimson_rose_bush'],tech:['lx_silver_biofern','lx_orbital_bloom']};
function strictWalk(g){const planted=new Set(g.plants.flatMap(p=>footprintCells(g.tiles.find(t=>t.id===p.tileId),varieties[p.varietyId])).map(key));return walkableTerrain(g.tiles,g.exhibits,1).filter(t=>!planted.has(key(t)));}
function targets(g){return [...g.plants.map(p=>({id:p.id,cells:footprintCells(g.tiles.find(t=>t.id===p.tileId),varieties[p.varietyId])})),...g.exhibits.map(b=>({id:b.id,cells:buildingCells(g,b)}))];}
const adjacent=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;

test('denser friend beds add only modest existing low art and preserve every original object and support coordinate',()=>{
 for(const g of source){const old=before.find(b=>b.id===g.id),added=g.plants.filter(p=>!old.plants.some(q=>q.id===p.id));assert.equal(added.length,expected[g.theme],g.id);
  for(const field of ['buildings','palette','owner','displayHost','spawn','ownerPosition','focalPlant','focalCamera','interactionTour','edges','scenery','progression'])assert.deepEqual(g[field],old[field],`${g.id} ${field}`);
  for(const p of old.plants){const now=g.plants.find(q=>q.id===p.id);if(g.theme==='tech'&&['lx_silver_biofern','lx_orbital_bloom'].includes(p.art)){assert.equal(now.art,p.art);assert.equal(now.scale,.86);}else assert.deepEqual(now,p,`${g.id} moved or replaced ${p.id}`);}
  assert.deepEqual(g.cells.map(({x,z})=>[x,z]),old.cells.map(({x,z})=>[x,z]));
  for(const c of g.cells){const was=old.cells.find(t=>t.x===c.x&&t.z===c.z);assert.ok(c.kind===was.kind||(was.kind==='platform'&&c.kind==='land'&&(g.theme==='tech'?g.plants:added).some(p=>p.x===c.x&&p.z===c.z)),`${g.id} unnecessary terrain change ${c.x}:${c.z}`);}
  for(const p of added){assert.ok(lowArt[g.theme].includes(p.art));assert.ok(p.scale>=.65&&p.scale<=.86);assert.equal(g.cells.find(t=>t.x===p.x&&t.z===p.z)?.kind,'land');assert.deepEqual(footprintOf({artKey:p.art}),[1,1]);}
  if(g.theme==='music')for(const p of added)assert.ok(BASIC_VARIETIES.some(v=>v.id===p.art),`${p.id} is not ordinary planting`);
 }
});

test('all four islands retain only connected narrow walkways and genuine exterior stances with every plant treated as occupied',()=>{
 for(const g of DEMO_GARDENS){const clear=strictWalk(g),spawn=clear.find(t=>t.id===g.spawnTileId);assert.ok(spawn,g.id);assert.ok(clear.some(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y));
  for(const t of clear)assert.ok(tileRoute(clear,spawn.id,t.id).length,`${g.id} disconnected clear tile ${key(t)}`);
  const free=new Set(clear.map(key));for(const t of clear)assert.ok(![[1,0],[0,1],[1,1]].every(([dx,dy])=>free.has(`${t.x+dx}:${t.y+dy}`)),`${g.id} still has an empty 2x2 plaza at ${key(t)}`);
  for(const b of g.exhibits)assert.ok(clear.some(t=>t.x===b.entranceCell[0]&&t.y===b.entranceCell[1]),`${b.id} entrance planted over`);
  for(const target of targets(g)){const stands=clear.filter(t=>target.cells.some(c=>adjacent(c,t)));assert.ok(stands.some(t=>tileRoute(clear,spawn.id,t.id).length),`${target.id} no real empty approach`);}
  for(const p of g.plants){const route=plantApproachRoute({tiles:clear,worldTiles:g.tiles,plants:g.plants,varieties,plantId:p.id,position:spawn});assert.ok(route,`${p.id} actual approach fails`);assert.ok(route.path.every(t=>free.has(key(t))),`${p.id} route cuts through plants/buildings`);}
  for(const point of g.animalVisitorSpawns)assert.ok(free.has(key(point)),`${g.id} animal spawn is planted over`);
 }
});

test('remaining empty grass is necessary for an actor, connected route or a plant/building approach, not unused lawn',()=>{
 for(const g of DEMO_GARDENS){const clear=strictWalk(g),required=new Set([g.spawnTileId,...clear.filter(t=>t.x===g.ownerPosition.x&&t.y===g.ownerPosition.y).map(t=>t.id),...g.exhibits.map(b=>clear.find(t=>t.x===b.entranceCell[0]&&t.y===b.entranceCell[1])?.id)]);
  for(const t of clear.filter(t=>t.kind==='land')){if(required.has(t.id))continue;const without=clear.filter(q=>q.id!==t.id),spawn=without.find(t=>t.id===g.spawnTileId),reachable=without.filter(q=>tileRoute(without,spawn.id,q.id).length);const disconnected=reachable.length!==without.length,lostTarget=targets(g).some(target=>!reachable.some(q=>target.cells.some(c=>adjacent(c,q))));assert.ok(disconnected||lostTarget,`${g.id} ${key(t)} is unused plantable lawn`);}
 }
});

test('each authored animal candidate still passes real runtime arrival and passage rules',()=>{
 for(const garden of DEMO_GARDENS)for(const point of garden.animalVisitorSpawns){const world={...garden,avatarTileId:garden.spawnTileId,residents:[{id:garden.hostId,...garden.ownerPosition}],animalVisitorSpawns:[point]},visitor=createAnimalVisitor({clock:()=>100000,random:()=>0});visitor.setWorld(world,varieties,0);assert.ok(visitor.tick(45000),`${garden.id} visitor cannot use ${key(point)}`);visitor.dispose();}
});
