import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduce, dayKey, getVariety, isMature, availableBasics, canBuySeed } from '../src/state.js';
import { CREATIVE_SAMPLES, DEMO_VARIETIES, DEMO_GARDENS, BUILDINGS, matchIdeas } from '../src/catalogue.js';
const NOW = Date.UTC(2026,9,25,15,40);
const fresh = () => createState(NOW,'visitor-test');
const act = (s,action,now=NOW) => { const r=reduce(s,action,now); assert.equal(r.ok,true,r.message); return r.state; };

test('fresh island permits first crop with given balances and only four land cells', () => {
  const s=fresh(); assert.equal(s.coins,120); assert.equal(s.crystals,3); assert.equal(s.inventory.radish,2);
  assert.equal(s.tiles.length,4); assert.ok(s.tiles.every(t=>t.kind==='land'));
  const p=act(s,{type:'PLANT',tileId:s.tiles[0].id,varietyId:'radish'});
  assert.equal(p.inventory.radish,1); assert.equal(p.plants[0].readyAt-NOW,15000); assert.equal(s.inventory.radish,2);
});
test('crop matures after elapsed time and sale removes whole plant once',()=>{
  let s=act(fresh(),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'}); const id=s.plants[0].id;
  assert.equal(isMature(s.plants[0],NOW+14999),false);
  assert.equal(reduce(s,{type:'SELL',plantId:id},NOW+14999).ok,false);
  s=act(s,{type:'SELL',plantId:id},NOW+15000); assert.equal(s.coins,134); assert.equal(s.sales,1); assert.equal(s.plants.length,0);
  const duplicate=reduce(s,{type:'SELL',plantId:id},NOW+15001); assert.equal(duplicate.ok,false); assert.equal(duplicate.state.coins,134);
});
test('same seed preserves exact variety and all further crops use catalogue growth',()=>{
  let s=fresh(); s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'});
  s=act(s,{type:'PLANT',tileId:'tile-1-0',varietyId:'radish'});
  assert.equal(s.plants[0].varietyId,s.plants[1].varietyId); assert.equal(s.plants[1].readyAt-NOW,45000);
});
test('buying is coin-only, does not overspend, hidden basics unlock from completed sales',()=>{
  let s=fresh(); assert.deepEqual(availableBasics(s).map(x=>x.id),['radish','tomato']);
  assert.equal(reduce(s,{type:'BUY_SEED',varietyId:'sunflower'}).ok,false);
  for(let i=0;i<15;i++) s=act(s,{type:'BUY_SEED',varietyId:'radish'});
  assert.equal(s.coins,0); assert.equal(s.crystals,3); assert.equal(reduce(s,{type:'BUY_SEED',varietyId:'radish'}).ok,false);
  s={...fresh(),sales:1}; assert.deepEqual(availableBasics(s).map(x=>x.id),['radish','tomato','mushroom']);
});
test('creative confirmation uses one crystal once; cancel or unsupported sample changes nothing',()=>{
  let s=fresh(); const before=structuredClone(s);
  const canceled=reduce(s,{type:'CANCEL_CREATION'},NOW); assert.deepEqual(canceled.state,before);
  const invalid=reduce(s,{type:'CREATE_VARIETY',sampleId:'anything-ai',requestId:'bad'},NOW); assert.equal(invalid.ok,false); assert.deepEqual(invalid.state,before);
  s=act(s,{type:'CREATE_VARIETY',sampleId:'whisper_radish',parentId:'radish',requestId:'once'});
  assert.equal(s.crystals,2); const created=Object.values(s.varieties).find(v=>v.authorId==='visitor-test'); assert.ok(created); assert.equal(s.inventory[created.id],1);
  const twice=reduce(s,{type:'CREATE_VARIETY',sampleId:'whisper_radish',parentId:'radish',requestId:'once'},NOW); assert.equal(twice.ok,false); assert.equal(twice.state.crystals,2);
  assert.equal(created.parentId,'radish'); assert.equal(created.rootId,'radish'); assert.equal(canBuySeed(s,created.id),true);
});
test('creation cannot spend absent crystals but ordinary farming remains available',()=>{
  let s={...fresh(),crystals:0}; assert.equal(reduce(s,{type:'CREATE_VARIETY',sampleId:CREATIVE_SAMPLES[0].id,requestId:'zero'},NOW).ok,false);
  s=act(s,{type:'BUY_SEED',varietyId:'tomato'}); assert.equal(s.coins,104);
});
test('daily grant uses Shanghai date and cannot repeat after reload-like copy',()=>{
  assert.equal(dayKey(Date.UTC(2026,9,25,16)), '2026-10-26');
  let s=act(fresh(),{type:'DAILY_CLAIM'},NOW); assert.equal(s.crystals,5);
  assert.equal(reduce(structuredClone(s),{type:'DAILY_CLAIM'},NOW+1000).ok,false);
  s=act(s,{type:'DAILY_CLAIM'},Date.UTC(2026,9,25,16)); assert.equal(s.crystals,7);
});
test('friend interaction is required and claim quota is per variety across copies and gardens',()=>{
  let s=fresh(); const g=DEMO_GARDENS[0], plant=g.plants.find(p=>p.varietyId==='demo-drum_pumpkin'); const action={gardenId:g.id,plantId:plant.id};
  assert.equal(reduce(s,{type:'CLAIM_SEED',...action},NOW).ok,false);
  s=act(s,{type:'INTERACT_DEMO',...action}); s=act(s,{type:'CLAIM_SEED',...action}); assert.equal(s.inventory[plant.varietyId],1);
  assert.equal(reduce(s,{type:'CLAIM_SEED',...action},NOW).ok,false);
  // Same canonical species in another local fixture proves the rule independently
  // from the current art director's decision not to repeat displays across islands.
  const other=DEMO_GARDENS[1],copy={...plant,id:'quota-test-copy',tileId:other.tiles.find(t=>t.kind==='land').id};other.plants.push(copy);
  try{s=act(s,{type:'INTERACT_DEMO',gardenId:other.id,plantId:copy.id});assert.equal(reduce(s,{type:'CLAIM_SEED',gardenId:other.id,plantId:copy.id},NOW).ok,false);}finally{other.plants.pop();}
  assert.equal(canBuySeed(s,plant.varietyId),false);
  s=act(s,{type:'INTERACT_DEMO',...action},NOW+86400000); s=act(s,{type:'CLAIM_SEED',...action},NOW+86400000); assert.equal(s.inventory[plant.varietyId],2);
});
test('second generation seed propagation keeps original author while remix declares new author',()=>{
  let s=fresh();s=act(s,{type:'RECEIVE_SEED',variety:structuredClone(DEMO_VARIETIES['demo-puffer_tomato']),transferId:'legacy-puffer'});
  const original=getVariety(s,'demo-puffer_tomato'); s=act(s,{type:'RECEIVE_SEED',variety:structuredClone(original),transferId:'second-generation'});
  assert.equal(s.inventory[original.id],2); assert.equal(getVariety(s,original.id).authorId,original.authorId);
  s=act(s,{type:'CREATE_VARIETY',sampleId:'painter_tomato',parentId:original.id,requestId:'remix-friend'});
  const remix=Object.values(s.varieties).find(v=>v.authorId===s.uid); assert.equal(remix.parentId,original.id); assert.equal(remix.rootId,original.rootId); assert.equal(remix.parentAuthorName,original.authorName);
});
test('all four constructions work; only land plants; occupied supporting land cannot move or reclaim',()=>{
  let s={...fresh(),coins:1000}; assert.equal(Object.keys(BUILDINGS).length,4);
  s=act(s,{type:'BUILD',kind:'platform',x:2,y:0}); const platform=s.tiles.find(t=>t.kind==='platform');
  assert.equal(reduce(s,{type:'PLANT',tileId:platform.id,varietyId:'radish'},NOW).ok,false);
  s=act(s,{type:'BUILD',kind:'fence',tileId:'tile-0-0',edge:'north'}); s=act(s,{type:'BUILD',kind:'wall',tileId:'tile-1-0',edge:'north'}); assert.equal(s.edges.length,2);
  s=act(s,{type:'BUILD',kind:'land',x:2,y:1}); s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'});
  assert.equal(reduce(s,{type:'RECLAIM',targetId:'tile-0-0'},NOW).ok,false);
  assert.equal(reduce(s,{type:'MOVE_BUILDING',targetId:'tile-0-0',x:3,y:0},NOW).ok,false);
  const edge=s.edges[0]; s=act(s,{type:'MOVE_BUILDING',targetId:edge.id,tileId:'tile-1-1',edge:'south'},NOW+3000); assert.equal(s.edges[0].tileId,'tile-1-1');
  s=act(s,{type:'RECLAIM',targetId:edge.id}); assert.equal(s.edges.length,1);
});
test('construction prevents disconnected shapes, duplicate edges, overspending and more than 36 cells',()=>{
  let s={...fresh(),coins:10000}; assert.equal(reduce(s,{type:'BUILD',kind:'land',x:4,y:4},NOW).ok,false);
  assert.equal(reduce(s,{type:'BUILD',kind:'land',x:0,y:0},NOW).ok,false);
  s=act(s,{type:'BUILD',kind:'fence',tileId:'tile-0-0',edge:'north'}); assert.equal(reduce(s,{type:'BUILD',kind:'wall',tileId:'tile-0-0',edge:'north'},NOW).ok,false);
  for(let x=2;x<34;x++) s=act(s,{type:'BUILD',kind:'land',x,y:0},NOW+(x-1)*3000); assert.equal(s.tiles.length,36);
  assert.equal(reduce(s,{type:'BUILD',kind:'land',x:34,y:0},NOW).ok,false);
  const poor={...fresh(),coins:0}; assert.equal(reduce(poor,{type:'BUILD',kind:'land',x:2,y:0},NOW).ok,false);
});
test('moving or reclaiming a bridge cannot orphan island and spawn always remains on existing cell',()=>{
  let s={...fresh(),coins:1000}; s=act(s,{type:'BUILD',kind:'land',x:2,y:0}); s=act(s,{type:'BUILD',kind:'land',x:3,y:0},NOW+3000);
  assert.equal(reduce(s,{type:'RECLAIM',targetId:'tile-2-0'},NOW).ok,false);
  s=act(s,{type:'TRAVEL',tileId:'tile-3-0'},NOW+6000); s=act(s,{type:'RECLAIM',targetId:'tile-3-0',actorPosition:{x:2,y:0}}); assert.ok(s.tiles.some(t=>t.id===s.avatarTileId));
});
test('offline idea matching rejects unknown prompt rather than silently claiming arbitrary generation',()=>{
  assert.ok(CREATIVE_SAMPLES.length>=10); assert.ok(CREATIVE_SAMPLES.filter(s=>s.invention).length>=2);
  assert.equal(matchIdeas('请按我的工作会议照片生成一棵树').length,0);
  assert.ok(matchIdeas('会打鼓的南瓜').some(s=>s.interaction==='drum'));
});
test('revealing a mature creative plant persists discovery after selling; immature reveal is rejected',()=>{
 let s=fresh();s=act(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'reveal'});const v=Object.values(s.varieties).find(v=>v.authorId===s.uid);
 s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:v.id});const p=s.plants[0];
 assert.equal(reduce(s,{type:'REVEAL',plantId:p.id},NOW).ok,false);s=act(s,{type:'REVEAL',plantId:p.id},p.readyAt);assert.ok(s.discovered.includes(v.id));
 s=act(s,{type:'SELL',plantId:p.id},p.readyAt);assert.ok(s.discovered.includes(v.id));
});
test('remixing requires a discovered parent rather than guessing a hidden catalogue id',()=>{
 const s=fresh();assert.equal(reduce(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',parentId:'sunflower',requestId:'hidden'},NOW).ok,false);
 assert.equal(reduce(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',parentId:'demo-cloud_lantern',requestId:'unowned'},NOW).ok,false);
});
test('first basic crop is accelerated even if tomato is chosen or a creative plant was planted first',()=>{
 let s=act(fresh(),{type:'BUY_SEED',varietyId:'tomato'});s=act(s,{type:'PLANT',tileId:'tile-0-0',varietyId:'tomato'});assert.equal(s.plants[0].readyAt-NOW,15000);
 let t=act(fresh(),{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'before-basic'});const v=Object.values(t.varieties).find(v=>v.authorId===t.uid);t=act(t,{type:'PLANT',tileId:'tile-0-0',varietyId:v.id});t=act(t,{type:'PLANT',tileId:'tile-1-0',varietyId:'radish'});assert.equal(t.plants[1].readyAt-NOW,15000);
});
test('prototype property names are not recognized as building kinds or known remix parents',()=>{
 const s=fresh();for(const kind of ['__proto__','constructor','toString']){
  const r=reduce(s,{type:'BUILD',kind,tileId:'tile-0-0',edge:'north'},NOW);assert.equal(r.ok,false,kind);assert.deepEqual(r.state,s);
  const parent=reduce(s,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',parentId:kind,requestId:`proto-${kind}`},NOW);assert.equal(parent.ok,false,kind);
 }
});
test('moving a cell with attached edge cannot overlap an existing shared edge',()=>{
 let s={...fresh(),coins:1000};s=act(s,{type:'BUILD',kind:'fence',tileId:'tile-0-0',edge:'north'});s=act(s,{type:'BUILD',kind:'wall',tileId:'tile-1-1',edge:'north'});
 const before=structuredClone(s),r=reduce(s,{type:'MOVE_BUILDING',targetId:'tile-0-0',x:1,y:1},NOW);assert.equal(r.ok,false);assert.deepEqual(r.state,before);
});
import {reclaimRefund} from '../src/state.js';
test('reclaim quote includes attached edges and matches the exact coin refund applied',()=>{
 let s={...fresh(),coins:1000};s=act(s,{type:'BUILD',kind:'fence',tileId:'tile-0-0',edge:'north'});s=act(s,{type:'BUILD',kind:'wall',tileId:'tile-0-0',edge:'west'});
 assert.equal(reclaimRefund(s,'tile-0-0'),22);const coins=s.coins;s=act(s,{type:'RECLAIM',targetId:'tile-0-0'},NOW+3000);assert.equal(s.coins-coins,22);assert.equal(s.edges.length,0);
});
test('specific piano-pumpkin idea ranks the compatible piano direction over generic pumpkin',()=>{
 assert.equal(matchIdeas('会弹琴的南瓜')[0].id,'piano_pumpkin');
});
