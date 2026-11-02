import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEMO_GARDENS,allCatalogueVarieties,DEMO_VARIETIES} from '../src/catalogue.js';
import {buildingCells,footprintCells} from '../src/footprints.js';
import {plantApproachRoute} from '../src/plant-approach.js';
import {edgeKey,createState,reduce} from '../src/state.js';
import {validateState,saveGame,loadGame} from '../src/storage.js';
const source=JSON.parse(fs.readFileSync('assets/garden-compositions.json')).gardens;
const vars=allCatalogueVarieties(),key=c=>`${c.x}:${c.y}`;
const existing={
 'demo-frog-sea':[['jiji_nocturne_manor',0,0,2,2],['black_silk_spider',4,0,2,1]],
 'demo-bear-moon':[['bear_fold_gallery',4,0,2,2],['bear_loop_rest',0,2,2,1]],
 'demo-lx-tech':[['lx_titanium_courtyard',0,0,2,2],['lx_silent_wing',4,0,2,1],['lx_nanofabricator',5,3,1,1]],
};
const desired={
 'demo-frog-sea':{jiji_crimson_rose_bush:9,silver_veil_willow:1,oxblood_bellflower:4},
 'demo-bear-moon':{bear_foldbud:1,bear_bubble_leaf:8,bear_plush_bloom:5},
 'demo-lx-tech':{lx_bio_vault:1,lx_silver_biofern:9,lx_orbital_bloom:4},
};
function clearCells(g){const used=new Set([...g.exhibits.flatMap(b=>buildingCells(g,b)),...g.plants.flatMap(p=>footprintCells(g.tiles.find(t=>t.id===p.tileId),vars[p.varietyId]))].map(key));return g.tiles.filter(t=>!used.has(key(t)));}
const sideDelta={north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]};
function crossedEdge(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1?edgeKey(a,b.x>a.x?'east':b.x<a.x?'west':b.y>a.y?'south':'north'):null;}

test('new estates display grouped real low planting while every approved architectural landmark stays fixed',()=>{
 for(const [id,counts]of Object.entries(desired)){
  const g=DEMO_GARDENS.find(g=>g.id===id);assert.equal(g.tiles.length,36,id);
  assert.deepEqual(g.exhibits.map(b=>[b.artKey,b.x,b.y,...b.footprint]),existing[id]);
  const actual={};for(const p of g.plants){assert.ok(vars[p.varietyId],p.varietyId);const art=vars[p.varietyId].artKey;actual[art]=(actual[art]??0)+1;}
  assert.deepEqual(actual,counts,id);assert.equal(clearCells(g).length,{'demo-frog-sea':16,'demo-bear-moon':16,'demo-lx-tech':15}[id]);
  // Added repetitions extend the established species palette; strict path/stance proof lives in dense-friend-beds.test.js.
  for(const p of g.plants)assert.equal(g.tiles.find(t=>t.id===p.tileId).kind,'land',`${p.id} planted on a walkway`);
 }
});
test('all four courtyards visibly use existing short boundaries with an open arrival and uncrossed routes to every target',()=>{
 for(const g of DEMO_GARDENS){assert.ok(g.edges.length>=8,`${g.id} has no designed boundaries`);assert.ok(g.edges.length<=18,`${g.id} is over-enclosed`);const clear=clearCells(g),arrival=clear.find(t=>t.id===g.spawnTileId),barriers=new Set();
  for(const edge of g.edges){assert.ok(['fence','wall'].includes(edge.kind));const t=g.tiles.find(t=>t.id===edge.tileId);assert.ok(t);const k=edgeKey(t,edge.edge);assert.ok(!barriers.has(k),`${g.id} duplicate boundary`);barriers.add(k);}
  // Edges are decorative in runtime; prove the authoring still reads as open paths even if they were barriers.
  const visit=new Set([arrival.id]),queue=[arrival];while(queue.length){const t=queue.shift();for(const next of clear)if(!visit.has(next.id)&&crossedEdge(t,next)&&!barriers.has(crossedEdge(t,next))){visit.add(next.id);queue.push(next);}}
  for(const t of clear)assert.ok(visit.has(t.id),`${g.id} boundary encloses clear cell ${key(t)}`);
  for(const b of g.exhibits)assert.ok(visit.has(g.tiles.find(t=>t.x===b.entranceCell[0]&&t.y===b.entranceCell[1]).id),`${b.id} closed entrance`);
  for(const p of g.plants){const cells=footprintCells(g.tiles.find(t=>t.id===p.tileId),vars[p.varietyId]);const result=plantApproachRoute({tiles:clear,worldTiles:g.tiles,plants:g.plants,varieties:vars,plantId:p.id,position:arrival});assert.ok(result,`${p.id} no real exterior stance`);assert.ok(clear.some(t=>visit.has(t.id)&&cells.some(c=>Math.abs(t.x-c.x)+Math.abs(t.y-c.y)===1&&!barriers.has(crossedEdge(t,c)))),`${p.id} enclosed behind decorative edges`);}
  const openArrivalSides=Object.entries(sideDelta).filter(([side,[dx,dy]])=>!g.tiles.some(t=>t.x===arrival.x+dx&&t.y===arrival.y+dy)&&!barriers.has(edgeKey(arrival,side)));assert.ok(openArrivalSides.length||clear.some(t=>visit.has(t.id)&&t.y>arrival.y),`${g.id} no open arrival court`);
 }
});
test('new plant identities use existing tariffs and claim, grow and save without replacing historical received IDs',()=>{
 for(const [art,author]of [['jiji_crimson_rose_bush','demo-jiji'],['bear_plush_bloom','demo-bear'],['lx_silver_biofern','demo-lx'],['lx_orbital_bloom','demo-lx']]){
  const v=DEMO_VARIETIES['demo-'+art];assert.ok(v,art);assert.equal(v.authorId,author);assert.deepEqual([v.seedPrice,v.salePrice,v.growMs],[90,140,720000]);
  const g=DEMO_GARDENS.find(g=>g.plants.some(p=>p.varietyId===v.id)),p=g.plants.find(p=>p.varietyId===v.id);let s=createState(1000);s=reduce(s,{type:'INTERACT_DEMO',gardenId:g.id,plantId:p.id},1000).state;const claimed=reduce(s,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id},1000);assert.equal(claimed.ok,true);assert.equal(claimed.state.inventory[v.id],1);assert.equal(validateState(claimed.state),true);
  const old={...DEMO_VARIETIES['demo-cloud_lantern'],id:v.id,rootId:v.id,authorId:'old-owner',authorName:'旧主人'};s=createState(1000);s.varieties[v.id]=old;s.inventory[v.id]=2;const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};saveGame(storage,s);assert.deepEqual(loadGame(storage).state.varieties[v.id],old);const played=reduce(s,{type:'INTERACT_DEMO',gardenId:g.id,plantId:p.id},1000).state;assert.equal(reduce(played,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id},1000).ok,false);
 }
});
test('Kelly retains the established musical plants, architecture and footprint while gaining ordinary low beds',()=>{const g=source.find(g=>g.theme==='music');assert.equal(g.cells.length,28);assert.deepEqual(g.plants.filter(p=>!p.id.startsWith('music-low-bed-fill-')).map(p=>[p.id,p.art,p.x,p.z]),[['music-keyboard','keyboard_corn',1,4],['music-drum','drum_pumpkin',0,3],['music-gramophone','gramophone_flower',5,3],['music-giant-canopy','giant_piano_sunflower',4,0]]);assert.equal(g.buildings.length,1);assert.ok(g.edges.some(e=>e.kind==='wall'));});

test('repeated specimens in a flowerbed share the existing one-seed-per-species daily cap',()=>{
 for(const g of DEMO_GARDENS){const grouped=new Map();for(const p of g.plants)grouped.set(p.varietyId,[...(grouped.get(p.varietyId)??[]),p]);for(const [id,plants]of grouped){if(plants.length<2)continue;let s=createState(1000);const coins=s.coins,crystals=s.crystals,initial=s.inventory[id]??0;for(const [i,p]of plants.entries()){s=reduce(s,{type:'INTERACT_DEMO',gardenId:g.id,plantId:p.id},1000).state;const r=reduce(s,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id},1000);assert.equal(r.ok,i===0,`${g.id} ${p.id} duplicates the daily grant`);s=r.state;assert.equal(s.inventory[id],initial+1);assert.equal(s.coins,coins);assert.equal(s.crystals,crystals);}const p=plants.at(-1);s=reduce(s,{type:'INTERACT_DEMO',gardenId:g.id,plantId:p.id},86401000).state;const tomorrow=reduce(s,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id},86401000);assert.equal(tomorrow.ok,true);assert.equal(tomorrow.state.inventory[id],initial+2);}}
});
test('all new low planting draws from bounded alpha-framed runtime assets, not missing art or large hero images',()=>{
 const art=JSON.parse(fs.readFileSync('assets/art-manifest.json')).sprites;
 for(const key of ['jiji_crimson_rose_bush','bear_plush_bloom','lx_silver_biofern','lx_orbital_bloom']){const s=art[key];assert.ok(s,`${key} missing runtime art`);assert.equal(s.kind,'plant');assert.ok(s.width>=60&&s.width<=80);assert.ok(s.width*s.frame.h/s.frame.w<=100,`${key} no longer low planting`);assert.ok(s.frame.w>0&&s.frame.h>0&&s.alphaBounds.w>0&&s.alphaBounds.h>0);assert.ok(s.anchor[0]>=0&&s.anchor[0]<=1&&s.anchor[1]>=0&&s.anchor[1]<=1);assert.ok(s.image.startsWith('assets/')&&!s.image.includes('work/'));assert.ok(fs.statSync(s.image).size<=350000,`${key} small plant exceeds runtime image budget`);}
});


test('Jiji and LX inset planted pockets distinguish land from paved approaches and introduce an open L-shaped border',()=>{
 const pockets={'demo-frog-sea':[[1,3],[1,4]],'demo-lx-tech':[[0,2],[1,2]]};
 for(const [id,points]of Object.entries(pockets)){const g=DEMO_GARDENS.find(g=>g.id===id);for(const [x,y]of points){const tile=g.tiles.find(t=>t.x===x&&t.y===y);assert.equal(tile?.kind,'land');assert.ok(g.plants.some(p=>p.tileId===tile.id));}const border=g.edges.filter(e=>points.some(([x,y])=>g.tiles.find(t=>t.id===e.tileId&&t.x===x&&t.y===y)));assert.ok(border.length>=2&&border.length<=3);assert.ok(new Set(border.map(e=>e.edge)).size>=2);for(const p of g.plants)assert.equal(g.tiles.find(t=>t.id===p.tileId)?.kind,'land');}
});

test('approved Jiji grounded perspectives place measured ground centers on unchanged scene anchors',()=>{
 const sprites=JSON.parse(fs.readFileSync('assets/art-manifest.json')).sprites;
 for(const [key,gx,gy]of [['jiji_nocturne_manor',903.75,713.875],['black_silk_spider',800,666.25]]){const s=sprites[key],f=s.frame,h=s.width*f.h/f.w;assert.match(s.image,/-ground-v3\.webp$/);assert.ok(Math.abs(((gx-f.x)/f.w-s.anchor[0])*s.width)<.001);assert.ok(Math.abs(6+((gy-f.y)/f.h-s.anchor[1])*h)<.001);assert.equal(s.preload,false);}
});
