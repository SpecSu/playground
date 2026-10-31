import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../src/minimal/model.ts';
import {FarmSaveGuard} from '../src/minimal/save-guard.ts';
import type {FarmEgg,MinimalState,Point,Tile} from '../src/minimal/model.ts';

const T=1793000000000;
// These regressions catch player-only clearance being omitted, shared with animals,
// or enforced by rejecting/resetting valid historical ledgers instead of intent.
function farm():MinimalState{
 const s=model.createMinimalState(T);
 Object.assign(s,{coins:537,welcomeClaimed:true,sequence:73,expansions:4,placedEggCount:6,hatchedCount:3,guardian:'cat',collection:['cow','bunny'],lastCompanionGiftDay:'2026-10-25',breedingDay:'2026-10-24'});
 for(const t of s.tiles)t.terrain='meadow';
 model.tileAt(s,{x:0,z:4})!.owned=true;
 s.animals=[{id:'cow-legacy-41',name:'团团',species:'cow',sex:'female',size:'large',position:{x:3,z:3},activity:'idle',energy:72,bond:19,bornAt:T-70_000,growthAgeMs:60_000,activityUntil:T+120_000,lastBreedAttemptDay:'2026-10-24'}];
 s.eggs=[{id:'egg-legacy-72',source:'bred',species:'bunny',sex:'male',size:'normal',location:'bag',boughtAt:T-4000,parents:['bunny-17','bunny-18']}];
 s.lastHatch={animalId:'cow-legacy-41',at:T-70_000,position:{x:3,z:3}};
 s.lastBreeding={animalIds:['bunny-17','bunny-18'],at:T-4000,success:true};
 return s;
}
function pond(s:MinimalState,x=2,z=2,owned=true):void{Object.assign(model.tileAt(s,{x,z})!,{terrain:'pond',owned});}
function nest(id:string,position:Point):FarmEgg{return {id,source:'shop',species:'cow',sex:'male',size:'normal',location:'ground',position,boughtAt:T-1000,placedAt:T-1000,readyAt:T+10_000};}
function legacy():MinimalState{const s=farm();pond(s);s.player={x:1.49,z:1.6};s.playerPath=[{x:1.49,z:2.4}];s.playerSpeed=.9;assert.equal(model.validateMinimalSave(s),true);return s;}
function storageFor(s:MinimalState){let raw=JSON.stringify(s);return {getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},raw:()=>raw};}
function cross(a:Point,b:Point,c:Point):number{return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}
function between(a:number,b:number,c:number):boolean{return c>=Math.min(a,b)&&c<=Math.max(a,b);}
function onSegment(a:Point,b:Point,c:Point):boolean{return cross(a,b,c)===0&&between(a.x,b.x,c.x)&&between(a.z,b.z,c.z);}
function linesIntersect(a:Point,b:Point,c:Point,d:Point):boolean{
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 return abC*abD<0&&cdA*cdB<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
// Independent edge/orientation oracle, deliberately not the production slab test.
function hitsPond(tile:Tile,a:Point,b:Point):boolean{
 const h=.5+.12+.000001,low={x:tile.x-h,z:tile.z-h},high={x:tile.x+h,z:tile.z+h};
 const inside=(p:Point)=>p.x>=low.x&&p.x<=high.x&&p.z>=low.z&&p.z<=high.z;
 const corners=[low,{x:high.x,z:low.z},high,{x:low.x,z:high.z}];
 return inside(a)||inside(b)||corners.some((p,i)=>linesIntersect(a,b,p,corners[(i+1)%4]));
}
function strictSegments(s:MinimalState,from:Point,path:readonly Point[]):void{
 for(let i=0;i<path.length;i++)for(const tile of s.tiles.filter(t=>t.terrain==='pond'))assert.equal(hitsPond(tile,i?path[i-1]:from,path[i]),false,JSON.stringify({from:i?path[i-1]:from,to:path[i],tile}));
}
function assertStopped(s:MinimalState,old:MinimalState):void{
 assert.deepEqual(s.player,old.player);assert.deepEqual(s.playerPath,[]);assert.equal(s.playerSpeed,0);assert.equal(s.coins,537);
 assert.deepEqual(s.tiles,old.tiles);assert.deepEqual(s.animals,old.animals);assert.deepEqual(s.eggs,old.eggs);
 for(const field of ['createdAt','sequence','expansions','collection','placedEggCount','hatchedCount','lastHatch','lastBreeding','breedingDay','lastCompanionGiftDay','guardian'] as const)assert.deepEqual(s[field],old[field],field);
}

test('strict pond buffer covers owned and locked ponds without inflating creek or ordinary obstacles',()=>{
 assert.equal(model.PLAYER_POND_CLEARANCE_CELLS,.12);
 for(const owned of [true,false]){
  const s=farm();pond(s,2,2,owned);
  for(const to of [{x:1.49,z:2},{x:2-(.5+.12+.000001),z:2},{x:2,z:2}])assert.equal(model.playerWalkRoute(s,{x:1,z:2},to),null);
  assert.deepEqual(model.playerWalkRoute(s,{x:1,z:2},{x:1.37999,z:2})?.at(-1),{x:1.37999,z:2});
  assert.equal(model.isPlayerWalkRouteSafe(s,{x:1,z:2},[{x:3,z:2}]),false);
  const edge=2-(.5+.12+.000001);assert.equal(model.isPlayerWalkRouteSafe(s,{x:edge-2e-13,z:2},[{x:edge+2e-13,z:2}]),false,'tiny nonzero segment must not bypass the closed boundary');
  assert.equal(model.isPlayerWalkRouteSafe(s,{x:1.3,z:1.459998},[{x:1.459998,z:1.3}]),false,'expanded-corner grazing');
 }
 const creek=farm();pond(creek,2,2);pond(creek,4,2,false);model.tileAt(creek,{x:3,z:2})!.terrain='creek';
 assert.deepEqual(model.playerWalkRoute(creek,{x:3,z:1},{x:3,z:3}),[{x:3,z:3}]);
 const ordinary=farm();ordinary.eggs.push(nest('ordinary',{x:2,z:2}));
 for(const [from,to] of [[{x:2,z:1},{x:2,z:1.49}],[{x:1,z:1},{x:1,z:.51}],[{x:3,z:3},{x:3.49,z:3}]] as [Point,Point][])assert.deepEqual(model.playerWalkRoute(ordinary,from,to)?.at(-1),to);
});

test('exact safe endpoints survive strict string pulling',()=>{
 const s=farm();pond(s);const from={x:1,z:2},to={x:3.19,z:3.14},route=model.playerWalkRoute(s,from,to);
 assert.ok(route);assert.deepEqual(route.at(-1),to);assert.ok(route.length>1);strictSegments(s,from,route);
 assert.equal(model.isPlayerWalkRouteSafe(s,from,route),true);
 const tinyGoal={x:1.000001,z:2};assert.deepEqual(model.playerWalkRoute(s,from,tinyGoal)?.at(-1),tinyGoal,'a distinct exact endpoint is not snapped away');
 const unsafe={x:1.49,z:2};assert.equal(model.playerWalkRoute(s,unsafe,unsafe),null);
});

test('old shoreline route loads, stops and persists without resetting',()=>{
 const old=legacy();assert.equal(model.validateMinimalSave(old),true);assert.equal(model.isPlayerWalkRouteSafe(old,old.player,old.playerPath),false);
 const storage=storageFor(old),oldRaw=storage.raw(),stopped=model.loadMinimalState(storage,T);assert.equal(storage.raw(),oldRaw);assertStopped(stopped,old);
 assert.equal(model.saveMinimalState(storage,stopped),true);assertStopped(model.loadMinimalState(storage,T),old);
 const guarded=storageFor(old),guard=new FarmSaveGuard(guarded,model.MINIMAL_STORAGE_KEY,guarded.raw());
 assert.equal(guard.persist(stopped),'saved');assertStopped(model.loadMinimalState(guarded,T),old);
 assert.equal(model.MINIMAL_STORAGE_KEY,'dreamina-egg-farm-v3');assert.equal(stopped.version,3);
 const idle={...old,playerPath:[],playerSpeed:0};assert.equal(model.validateMinimalSave(idle),true);assertStopped(model.loadMinimalState(storageFor(idle),T),idle);
});

test('safe old goal with unsafe shortcut is reconciled',()=>{
 const s=farm();pond(s);s.player={x:1,z:1.9};s.playerPath=[{x:1.9,z:1}];s.playerSpeed=.9;
 assert.equal(model.validateMinimalSave(s),true);assert.equal(model.isPlayerWalkRouteSafe(s,s.player,s.playerPath),false);
 const stopped=model.advanceMinimalState(s,T);assertStopped(stopped,s);
 const route=model.playerWalkRoute(stopped,stopped.player,s.playerPath[0]);assert.ok(route);assert.deepEqual(route.at(-1),s.playerPath[0]);strictSegments(s,s.player,route);
});

test('invalid clocks preserve prior motion while zero-dt sanitizes',()=>{
 const old=legacy();for(const now of [NaN,T-1]){const unchanged=model.advanceMinimalState(old,now);assert.deepEqual(unchanged.player,old.player);assert.deepEqual(unchanged.playerPath,old.playerPath);assert.equal(unchanged.playerSpeed,.9);}
 assertStopped(model.advanceMinimalState(old,T),old);
});

test('checked retreat is retained and complete',()=>{
 const old=legacy(),goal={x:1,z:3},route=model.playerWalkRoute(old,old.player,goal);assert.ok(route);
 assert.deepEqual(route[0],{x:1,z:2});assert.deepEqual(route.at(-1),goal);assert.equal(model.isPlayerWalkRouteSafe(old,old.player,route),true);strictSegments(old,route[0],route.slice(1));
 assert.equal(model.isPlayerWalkRouteSafe(old,{x:1.48,z:1.6081632653061224},route),true,'partial progress toward the same dry center');
 assert.equal(model.isPlayerWalkRouteSafe(old,old.player,[{x:1,z:3}]),false,'no arbitrary first-segment exemption');
 assert.equal(model.isPlayerWalkRouteSafe(old,old.player,[{x:1,z:2},{x:3,z:2},goal]),false,'later crossing is never exempt');
 assert.equal(model.isPlayerWalkRouteSafe(old,old.player,[{x:1,z:2},{x:1.49,z:2.4}]),false,'unsafe goal');
 assert.equal(model.playerWalkRoute(old,old.player,{x:1.49,z:2.4}),null);
 const trapped=farm();pond(trapped,2,1);trapped.player={x:1.49,z:1.01};trapped.eggs.push(nest('west',{x:0,z:1}),nest('south',{x:1,z:2}));
 assert.equal(model.validateMinimalSave(trapped),true);assert.equal(model.playerWalkRoute(trapped,trapped.player,{x:3,z:3}),null,'complete unreachable suffix cannot return just the retreat');
});

test('real navigation governs retreat',()=>{
 for(const ownNest of [false,true]){
  const s=farm();s.player={x:1.49,z:1.01};pond(s,2,1);model.tileAt(s,{x:0,z:1})!.terrain='creek';s.eggs.push(nest('south',{x:1,z:2}));if(ownNest)s.eggs.push(nest('owner',{x:1,z:1}));
  assert.equal(model.validateMinimalSave(s),true);const route=model.playerWalkRoute(s,s.player,{x:0,z:1});assert.ok(route);assert.deepEqual(route[0],{x:1,z:1});assert.deepEqual(route.at(-1),{x:0,z:1});assert.equal(model.isPlayerWalkRouteSafe(s,s.player,route),true);
 }
 const corner=farm();corner.player={x:2.49,z:1.49};pond(corner,3,1);corner.eggs.push(nest('south',{x:2,z:2}),nest('west',{x:1,z:1}));assert.equal(model.validateMinimalSave(corner),true);
 const cornerRoute=model.playerWalkRoute(corner,corner.player,{x:2,z:0});assert.ok(cornerRoute);assert.deepEqual(cornerRoute[0],{x:2,z:1});assert.equal(model.isPlayerWalkRouteSafe(corner,corner.player,cornerRoute),true);
 const locked=legacy();model.tileAt(locked,{x:2,z:2})!.owned=false;assert.equal(model.validateMinimalSave(locked),true);assert.equal(model.isPlayerWalkRouteSafe(locked,locked.player,model.playerWalkRoute(locked,locked.player,{x:1,z:3})!),true);
 const multiple=farm();multiple.player={x:1.49,z:1.49};pond(multiple,2,1);pond(multiple,1,2);pond(multiple,2,2);assert.equal(model.validateMinimalSave(multiple),true);
 const multipleRoute=model.playerWalkRoute(multiple,multiple.player,{x:0,z:1});assert.ok(multipleRoute);assert.deepEqual(multipleRoute[0],{x:1,z:1});assert.equal(model.isPlayerWalkRouteSafe(multiple,multiple.player,multipleRoute),true);
 const blocked=legacy();model.tileAt(blocked,{x:1,z:2})!.owned=false;assert.equal(model.playerWalkRoute(blocked,blocked.player,{x:1,z:3}),null,'actually blocked center');
});

test('canonical epsilon traps remain blocked and savable',()=>{
 const cases=[{at:{x:1.4999995,z:1.01},water:{x:2,z:1}},{at:{x:1.49,z:.5000005},water:{x:2,z:1}},{at:{x:2.49,z:1.4999995},water:{x:3,z:1},nest:{x:2,z:2}}];
 for(const c of cases){const s=farm();s.player={...c.at};s.playerSpeed=0;pond(s,c.water.x,c.water.z);if(c.nest)s.eggs.push(nest('epsilon',c.nest));assert.equal(model.validateMinimalSave(s),true);
  const storage=storageFor(s),loaded=model.loadMinimalState(storage,T);assertStopped(loaded,s);assert.equal(model.isPlayerWalkRouteSafe(loaded,loaded.player,[]),true);assert.equal(model.playerWalkRoute(loaded,loaded.player,{x:3,z:3}),null);
  const rejected=model.minimalCommand(loaded,{type:'move',to:{x:3,z:3}},T);assert.equal(rejected.accepted,false);assertStopped(rejected.state,s);assert.equal(model.saveMinimalState(storage,rejected.state),true);assert.deepEqual(model.loadMinimalState(storage,T).player,c.at);
 }
});

test('partial escape survives save reload cancel and retarget',()=>{
 const old=legacy();old.playerPath=model.playerWalkRoute(old,old.player,{x:1,z:3})!;old.playerSpeed=0;assert.equal(model.validateMinimalSave(old),true);
 const partial=model.advanceMinimalState(old,T+100),center={x:1,z:2};
 assert.deepEqual({x:Math.round(partial.player.x),z:Math.round(partial.player.z)},{x:1,z:2});assert.notDeepEqual(partial.player,old.player);assert.ok(Math.hypot(partial.player.x-1,partial.player.z-2)<Math.hypot(old.player.x-1,old.player.z-2));assert.equal(model.isPlayerWalkRouteSafe(partial,partial.player,partial.playerPath),true);
 const penetration=(p:Point,tile:Tile)=>Math.max(0,Math.min(.620001-Math.abs(p.x-tile.x),.620001-Math.abs(p.z-tile.z)));
 for(const tile of old.tiles.filter(t=>t.terrain==='pond')){assert.ok(penetration(partial.player,tile)<=penetration(old.player,tile));if(!hitsPond(tile,old.player,old.player))assert.equal(hitsPond(tile,partial.player,partial.player),false);}
 const storage=storageFor(old);assert.equal(model.saveMinimalState(storage,partial),true);const loaded=model.loadMinimalState(storage,T+100);assert.deepEqual(loaded.player,partial.player);assert.deepEqual(loaded.playerPath,partial.playerPath);
 const canceled={...loaded,player:{...loaded.player},playerPath:[],playerSpeed:0};assert.equal(model.isPlayerWalkRouteSafe(canceled,canceled.player,[]),true);assert.equal(model.saveMinimalState(storage,canceled),true);assert.deepEqual(model.loadMinimalState(storage,T+100).player,partial.player);
 const to={x:.83,z:3.17},retarget=model.minimalCommand(canceled,{type:'move',to},T+100);assert.equal(retarget.accepted,true);assert.deepEqual(retarget.state.player,partial.player);assert.deepEqual(retarget.state.playerPath[0],center);assert.deepEqual(retarget.state.playerPath.at(-1),to);assert.equal(model.isPlayerWalkRouteSafe(retarget.state,partial.player,retarget.state.playerPath),true);strictSegments(retarget.state,center,retarget.state.playerPath.slice(1));
});

test('legacy contract still rejects real water corruption',()=>{
 const old=legacy(),inWater=structuredClone(old);inWater.player={x:2,z:2};inWater.playerPath=[];assert.equal(model.validateMinimalSave(inWater),false);
 const crossing=structuredClone(old);crossing.player={x:1,z:2};crossing.playerPath=[{x:3,z:2}];assert.equal(model.validateMinimalSave(crossing),false);
 const creek=farm();model.tileAt(creek,{x:2,z:2})!.terrain='creek';creek.player={x:2,z:1};creek.playerPath=[{x:2,z:3}];creek.playerSpeed=.21;assert.equal(model.validateMinimalSave(creek),true);
 const loaded=model.loadMinimalState(storageFor(creek),T);assert.equal(model.tileAt(loaded,{x:2,z:2})!.terrain,'creek');assert.deepEqual(loaded.playerPath,creek.playerPath);assert.equal(loaded.playerSpeed,.21);
 const strict=farm();pond(strict);strict.player={x:1,z:2};strict.playerPath=[{x:1,z:3}];strict.playerSpeed=.21;assert.equal(model.validateMinimalSave(strict),true);assert.deepEqual(model.loadMinimalState(storageFor(strict),T),strict);
 assertStopped(model.advanceMinimalState(old,T),old);
});

test('conversion protects only the newly expanded pond box',()=>{
 for(const x of [1.49,2-(.5+.12+.000001)]){
  const s=farm();s.player={x,z:2};assert.equal(model.validateMinimalSave(s),true);const r=model.minimalCommand(s,{type:'convert',at:{x:2,z:2},terrain:'pond'},T);assert.equal(r.accepted,false);assert.equal(r.state.coins,537);assert.equal(model.tileAt(r.state,{x:2,z:2})!.terrain,'meadow');
 }
 const remote=legacy();remote.playerPath=[];remote.playerSpeed=0;assert.equal(model.validateMinimalSave(remote),true);const r=model.minimalCommand(remote,{type:'convert',at:{x:3,z:3},terrain:'pond'},T);assert.equal(r.accepted,false,'occupied animal still protects its own tile');
 const unoccupied=structuredClone(remote);unoccupied.animals[0].position={x:3,z:1};assert.equal(model.validateMinimalSave(unoccupied),true);const allowed=model.minimalCommand(unoccupied,{type:'convert',at:{x:3,z:3},terrain:'pond'},T);assert.equal(allowed.accepted,true);assert.equal(allowed.state.coins,517);assert.deepEqual(allowed.state.player,remote.player);
 // Grounded giant protection and a genuinely clear ordinary drinker remain distinct.
 for(const size of ['giant','normal'] as const){let s=farm();s.player={x:1,z:3};pond(s,3,2);const a=s.animals[0];Object.assign(a,{size,growth:{version:1,scales:[.6,1,size==='giant'?2.2:1.25]},growthAgeMs:120_000,bornAt:T-120_000,position:{x:1,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink',activity:'walk',activityUntil:T+100_000});
  assert.equal(model.validateMinimalSave(s),true);for(let elapsed=250;elapsed<16000&&s.animals[0].activity!=='drink';elapsed+=250)s=model.advanceMinimalState(s,T+elapsed);assert.equal(s.animals[0].activity,'drink');const anchor=structuredClone(s.animals[0].drinkAnchor);const dug=model.minimalCommand(s,{type:'convert',at:{x:1,z:2},terrain:'pond'},s.updatedAt);assert.equal(dug.accepted,size==='normal');if(size==='giant'){assert.equal(dug.state.coins,537);assert.deepEqual(dug.state.animals[0].drinkAnchor,anchor);}
 }
});
