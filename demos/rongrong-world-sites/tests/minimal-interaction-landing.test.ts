import test from 'node:test';
import assert from 'node:assert/strict';
import {createMinimalState,minimalCommand,saveMinimalState,type MinimalState,type Species} from '../src/minimal/model.ts';
const now=1_793_000_000_000;
function carried(species:Species='sheep',scale=1):MinimalState{
 const s=createMinimalState(now);s.welcomeClaimed=true;s.coins=120;s.player={x:2,z:2};s.tiles=s.tiles.map(t=>({...t,owned:true,terrain:'meadow'}));
 s.animals=[{id:'held',name:'团团',species,sex:'female',size:scale>1.8?'giant':'normal',growth:{version:1,scales:[.6,Math.min(1,scale),Math.max(1,scale)]},bornAt:scale===.6?now:now-120_000,activity:'carried',activityUntil:now+10000,position:{...s.player},energy:80,bond:3}];s.carriedAnimalId='held';return s;
}
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
test('default putdown selects a clear nearby cell instead of dropping through LX',()=>{
 for(const species of ['cow','sheep','pig','bunny','duck'] as const)for(const scale of [.6,1,2.2]){const s=carried(species,scale),reply=minimalCommand(s,{type:'putdown'},now);assert.equal(reply.accepted,true);assert.equal(reply.state.carriedAnimalId,null);assert.ok(distance(reply.state.player,reply.state.animals[0].position)>=.5,`${species}/${scale} never lands under LX`);assert.ok(distance(reply.state.player,reply.state.animals[0].position)<=1.6);assert.equal(reply.state.coins,120);assert.equal(reply.state.animals[0].bond,3);assert.deepEqual(reply.state.animals[0].growth,s.animals[0].growth);assert.deepEqual(minimalCommand(s,{type:'putdown'},now).state.animals[0].position,reply.state.animals[0].position,'tie-breaking is deterministic');}
});
test('explicit unsafe putdown cannot bypass the under-LX invariant',()=>{
 const s=carried();for(const at of [{x:2,z:2},{x:2.1,z:2}, {x:NaN,z:2}]){const reply=minimalCommand(s,{type:'putdown',at},now);assert.equal(reply.accepted,false);assert.equal(reply.state.carriedAnimalId,'held');assert.deepEqual(reply.state.animals[0].position,s.player);}
});
test('large-body clearance rejects an adjacent giant pig but allows a clear diagonal',()=>{
 const s=carried('pig',2.2);assert.equal(minimalCommand(s,{type:'putdown',at:{x:3,z:2}},now).accepted,false,'two world units do not clear this giant plus LX');const reply=minimalCommand(s,{type:'putdown',at:{x:3,z:3}},now);assert.equal(reply.accepted,true);assert.deepEqual(reply.state.animals[0].position,{x:3,z:3});
});
test('crowded putdown remains carried with a helpful reason and no resource mutation',()=>{
 const s=carried();s.tiles=s.tiles.map(t=>({...t,owned:t.x===2&&t.z===2}));const reply=minimalCommand(s,{type:'putdown'},now);assert.equal(reply.accepted,false);assert.match(reply.message,/旁边有点挤/);assert.equal(reply.state.carriedAnimalId,'held');assert.equal(reply.state.coins,s.coins);assert.equal(reply.state.animals.length,1);assert.equal(reply.state.animals[0].activity,'carried');
});
test('landing rejects pond, shallow water, shop, locked ground, eggs and occupied cells',()=>{
 for(const kind of ['pond','creek','locked','egg','animal'] as const){const s=carried(),at={x:3,z:2},tile=s.tiles.find(t=>t.x===3&&t.z===2)!;if(kind==='pond'||kind==='creek')tile.terrain=kind;if(kind==='locked')tile.owned=false;if(kind==='egg')s.eggs=[{id:'egg',species:'duck',sex:'male',size:'normal',source:'shop',location:'ground',position:at,boughtAt:now}];if(kind==='animal')s.animals.push({...s.animals[0],id:'other',activity:'idle',position:at});const reply=minimalCommand(s,{type:'putdown',at},now);assert.equal(reply.accepted,false,kind);assert.equal(reply.state.carriedAnimalId,'held');}
 const s=carried();s.player={x:1,z:1};s.animals[0].position={...s.player};assert.equal(minimalCommand(s,{type:'putdown',at:{x:1,z:0}},now).accepted,false);assert.equal(minimalCommand(s,{type:'putdown',at:{x:4,z:4}},now).accepted,false,'range remains bounded');
});
test('a giant cannot land with its planted foot envelope crossing a dry-ground edge',()=>{
 const s=carried('cow',2.2),at={x:3,z:3};s.tiles.find(t=>t.x===4&&t.z===3)!.terrain='pond';const reply=minimalCommand(s,{type:'putdown',at},now);assert.equal(reply.accepted,false);assert.equal(reply.state.carriedAnimalId,'held');
});
test('clearance considers neighboring actual animal and egg envelopes, not only matching tile ids',()=>{
 const s=carried('pig',2.2),at={x:3,z:3};s.animals.push({...s.animals[0],id:'other',activity:'idle',position:{x:4,z:3}});assert.equal(minimalCommand(s,{type:'putdown',at},now).accepted,false);
 s.animals.pop();s.eggs=[{id:'egg',species:'duck',sex:'male',size:'normal',source:'shop',location:'ground',position:{x:4,z:3},boughtAt:now}];assert.equal(minimalCommand(s,{type:'putdown',at},now).accepted,false);
});
test('safe release remains serializable in the unchanged v2 save shape',()=>{
 const s=carried('duck',.6),reply=minimalCommand(s,{type:'putdown'},now),values=new Map<string,string>();assert.equal(reply.accepted,true);assert.equal(saveMinimalState({setItem:(k,v)=>{values.set(k,v);},getItem:k=>values.get(k)??null},reply.state),true);assert.equal(reply.state.version,3);assert.equal(Object.hasOwn(reply.state.animals[0],'transfer'),false);
});
