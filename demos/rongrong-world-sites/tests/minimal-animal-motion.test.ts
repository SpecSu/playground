import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMinimalState,createMinimalState,loadMinimalState,saveMinimalState,getDrinkSpot,minimalCommand,animalScale,type MinimalAnimal,type LegacySpecies as Species} from '../src/minimal/model.ts';
import {ANIMAL_ASSETS} from '../src/minimal/animal-assets.ts';
const NOW=1_800_000_000_000;
const targetHz:Record<Species,number>={cow:1,sheep:1,pig:1.2,bunny:1.7,duck:1.5};
const species=Object.keys(targetHz) as Species[];
const state=()=>{const s=createMinimalState(NOW);s.welcomeClaimed=true;s.coins=500;s.expansions=1;s.hatchedCount=1;for(const t of s.tiles){t.owned=true;t.terrain='meadow';}return s;};
function animal(kind:Species,scale=.6):MinimalAnimal{return {id:kind,name:kind,species:kind,sex:'female',size:'normal',growth:{version:1,scales:scale===2.2?[.6,1,2.2]:[scale,scale,2.2]},growthAgeMs:scale===2.2?120000:0,position:{x:1,z:2},target:{x:3,z:2},path:[{x:2,z:2},{x:3,z:2}],targetActivity:'graze',activity:'walk',energy:35,bond:0,bornAt:scale===2.2?NOW-120000:NOW,activityUntil:NOW+100000};}
test('animal model gives every size a natural full-cycle cadence instead of frantic baby steps',()=>{
 for(const kind of species)for(const scale of [.6,1,2.2]){const s=state();s.animals=[animal(kind,scale)];const a=advanceMinimalState(s,NOW+1000).animals[0],hz=(a.position.x-1)*2/(scale*ANIMAL_ASSETS[kind].stride);assert.ok(hz>=targetHz[kind]*.95-1e-6&&hz<=targetHz[kind]*1.05+1e-6,`${kind} scale ${scale}: ${hz} full cycles/s`);}
});
test('the same animal keeps its pace when an earlier animal is removed or array order changes',()=>{
 const s=state();s.animals=[animal('cow'),animal('duck')];const before=advanceMinimalState(s,NOW+250).animals.find(a=>a.id==='duck')!.position.x;const removed=structuredClone(s);removed.animals.shift();const after=advanceMinimalState(removed,NOW+250).animals[0].position.x;assert.equal(after,before);
 const reordered=structuredClone(s);reordered.animals.reverse();assert.equal(advanceMinimalState(reordered,NOW+250).animals.find(a=>a.id==='duck')!.position.x,before);
});
test('drinking starts its full six seconds only after the fractional dry bank approach',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('duck');a.position={x:1.99,z:2};a.target={x:2,z:2};a.path=[{x:2,z:2}];a.targetActivity='drink';s.animals=[a];s=advanceMinimalState(s,NOW+250);assert.equal(s.animals[0].activity,'walk','cell-center arrival is not actual bank arrival');
 let arrived=0;for(let elapsed=500;elapsed<=12000;elapsed+=250){s=advanceMinimalState(s,NOW+elapsed);if(s.animals[0].activity==='drink'){arrived=NOW+elapsed;break;}}assert.ok(arrived,'reachable bank is eventually reached');assert.equal(s.animals[0].activityUntil,arrived+6000);assert.ok(s.animals[0].position.x>2.1,'authoritative position is the actual fractional stance');assert.ok(getDrinkSpot(s,s.animals[0]));assert.equal(saveMinimalState({getItem:()=>null,setItem(){}},s),true);
});
test('an old center-based drink save reapproaches without free energy or resetting the farm',()=>{
 const s=state(),a=animal('duck');delete a.target;delete a.path;delete a.targetActivity;a.position={x:2,z:2};a.activity='drink';a.activityUntil=NOW+1000;s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';s.animals=[a];const raw=JSON.stringify(s),loaded=loadMinimalState({getItem:()=>raw,setItem(){}},NOW+2000);assert.equal(loaded.coins,500);assert.equal(loaded.animals.length,1);assert.equal(loaded.animals[0].energy,35,'legacy clock cannot award water before shore approach');assert.ok(['walk','drink'].includes(loaded.animals[0].activity));
});

test('shared interval travel agrees across tick subdivisions and monotone growth boundaries',async()=>{
 const {animalGridTravel,stableAnimalPace}=await import('../src/minimal/animal-motion.ts');
 for(const profile of [undefined,{version:1 as const,scales:[.6,1.1,2.2] as [number,number,number]},{version:1 as const,scales:[.6,2.2,2.2] as [number,number,number]}])for(const floor of [0,45000,80000]){
  const a=animal('duck');a.growth=profile;a.growthAgeMs=floor;
  for(const start of [-1000,0,29000,59000,119000]){const from=NOW+start,to=from+2000,whole=animalGridTravel(a,from,to);let split=0;for(let t=from;t<to;t+=250)split+=animalGridTravel(a,t,t+250);assert.ok(Math.abs(whole-split)<1e-12,`floor ${floor}, start ${start}`);assert.ok(whole>0);}
 }
 const a=animal('duck');for(const [from,to] of [[NOW,NOW-1],[NaN,NOW],[NOW,Infinity]])assert.equal(animalGridTravel(a,from,to),0);
 assert.equal(stableAnimalPace(a),stableAnimalPace(JSON.parse(JSON.stringify(a))));assert.notEqual(stableAnimalPace(a),stableAnimalPace({...a,id:'another-duck'}));
});
test('pure motion profiles and GLB phase metadata match delivered authored stride contracts',async()=>{
 const {ANIMAL_MOTION_PROFILES}=await import('../src/minimal/animal-motion.ts'),{readFileSync}=await import('node:fs');
 for(const kind of species){const contract=JSON.parse(readFileSync(new URL(`../art-source/${kind}-animation/asset-contract.json`,import.meta.url),'utf8'));assert.equal(ANIMAL_MOTION_PROFILES[kind].stride,contract.walk_stride_m);assert.equal(ANIMAL_ASSETS[kind].stride,contract.walk_stride_m);assert.ok(Math.abs(ANIMAL_MOTION_PROFILES[kind].muzzleReach-contract.mouth_drink[2])<1e-6,`${kind} authored mouth reach matches the single pure profile`);}
});

test('fractional drink approaches and frozen drink anchors survive save reloads',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('duck');Object.assign(a,{position:{x:1.99,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];s=advanceMinimalState(s,NOW+250);assert.ok(s.animals[0].drinkAnchor);assert.ok(s.animals[0].path?.some(p=>!Number.isInteger(p.x)||!Number.isInteger(p.z)));
 const roundTrip=(value:typeof s)=>{let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};assert.equal(saveMinimalState(storage,value),true);return loadMinimalState(storage,value.updatedAt);};
 const reloaded=roundTrip(s);assert.deepEqual(reloaded.animals[0].drinkAnchor,s.animals[0].drinkAnchor);assert.deepEqual(reloaded.animals[0].path,s.animals[0].path);
 for(let t=500;t<12000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);assert.equal(s.animals[0].activity,'drink');const frozen=structuredClone(s.animals[0].drinkAnchor),deadline=s.animals[0].activityUntil;s=roundTrip(s);s=advanceMinimalState(s,s.updatedAt+1000);assert.deepEqual(s.animals[0].drinkAnchor,frozen);assert.deepEqual(s.animals[0].position,frozen!.stance);assert.equal(s.animals[0].activityUntil,deadline);
});
test('a giant creek drink retains canonical water identity from its neighboring meadow stance',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='creek';const a=animal('pig',2.2);Object.assign(a,{position:{x:4,z:2},target:{x:3,z:2},path:[{x:3,z:2}],targetActivity:'drink'});s.animals=[a];for(let t=250;t<16000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);const grown=s.animals[0];assert.equal(grown.activity,'drink');assert.deepEqual(grown.drinkAnchor?.site,{x:3,z:2});assert.notEqual(Math.round(grown.position.x),3);assert.equal(getDrinkSpot(s,grown)?.source,'creek');s=advanceMinimalState(s,s.updatedAt+1000);assert.equal(s.animals[0].activity,'drink');
});
test('save validation rejects orphan fractional paths and root-only wet-foot drink anchors',()=>{
 const accepts=(s:ReturnType<typeof state>)=>saveMinimalState({getItem:()=>null,setItem(){}},s);
 const orphan=state(),a=animal('duck');delete a.target;delete a.targetActivity;a.path=[{x:1.25,z:2}];a.activity='idle';orphan.animals=[a];assert.equal(accepts(orphan),false,'fractional paths require a justified drink anchor');
 const wet=state(),b=animal('cow');delete b.target;delete b.path;delete b.targetActivity;wet.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';b.position={x:2.49,z:2};b.activity='drink';b.drinkAnchor={site:{x:2,z:2},stance:{...b.position}};wet.animals=[b];assert.equal(accepts(wet),false,'a dry root cannot authorize feet inside pond');
 const malformed=state(),c=animal('duck');(c as unknown as {drinkAnchor:null}).drinkAnchor=null;malformed.animals=[c];assert.equal(accepts(malformed),false,'optional does not mean explicit null is a valid anchor');
});

test('a feasible newborn cow pond approach is not rejected by coarse radius samples',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('cow');Object.assign(a,{position:{x:1,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];s=advanceMinimalState(s,NOW+250);assert.equal(s.animals[0].activity,'walk');assert.deepEqual(s.animals[0].drinkAnchor?.site,{x:2,z:2},'the originally requested feasible water site must not be silently abandoned');
});
test('saved drink anchors cannot claim more anatomical reach than their species and source permit',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('sheep');Object.assign(a,{position:{x:1,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];for(let t=250;t<16000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);
 const b=s.animals[0],spot=getDrinkSpot(s,b)!;assert.equal(b.activity,'drink');b.position={x:spot.waterPoint.x-(.72+.10)*.6/2,z:spot.waterPoint.z};b.drinkAnchor!.stance={...b.position};assert.equal(saveMinimalState({getItem:()=>null,setItem(){}},s),false,'sheep +.10 local is outside its vetted +.06 limit even though the root and feet are dry');
});
test('an active drink retains its chosen pond when another adjacent pond appears',()=>{
 let s=state();s.tiles.find(t=>t.x===2&&t.z===3)!.terrain='pond';const a=animal('duck');Object.assign(a,{position:{x:2,z:1},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];for(let t=250;t<16000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);assert.equal(s.animals[0].activity,'drink');const water=getDrinkSpot(s,s.animals[0])!.waterPoint;
 s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';assert.deepEqual(getDrinkSpot(s,s.animals[0])!.waterPoint,water,'adding an earlier neighbor must not rotate the drink target');s.tiles.find(t=>t.x===2&&t.z===3)!.terrain='meadow';s=advanceMinimalState(s,s.updatedAt+250);assert.equal(s.animals[0].activity,'idle');assert.equal(s.animals[0].drinkAnchor,undefined);assert.equal(s.animals[0].energy,35,'removing its actual source cannot award water from an unrelated pond');
});
test('rapid growth keeps the chosen stance and full drink deadline across save reload and clock rollback',()=>{
 for(const kind of species){let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal(kind);Object.assign(a,{growth:{version:1,scales:[.6,2.2,2.2]},bornAt:NOW-12000,growthAgeMs:12000,position:{x:1.8,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];
  for(let t=250;t<=12000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);assert.equal(s.animals[0].activity,'drink',`${kind} reaches a safe growing stance`);
  const arrived=s.updatedAt,deadline=s.animals[0].activityUntil,anchor=structuredClone(s.animals[0].drinkAnchor),startScale=animalScale(s.animals[0],arrived);
  for(let t=250;t<6000;t+=250){s=advanceMinimalState(s,arrived+t);assert.equal(s.animals[0].activity,'drink');assert.deepEqual(s.animals[0].drinkAnchor,anchor);assert.deepEqual(s.animals[0].position,anchor!.stance);assert.equal(s.animals[0].activityUntil,deadline);assert.equal(s.animals[0].energy,35);let raw='';const storage={getItem:()=>raw||null,setItem:(_k:string,v:string)=>{raw=v;}};assert.equal(saveMinimalState(storage,s),true);s=loadMinimalState(storage,s.updatedAt-1000);assert.equal(s.updatedAt,arrived+t);}
  assert.ok(animalScale(s.animals[0],s.updatedAt)-startScale>.15,'valid fastest growth is actually exercised');s=advanceMinimalState(s,deadline);assert.equal(s.animals[0].energy,57);assert.equal(s.animals[0].drinkAnchor,undefined);
 }
});
test('care, pickup, putdown and blocked final approaches clear semantic water state without phantom drink credit',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('duck');Object.assign(a,{position:{x:1.99,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];s=advanceMinimalState(s,NOW+250);assert.ok(s.animals[0].drinkAnchor);s.player={...s.animals[0].position};
 const cared=minimalCommand(s,{type:'care',animalId:a.id},s.updatedAt);assert.equal(cared.accepted,true);assert.equal(cared.state.animals[0].energy,43);assert.equal(cared.state.animals[0].drinkAnchor,undefined);
 const held=minimalCommand(s,{type:'pickup',animalId:a.id},s.updatedAt);assert.equal(held.accepted,true);assert.equal(held.state.animals[0].drinkAnchor,undefined);assert.equal(held.state.animals[0].energy,35);const dropped=minimalCommand(held.state,{type:'putdown',at:{x:1,z:2}},s.updatedAt);assert.equal(dropped.accepted,true);assert.equal(dropped.state.animals[0].drinkAnchor,undefined);assert.equal(dropped.state.animals[0].activity,'idle');
 const blocked=structuredClone(s);blocked.eggs=[{id:'blocked-bank',source:'shop',species:'duck',sex:'male',size:'normal',location:'ground',position:{x:2,z:2},boughtAt:NOW,placedAt:NOW,readyAt:NOW+15000}];const stopped=advanceMinimalState(blocked,s.updatedAt+250);assert.equal(stopped.animals[0].drinkAnchor,undefined);assert.equal(stopped.animals[0].activity,'idle');assert.equal(stopped.animals[0].energy,35);
});
test('placing a nest across a giant creek drink footprint cancels the stale anchor and remains saveable',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='creek';const a=animal('pig',2.2);Object.assign(a,{position:{x:4,z:2},target:{x:3,z:2},path:[{x:3,z:2}],targetActivity:'drink'});s.animals=[a];for(let t=250;t<16000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);assert.equal(s.animals[0].activity,'drink');assert.equal(Math.round(s.animals[0].position.x),2);s.player={x:3,z:2};s.eggs=[{id:'nest',source:'shop',species:'duck',sex:'male',size:'normal',location:'bag',boughtAt:NOW}];
 const placed=minimalCommand(s,{type:'placeEgg',eggId:'nest',at:{x:3,z:2}},s.updatedAt);assert.equal(placed.accepted,true);assert.equal(placed.state.animals[0].drinkAnchor,undefined);assert.equal(placed.state.animals[0].energy,35);assert.equal(saveMinimalState({getItem:()=>null,setItem(){}},placed.state),true);
});
test('pond excavation cannot remove support under a giant drinker rear feet while its root and source stay valid',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('cow',2.2);Object.assign(a,{position:{x:1,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];for(let t=250;t<16000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);assert.equal(s.animals[0].activity,'drink');assert.equal(Math.round(s.animals[0].position.x),2);const anchor=structuredClone(s.animals[0].drinkAnchor);
 const dug=minimalCommand(s,{type:'convert',at:{x:1,z:2},terrain:'pond'},s.updatedAt);assert.equal(dug.accepted,false,'a valid dry root does not permit digging under its rear hoof support');assert.equal(dug.state.coins,s.coins);assert.equal(dug.state.tiles.find(t=>t.x===1&&t.z===2)!.terrain,'meadow');assert.deepEqual(dug.state.animals[0].drinkAnchor,anchor);assert.equal(saveMinimalState({getItem:()=>null,setItem(){}},dug.state),true);
 s.player={x:1,z:3};const held=minimalCommand(s,{type:'pickup',animalId:a.id},s.updatedAt);assert.equal(held.accepted,true);const clear=minimalCommand(held.state,{type:'convert',at:{x:1,z:2},terrain:'pond'},s.updatedAt);assert.equal(clear.accepted,true,'carried animals no longer reserve their former ground footprint');
});
test('a safely planned drink completed while hidden keeps its existing energy reward despite later growth',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('duck');Object.assign(a,{growth:{version:1,scales:[.6,2.2,2.2]},bornAt:NOW,position:{x:1.99,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];for(let t=250;t<12000&&s.animals[0].activity!=='drink';t+=250)s=advanceMinimalState(s,NOW+t);assert.equal(s.animals[0].activity,'drink');const offline=advanceMinimalState(s,s.updatedAt+120000);assert.equal(offline.animals[0].energy,57,'growth after the already safe six-second deadline cannot retroactively cancel the drink');assert.equal(offline.animals[0].activity,'idle');assert.equal(offline.animals[0].drinkAnchor,undefined);
});
test('growth replanning preserves its final approach direction and selected water source',()=>{
 let s=state();s.tiles.find(t=>t.x===2&&t.z===3)!.terrain='pond';const a=animal('duck');Object.assign(a,{growth:{version:1,scales:[.6,2.2,2.2]},bornAt:NOW,position:{x:2,z:1.99},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];s=advanceMinimalState(s,NOW+250);const chosen=structuredClone(s.animals[0].drinkAnchor?.waterSite);assert.deepEqual(chosen,{x:2,z:3});s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';let previous=s.animals[0].position.z;
 for(let t=500;t<7000&&s.animals[0].activity!=='drink';t+=250){s=advanceMinimalState(s,NOW+t);assert.deepEqual(s.animals[0].drinkAnchor?.waterSite,chosen);assert.ok(s.animals[0].position.z>=previous-1e-8,'a continuously growing straight approach must not alternate backward/forward lineup routes');previous=s.animals[0].position.z;}
 assert.equal(s.animals[0].activity,'drink');assert.equal(getDrinkSpot(s,s.animals[0])!.waterPoint.x,2);
});
test('malformed optional water identities and fractional waypoints cannot overwrite a valid approach save',()=>{
 let s=state();s.tiles.find(t=>t.x===3&&t.z===2)!.terrain='pond';const a=animal('duck');Object.assign(a,{position:{x:1.99,z:2},target:{x:2,z:2},path:[{x:2,z:2}],targetActivity:'drink'});s.animals=[a];s=advanceMinimalState(s,NOW+250);let raw='';const storage={getItem:()=>raw||null,setItem:(_k:string,v:string)=>{raw=v;}};assert.equal(saveMinimalState(storage,s),true);const valid=raw;
 for(const change of [(b:MinimalAnimal)=>{b.drinkAnchor!.waterSite={x:NaN,z:2};},(b:MinimalAnimal)=>{b.drinkAnchor!.waterSite={x:6,z:6};},(b:MinimalAnimal)=>{b.drinkAnchor!.stance.x=Infinity;},(b:MinimalAnimal)=>{b.drinkAnchor!.site.x=2.1;},(b:MinimalAnimal)=>{b.path!.unshift({x:1.8,z:2});}]){const malformed=structuredClone(s);change(malformed.animals[0]);assert.equal(saveMinimalState(storage,malformed),false);assert.equal(raw,valid);}
});
