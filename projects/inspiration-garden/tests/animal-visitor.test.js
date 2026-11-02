import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimalVisitor} from '../src/animal-visitor.js';
import {DEMO_GARDENS,allCatalogueVarieties} from '../src/catalogue.js';

const grid=(w=6,h=5)=>Array.from({length:w*h},(_,i)=>({id:`t${i%w}:${Math.floor(i/w)}`,x:i%w,y:Math.floor(i/w),kind:'land'}));
const makeWorld=(patch={})=>({id:'demo-kelly-music',tiles:grid(),plants:[],exhibits:[],avatarTileId:'t0:0',spawnTileId:'t0:0',ownerPosition:{x:0,y:1},residents:[{id:'host',x:0,y:1,avatarKey:'human-kelly'}],animalVisitorSpawns:[{x:3,y:2},{x:4,y:2}],...patch});
const create=(random=()=>0)=>createAnimalVisitor({clock:()=>100000,random});

test('an approved friend demo gets one stable scene-only animal after a quiet initial delay',()=>{
 const world=makeWorld(),before=structuredClone(world),visitor=create();visitor.setWorld(world,{},0);
 assert.equal(visitor.tick(44999),null);
 const first=visitor.tick(45000);
 assert.equal(first.avatarKey,'milk-frog');assert.equal(first.kind,'animal-visitor');assert.equal(first.interactive,false);
 assert.equal(typeof first.id,'string');assert.equal(first.x,3);assert.equal(first.y,2);assert.equal(first.direction,'front');assert.equal(first.mirror,false);assert.equal(first.moving,false);
 for(let at=45000;at<48000;at+=25){visitor.setWorld({...world}, {},at);const pose=visitor.tick(at);assert.equal(pose.id,first.id);assert.equal(pose.avatarKey,first.avatarKey);assert.equal(Array.isArray(pose),false);}
 first.x=999;assert.notEqual(visitor.tick(47999).x,999);assert.deepEqual(world,before);
});

test('only the four approved demo worlds are eligible and explicit authored stops are mandatory',()=>{
 for(const id of ['my-inspiration-garden','home','demo-unapproved','friend-unapproved','']){const visitor=create();visitor.setWorld(makeWorld({id}),{},0);assert.equal(visitor.tick(90000),null,id);}
 for(const animalVisitorSpawns of [undefined,[],[{x:99,y:99}]]){const visitor=create();visitor.setWorld(makeWorld({animalVisitorSpawns}),{},0);assert.equal(visitor.tick(90000),null);}
 for(const garden of DEMO_GARDENS){const world={...garden,avatarTileId:garden.spawnTileId,residents:[{id:garden.hostId,...garden.ownerPosition}]},before=structuredClone(world),visitor=create();visitor.setWorld(world,allCatalogueVarieties(),0);const pose=visitor.tick(45000);assert.ok(pose,garden.id);assert.ok(garden.animalVisitorSpawns.some(p=>p.x===pose.x&&p.y===pose.y));assert.deepEqual(world,before);}
});

test('a visit expires and the next arrival waits a full cooldown with a new identity',()=>{
 const visitor=create();visitor.setWorld(makeWorld(),{},0);const first=visitor.tick(45000);assert.ok(visitor.tick(64999));assert.equal(visitor.tick(65000),null);assert.equal(visitor.tick(124999),null);const next=visitor.tick(125000);assert.ok(next);assert.notEqual(next.id,first.id);
});

test('maximum random values still produce bounded initial, visit and cooldown delays',()=>{
 const visitor=create(()=>1);visitor.setWorld(makeWorld(),{},0);assert.equal(visitor.tick(89999),null);assert.ok(visitor.tick(90000));assert.ok(visitor.tick(124999));assert.equal(visitor.tick(125000),null);assert.equal(visitor.tick(244999),null);assert.ok(visitor.tick(245000));
});

test('live occupied stops are skipped and an all-blocked arrival is deferred instead of overlapping',()=>{
 const visitor=create(),world=makeWorld();visitor.setWorld(world,{},0);const pose=visitor.tick(45000,{occupied:[{x:3,y:2}]});assert.equal(pose.x,4);assert.equal(pose.y,2);
 const blocked=create();blocked.setWorld(world,{},0);assert.equal(blocked.tick(45000,{occupied:[{x:3.2,y:2},{x:4,y:2}]}),null);assert.equal(blocked.tick(45001,{occupied:[]}),null);assert.ok(blocked.tick(90000,{occupied:[]}));
});

test('authored arrival, player and host cells are reserved even when live occupied poses are omitted',()=>{
 for(const patch of [
  {animalVisitorSpawns:[{x:0,y:0}]},
  {animalVisitorSpawns:[{x:0,y:1}]},
  {avatarTileId:'t3:2',animalVisitorSpawns:[{x:3,y:2}]},
  {residents:[{id:'extra-host',x:3,y:2}],animalVisitorSpawns:[{x:3,y:2}]},
 ]){const visitor=create();visitor.setWorld(makeWorld(patch),{},0);assert.equal(visitor.tick(45000,{occupied:[]}),null);}
});

test('animals require completed land or platform and never fall back to planted stops',()=>{
 for(const patch of [
  {tiles:grid().map(t=>t.id==='t3:2'?{...t,startedAt:99000,readyAt:101000}:t)},
  {tiles:grid().map(t=>t.id==='t3:2'?{...t,kind:'water'}:t)},
  {plants:[{id:'plant',tileId:'t3:2',varietyId:'small'}]},
  {plants:[{id:'canopy',tileId:'t2:1',varietyId:'giant'}]},
 ]){const visitor=create();visitor.setWorld(makeWorld({...patch,animalVisitorSpawns:[{x:3,y:2}]}),{small:{artKey:'radish'},giant:{artKey:'giant_piano_sunflower'}},0);assert.equal(visitor.tick(45000),null);}
});

test('trusted 1×1, 2×1 and 2×2 building cells block every occupied stop, including nonanchors and worksites',()=>{
 for(const [sampleId,width,height]of [['lamy_memory_column',1,1],['airforce_memory_house',2,1],['necklace_memory_monument',2,2]]){
  const stops=[];for(let x=2;x<2+width;x++)for(let y=2;y<2+height;y++)stops.push({x,y});stops.push({x:2+width,y:2});
  for(const owned of [false,true]){
   const building={id:'building',...(owned?{tileId:'t2:2',blueprintId:'owned'}:{x:2,y:2,artKey:sampleId}),footprint:[99,99],startedAt:99000,readyAt:114000};
   const world=makeWorld({animalVisitorSpawns:stops,...(owned?{buildings:[building],blueprints:{owned:{sampleId}}}:{exhibits:[building]})}),visitor=create();visitor.setWorld(world,{},0);const pose=visitor.tick(45000);assert.ok(pose,`${sampleId} ${owned}`);assert.equal(pose.x,2+width);assert.equal(pose.y,2);
  }
 }
});

test('an approved stop must connect to arrival without crossing any plant footprint',()=>{
 const tiles=grid(5,3),plants=[0,1,2].map(y=>({id:`plant${y}`,tileId:`t2:${y}`,varietyId:'small'})),visitor=create();visitor.setWorld(makeWorld({tiles,plants,animalVisitorSpawns:[{x:3,y:1}]}),{small:{artKey:'radish'}},0);assert.equal(visitor.tick(45000),null);
});

test('a visitor does not occupy a one-cell main-route bottleneck',()=>{
 const tiles=grid(5,1),visitor=create();visitor.setWorld(makeWorld({tiles,ownerPosition:null,residents:[],animalVisitorSpawns:[{x:2,y:0}]}),{},0);assert.equal(visitor.tick(45000),null);
});

test('hidden visits clear immediately and resume starts a fresh delay without background catch-up',()=>{
 const visitor=create();visitor.setWorld(makeWorld(),{},0);const first=visitor.tick(45000);visitor.setActive(false,45001);assert.equal(visitor.tick(50000),null);assert.equal(visitor.tick(900000),null);visitor.setActive(true,900000);assert.equal(visitor.tick(944999),null);const next=visitor.tick(945000);assert.ok(next);assert.notEqual(next.id,first.id);
 visitor.setActive(true,945001);assert.equal(visitor.tick(945002).id,next.id);
});

test('a world installed while hidden cannot arrive until a full fresh visible delay',()=>{
 const visitor=create();visitor.setActive(false,0);visitor.setWorld(makeWorld(),{},10);assert.equal(visitor.tick(1000000),null);visitor.setActive(true,1000000);assert.equal(visitor.tick(1044999),null);assert.ok(visitor.tick(1045000));
});

test('switching worlds cancels old identity and home never inherits a pending guest',()=>{
 const visitor=create();visitor.setWorld(makeWorld(),{},0);const first=visitor.tick(45000);visitor.setWorld(makeWorld({id:'demo-lx-tech'}),{},45001);assert.equal(visitor.tick(45001),null);assert.equal(visitor.tick(90000),null);const second=visitor.tick(90001);assert.ok(second);assert.notEqual(second.id,first.id);visitor.setWorld(makeWorld({id:'my-inspiration-garden'}),{},90002);assert.equal(visitor.tick(999999),null);visitor.setWorld(makeWorld(),{},1000000);assert.equal(visitor.tick(1044999),null);assert.ok(visitor.tick(1045000));
});

test('clear releases world state and allows a new delay while dispose permanently prevents all action',()=>{
 const visitor=create();visitor.setWorld(makeWorld(),{},0);assert.ok(visitor.tick(45000));visitor.clear();assert.equal(visitor.tick(1000000),null);visitor.setWorld(makeWorld(),{},1000000);assert.equal(visitor.tick(1044999),null);assert.ok(visitor.tick(1045000));visitor.dispose();visitor.dispose();visitor.clear();visitor.setActive(true,1100000);visitor.setWorld(makeWorld(),{},1100000);assert.equal(visitor.tick(2000000),null);
});

test('same-world geometry, worksite or planted-footprint changes remove an active visitor before another sample',()=>{
 for(const mutate of [
  w=>({...w,exhibits:[{id:'new-worksite',x:3,y:2,artKey:'lamy_memory_column',startedAt:99000,readyAt:114000}]}),
  w=>({...w,tiles:w.tiles.filter(t=>t.id!=='t3:2')}),
  w=>({...w,plants:[{id:'new-plant',tileId:'t3:2',varietyId:'small'}]}),
 ]){const visitor=create(),world=makeWorld();visitor.setWorld(world,{small:{artKey:'radish'}},0);assert.ok(visitor.tick(45000));visitor.setWorld(mutate(world),{small:{artKey:'radish'}},45001);assert.equal(visitor.tick(45001),null);assert.equal(visitor.tick(45002),null);}
 const world=makeWorld(),visitor=create();visitor.setWorld(world,{},0);assert.ok(visitor.tick(45000));world.tiles.find(t=>t.id==='t3:2').readyAt=200000;world.tiles.find(t=>t.id==='t3:2').startedAt=100000;assert.equal(visitor.tick(45001),null);
});

test('a live actor entering a stationary guest position removes it rather than overlapping or blocking',()=>{
 const visitor=create();visitor.setWorld(makeWorld(),{},0);const pose=visitor.tick(45000);assert.equal(visitor.tick(45001,{occupied:[{x:pose.x+.2,y:pose.y}]}),null);assert.equal(visitor.tick(45002,{occupied:[]}),null);
});

test('a guest pauses, walks continuously on nearby empty supports and pauses again without replacing identity',()=>{
 const visitor=create(),world=makeWorld();visitor.setWorld(world,{},0);const first=visitor.tick(45000);let previous=first,moving=0,fractional=0,stoppedAfter=false,lastMoving=null;
 for(let at=45010;at<=51000;at+=10){const pose=visitor.tick(at);assert.ok(pose);assert.equal(pose.id,first.id);assert.equal(pose.avatarKey,first.avatarKey);assert.ok(Math.hypot(pose.x-previous.x,pose.y-previous.y)<.05,`jump at ${at}`);assert.ok(Math.abs(pose.x-first.x)+Math.abs(pose.y-first.y)<=2.0001);if(at<48000)assert.equal(pose.moving,false);if(pose.moving){moving++;lastMoving=at;if(!Number.isInteger(pose.x)||!Number.isInteger(pose.y))fractional++;}else if(moving){stoppedAfter=true;assert.ok(at-lastMoving<2500);}previous=pose;}
 assert.ok(moving>20);assert.ok(fractional>20);assert.ok(stoppedAfter);
});

test('walking directions and mirror flags follow the illustrated shared grid-facing mapping',()=>{
 const outcomes=new Set();for(let seed=1;seed<=18;seed++){
  let state=seed;const random=()=>((state=(state*1664525+1013904223)>>>0)/4294967296),visitor=create(random);visitor.setWorld(makeWorld(),{},0);let previous=null;
  for(let at=45000;at<=120000;at+=20){const pose=visitor.tick(at);if(pose&&previous&&pose.id===previous.id&&pose.moving){const x=pose.x-previous.x,y=pose.y-previous.y;if(Math.abs(x)+Math.abs(y)>1e-7&&(Math.abs(x)<1e-7||Math.abs(y)<1e-7)){const direction=x+y<0?'back':'front',mirror=direction==='front'?x-y>0:x-y<0;assert.equal(pose.direction,direction);assert.equal(pose.mirror,mirror);outcomes.add(`${direction}:${mirror}`);}}previous=pose;}
 }
 assert.deepEqual([...outcomes].sort(),['back:false','back:true','front:false','front:true']);
});

test('wandering avoids full plant/building footprints, live occupied supports and fractional actor corridors',()=>{
 const world=makeWorld({plants:[{id:'canopy',tileId:'t1:2',varietyId:'giant'}],exhibits:[{id:'small-house',x:4,y:1,artKey:'airforce_memory_house'}]}),visitor=create(),actors=[{x:3.5,y:1.3}];visitor.setWorld(world,{giant:{artKey:'giant_piano_sunflower'}},0);let moved=false;
 for(let at=45000;at<64000;at+=10){const pose=visitor.tick(at,{occupied:actors});assert.ok(pose);moved||=pose.moving;assert.ok(!(pose.x> .5&&pose.x<2.5&&pose.y>1.5&&pose.y<3.5),'inside giant plant');assert.ok(!(pose.x>3.5&&pose.x<5.5&&pose.y>.5&&pose.y<1.5),'inside 2×1 house');assert.ok(Math.hypot(pose.x-3.5,pose.y-1.3)>=.8-1e-7);}
 assert.ok(moved);
});

test('new occupied or constructed route cells remove a moving guest before crossing even on a long frame',()=>{
 for(const mode of ['actor','building']){
  const world=makeWorld(),visitor=create();visitor.setWorld(world,{},0);visitor.tick(45000);let moving;
  for(let at=48000;at<=52000;at+=10){const pose=visitor.tick(at);if(pose?.moving&&(!Number.isInteger(pose.x)||!Number.isInteger(pose.y))){moving={...pose,at};break;}}
  assert.ok(moving);const target={x:Math.round(moving.x),y:Math.floor(moving.y)};
  if(mode==='actor')assert.equal(visitor.tick(moving.at+2000,{occupied:[target]}),null);
  else{world.exhibits.push({id:'new',...target,artKey:'lamy_memory_column',startedAt:99000,readyAt:114000});assert.equal(visitor.tick(moving.at+2000),null);}
 }
});

test('if every nearby wander support is occupied the visitor quietly stays at its approved stop',()=>{
 const world=makeWorld(),visitor=create(),occupied=world.tiles.filter(t=>t.x!==3||t.y!==2).map(({x,y})=>({x,y}));visitor.setWorld(world,{},0);const first=visitor.tick(45000,{occupied});assert.ok(first);for(let at=48000;at<65000;at+=100){const pose=visitor.tick(at,{occupied});assert.ok(pose);assert.equal(pose.x,3);assert.equal(pose.y,2);assert.equal(pose.moving,false);}
});

test('authored stops restored on the same world start a fresh arrival delay',()=>{
 const visitor=create();visitor.setWorld(makeWorld({animalVisitorSpawns:[]}),{},0);assert.equal(visitor.tick(90000),null);visitor.setWorld(makeWorld(),{},90001);assert.equal(visitor.tick(135000),null);assert.ok(visitor.tick(135001));
});

test('malformed authored stops are ignored without inventing a substitute cell',()=>{
 const visitor=create();visitor.setWorld(makeWorld({animalVisitorSpawns:[null,{x:'3',y:2},{x:NaN,y:2},{x:99,y:99}]}),{},0);assert.equal(visitor.tick(45000),null);
});

test('only the six existing illustrated animal identities are selected, never a human or outfit',()=>{
 const selected=new Set();for(let index=0;index<6;index++){const visitor=create(()=>index/6+.01);visitor.setWorld(makeWorld(),{},0);selected.add(visitor.tick(90000).avatarKey);}
 assert.deepEqual([...selected].sort(),['banana-cat','feidudu','miaocuijiao','milk-frog','niulai','sword-shield-dog']);
});

test('wandering is bounded to three short walks per visit rather than a busy continuous patrol',()=>{
 const visitor=create();visitor.setWorld(makeWorld(),{},0);let starts=0,previous=null;for(let at=45000;at<65000;at+=20){const pose=visitor.tick(at);if(pose.moving&&!previous?.moving)starts++;previous=pose;}assert.ok(starts>0);assert.ok(starts<=3);
});
