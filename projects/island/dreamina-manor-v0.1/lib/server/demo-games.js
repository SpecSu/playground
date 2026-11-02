import{NPC_ISLAND_LAYOUTS}from'../art/npc-island-layouts.js';
import {recordDiscovery} from '../game/collection.js';
import {createGame,assertGame}from'../game/state.js';
import {SPECIES_BY_ID}from'../game/catalogue.js';
import {DEMO_ISLANDS}from'../game/demo-catalogue.js';
import {priceItem}from'../game/economy.js';
/** Created once per shared exhibition. Collected production is never silently reseeded. */
export function createDemoGame(uid,now){const d=DEMO_ISLANDS.find(d=>d.uid===uid);if(!d)throw new Error('Unknown exhibition');const s=createGame(uid,now);s.profile={name:d.name,avatar:d.avatar};s.coins=0;s.seeds=[0,0,0,0,0];s.firstPlantStarted=true;s.demo=true;s.fishHousingVersion=1;
 const add=(id,mutation,location,scale=1)=>{const spec=SPECIES_BY_ID[id],item={id:`${uid}-v1-${id}`,kind:spec.kind,speciesId:id,tier:spec.tier,mutation,standardSize:spec.standardSize,finalSize:spec.standardSize*scale,value:priceItem(spec,spec.standardSize*scale,mutation),createdAt:now,harvestedAt:now,location};s.items.push(item);recordDiscovery(s,item);return item;};
 if(uid==='demo-kelly'){s.land=Array.from({length:10},(_,i)=>({x:i%5,z:Math.floor(i/5)}));s.tank=[{x:0,z:0},{x:1,z:0}];s.docks=[{x:5,z:1},{x:6,z:1}];s.position={x:2,z:1.38};add('phalaenopsis','gold',{kind:'land',cell:{x:2,z:0}});add('tulip','normal',{kind:'land',cell:{x:3,z:0}});add('iris','normal',{kind:'land',cell:{x:4,z:0}});add('clownfish','gold',{kind:'tank'});add('blue-tang','normal',{kind:'tank'});add('oarfish','normal',{kind:'tank'});
 }else{s.land=Array.from({length:16},(_,i)=>({x:i%4,z:Math.floor(i/4)})).filter(c=>!(c.x>=2&&c.z<2));s.tank=[{x:0,z:0},{x:1,z:0},{x:0,z:1}];s.docks=[{x:4,z:2},{x:5,z:2},{x:6,z:2}];s.position={x:1,z:1.38};add('sunflower','normal',{kind:'land',cell:{x:0,z:3}});add('pumpkin','giant',{kind:'land',cell:{x:2,z:3}},1.3);add('grape','normal',{kind:'land',cell:{x:3,z:3}});add('manta-ray','normal',{kind:'tank'});add('hammerhead','giant',{kind:'tank'},1.3);add('king-crab','gold',{kind:'tank'});}
 const plant=SPECIES_BY_ID[uid==='demo-kelly'?'daisy':'tomato'],fish=SPECIES_BY_ID[uid==='demo-kelly'?'sardine':'salmon'];
 for(const [spec,target]of [[plant,{kind:'land',cell:uid==='demo-kelly'?{x:3,z:1}:{x:1,z:2}}],[fish,{kind:'dock',cell:s.docks.at(-1)}]]){const product={id:`${uid}-v1-production-${spec.id}`,kind:spec.kind,speciesId:spec.id,tier:spec.tier,mutation:'normal',standardSize:spec.standardSize,finalSize:spec.standardSize,value:priceItem(spec,spec.standardSize,'normal'),createdAt:now};s.jobs.push({id:`${uid}-v1-job-${spec.id}`,target,inputTier:spec.tier,startedAt:now,readyAt:now+10000,product});}
 assertGame(s);return s;}

export const DEMO_LAYOUT_VERSION=3;
/** Deterministic themed exhibits. Versioned IDs are never recycled or reseeded. */
export function createDemoGameV2(uid,now){
 if(!DEMO_ISLANDS.some(d=>d.uid===uid))throw new Error('Unknown exhibition');
 const s=createDemoGame(uid,now);s.demoLayoutVersion=2;s.fishHousingVersion=2;s.items=[];s.jobs=[];s.discovered={};s.discoveredVariants={};
 let seed=[...uid].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 if(uid==='demo-kelly'){s.land=Array.from({length:12},(_,i)=>({x:i%4,z:Math.floor(i/4)})).concat([{x:4,z:2}]);s.tank=[{x:0,z:0},{x:1,z:0},{x:0,z:1},{x:1,z:1}];s.docks=[{x:5,z:2},{x:6,z:2}];s.position={x:2,z:1};}
 else{s.land=Array.from({length:15},(_,i)=>({x:i%5,z:Math.floor(i/5)})).filter(c=>c.x<4||c.z===2);s.land.push({x:0,z:3},{x:1,z:3});s.tank=[{x:2,z:0},{x:3,z:0},{x:2,z:1},{x:3,z:1}];s.docks=[{x:-1,z:2},{x:-2,z:2},{x:-3,z:2}];s.position={x:1,z:1};}
 const add=(id,location,mutation='normal')=>{const p=SPECIES_BY_ID[id],item={id:`${uid}-v2-display-${id}`,kind:p.kind,speciesId:id,tier:p.tier,mutation,standardSize:p.standardSize,finalSize:p.standardSize,value:priceItem(p,p.standardSize,mutation),createdAt:now,harvestedAt:now,location};s.items.push(item);recordDiscovery(s,item);};
 const free=s.land.filter(c=>!s.tank.some(t=>t.x===c.x&&t.z===c.z)&&!(c.x===s.position.x&&c.z===s.position.z));for(let i=free.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[free[i],free[j]]=[free[j],free[i]];}
 const plants=uid==='demo-kelly'?['pitcher-plant','mimosa','rafflesia','tulip']:['fantasy-chomper','travellers-palm','titan-arum','sunflower'];plants.forEach((id,i)=>add(id,{kind:'land',cell:free[i]},i===0?'gold':'normal'));
 const fishes=uid==='demo-kelly'?['clownfish','blue-tang','oarfish']:['manta-ray','hammerhead','king-crab'];fishes.forEach((id,i)=>add(id,{kind:'tank'},i===0?'gold':'normal'));
 const plant=SPECIES_BY_ID[uid==='demo-kelly'?'lithops':'mimosa'],fish=SPECIES_BY_ID[uid==='demo-kelly'?'sardine':'salmon'];for(const[p,target]of[[plant,{kind:'land',cell:free[4]}],[fish,{kind:'dock',cell:s.docks.at(-1)}]]){const product={id:`${uid}-v2-production-${p.id}`,kind:p.kind,speciesId:p.id,tier:p.tier,mutation:'normal',standardSize:p.standardSize,finalSize:p.standardSize,value:priceItem(p,p.standardSize,'normal'),createdAt:now};s.jobs.push({id:`${uid}-v2-job-${p.id}`,target,inputTier:p.tier,startedAt:now,readyAt:now+10000,product});}
 assertGame(s);return s;
}

/** New IDs and a complete prior-state receipt make this a one-time exhibition refresh. */
export function createDemoGameV3(uid,now){
 const layout=NPC_ISLAND_LAYOUTS.find(d=>d.uid===uid);if(!layout)throw new Error('Unknown exhibition');
 const s=createGame(uid,now);Object.assign(s,{demo:true,demoLayoutVersion:3,profile:structuredClone(layout.profile),coins:0,seeds:[0,0,0,0,0],firstPlantStarted:true,land:structuredClone(layout.land),docks:structuredClone(layout.docks),tank:structuredClone(layout.tank),position:structuredClone(layout.position)});
 const product=(a,id)=>{const spec=SPECIES_BY_ID[a.speciesId],size=spec.standardSize*(a.scale??1),mutation=a.mutation??'normal';return{id,kind:spec.kind,speciesId:spec.id,tier:spec.tier,mutation,standardSize:spec.standardSize,finalSize:size,value:priceItem(spec,size,mutation),createdAt:now};};
 [...layout.displayPlants,...layout.displayFish].forEach((a,i)=>{const item={...product(a,`${uid}-v3-display-${i}-${a.speciesId}`),harvestedAt:now,location:a.cell?{kind:'land',cell:structuredClone(a.cell)}:{kind:'tank'}};s.items.push(item);recordDiscovery(s,item);});
 layout.production.forEach((a,i)=>s.jobs.push({id:`${uid}-v3-job-${i}`,target:{kind:a.kind==='plant'?'land':'dock',cell:structuredClone(a.cell)},inputTier:a.tier,startedAt:now,readyAt:now+10000,product:product(a,`${uid}-v3-product-${i}`)}));assertGame(s);return s;
}
