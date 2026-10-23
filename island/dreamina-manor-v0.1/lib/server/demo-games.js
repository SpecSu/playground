import {recordDiscovery} from '../game/collection.js';
import {createGame,assertGame}from'../game/state.js';
import {SPECIES_BY_ID}from'../game/catalogue.js';
import {DEMO_ISLANDS}from'../game/demo-catalogue.js';
import {priceItem}from'../game/economy.js';
/** Created once per shared exhibition. Collected production is never silently reseeded. */
export function createDemoGame(uid,now){const d=DEMO_ISLANDS.find(d=>d.uid===uid);if(!d)throw new Error('Unknown exhibition');const s=createGame(uid,now);s.profile={name:d.name,avatar:d.avatar};s.coins=0;s.seeds=[0,0,0,0,0];s.firstPlantStarted=true;s.demo=true;
 const add=(id,mutation,location,scale=1)=>{const spec=SPECIES_BY_ID[id],item={id:`${uid}-v1-${id}`,kind:spec.kind,speciesId:id,tier:spec.tier,mutation,standardSize:spec.standardSize,finalSize:spec.standardSize*scale,value:priceItem(spec,spec.standardSize*scale,mutation),createdAt:now,harvestedAt:now,location};s.items.push(item);recordDiscovery(s,item);return item;};
 if(uid==='demo-kelly'){s.land=Array.from({length:10},(_,i)=>({x:i%5,z:Math.floor(i/5)}));s.tank=[{x:0,z:0},{x:1,z:0}];s.docks=[{x:5,z:1},{x:6,z:1}];s.position={x:2,z:1.38};add('phalaenopsis','gold',{kind:'land',cell:{x:2,z:0}});add('tulip','normal',{kind:'land',cell:{x:3,z:0}});add('iris','normal',{kind:'land',cell:{x:4,z:0}});add('clownfish','gold',{kind:'tank'});add('blue-tang','normal',{kind:'tank'});add('oarfish','normal',{kind:'tank'});
 }else{s.land=Array.from({length:16},(_,i)=>({x:i%4,z:Math.floor(i/4)})).filter(c=>!(c.x>=2&&c.z<2));s.tank=[{x:0,z:0},{x:1,z:0},{x:0,z:1}];s.docks=[{x:4,z:2},{x:5,z:2},{x:6,z:2}];s.position={x:1,z:1.38};add('sunflower','normal',{kind:'land',cell:{x:0,z:3}});add('pumpkin','giant',{kind:'land',cell:{x:2,z:3}},1.3);add('grape','normal',{kind:'land',cell:{x:3,z:3}});add('manta-ray','normal',{kind:'tank'});add('hammerhead','giant',{kind:'tank'},1.3);add('king-crab','gold',{kind:'tank'});}
 const plant=SPECIES_BY_ID[uid==='demo-kelly'?'daisy':'tomato'],fish=SPECIES_BY_ID[uid==='demo-kelly'?'sardine':'salmon'];
 for(const [spec,target]of [[plant,{kind:'land',cell:uid==='demo-kelly'?{x:3,z:1}:{x:1,z:2}}],[fish,{kind:'dock',cell:s.docks.at(-1)}]]){const product={id:`${uid}-v1-production-${spec.id}`,kind:spec.kind,speciesId:spec.id,tier:spec.tier,mutation:'normal',standardSize:spec.standardSize,finalSize:spec.standardSize,value:priceItem(spec,spec.standardSize,'normal'),createdAt:now};s.jobs.push({id:`${uid}-v1-job-${spec.id}`,target,inputTier:spec.tier,startedAt:now,readyAt:now+10000,product});}
 assertGame(s);return s;}
