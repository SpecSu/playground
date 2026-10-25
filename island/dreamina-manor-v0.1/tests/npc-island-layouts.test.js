import test from 'node:test';
import assert from 'node:assert/strict';
import {AVATAR_CAST} from '../lib/avatars/avatar-cast.js';
import {SPECIES_BY_ID} from '../lib/game/catalogue.js';
import {allLandReachable,cellKey,docksHaveWater,planWalk,validCell} from '../lib/game/grid.js';
import {fishTankFit} from '../lib/game/fish-space.js';
import {createGame,assertGame} from '../lib/game/state.js';
import {priceItem} from '../lib/game/economy.js';

// Missing authored content must fail as a missing feature, not hide behind import failure.
const {NPC_ISLAND_LAYOUTS:layouts=[]}=await import('../lib/art/npc-island-layouts.js').catch(error=>{
 if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
 return {};
});
const has=(cells,cell)=>cells.some(c=>cellKey(c)===cellKey(cell));
function connected(cells){
 if(!cells.length)return true;
 const seen=new Set(),todo=[cells[0]],all=new Set(cells.map(cellKey));
 while(todo.length){const c=todo.pop(),key=cellKey(c);if(seen.has(key))continue;seen.add(key);for(const [x,z]of[[c.x-1,c.z],[c.x+1,c.z],[c.x,c.z-1],[c.x,c.z+1]])if(all.has(`${x},${z}`)&&!seen.has(`${x},${z}`))todo.push({x,z});}
 return seen.size===cells.length;
}
function asGame(layout){
 const g=createGame(layout.uid,1000);
 for(const key of ['profile','land','docks','tank','position'])g[key]=structuredClone(layout[key]);
 const product=(entry,id)=>{const p=SPECIES_BY_ID[entry.speciesId],size=p.standardSize*(entry.scale??1),mutation=entry.mutation??'normal';return {id,speciesId:p.id,kind:p.kind,tier:p.tier,standardSize:p.standardSize,finalSize:size,mutation,value:priceItem(p,size,mutation),createdAt:1000};};
 g.items=[...layout.displayPlants.map((p,i)=>({...product(p,`${layout.uid}-plant-${i}`),location:{kind:'land',cell:p.cell}})),...layout.displayFish.map((p,i)=>({...product(p,`${layout.uid}-fish-${i}`),location:{kind:'tank'}}))];
 g.jobs=layout.production.map((p,i)=>({id:`${layout.uid}-job-${i}`,target:{kind:p.kind==='plant'?'land':'dock',cell:p.cell},inputTier:p.tier,startedAt:1000,readyAt:11000,product:product(p,`${layout.uid}-production-${i}`)}));
 return g;
}

test('four authored islands retain Kelly/Bear and use two real original-cast identities',()=>{
 assert.equal(layouts.length,4,'four authored layouts must be available');
 assert.deepEqual(layouts.map(l=>[l.uid,l.profile.name,l.profile.avatar]),[
  ['demo-kelly','Kelly','human-kelly'],['demo-bear','Bear熊','human-bear'],
  ['demo-frog','奶蛙','milk-frog'],['demo-cat','香蕉猫','banana-cat'],
 ]);
 for(const l of layouts)assert.ok(AVATAR_CAST.some(a=>a.id===l.profile.avatar&&a.name===l.profile.name));
 assert.equal(new Set(layouts.map(l=>l.theme)).size,4);
});

test('authored land and tanks are connected, every dry cell and fishing dock stays reachable',()=>{
 for(const l of layouts){
  for(const cells of[l.land,l.docks,l.tank]){assert.ok(cells.every(validCell),l.uid);assert.equal(new Set(cells.map(cellKey)).size,cells.length,l.uid);}
  assert.ok(connected(l.land),`${l.uid}: disconnected land`);
  assert.ok(connected(l.tank),`${l.uid}: split aquarium`);
  assert.ok(l.tank.every(c=>has(l.land,c)),l.uid);
  assert.ok(l.docks.every(c=>!has(l.land,c)),l.uid);
  assert.ok(docksHaveWater(l.land,l.docks),`${l.uid}: a dock has no open water`);
  assert.ok(allLandReachable(l.land,l.docks,l.tank,l.position),`${l.uid}: blocked route`);
  const g=asGame(l);
  for(const p of l.production)assert.ok(planWalk(l.land,l.docks,l.tank,l.position,{type:p.kind==='fish'?'dock':'land',cell:p.cell,workSide:p.kind==='plant'},g),`${l.uid}: production not approachable`);
 }
});

test('display plants and low-tier production use existing assets without double occupancy',()=>{
 for(const l of layouts){
  const g=asGame(l);assert.equal(assertGame(g),true,l.uid);
  assert.equal(l.production.length,2,l.uid);
  assert.deepEqual(l.production.map(p=>p.kind).sort(),['fish','plant']);
  for(const p of l.production){const s=SPECIES_BY_ID[p.speciesId];assert.ok(s,l.uid);assert.equal(s.kind,p.kind);assert.equal(s.tier,p.tier);assert.ok(p.tier<=2);}
  for(const p of l.displayPlants){assert.equal(SPECIES_BY_ID[p.speciesId].kind,'plant');assert.equal(p.scale,1);}
  for(const p of l.displayFish){assert.equal(SPECIES_BY_ID[p.speciesId].kind,'fish');assert.equal(p.scale,1);}
  assert.ok(!l.tank.some(c=>Math.abs(c.x-l.position.x)<.5&&Math.abs(c.z-l.position.z)<.5),l.uid);
 }
});

test('all aquarium residents fit at their true species scale without tank-driven shrinking',()=>{
 for(const l of layouts){const g=asGame(l);for(const item of g.items.filter(i=>i.kind==='fish')){
  const fit=fishTankFit(g,item);assert.ok(fit.fitsFootprint&&fit.fitsHeight,`${l.uid}: ${item.speciesId} does not fit`);
  assert.ok(fit.freeRectangle,`${l.uid}: ${item.speciesId} cannot freely turn`);
 }}
});

test('every outer dock has a clear cast-and-splash corridor instead of facing a narrow inland slot',()=>{
 for(const l of layouts)for(const dock of l.docks){
  const obstacles=[...l.land,...l.docks.filter(c=>cellKey(c)!==cellKey(dock))];
  // Three lane samples span a .8-cell-wide corridor, from the dock lip to
  // 3.5 cells of open sea. Neighbouring docks may block straight-out casting;
  // a lateral open-sea direction must then remain available to the renderer.
  const clearDirections=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>{
   for(let t=.55;t<=3.5;t+=.10)for(const side of[-.4,0,.4]){
    const x=dock.x+dx*t-dz*side,z=dock.z+dz*t+dx*side;
    if(obstacles.some(c=>Math.abs(c.x-x)<.5&&Math.abs(c.z-z)<.5))return false;
   }
   return true;
  });
  assert.ok(clearDirections.length>0,`${l.uid}: dock ${cellKey(dock)} has no safe casting corridor`);
  // The jetty sits outside its shoreline row, not between two land banks.
  const xs=l.land.filter(c=>c.z===dock.z).map(c=>c.x);
  assert.ok(xs.length>0&&(dock.x<Math.min(...xs)||dock.x>Math.max(...xs)),l.uid);
 }
});

test('themes retain legible collection focus and clear walking space instead of filling every tile',()=>{
 assert.equal(new Set(layouts.map(l=>JSON.stringify(l.land))).size,4);
 const by=Object.fromEntries(layouts.map(l=>[l.uid,l]));
 assert.ok(by['demo-frog']?.displayPlants.filter(p=>p.speciesId==='rafflesia').length>=3);
 assert.deepEqual(new Set(by['demo-cat']?.displayPlants.map(p=>p.speciesId)),new Set(['lithops','tomato','grape']));
 assert.ok(by['demo-bear']?.tank.length>=6);
 assert.ok(by['demo-bear']?.displayFish.some(p=>p.speciesId==='manta-ray'));
 assert.ok(by['demo-kelly']?.displayPlants.some(p=>p.speciesId==='phalaenopsis'));
 for(const l of layouts){const dry=l.land.length-l.tank.length,occupied=l.displayPlants.length+l.production.filter(p=>p.kind==='plant').length;assert.ok((dry-occupied)/dry>=.35,`${l.uid}: no visual breathing room`);}
});

test('declarative layouts contain no economic balances or generated IDs and cannot be mutated by visitors',()=>{
 assert.ok(Object.isFrozen(layouts));
 for(const l of layouts){
  assert.equal(l.coins,undefined);assert.equal(l.jobs,undefined);assert.equal(l.items,undefined);
  assert.throws(()=>{l.land[0].x=999;},TypeError);
  for(const p of[...l.displayPlants,...l.displayFish,...l.production]){assert.equal(p.id,undefined);assert.equal(p.value,undefined);assert.ok(Object.isFrozen(p));}
 }
});
