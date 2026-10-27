import {grantPersonalExhibitBlueprints} from './personal-exhibit-starters.js';
import {grantCatBlueprint} from './cat-blueprint-starter.js';
import {grantMemorialBlueprints} from './memorial-starters.js';
import {validGiftLog} from './gifts.js';
import {isBuilt,completedTerrain,validConstructionTime,BASIC_WORK_MS,PERSONAL_WORK_MS} from './construction.js';
import {validBlueprintCollection,getBlueprint} from './blueprints.js';
import { SAVE_VERSION, MAX_TILES, connected, stableConstructionTerrain, edgeKey, isValidVariety, sameVariety } from './state.js';
import {canPlacePlant,canPlaceBuilding} from './footprints.js';
import { BASIC_VARIETIES, CREATIVE_SAMPLES, BUILDINGS } from './catalogue.js';
export const SAVE_KEY='inspiration-garden:v1';
const RECOVERY=SAVE_KEY+':recovery';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e7;
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const string=v=>typeof v==='string'&&v.length>0&&v.length<=180;
const unique=xs=>new Set(xs).size===xs.length;
export function validateState(s){
  try{
    if(!record(s)||s.version!==SAVE_VERSION||!string(s.uid)||!string(s.profileName)||!count(s.coins)||!count(s.crystals)||!count(s.sales)||!count(s.plantedCount)||!count(s.nextId)||!finite(s.lastSeenAt))return false;
    if(Object.hasOwn(s,'personalExhibitsVersion')&&s.personalExhibitsVersion!==1)return false;
    if(Object.hasOwn(s,'catBlueprintsVersion')&&s.catBlueprintsVersion!==1)return false;
    if(typeof s.firstBasicPlanted!=='boolean'||Object.hasOwn(s,'memorialBlueprintsVersion')&&s.memorialBlueprintsVersion!==1)return false;
    if(!Array.isArray(s.discovered)||!s.discovered.every(string))return false;
    if(!record(s.inventory)||!record(s.varieties)||!record(s.claims)||!record(s.demoInteractions)||!record(s.settings)||!Array.isArray(s.receipts)||s.receipts.length>200||!s.receipts.every(string))return false;
    if(!Array.isArray(s.tiles)||!s.tiles.length||s.tiles.length>MAX_TILES||!Array.isArray(s.edges)||s.edges.length>144||!Array.isArray(s.plants)||s.plants.length>MAX_TILES)return false;
    if(!s.tiles.every(t=>string(t.id)&&Number.isInteger(t.x)&&Number.isInteger(t.y)&&Math.abs(t.x)<=40&&Math.abs(t.y)<=40&&['land','platform'].includes(t.kind)&&validConstructionTime(t,BASIC_WORK_MS)))return false;
    if(!unique(s.tiles.map(t=>t.id))||!unique(s.tiles.map(t=>`${t.x}:${t.y}`))||!stableConstructionTerrain(s.tiles,s.lastSeenAt)||!s.tiles.some(t=>t.id===s.avatarTileId&&isBuilt(t,s.lastSeenAt)))return false;
    if(!Object.entries(s.varieties).every(([id,v])=>id===v.id&&isValidVariety(v)))return false;
    if(!BASIC_VARIETIES.every(v=>s.varieties[v.id]?.authorId===v.authorId))return false;
    if(!Object.entries(s.inventory).every(([id,n])=>s.varieties[id]&&count(n)))return false;
    if(Object.hasOwn(s,'blueprints')&&!validBlueprintCollection(s.blueprints,s.uid))return false;
    const validBuilding=b=>record(b)&&(!Object.hasOwn(b,'sampleId')||b.sampleId===getBlueprint(s,b.blueprintId)?.sampleId)&&((getBlueprint(s,b.blueprintId)?.footprint??[2,2]).every(n=>n===2)||b.sampleId===getBlueprint(s,b.blueprintId)?.sampleId)&&string(b.id)&&string(b.tileId)&&string(b.blueprintId)&&Object.hasOwn(s.blueprints??{},b.blueprintId)&&validConstructionTime(b,PERSONAL_WORK_MS);
    if(Object.hasOwn(s,'buildings')&&(!Array.isArray(s.buildings)||s.buildings.length>MAX_TILES||!s.buildings.every(b=>validBuilding(b)&&canPlaceBuilding(s,b.tileId,s.varieties,b.id,s.lastSeenAt,b))))return false;
    if(Object.hasOwn(s,'buildingBag')&&(!Array.isArray(s.buildingBag)||s.buildingBag.length>144||!s.buildingBag.every(b=>validBuilding(b)&&isBuilt(b,s.lastSeenAt))))return false;
    const validPlant=p=>record(p)&&string(p.id)&&string(p.tileId)&&string(p.varietyId)&&Object.hasOwn(s.varieties,p.varietyId)&&finite(p.plantedAt)&&finite(p.readyAt)&&p.readyAt>=p.plantedAt;
    if(Object.hasOwn(s,'plantBag')&&(!Array.isArray(s.plantBag)||s.plantBag.length>144||!s.plantBag.every(validPlant)))return false;
    if(!s.plants.every(p=>validPlant(p)&&canPlacePlant(s,s.varieties[p.varietyId],p.tileId,s.varieties,p.id)))return false;
    if(!unique([...s.plants,...(s.plantBag??[]),...(s.buildings??[]),...(s.buildingBag??[])].map(p=>p.id)))return false;
    if(!s.edges.every(e=>string(e.id)&&['fence','wall'].includes(e.kind)&&s.tiles.some(t=>t.id===e.tileId)&&['north','south','east','west'].includes(e.edge)&&validConstructionTime(e,BASIC_WORK_MS)&&s.tiles.some(t=>t.id===e.tileId&&isBuilt(t,s.lastSeenAt))))return false;
    const edgeKeys=s.edges.map(e=>edgeKey(s.tiles.find(t=>t.id===e.tileId),e.edge));if(!unique(edgeKeys)||!unique(s.edges.map(e=>e.id)))return false;
    if(s.lastDailyClaim!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(s.lastDailyClaim))return false;
    if(!Object.values(s.claims).every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v))||!Object.values(s.demoInteractions).every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)))return false;
    if(!validGiftLog(s,isValidVariety,sameVariety))return false;
    return true;
  }catch{return false;}
}
const checksum=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);};
const parse=raw=>{
  if(!raw)return null;
  try{const e=JSON.parse(raw);if(e.format!==1||!record(e.state)||e.checksum!==checksum(JSON.stringify(e.state))||!validateState(e.state))return null;return e.state;}catch{return null;}
};
export function loadGame(storage,now=Date.now()){
  try{
    const primary=storage.getItem(SAVE_KEY),backup=storage.getItem(RECOVERY);
    if(primary===null&&backup===null)return {state:null,status:'empty',head:null};
    const hydrate=state=>grantCatBlueprint(grantPersonalExhibitBlueprints(grantMemorialBlueprints({...{plantBag:[],blueprints:{},buildings:[],buildingBag:[]},...state})));
    const state=parse(primary);if(state)return {state:hydrate(state),status:'loaded',head:primary};
    const recovered=parse(backup);if(recovered)return {state:hydrate(recovered),status:'recovered',head:primary,message:'主存档损坏，已读取上一份恢复副本。损坏资料未被自动覆盖。'};
    return {state:null,status:'corrupt',head:primary,message:'这份本地存档无法读取。旧资料仍保留，请先确认是否新建花园。'};
  }catch{return {state:null,status:'unavailable',message:'浏览器暂不允许保存。本次可临时体验，关闭页面后进度可能丢失。'};}
}
export function saveGame(storage,state,now=Date.now(),options={}){
  if(!validateState(state))return {ok:false,message:'存档检查未通过，旧进度没有被覆盖。'};
  try{
    const previous=storage.getItem(SAVE_KEY);
    if(Object.hasOwn(options,'expectedHead')&&previous!==options.expectedHead)return {ok:false,conflict:true,message:'另一个标签页已经保存了更新的进度。这一页已暂停，请刷新后继续。'};
    if(previous!==null&&!parse(previous)){const archived=archiveDamaged(storage,now);if(!archived.ok)return archived;}
    // Never replace a valid recovery revision with corrupted primary bytes.
    if(parse(previous))storage.setItem(RECOVERY,previous);
    const payload=JSON.stringify({format:1,savedAt:now,state,checksum:checksum(JSON.stringify(state))});
    storage.setItem(SAVE_KEY,payload);
    return {ok:true,head:payload};
  }catch{return {ok:false,message:'保存没有成功，可能是浏览器空间或权限不足。请勿关闭页面。'};}
}
export function archiveDamaged(storage,now=Date.now()){
  try{
    const primary=storage.getItem(SAVE_KEY),recovery=storage.getItem(RECOVERY);
    storage.setItem(`${SAVE_KEY}:damaged:${now}`,JSON.stringify({primary,recovery}));
    return {ok:true};
  }catch{return {ok:false,message:'无法保留损坏副本。未新建花园，也未覆盖旧资料。'};}
}

/** Serialize this page's writes; Web Locks additionally serialize the atomic head-check/write across pages. */
export function createSaveCoordinator({storage,head=null,locks=null}){
 let currentHead=head,queue=Promise.resolve(),pending=0;
 return {
  save(state,now=Date.now()){
   if(!locks?.request)return Promise.resolve({ok:false,temporaryRequired:true,message:'这个浏览器暂不支持多标签页安全保存。仅可临时体验，已有存档不会被覆盖。'});
   pending++;
   const job=queue.then(async()=>{
    const write=()=>saveGame(storage,state,now,{expectedHead:currentHead});let result;
    try{result=await locks.request(SAVE_KEY+':write',{mode:'exclusive'},write);}
    catch{result={ok:false,message:'保存暂时没有完成，请保持页面打开后重试。'};}
    if(result.ok)currentHead=result.head;return result;
   });
   queue=job.catch(()=>{});return job.finally(()=>pending--);
  },
  adopt(nextHead){currentHead=nextHead;},get head(){return currentHead;},get pending(){return pending;},
 };
}
