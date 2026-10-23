import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Backpack,Check,ChevronRight,PackageOpen} from 'lucide-react';
import type {Profile} from '../v5/estate.ts';
import {TIERS,TIER_VALUE,type MaterialTier} from '../v5/herd-economy.ts';
import {V7_RULES} from '../v5/v7-economy.ts';
import {SHIELD_ANCHORS} from '../v5/tactical-shield.ts';
import {isOwned,isWalkable} from '../v5/layout.ts';
import type {WorkshopRecipe} from '../v5/workshop.ts';
import ResourceIcon,{QUALITY,type ResourceKind} from './ResourceIcon.tsx';
import './inventory.css';
type Group='all'|'wool'|'supplies'|'equipment';
type Entry={id:string;name:string;kind:ResourceKind;group:Exclude<Group,'all'>;count:number;tier?:MaterialTier;note:string;unit:string};
const COLOR:Record<MaterialTier,string>={white:'白',green:'绿',blue:'蓝',red:'红',gold:'金'};
const NAMES:Record<WorkshopRecipe,string>={cape:'伙伴披风',banner:'庭院旗面',signpost:'路线标识',shield:'折翼拦路盾',signature:'动物签名'};
const USES:Record<MaterialTier,string>={white:'制作伙伴披风和庭院旗面，让共同经历留在身边。',green:'制作路线标识，装点真实的回家路线。',blue:'制作狗盾配方，装配后可让狗在指定位置守路。',red:'保留用于后续战术配方（尚未开放），现在也可继续合成金毛。',gold:'制作动物永久签名，可免费换贴到已拥有的披风和旗面。'};
export type InventoryPanelProps={profile:Profile;busy:boolean;send:(type:string,extra?:Record<string,unknown>)=>void;onCraft?:()=>void;showBalance?:boolean};
/** A view of authoritative stock, never an optimistic second inventory. */
export default function InventoryPanel({profile:p,busy,send,onCraft,showBalance=true}:InventoryPanelProps){
 const [group,setGroup]=useState<Group>('all'),[selected,setSelected]=useState('wool:white'),[saleWarning,setSaleWarning]=useState(false),[deliveryTarget,setDeliveryTarget]=useState(''),[anchor,setAnchor]=useState(1);
 const lock=useRef(false);useEffect(()=>{if(!busy)lock.current=false;},[busy,p]);
 const act=(type:string,extra?:Record<string,unknown>)=>{if(busy||lock.current)return;lock.current=true;send(type,extra);};
 const troughs=p.layout.buildings.filter(b=>b.kind==='trough'),delivery=troughs.find(b=>b.id===deliveryTarget)??troughs[0],availableTrough=troughs.find(b=>(p.troughFood?.[b.id]??0)>0),troughStock=troughs.reduce((n,b)=>n+(p.troughFood?.[b.id]??0),0);
 const items=p.workshop?.items.filter(item=>!item.destroyed)??[],equipped=p.workshop?.equipment;
 const entries:Entry[]=[
  ...TIERS.map(tier=>({id:`wool:${tier}`,name:`${COLOR[tier]}羊毛`,kind:'wool' as const,group:'wool' as const,count:p.economy?.warehouse[tier]??0,tier,note:`${QUALITY[tier].rank} ${QUALITY[tier].name}`,unit:'份'})),
  {id:'production-feed',name:'生产粮',kind:'feed',group:'supplies',count:p.v7?.productionFeed??0,note:'生产专用',unit:'份'},
  {id:'hand-food',name:'随身食物',kind:'food',group:'supplies',count:p.inventory.hand,note:'手持 / 3',unit:'份'},
  {id:'pantry-food',name:'工作台食物',kind:'pantry',group:'supplies',count:p.inventory.pantry,note:'免费照料',unit:'份'},
  {id:'factory-food',name:'工厂食物',kind:'factory',group:'supplies',count:p.factory.stock,note:'待配送 / 12',unit:'份'},
  {id:'trough-food',name:'食槽食物',kind:'trough',group:'supplies',count:troughStock,note:`${troughs.length} 处食槽`,unit:'份'},
  ...items.map(item=>({id:`equipment:${item.id}`,name:NAMES[item.recipe],kind:item.recipe,group:'equipment' as const,count:1,note:equipped?.cape===item.id||equipped?.shield===item.id?'已装配':p.workshop?.placements[item.id]?'已摆放':item.recipe==='signature'?'永久解锁':'未装配',unit:'件'})),
 ];
 const visible=entries.filter(entry=>group==='all'||entry.group===group),entry=visible.find(item=>item.id===selected)??visible[0];
 const choose=(id:string)=>{setSelected(id);setSaleWarning(false);};
 const tier=entry?.tier??'white',stock=p.economy?.warehouse[tier]??0,saleable=p.economy?.lots?.filter(l=>l.tier===tier&&l.version!=='legacy').reduce((n,l)=>n+l.amount,0)??0,nextTier=TIERS[TIERS.indexOf(tier)+1],saleVersion=p.economy?.lots?.some(l=>l.tier===tier&&l.version==='v7'&&l.amount>0)?'v7':'v6';
 const item=entry?.group==='equipment'?items.find(i=>`equipment:${i.id}`===entry.id):undefined,isEquipped=item&&(equipped?.cape===item.id||equipped?.shield===item.id),activeThreat=!!p.threat&&p.threat.phase!=='complete';
 const workshopAct=(type:string,extra:Record<string,unknown>)=>act(type,{...extra,workshopVersion:p.workshop?.version??0,worldVersion:p.layout.version});
 return <section className="inventory-panel" data-inventory>
  <div className="inventory-heading"><div><Backpack size={18}/><h3>物资背包</h3><span>已入库</span></div>{onCraft&&<button type="button" className="inventory-workshop" data-craft onClick={onCraft}>做披风<ChevronRight size={14}/></button>}</div>
  {showBalance&&<div className="inventory-wallet"><ResourceIcon kind="coin" size={34}/><strong>{p.materials}</strong><span>金币</span><small>建造与交易共用余额</small></div>}
  <p className="inventory-intro">羊毛用于制作披风、旗面与战术装备。选中物资，查看用途和操作。</p>
  <nav className="inventory-tabs" aria-label="物资分类">{(['all','wool','supplies','equipment'] as const).map((id,index)=><button type="button" key={id} data-inventory-group={id} aria-pressed={group===id} onClick={()=>{setGroup(id);setSaleWarning(false);}}>{['全部','羊毛','补给','装备'][index]}{id==='equipment'&&items.length>0&&<span>{items.length}</span>}</button>)}</nav>
  <div className="inventory-grid" aria-label="已拥有的物资">{visible.map(e=><button type="button" key={e.id} data-inventory-item={e.id} data-wool-tier={e.tier} aria-pressed={entry?.id===e.id} aria-label={`${e.name}，${e.note}，${e.count}${e.unit}${entry?.id===e.id?'，已选中':''}`} className={`inventory-tile ${e.count===0?'is-empty':''}`} style={e.tier?{'--item-color':QUALITY[e.tier].color,'--wool-color':QUALITY[e.tier].shade} as CSSProperties:undefined} onClick={()=>choose(e.id)}>
   <span className="inventory-art"><ResourceIcon kind={e.kind} tier={e.tier} size={54}/>{entry?.id===e.id&&<Check className="inventory-selected" size={13}/>}</span><b>{e.name}</b><small className="inventory-quality">{e.note}</small><strong className="inventory-quantity">{e.count}<span>{e.unit}</span></strong>
  </button>)}</div>
  {!visible.length&&<div className="inventory-empty"><PackageOpen size={32}/><b>还没有作品</b><p>制作完成的披风、狗盾和旗面会出现在这里。</p>{onCraft&&<button className="cycle-small-button" onClick={onCraft}>去工作坊做第一件</button>}</div>}
  {entry&&<section className="inventory-detail" data-inventory-detail aria-label="选中物资详情" aria-live="polite">
   <div className="inventory-detail-heading"><ResourceIcon kind={entry.kind} tier={entry.tier} size={45}/><div><h4>{entry.name}</h4><span>{entry.note} · 库存 {entry.count}{entry.unit}</span></div></div>
   {entry.group==='wool'&&<><p>{USES[tier]}</p><div className="inventory-price"><ResourceIcon kind="coin" size={22}/><span>{COLOR[tier]}毛卖价 <b>{V7_RULES.sale[tier]}金币/份</b></span><small>新版可售 {saleable}份</small></div><div className="v7-actions"><button className="cycle-small-button" data-v7-sell disabled={busy||saleable<1} onClick={()=>{if(['blue','red','gold'].includes(tier)&&!saleWarning){setSaleWarning(true);return;}setSaleWarning(false);act('v7-sell-wool',{tier,amount:1,version:saleVersion});}}>{saleWarning?'确认卖1份':'卖1份'} · +{V7_RULES.sale[tier]}金币</button>{nextTier&&<button className="cycle-small-button" data-v7-synthesize disabled={busy||stock<V7_RULES.synthesisRatio||p.materials<V7_RULES.synthesisCoins} onClick={()=>act('v7-synthesize',{tier,amount:1})}>{V7_RULES.synthesisRatio}{COLOR[tier]} → 1{COLOR[nextTier]} · {V7_RULES.synthesisCoins}金币</button>}</div>{nextTier&&<small className="inventory-footnote">合成消耗3份当前品质羊毛和2金币，不是免费升级。</small>}{saleWarning&&<p role="status" className="cycle-pause">卖出这份{COLOR[tier]}毛后，就不能用它制作上述配方。<button className="cycle-link" onClick={()=>setSaleWarning(false)}>先留着</button></p>}</>}
   {entry.id==='production-feed'&&<><p>用于羊毛生产，每批按动物品质消耗。与免费照料食物分账，不能用随身食物替代。</p><button className="cycle-small-button" data-inventory-buy-feed disabled={busy||p.materials<V7_RULES.feedPackPrice} onClick={()=>act('v7-buy-feed',{packs:1})}>补充{V7_RULES.feedPack}份 · {V7_RULES.feedPackPrice}金币</button></>}
   {(entry.id==='hand-food'||entry.id==='pantry-food')&&<><p>{entry.id==='hand-food'?'LX随身携带，走近动物后喂奶或喂食，每次用1份。':'工作台每30在线秒准备3份免费食物，领取需要LX实际走到工作台。'} 不扣生产粮。</p><button className="cycle-small-button" data-inventory-refill disabled={busy||!!p.job||p.inventory.hand>=3||p.inventory.pantry<1} onClick={()=>act('refill')}>{p.inventory.hand>=3?'随身已装满':p.inventory.pantry<1?'等待工作台备好食物':'去工作台免费补充'}</button></>}
   {entry.id==='factory-food'&&<><p>工厂每60在线秒加工3份，最多储存12份。LX每趟搬运最多3份，沿真实路线送到食槽。</p><label className="inventory-field">配送目的地<select value={delivery?.id??''} disabled={!troughs.length} onChange={event=>setDeliveryTarget(event.target.value)}>{!troughs.length&&<option value="">先建一处食槽</option>}{troughs.map(t=><option key={t.id} value={t.id}>食槽 ({t.x},{t.z}) · {p.troughFood?.[t.id]??0}/{t.capacity}</option>)}</select></label><button className="cycle-small-button" data-inventory-deliver disabled={busy||!!p.job||p.factory.stock<1||!delivery||(p.troughFood?.[delivery.id]??0)>=delivery.capacity} onClick={()=>act('delivery',{target:delivery?.id})}>从工厂搬运</button></>}
   {entry.id==='trough-food'&&<><p>已经配送到食槽的免费食物。LX可以走到有存粮的食槽装满随身食物，最多携带3份。</p><button className="cycle-small-button" data-inventory-refill-trough disabled={busy||!!p.job||p.inventory.hand>=3||!availableTrough} onClick={()=>act('refill',{source:'trough',target:availableTrough?.id})}>去食槽装食物</button></>}
   {item&&<><p>{item.recipe==='cape'?'伙伴的外观装备，装配到独立披风槽，不改变动物身份与关系。':item.recipe==='shield'?'狗盾使用独立装备槽，在合法驻守点形成路障；守护事件中不能改换战术。':item.recipe==='signature'?'这只动物的永久签名已解锁，可在工作坊免费换贴到已拥有的披风或旗面。':'在工作坊选择场景位置再摆放，不会增加碰撞或阻挡道路。'}</p><small className="inventory-footnote">{item.gift?'赠送试制':`实付 ${item.paid.materials}金币`} · 纹样 v{item.assetVersion}{isEquipped?' · 已装配':''}</small>{item.recipe==='shield'&&<label className="inventory-field">驻守点<select aria-label="背包狗盾驻守点" value={anchor} onChange={event=>setAnchor(Number(event.target.value))}>{SHIELD_ANCHORS.map((q,index)=><option key={index} value={index}>{['保护区外','回家路口','草场路口','东侧路口'][index]} ({q.x},{q.z})</option>)}</select></label>}{(item.recipe==='cape'||item.recipe==='shield')&&<button className="cycle-small-button" data-inventory-equip disabled={busy||item.recipe==='shield'&&(activeThreat||!isEquipped&&(!isOwned(p.layout,SHIELD_ANCHORS[anchor])||!isWalkable(p.layout,SHIELD_ANCHORS[anchor])))} onClick={()=>workshopAct(isEquipped?'workshop-unequip':'workshop-apply',isEquipped?{slot:item.recipe}:{itemId:item.id,...(item.recipe==='shield'?{position:SHIELD_ANCHORS[anchor]}:{})})}>{isEquipped?'卸下装备':item.recipe==='cape'?'穿给伙伴':'装盾并定点'}</button>}{onCraft&&<button className="inventory-workshop" onClick={onCraft}>到工作坊{item.recipe==='banner'||item.recipe==='signpost'?'摆放':'查看作品'}<ChevronRight size={14}/></button>}</>}
  </section>}
  <details className="cycle-more inventory-provenance"><summary>旧库存兑换权与来源</summary><p>旧版白/绿/蓝/红/金仍按1/2/4/7/12金币兑换；新版按公开卖价。旧库存兑换权保留，没有一键全卖。</p>{TIERS.map(t=>{const n=p.economy?.lots?.filter(l=>l.tier===t&&l.version==='legacy').reduce((a,l)=>a+l.amount,0)??0;return <div className="cycle-row" key={t}><span><ResourceIcon kind="wool" tier={t} size={22}/>旧版{COLOR[t]}毛 {n}份</span><button data-exchange-tier={t} disabled={busy||!n} onClick={()=>act('exchangeWool',{tier:t,amount:1,woolVersion:'legacy'})}>换1份 · +{TIER_VALUE[t]}金币</button></div>;})}{p.economy?.lots?.filter(l=>l.amount>0).map(l=><p key={l.id}>{l.version==='legacy'?'旧版':l.version==='v6'?'V6':'V7'} · {l.animalId?p.animals.find(a=>a.id===l.animalId)?.name??l.animalId:'仓库'} · {COLOR[l.tier]}毛{l.amount}份</p>)}</details>
 </section>;
}
