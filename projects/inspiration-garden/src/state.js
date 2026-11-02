import {grantPersonalExhibitBlueprints} from './personal-exhibit-starters.js';
import {grantCatBlueprint} from './cat-blueprint-starter.js';
import {OFFICIAL_TARIFFS,PREVIOUS_BASIC_TARIFFS,creativeTariff,matchesTariff,withTariff} from './plant-pricing.js';
import {OUTFIT_KEYS} from './player-style.js';
import {trustedTreeRecord,trustedLegacyTreeRecord,legacyTreeUnlock} from './advanced-catalogue.js';
import {grantMemorialBlueprints} from './memorial-starters.js';
import {giftRecipient,GIFT_LOG_LIMIT} from './gifts.js';
import {LAND_PALETTES} from './terrain-palettes.js';
import {canReserveBuilding,walkableTerrain,tileRoute,containsPoint,safeActorPoint,stableWalkGraph,legacyRecoveryEligible} from './navigation.js';
import {isBuilt,completedTerrain,constructionTiming,BASIC_WORK_MS,PERSONAL_WORK_MS} from './construction.js';
import {ACTIVE_BUILDING_SAMPLES,getBlueprint,ownedBlueprintForSample,CONSTRUCTION_PRICE,RELOCATION_PRICE,DEMOLITION_PRICE} from './blueprints.js';
import { BASIC_VARIETIES, OFFICIAL_VARIETIES, CREATIVE_SAMPLES, DEMO_GARDENS, DEMO_VARIETIES, BUILDINGS, ART_FAMILIES } from './catalogue.js';
import {canPlacePlant,plantAtTile,canPlaceBuilding,buildingAtTile} from './footprints.js';
export const SAVE_VERSION=1;
export const MAX_TILES=36;
export const dayKey = now => new Date(now+8*3600000).toISOString().slice(0,10);
export const isMature = (plant,now) => now>=plant.readyAt;
export const getVariety = (state,id) => {const stored=Object.hasOwn(state.varieties,id)?state.varieties[id]:null;if(trustedOfficialRecord(stored))return OFFICIAL_VARIETIES.find(v=>v.id===id);if(trustedCreativeRecord(stored))return withTariff({...stored,name:creativePresentationName(stored)},creativeTariff(stored.artKey));return stored??(Object.hasOwn(DEMO_VARIETIES,id)?DEMO_VARIETIES[id]:OFFICIAL_VARIETIES.find(v=>v.id===id));};
export const availableBasics = state => OFFICIAL_VARIETIES.filter(v=>(v.unlockSales<=state.sales||trustedLegacyTreeRecord(state.varieties[v.id])&&state.sales>=legacyTreeUnlock(v.id))&&(!Object.hasOwn(state.varieties,v.id)||sameVariety(state.varieties[v.id],v)));
export const canBuySeed = (state,id) => availableBasics(state).some(v=>v.id===id) || state.varieties[id]?.authorId===state.uid;
export const createState = (now=Date.now(),uid='local-visitor') => grantCatBlueprint(grantPersonalExhibitBlueprints(grantMemorialBlueprints({
  version:SAVE_VERSION,uid,profileName:'我',coins:120,crystals:3,sales:0,plantedCount:0,firstBasicPlanted:false,nextId:1,
  inventory:{radish:2},varieties:Object.fromEntries(BASIC_VARIETIES.map(v=>[v.id,{...v}])),
  tiles:[{id:'tile-0-0',x:0,y:0,kind:'land'},{id:'tile-1-0',x:1,y:0,kind:'land'},{id:'tile-0-1',x:0,y:1,kind:'land'},{id:'tile-1-1',x:1,y:1,kind:'land'}],
  edges:[],plants:[],plantBag:[],blueprints:{},buildings:[],buildingBag:[],discovered:[],avatarTileId:'tile-0-1',lastDailyClaim:null,claims:{},demoInteractions:{},receipts:[],lastSeenAt:now,
  settings:{muted:false,avatarKey:'niulai'},
})));
const fail=(state,message)=>({state,ok:false,message});
const okay=(state,message='',effect=null)=>({state,ok:true,message,effect});
const integer=n=>Number.isInteger(n)&&Math.abs(n)<=40;
const adjacent=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;
export const connected = tiles => {
  if(!tiles.length) return false;
  const seen=new Set([tiles[0].id]),queue=[tiles[0]];
  for(let i=0;i<queue.length;i++) for(const t of tiles) if(!seen.has(t.id)&&adjacent(queue[i],t)){seen.add(t.id);queue.push(t);}
  return seen.size===tiles.length;
};
/** Every staggered completion frontier must remain walkable without a completion transaction. */
export const stableConstructionTerrain=(tiles,now)=>connected(tiles)&&[...new Set([now,...tiles.filter(t=>!isBuilt(t,now)).map(t=>t.readyAt)])].every(at=>connected(completedTerrain(tiles,at)));
export const edgeKey = (tile,edge) => {
  if(edge==='north') return `h:${tile.x}:${tile.y}`;
  if(edge==='south') return `h:${tile.x}:${tile.y+1}`;
  if(edge==='west') return `v:${tile.x}:${tile.y}`;
  if(edge==='east') return `v:${tile.x+1}:${tile.y}`;
  return null;
};
export const validEdge = (s,tileId,edge,exceptId=null) => {
  const tile=s.tiles.find(t=>t.id===tileId),key=tile&&edgeKey(tile,edge);
  return !!key&&!s.edges.some(e=>e.id!==exceptId&&edgeKey(s.tiles.find(t=>t.id===e.tileId),e.edge)===key);
};
const fixturePlant=(gardenId,plantId)=>{
  const garden=DEMO_GARDENS.find(g=>g.id===gardenId),plant=garden?.plants.find(p=>p.id===plantId);
  const variety=plant&&(DEMO_VARIETIES[plant.varietyId]??OFFICIAL_VARIETIES.find(v=>v.id===plant.varietyId));return plant&&variety?{garden,plant,variety}:null;
};
const receiptExists=(s,id)=>s.receipts.includes(id);
const addReceipt=(s,id)=>{s.receipts=[...s.receipts.slice(-199),id];};
const newId=(s,prefix)=>{while(s.nextId<10000000){const id=`${prefix}-${s.uid.slice(0,120)}-${s.nextId++}`;if(!(s.giftLog??[]).some(g=>g.plant?.id===id))return id;}return null;};
const constructionId=(s,prefix)=>{
 const used=new Set([...Object.keys(s.blueprints??{}),...Object.keys(s.varieties),...s.plants,...(s.plantBag??[]),...(s.buildings??[]),...(s.buildingBag??[]),...s.tiles,...s.edges].map(v=>typeof v==='string'?v:v.id));
 while(s.nextId<10000000){const id=newId(s,prefix);if(!used.has(id))return id;}return null;
};
const text=(value,max=160)=>typeof value==='string'&&value.length>0&&value.length<=max;
const identityKeys=['id','name','authorId','authorName','parentId','rootId','parentAuthorName','sampleId','artKey','interaction','kind','seedPrice','salePrice','growMs'];
const trustedOfficialRecord=v=>trustedTreeRecord(v)||v?.kind==='basic'&&OFFICIAL_VARIETIES.some(c=>c.id===v.id&&identityKeys.filter(k=>!['seedPrice','salePrice','growMs'].includes(k)).every(k=>(c[k]??null)===(v[k]??null))&&(matchesTariff(v,OFFICIAL_TARIFFS[v.id])||matchesTariff(v,PREVIOUS_BASIC_TARIFFS[v.id])));
// The authored fern was visually replaced by aloe; accept its exact historical name without rewriting saved records.
const creativePresentationName=v=>v?.artKey==='lx_silver_biofern'&&v.name==='银序生物蕨'?'银序芦荟':v?.name;
const trustedCreativeRecord=v=>v?.kind==='creative'&&CREATIVE_SAMPLES.some(c=>c.artKey===v.artKey&&creativePresentationName(c)===creativePresentationName(v)&&c.interaction===v.interaction&&(v.sampleId==null||v.sampleId===c.id))&&(matchesTariff(v,[18,28,90000])||matchesTariff(v,creativeTariff(v.artKey)));
export const sameVariety=(a,b)=>{const repriced=trustedOfficialRecord(a)&&trustedOfficialRecord(b)||trustedCreativeRecord(a)&&trustedCreativeRecord(b);return identityKeys.every(key=>repriced&&['seedPrice','salePrice','growMs'].includes(key)||repriced&&key==='name'&&creativePresentationName(a)===creativePresentationName(b)||(a[key]??null)===(b[key]??null));};
export function isValidVariety(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||!text(v.id)||!text(v.name,80)||!text(v.authorId)||!text(v.authorName,80)||!text(v.rootId))return false;
  if(v.parentId!==null&&!text(v.parentId))return false;
  if(v.parentAuthorName!=null&&!text(v.parentAuthorName,80))return false;
  if(v.description!=null&&(!text(v.description,320)))return false;
  if(v.gesture!=null&&(!text(v.gesture,100)))return false;
  if(v.keywords!=null&&(!Array.isArray(v.keywords)||v.keywords.length>20||!v.keywords.every(k=>text(k,24))))return false;
  if(v.kind==='basic'){const canonical=OFFICIAL_VARIETIES.find(b=>b.id===v.id);return !!canonical&&sameVariety(canonical,v);}
  if(!trustedCreativeRecord(v)&&(!Number.isSafeInteger(v.seedPrice)||v.seedPrice<8||v.seedPrice>24||!Number.isSafeInteger(v.salePrice)||v.salePrice<14||v.salePrice>38||!Number.isSafeInteger(v.growMs)||v.growMs<45000||v.growMs>120000))return false;
  if(v.kind!=='creative'||!CREATIVE_SAMPLES.some(p=>p.artKey===v.artKey&&p.interaction===v.interaction))return false;
  if(v.sampleId!=null&&!CREATIVE_SAMPLES.some(p=>p.id===v.sampleId&&p.artKey===v.artKey))return false;
  const canonical=DEMO_VARIETIES[v.id];if(canonical&&!['demo-jiji_crimson_rose_bush','demo-bear_plush_bloom','demo-lx_silver_biofern','demo-lx_orbital_bloom','demo-silver_veil_willow','demo-oxblood_bellflower','demo-bear_foldbud','demo-bear_bubble_leaf','demo-lx_bio_vault','demo-plush_button_sprout','demo-yarn_ball_flower','demo-controller_sprout','demo-plush_cotton_tree','demo-circuit_bonsai','demo-radar_succulent','demo-pace_meter_bamboo'].includes(v.id)&&!sameVariety(canonical,v))return false;
  return true;
}
/** Pure, time-injected transaction. Failure never changes or partially spends state. */
export function reduce(state,action,now=Date.now()) {
  if(!action||typeof action.type!=='string') return fail(state,'这个操作暂时不可用。');
  const time=Math.max(Number.isFinite(now)?now:state.lastSeenAt,state.lastSeenAt);
  if(action.type==='CANCEL_CREATION') return okay(state);
  const s=structuredClone(state); s.lastSeenAt=time;
  const done=(message,effect)=>okay(s,message,effect);
  const rememberActor=()=>{if(action.actorPosition){const t=walkableTerrain(s.tiles,s.buildings??[],time).find(t=>containsPoint(t,action.actorPosition));if(t)s.avatarTileId=t.id;}};
  switch(action.type){
    case 'DEMO_COINS': {if(s.coins>9999900)return fail(state,'金币已接近本地上限，本次没有补充。');s.coins+=100;return done('演示补给 +100 金币');}
    case 'SET_LAND_PALETTE': {if(!LAND_PALETTES.some(p=>p.id===action.presetId))return fail(state,'请选择一个现有地块色调。');s.settings.landPalette=action.presetId;return done('整座花园换好地块色调啦。');}
    case 'GIFT_ITEM': {
      const recipient=giftRecipient(action.gardenId,action.recipientId),log=s.giftLog??[];
      if(!recipient||recipient.id===s.uid)return fail(state,'请选择当前示范花园的朋友。');
      if(!text(action.requestId,180)||receiptExists(s,action.requestId)||log.some(g=>g.requestId===action.requestId))return fail(state,'这份本地礼物已经记录，不会重复扣除。');
      if(log.length>=GIFT_LOG_LIMIT)return fail(state,'本地赠送记录已满，物品仍保留。');
      let plant=null,variety;
      if(action.kind==='seed'){if(!text(action.varietyId,160))return fail(state,'请选择一颗库存里的种子。');variety=Object.hasOwn(s.varieties,action.varietyId)?s.varieties[action.varietyId]:null;if(!variety||!(s.inventory[variety.id]>0))return fail(state,'这颗种子已经不在库存里。');}
      else if(action.kind==='plant'){if(!text(action.plantId,180))return fail(state,'请选择收获里的一株植物。');plant=(s.plantBag??[]).find(p=>p.id===action.plantId);variety=plant&&getVariety(s,plant.varietyId);if(!plant||!variety||!isMature(plant,time))return fail(state,'只能送出收获里已经成熟的那一株。');}
      else return fail(state,'只能赠送种子或收好的成熟植物。');
      const record={requestId:action.requestId,gardenId:recipient.gardenId,recipientId:recipient.id,recipientName:recipient.name,kind:action.kind,at:time,variety:structuredClone(variety),plant:plant?structuredClone(plant):null};
      if(plant)s.plantBag=s.plantBag.filter(p=>p.id!==plant.id);else s.inventory[variety.id]--;
      s.giftLog=[...log,record];addReceipt(s,action.requestId);return done('本地赠送演示已记录；不会通知真实好友。',{kind:'local-gift',requestId:action.requestId});
    }

    case 'CREATE_BLUEPRINT': {
      if(s.nextId>=10000000)return fail(state,'本地编号已用完，本次没有花费。');
      const sample=ACTIVE_BUILDING_SAMPLES.find(b=>b.id===action.sampleId),parent=action.parentId?getBlueprint(s,action.parentId):null;
      if(!sample||action.parentId&&!parent)return fail(state,'这个想法暂不在离线建筑样例里，未消耗水晶。');
      if(!text(action.requestId,180)||receiptExists(s,action.requestId))return fail(state,'这次图纸已经收好了，不会重复扣水晶。');
      if(parent?.sampleId===sample.id)return fail(state,'它已经是这个样子啦，本次未消耗水晶。');
      if(ownedBlueprintForSample(s,sample.id))return fail(state,'这张图纸你已经有了，直接用金币建造就好。');
      if(Object.keys(s.blueprints??{}).length>=100)return fail(state,'永久图纸已达到100张创作上限，现有图纸仍可继续建造，本次未消耗水晶。');
      if(s.crystals<1)return fail(state,'还差1颗水晶，现有图纸仍可用金币建造。');
      const id=constructionId(s,'blueprint');if(!id)return fail(state,'本地编号已用完，本次没有花费。');s.blueprints={[id]:{id,sampleId:sample.id,authorId:s.uid,authorName:s.profileName,parentId:parent?.id??null,rootId:parent?.rootId??id,parentAuthorName:parent?.authorName??null},...(s.blueprints??{})};s.crystals--;addReceipt(s,action.requestId);return done('永久图纸收好啦，每座用60金币建造。',{kind:'blueprint-created',blueprintId:id});
    }
    case 'CONSTRUCT_BUILDING': {
      if(s.nextId>=10000000)return fail(state,'本地编号已用完，本次没有花费。');
      const owned=Object.hasOwn(s.blueprints??{},action.blueprintId)?s.blueprints[action.blueprintId]:null;if(!owned||owned.authorId!==s.uid)return fail(state,'先创造自己的永久图纸，再用金币建造。');
      if(s.coins<CONSTRUCTION_PRICE)return fail(state,'还差一点金币，每座建筑需要60金币。');
      if(!canReserveBuilding(s,action.tileId,s.varieties,null,time,action.actorPosition,{sampleId:owned.sampleId}))return fail(state,'需要足够的空位，并给角色留出屋外可走的土地。');
      const timing=constructionTiming(time,PERSONAL_WORK_MS);if(!timing)return fail(state,'本地时间暂不适合开始建设，本次未花费。');
      const id=constructionId(s,'building');if(!id)return fail(state,'本地编号已用完，本次没有花费。');s.buildings??=[];s.buildings.push({id,blueprintId:owned.id,sampleId:owned.sampleId,tileId:action.tileId,...timing});s.coins-=CONSTRUCTION_PRICE;rememberActor();return done('小屋开工啦，约15秒建好；图纸会一直留着。','build');
    }
    case 'PACK_BUILDING':
    case 'SELL_BUILDING':return fail(state,'建筑不能收进背包或卖出，可以付费搬迁或拆除。');
    case 'RELOCATE_BUILDING': {
      const b=(s.buildings??[]).find(b=>b.id===action.buildingId);if(action.gardenId||!b)return fail(state,'只能搬迁自己的建筑。');
      if(!isBuilt(b,time))return fail(state,'小屋还在建设，完成后才能搬迁。');
      if(b.tileId===action.tileId)return fail(state,'这里就是原位置，没有收取搬迁费。');
      if(s.coins<RELOCATION_PRICE)return fail(state,`搬迁需要${RELOCATION_PRICE}金币，本次没有花费。`);
      if(!canReserveBuilding(s,action.tileId,s.varieties,b.id,time,action.actorPosition))return fail(state,'需要足够的空位，并给角色留出屋外可走的土地。');
      b.tileId=action.tileId;s.coins-=RELOCATION_PRICE;rememberActor();return done(`小屋搬好啦，花费${RELOCATION_PRICE}金币。`,'build');
    }
    case 'RECOVER_LEGACY_BUILDING': {const b=(s.buildings??[]).find(b=>b.id===action.buildingId);if(action.gardenId||!legacyRecoveryEligible(s,time)||!b||!isBuilt(b,time)||!Object.hasOwn(s.blueprints??{},b.blueprintId))return fail(state,'当前布局不符合旧版恢复条件，建筑仍保留。');s.buildings=s.buildings.filter(x=>x.id!==b.id);s.avatarTileId=walkableTerrain(s.tiles,s.buildings,time)[0].id;return done('旧版布局恢复了落脚空间，永久图纸仍保留；未收取费用。','build');}
    case 'DEMOLISH_BUILDING': {
      const b=(s.buildings??[]).find(b=>b.id===action.buildingId);if(action.gardenId||!b)return fail(state,'只能拆除自己的建筑。');
      if(!isBuilt(b,time))return fail(state,'小屋还在建设，完成后才能拆除。');
      if(s.coins<DEMOLITION_PRICE)return fail(state,`拆除需要${DEMOLITION_PRICE}金币，本次没有花费。`);
      s.buildings=s.buildings.filter(x=>x.id!==b.id);s.coins-=DEMOLITION_PRICE;return done(`小屋已拆除，花费${DEMOLITION_PRICE}金币；永久图纸仍保留。`,'build');
    }
    case 'RESTORE_BUILDING': {
      const b=(s.buildingBag??[]).find(b=>b.id===action.buildingId);if(!b)return fail(state,'这座建筑已经摆回花园了。');if(!isBuilt(b,time))return fail(state,'这座建筑还没有建设完成。');if(!canReserveBuilding(s,action.tileId,s.varieties,null,time,action.actorPosition,b))return fail(state,'这里放不下建筑，或没有留出屋外走道。');s.buildings=[...(s.buildings??[]),{...b,tileId:action.tileId}];s.buildingBag=s.buildingBag.filter(x=>x.id!==b.id);rememberActor();return done('原来那座小屋回来了，没有额外花费。','build');
    }
    case 'BUY_SEED': {
      const v=getVariety(s,action.varietyId); if(!v||!canBuySeed(s,v.id)) return fail(state,'这个品种还不能在种子铺购买。');
      if(s.coins<v.seedPrice) return fail(state,'金币还不够，先卖一株成熟植物吧。');
      if((s.inventory[v.id]??0)>=10000000)return fail(state,'这颗种子的库存已到本地上限，本次没有花费。');
      if(!Object.hasOwn(s.varieties,v.id))s.varieties[v.id]={...v};
      s.coins-=v.seedPrice;s.inventory[v.id]=(s.inventory[v.id]??0)+1;return done(`收好一颗${v.name}种子。`,'coin');
    }
    case 'PLANT': {
      const tile=s.tiles.find(t=>t.id===action.tileId),v=getVariety(s,action.varietyId);
      if(!tile||tile.kind!=='land')return fail(state,'只有种植土地可以种植物。');
      if(v&&!canPlacePlant(s,v,tile.id))return fail(state,'这里放不下它，需要连在一起的空土地。');
      if(!v||!(s.inventory[v.id]>0))return fail(state,'还没有这颗种子，去种子铺或示范花园找找。');
      const id=newId(s,'plant');if(!id)return fail(state,'本地编号已用完，本次没有花费。');s.inventory[v.id]--;const starter=BASIC_VARIETIES.some(b=>b.id===v.id),growMs=!s.firstBasicPlanted&&starter?15000:v.growMs;if(starter)s.firstBasicPlanted=true;
      s.plants.push({id,tileId:tile.id,varietyId:v.id,plantedAt:time,readyAt:time+growMs});s.plantedCount++;s.avatarTileId=tile.id;
      return done('种好啦，等它慢慢长大。','plant');
    }
    case 'DEMO_READY_PLANT': {
      const p=s.plants.find(p=>p.id===action.plantId),v=p&&getVariety(s,p.varietyId);
      if(action.gardenId!=null||!p||!v||!['tileId','varietyId','plantedAt','readyAt'].every(key=>action[key]===p[key]))return fail(state,'这株植物的倒计时已经改变。');
      if(!Number.isFinite(p.plantedAt)||!Number.isFinite(p.readyAt)||p.plantedAt>time||isMature(p,time)||!canPlacePlant(s,v,p.tileId,s.varieties,p.id,time))return fail(state,'只能跳过自己土地上正在成长的植物。');
      p.readyAt=time;if(!s.discovered.includes(p.varietyId))s.discovered.push(p.varietyId);
      return done();
    }
    case 'PACK_PLANT': {
      if(action.gardenId)return fail(state,'示范花园的居民只能在这里玩。');
      const p=s.plants.find(p=>p.id===action.plantId);if(!p)return fail(state,'这株植物已经收好或离开土地了。');
      if(!isMature(p,time))return fail(state,'它还在长大，成熟后再收进背包。');
      if((s.plantBag??[]).length>=144)return fail(state,'植物背包装满啦，先摆回几位居民。');
      s.plantBag=[...(s.plantBag??[]),p];s.plants=s.plants.filter(x=>x.id!==p.id);return done('整株收好啦，摆回时还是原来那一株。','seed');
    }
    case 'RESTORE_PLANT': {
      const p=(s.plantBag??[]).find(p=>p.id===action.plantId),v=p&&getVariety(s,p.varietyId);
      if(!p||!v)return fail(state,'这株植物已经摆回花园了。');
      if(!canPlacePlant(s,v,action.tileId))return fail(state,'这里放不下它，需要连在一起的空土地。');
      s.plants.push({...p,tileId:action.tileId});s.plantBag=s.plantBag.filter(x=>x.id!==p.id);return done('老朋友回到花园，还是原来的那一株。','plant');
    }
    case 'REVEAL': {
      const p=s.plants.find(p=>p.id===action.plantId);if(!p||!isMature(p,time))return fail(state,'它还在长大，成熟后再揭晓。');
      if(s.discovered.includes(p.varietyId))return okay(state);s.discovered.push(p.varietyId);return done('新居民成熟啦，轻轻碰一下认识它。','crystal');
    }
    case 'SELL_PACKED_PLANT': {
      if(action.gardenId)return fail(state,'只能卖出自己收好的植物。');
      const p=(s.plantBag??[]).find(p=>p.id===action.plantId);if(!p)return fail(state,'这株植物已经摆回或卖出了。');
      if(!isMature(p,time))return fail(state,'它还在长大，成熟后才能卖出。');
      const v=getVariety(s,p.varietyId);if(s.coins>10000000-v.salePrice||s.sales>=10000000)return fail(state,'本地金币或出售记录已到上限，这株植物仍保留。');
      if(!s.discovered.includes(v.id))s.discovered.push(v.id);s.coins+=v.salePrice;s.sales++;s.plantBag=s.plantBag.filter(x=>x.id!==p.id);return done(`${v.name}换得 ${v.salePrice} 金币。`,'coin');
    }
    case 'SELL': {
      if(action.gardenId)return fail(state,'示范花园的居民不能卖出。');
      const p=s.plants.find(p=>p.id===action.plantId);if(!p)return fail(state,'这株植物已经离开土地了。');
      if(!isMature(p,time))return fail(state,'它还在长大，再等一小会儿。');
      const v=getVariety(s,p.varietyId);if(s.coins>10000000-v.salePrice||s.sales>=10000000)return fail(state,'本地金币或出售记录已到上限，这株植物仍保留。');if(!s.discovered.includes(v.id))s.discovered.push(v.id);s.coins+=v.salePrice;s.sales++;s.plants=s.plants.filter(x=>x.id!==p.id);
      return done(`${v.name}换得 ${v.salePrice} 金币，土地空出来了。`,'coin');
    }
    case 'DAILY_CLAIM': {
      const day=dayKey(time);if(s.lastDailyClaim===day)return fail(state,'今天的灵感水晶已经领过了。');
      s.lastDailyClaim=day;s.crystals+=2;return done('今日的 2 颗灵感水晶，收好啦。','crystal');
    }
    case 'DEMO_CRYSTALS': {
      if(s.crystals>996)return fail(state,'水晶已经足够体验啦。');s.crystals+=3;
      return done('已模拟补充 3 颗水晶。纯演示，不收费。','crystal');
    }
    case 'CREATE_VARIETY': {
      const sample=CREATIVE_SAMPLES.find(p=>p.id===action.sampleId),parent=action.parentId&&Object.hasOwn(s.varieties,action.parentId)?s.varieties[action.parentId]:null;
      if(!sample)return fail(state,'请选择一个支持的离线灵感样例。');
      if(action.parentId&&!knownParent(s,parent))return fail(state,'找不到要改造的原品种。');
      if(!text(action.requestId,180)||receiptExists(s,action.requestId))return fail(state,'这次灵感已经完成，不会重复扣除水晶。');
      if(parent&&familyOf(parent)!==familyOf(sample))return fail(state,'改造会保留原品种的家族。这个离线方向不适合这颗种子，未消耗水晶。');
      if(parent&&parent.artKey===sample.artKey&&parent.interaction===sample.interaction)return fail(state,'它已经是这个模样啦，换一个离线改造方向吧。本次未消耗水晶。');
      if(reusablePersonalVariety(s,sample.id))return fail(state,'这个离线样例你已经有了，可以直接再种，不必再用水晶。');
      if(s.crystals<1)return fail(state,'还差 1 颗水晶；普通种植仍然可以继续。');
      const id=newId(s,'variety');if(!id)return fail(state,'本地编号已用完，本次没有花费。');const v={...sample,sampleId:sample.id,id,authorId:s.uid,authorName:s.profileName,parentId:parent?.id??null,rootId:parent?.rootId??id,parentAuthorName:parent?.authorName??null};
      s.crystals--;s.varieties[id]=v;s.inventory[id]=1;addReceipt(s,action.requestId);
      return done(`一颗新种子诞生了。成熟后再认识它的模样。`,{kind:'created',varietyId:id});
    }
    case 'INTERACT_DEMO': {
      const f=fixturePlant(action.gardenId,action.plantId);if(!f)return fail(state,'这株示范植物暂时找不到了。');
      s.demoInteractions[`${action.gardenId}:${action.plantId}`]=dayKey(time);return done('',{kind:'interact',interaction:f.variety.interaction});
    }
    case 'CLAIM_SEED':
    case 'SHAKE_SEED': {
      let variety;
      if(action.gardenId){
        const f=fixturePlant(action.gardenId,action.plantId);if(!f)return fail(state,'这株示范植物暂时找不到了。');
        if(s.demoInteractions[`${action.gardenId}:${action.plantId}`]!==dayKey(time))return fail(state,'先和它玩一下，再摇一颗种子回家。');
        variety=f.variety;
      }else{
        const p=s.plants.find(p=>p.id===action.plantId);if(!p||!isMature(p,time))return fail(state,'等它长大，再轻轻摇出种子。');
        variety=getVariety(s,p.varietyId);
      }
      if(Object.hasOwn(s.varieties,variety.id)&&!sameVariety(s.varieties[variety.id],variety))return fail(state,'本地已有不同来历的同编号品种，原有植物保留，本次未领取。');
      const day=dayKey(time);if(s.claims[variety.id]===day)return fail(state,'这个品种今天已摇过一颗，明天再来吧。');
      if(!Object.hasOwn(s.varieties,variety.id))s.varieties[variety.id]={...variety};if(!s.discovered.includes(variety.id))s.discovered.push(variety.id);s.inventory[variety.id]=(s.inventory[variety.id]??0)+1;s.claims[variety.id]=day;
      return done(`摇出一颗${variety.name}种子 · 原作者 ${variety.authorName}`,'seed');
    }
    case 'RECEIVE_SEED': {
      const v=action.variety;if(!isValidVariety(v)||!text(action.transferId,180)||receiptExists(s,action.transferId))return fail(state,'这份种子资料不完整或已经收过了。');
      if(s.varieties[v.id]&&!sameVariety(s.varieties[v.id],v))return fail(state,'同一品种的作者资料不一致，未接收。');
      if(!Object.hasOwn(s.varieties,v.id))s.varieties[v.id]=structuredClone(v);if(!s.discovered.includes(v.id))s.discovered.push(v.id);s.inventory[v.id]=(s.inventory[v.id]??0)+1;addReceipt(s,action.transferId);return done('收到一颗保留原作者的种子。','seed');
    }
    case 'BUILD': {
      const b=Object.hasOwn(BUILDINGS,action.kind)?BUILDINGS[action.kind]:null;if(!b)return fail(state,'请选择土地、平台、栅栏或矮墙。');
      if(s.coins<b.price)return fail(state,'金币还不够，先在花园赚一点吧。');
      const timing=constructionTiming(time,BASIC_WORK_MS);if(!timing)return fail(state,'本地时间暂不适合开始建设，本次未花费。');
      if(action.kind==='land'||action.kind==='platform'){
        if(s.tiles.length>=MAX_TILES)return fail(state,'小岛已经很丰富啦，先重新布置现有空间吧。');
        if(!integer(action.x)||!integer(action.y)||s.tiles.some(t=>t.x===action.x&&t.y===action.y))return fail(state,'这里不能放置，请选择相邻的空位。');
        const next={id:`tile-${action.x}-${action.y}`,x:action.x,y:action.y,kind:action.kind,...timing};if(s.tiles.some(t=>t.id===next.id)){next.id=newId(s,'tile');if(!next.id)return fail(state,'本地编号已用完，本次没有花费。');}
        if(!s.tiles.some(t=>isBuilt(t,time)&&adjacent(t,next)))return fail(state,'新地块要贴着现有的小岛。');s.tiles.push(next);
      }else{
        if(!isBuilt(s.tiles.find(t=>t.id===action.tileId)??{},time)||!validEdge(s,action.tileId,action.edge))return fail(state,'这条边已经有装饰，换一条边试试。');
        const id=newId(s,'edge');if(!id)return fail(state,'本地编号已用完，本次没有花费。');s.edges.push({id,kind:action.kind,tileId:action.tileId,edge:action.edge,...timing});
      }
      s.coins-=b.price;return done(`开始建设${b.name}，约3秒完成。`,'build');
    }
    case 'RECLAIM': {
      const edge=s.edges.find(e=>e.id===action.targetId);
      if(edge){if(!isBuilt(edge,time))return fail(state,'边饰还在建设，完成后再收回。');s.edges=s.edges.filter(e=>e.id!==edge.id);s.coins+=BUILDINGS[edge.kind].refund;return done('已收回边饰，返还部分金币。','coin');}
      const tile=s.tiles.find(t=>t.id===action.targetId);if(!tile)return fail(state,'请先选择要收回的建筑。');if(!isBuilt(tile,time)||s.edges.some(e=>e.tileId===tile.id&&!isBuilt(e,time)))return fail(state,'这里还在建设，完成后再收回。');
      if(plantAtTile(s,tile.id,s.varieties)||buildingAtTile(s,tile.id))return fail(state,'这里有植物或建筑，先收好成熟植物，或搬迁 / 拆除建筑，再移动土地。');
      const remaining=s.tiles.filter(t=>t.id!==tile.id);if(!stableConstructionTerrain(remaining,time))return fail(state,'收回后小岛会断开，请保留连接。');if(!safeActorPoint(remaining,s.buildings??[],action.actorPosition??s.tiles.find(t=>t.id===s.avatarTileId),time)||!stableWalkGraph(remaining,s.buildings??[],time))return fail(state,'先让角色走到屋外其他地块，再调整这里。');
      s.coins+=reclaimRefund(s,tile.id);
      s.edges=s.edges.filter(e=>e.tileId!==tile.id);s.tiles=remaining;if(s.avatarTileId===tile.id)s.avatarTileId=walkableTerrain(remaining,s.buildings??[],time)[0].id;rememberActor();
      return done('已收回地块与它的边饰，返还部分金币。','coin');
    }
    case 'MOVE_BUILDING': {
      const edge=s.edges.find(e=>e.id===action.targetId);
      if(edge){if(!isBuilt(edge,time)||!isBuilt(s.tiles.find(t=>t.id===action.tileId)??{},time))return fail(state,'完成建设后才能移动到这里。');if(!validEdge(s,action.tileId,action.edge,edge.id))return fail(state,'那条边不能放置，请换一条。');edge.tileId=action.tileId;edge.edge=action.edge;return done('边饰搬好啦。','build');}
      const tile=s.tiles.find(t=>t.id===action.targetId);if(!tile)return fail(state,'请先选择要移动的建筑。');if(!isBuilt(tile,time)||s.edges.some(e=>e.tileId===tile.id&&!isBuilt(e,time)))return fail(state,'这里还在建设，完成后再移动。');
      if(plantAtTile(s,tile.id,s.varieties)||buildingAtTile(s,tile.id))return fail(state,'这里有植物或建筑，先收好成熟植物，或搬迁 / 拆除建筑，再移动土地。');
      if(!integer(action.x)||!integer(action.y)||s.tiles.some(t=>t.id!==tile.id&&t.x===action.x&&t.y===action.y))return fail(state,'这里不能放置，请选择空位。');
      const actor=action.actorPosition??s.tiles.find(t=>t.id===s.avatarTileId),oldPosition=actor&&{x:actor.x,y:actor.y};tile.x=action.x;tile.y=action.y;if(!safeActorPoint(s.tiles,s.buildings??[],oldPosition,time)||!stableWalkGraph(s.tiles,s.buildings??[],time))return fail(state,'先让角色走到屋外其他地块，再调整这里。');rememberActor();if(!stableConstructionTerrain(s.tiles,time))return fail(state,'移动后小岛会断开，换个位置吧。');
      // Edges move with their supporting tile; prevent an overlapping shared edge.
      const keys=s.edges.map(e=>edgeKey(s.tiles.find(t=>t.id===e.tileId),e.edge));if(new Set(keys).size!==keys.length)return fail(state,'移动后边饰会重叠，请先移动边饰。');
      return done('搬好啦，没有额外花费。','build');
    }
    case 'TRAVEL': {const safe=walkableTerrain(s.tiles,s.buildings??[],time),position=action.actorPosition??s.tiles.find(t=>t.id===s.avatarTileId),start=safe.find(t=>containsPoint(t,position));if(!start||!tileRoute(safe,start.id,action.tileId).length)return fail(state,'这里被建筑挡住了，暂时走不过去。');s.avatarTileId=action.tileId;return done();}
    case 'SET_MUTED': {s.settings.muted=!!action.value;return done(s.settings.muted?'声音已关闭。':'声音已开启。');}
    case 'SET_OUTFIT':{if(!OUTFIT_KEYS.includes(action.outfitKey))return fail(state,'这套衣服暂时还没准备好。');s.settings.outfitKey=action.outfitKey;s.settings.avatarKey='human-subeike';return done('换好啦，还是熟悉的苏贝壳。');}
    case 'SET_AVATAR': {if(!['feidudu','miaocuijiao','milk-frog','banana-cat','human-bear','sword-shield-dog','niulai','human-jiji','human-lx','human-subeike','human-jiaxin','human-kelly'].includes(action.avatarKey))return fail(state,'这个角色暂时不可用。');s.settings.avatarKey=action.avatarKey;return done('换好角色啦。');}
    default:return fail(state,'这个操作暂时不可用。');
  }
}
export const tick=(state,now=Date.now())=>({...state,lastSeenAt:Math.max(state.lastSeenAt,now)});
export function reclaimRefund(state,targetId){const edge=state.edges.find(e=>e.id===targetId);if(edge)return BUILDINGS[edge.kind].refund;const tile=state.tiles.find(t=>t.id===targetId);return tile?BUILDINGS[tile.kind].refund+state.edges.filter(e=>e.tileId===targetId).reduce((sum,e)=>sum+BUILDINGS[e.kind].refund,0):0;}
export const familyOf=variety=>variety&&Object.hasOwn(ART_FAMILIES,variety.artKey)?ART_FAMILIES[variety.artKey]:null;
const knownParent=(s,parent)=>parent&&(parent.kind!=='basic'||availableBasics(s).some(v=>v.id===parent.id)||(s.inventory[parent.id]??0)>0||s.discovered.includes(parent.id));
export function compatibleRemixSamples(s,parentId){const parent=Object.hasOwn(s.varieties,parentId)?s.varieties[parentId]:null;if(!knownParent(s,parent))return [];const family=familyOf(parent);return CREATIVE_SAMPLES.filter(sample=>familyOf(sample)===family&&(sample.artKey!==parent.artKey||sample.interaction!==parent.interaction));}
export function reusablePersonalVariety(s,sampleId){const sample=CREATIVE_SAMPLES.find(v=>v.id===sampleId);return sample?Object.values(s.varieties).find(v=>v.kind==='creative'&&v.authorId===s.uid&&v.artKey===sample.artKey&&v.interaction===sample.interaction):null;}

