import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Cloud,ArrowRight,Shield,House,TriangleAlert,Plus} from 'lucide-react';
import type {EstateAnimal,Profile} from './estate.ts';
import {GUARDIAN_LABEL} from './estate.ts';
import {guardianUpgradeRules,shelterDoorService,type GuardianKind} from './threat.ts';
import {shelterEntries} from './layout.ts';
import {TIERS,TIER_COLOR,TIER_VALUE,tierNumber,createHusbandry,emptyStacks,type MaterialTier as Tier,type AnimalHusbandry,type HerdEconomy} from './herd-economy.ts';
import {createProduction,settleProduction,PRODUCTION_RULES,type ProductionState} from './v6-production.ts';
import {RAID_RULES,raidDay,raidRisk,type RaidCycle} from './raid-cycle.ts';

type Send=(type:string,extra?:Record<string,unknown>)=>void;
type CycleAnimal=EstateAnimal&{husbandry?:AnimalHusbandry};
type CycleProfile=Profile&{economy?:HerdEconomy;production?:ProductionState;raidCycle?:RaidCycle;upgrades?:{guardians:Record<GuardianKind,number>;shelters:Record<string,number>}};
export type FarmCyclePanelProps={profile:Profile;now:number;busy:boolean;send:Send;onInspect?:(id:string)=>void;onCraft?:()=>void};
const COLORS:Record<Tier,string>={white:'白',green:'绿',blue:'蓝',red:'红',gold:'金'};
const GUARDIANS:GuardianKind[]=['dog','cat','frog'];
const PORTRAITS:Record<GuardianKind,string>={dog:'sword-shield-dog',cat:'miaocuijiao',frog:'milk-frog'};
const level=(value:number|undefined)=>Math.max(1,Math.min(3,Math.floor(value??1)));
const woolStyle=(tier:Tier)=>({'--wool-color':TIER_COLOR[tier]} as CSSProperties);
const husbandry=(a:CycleAnimal,now:number,profile:'home'|'lab'='home')=>a.husbandry??createHusbandry(now,profile,a.life,a.appearance);
const guardianEffect=(kind:GuardianKind,n:number)=>{const rule=guardianUpgradeRules(kind,n);return kind==='dog'?`守住${rule.duration}秒`:kind==='cat'?`看见${rule.sight}格 · 归拢${rule.range}格`:`安抚${rule.range}格 · ${rule.duration}秒`;};
/** Hold an intent until its snapshot/busy lifecycle changes, including same-frame double taps. */
function useIntent(busy:boolean,snapshot:unknown,send:Send){
 const submitted=useRef(false);useEffect(()=>{if(!busy)submitted.current=false;},[busy,snapshot]);
 return (type:string,extra?:Record<string,unknown>)=>{if(busy||submitted.current)return;submitted.current=true;send(type,extra);};
}

/** Optional detailed-care content, never automatically added to the small scene card. */
export function AnimalProduction({animal,now,busy,send,production,compact=false}:{animal:EstateAnimal;now:number;busy:boolean;send:Send;economy?:HerdEconomy;production?:ProductionState;compact?:boolean;blockedReason?:string}){
 const a=animal as CycleAnimal,act=useIntent(busy,animal,send);if(a.memorial)return null;
 const current=production?settleProduction(production,now):undefined,lots=current?.pending.filter(l=>l.animalId===a.id)??[],total=lots.reduce((n,l)=>n+l.amount,0),slot=current?.slots.some(s=>s.animalId===a.id);
 return <section className={`animal-production ${compact?'compact':''}`} data-animal-production={a.id}><div className="cycle-row"><b>Lv.{a.husbandry?.level??1} · 当前产物</b><span>{total}份羊毛</span></div><p className="cycle-muted">{current?(slot?'生产位 · 每12小时一批，每批2份白毛':'休息中 · 未占生产位'):'生产详情请打开产物面板'} · 原稀有标签保留</p>{lots.map(l=><p className="cycle-muted" key={l.id}>{COLORS[l.tier]}毛 {l.amount}份 · 第{l.cycle}周期</p>)}<button className="cycle-small-button" data-cycle-claim={a.id} disabled={busy||!total} onClick={()=>act('claimWool',{target:a.id})}>领取羊毛</button>{!compact&&<details className="cycle-more"><summary>生产与成长</summary><p>等级解锁全场稀有目标方向；原有稀有标签保留，纯标签培育消费已暂停。稀有度与财富不会提高来袭压力。</p><p>每位最多存6批白毛（12份）；等级不改变白毛产量。</p></details>}</section>;
}

export default function FarmCyclePanel({profile,now,busy,send,onInspect,onCraft}:FarmCyclePanelProps){
 const p=profile as CycleProfile,[tab,setTab]=useState<'products'|'defense'|'raids'>('products'),act=useIntent(busy,profile,send);
 const animals=p.animals.filter(a=>!a.memorial) as CycleAnimal[],economy:HerdEconomy=p.economy??{version:1,warehouse:emptyStacks()};
 const products=animals.map(a=>({animal:a,h:husbandry(a,now,p.id)}));
 const production=settleProduction(p.production??createProduction(now,p.id,animals.map(a=>a.id)),now),ready=production.pending.reduce((n,l)=>n+l.amount,0),risk=raidRisk(products.map(({animal,h})=>({id:animal.id,rarity:tierNumber(h.rarity)})));
 const capacity=[...new Map(shelterEntries(p.layout).map(entry=>[entry.buildingId,entry.capacity])).values()].reduce((a,b)=>a+b,0);
 const guarded=!!p.threat,pause=guarded?'等这次守护结束后再升级':p.layout.construction?'先等眼前设施建好':'';
 const adoptionReason=guarded?'等这次守护结束':p.layout.construction?'先等眼前设施建好':animals.length>=12?'小家已有12位住民':!p.milestones.includes('first-meal')?'先照顾好大家的第一顿':capacity<=animals.length?'先建一处保护区，留出安全位':p.materials<20?`还差${20-p.materials}材料`:'';
 const cycle=p.raidCycle,warning=cycle?.phase==='warning'||cycle?.phase==='ready',today=cycle?.history.filter(e=>e.day===raidDay(now)).length??0;
 return <div className="farm-cycle-panel" data-farm-cycle>
  <p className="cycle-loop"><Cloud size={13}/>收羊毛<ArrowRight size={11}/>做披风<ArrowRight size={11}/><Shield size={13}/>布置小家</p>
  {p.id==='lab'&&<p className="cycle-demo">独立演示档 · 生产周期30秒 · 来袭30–60在线秒</p>}
  <nav className="cycle-tabs" aria-label="农场经营">{(['products','defense','raids'] as const).map((id,i)=><button key={id} type="button" data-cycle-tab={id} aria-pressed={tab===id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{['产物','守护','来袭'][i]}</button>)}</nav>
  {tab==='products'&&<section data-cycle-section="products">
   <div className="cycle-row cycle-heading"><h3>{production.slots.length}/6 个生产位</h3><button className="cycle-small-button" data-cycle-command="claim-all" disabled={busy||ready===0} onClick={()=>act('claimWool')}>领取 {ready}份</button></div>
   <p className="cycle-muted">每12小时每位一批，每批2份白毛；当前每天{production.slots.length*4}份白毛。</p>
   <div className="cycle-slot-list">{animals.map(a=>{const selected=production.slots.some(s=>s.animalId===a.id);return <button key={a.id} aria-pressed={selected} disabled={busy||(!selected&&production.slots.length>=6)} onClick={()=>act('setProductionSlots',{animalIds:selected?production.slots.filter(s=>s.animalId!==a.id).map(s=>s.animalId):[...production.slots.map(s=>s.animalId),a.id]})}>{selected?'✓ ':''}{a.name}</button>;})}</div>
   <details className="cycle-more"><summary>批、份与换位规则</summary><p>1批＝2份白毛。每位最多存6批（12份），自然档72小时存满。最多6位时每天24份白毛。离线最多结算6周期；新增或换位从完整周期起，不补领。</p>{p.id==='lab'&&<p>独立演示档每30秒模拟一个12小时周期。</p>}</details>
   <h3>全场稀有目标</h3><p className="cycle-muted">{production.target?`${animals.find(a=>a.id===production.target!.animalId)?.name??'伙伴'} · ${COLORS[production.target.tier]}毛 ${production.rareProgress}/${PRODUCTION_RULES.rareCycles[production.target.tier]}周期`:'尚未选择'}{'nextTarget' in production?' · 已预约下周期切换':''}</p>
   <div className="cycle-rare-list">{animals.map(a=><div key={a.id}><button className="cycle-animal-name" disabled={!onInspect} onClick={()=>onInspect?.(a.id)}>{a.name}</button>{(['blue','red','gold'] as const).map((tier,i)=><button key={tier} data-rare-target={tier} disabled={busy||(a.husbandry?.level??1)<i+3} onClick={()=>act('setRareTarget',{target:a.id,tier})}>{COLORS[tier]} · Lv.{i+3}</button>)}</div>)}</div>
   <details className="cycle-more"><summary>稀有目标规则 · 试验值</summary><p>全场只选一个目标动物与颜色。蓝2、红6、金14周期产1份；下周期切换，进度按动物与颜色保留。累计照料等级Lv.3/4/5解锁蓝/红/金方向。</p><p>原稀有标签保留，纯标签培育消费暂停。稀有度、仓库财富不增加来袭压力。</p></details>
   <div className="cycle-row cycle-heading"><h3>羊毛仓库</h3>{onCraft&&<button className="cycle-small-button" data-craft onClick={onCraft}>做披风</button>}</div>
   <div className="cycle-wool-grid">{TIERS.map(tier=><article key={tier} data-wool-tier={tier} style={woolStyle(tier)}><Cloud size={23}/><b>{COLORS[tier]}毛</b><strong>{economy.warehouse[tier]}份</strong><small>{({white:'披风与旗面',green:'路标',blue:'优先留给狗盾',red:'保留给后续配方',gold:'永久签名'})[tier]}</small></article>)}</div>
   <button className="cycle-small-button" data-process-green disabled={busy||economy.warehouse.white<2} onClick={()=>act('processGreen',{amount:1})}>2白 → 1绿</button>
   <details className="cycle-more"><summary>来源与旧版兑换权</summary><p>新版毛优先用于制作。旧版毛保留白1、绿2、蓝4、红7、金12材料兑换权；每次兑换1份。</p>{TIERS.map(tier=>{const legacy=economy.lots?.filter(l=>l.tier===tier&&l.version==='legacy').reduce((n,l)=>n+l.amount,0)??0;return <div className="cycle-row" key={tier}><span>旧版{COLORS[tier]}毛 {legacy}份</span><button data-exchange-tier={tier} disabled={busy||!legacy} onClick={()=>act('exchangeWool',{tier,amount:1,woolVersion:'legacy'})}>兑换 · {TIER_VALUE[tier]}材料</button></div>;})}{economy.lots?.map(l=><p className="cycle-muted" key={l.id}>{l.version==='legacy'?'旧版':'新版'} · {l.animalId?animals.find(a=>a.id===l.animalId)?.name??l.animalId:'旧仓库'} · {COLORS[l.tier]}毛 {l.amount}份 · {l.source==='rare-target'?'稀有目标':l.source==='production'?'生产位':l.source==='processing'?'加工':l.version==='legacy'?'历史库存':'制作返还'}</p>)}</details>
   <div className="cycle-adopt"><div><b>迎接新小羊</b><small>{animals.length}/12 位住民 · {Math.max(0,capacity-animals.length)}个空安全位</small></div><button className="cycle-small-button" data-cycle-command="adopt" disabled={busy||!!adoptionReason} onClick={()=>act('adopt',{expectedCount:animals.length})}><Plus size={13}/>20材料</button></div>{adoptionReason&&<p className="cycle-muted">{adoptionReason}</p>}
  </section>}
  {tab==='defense'&&<section data-cycle-section="defense">
   <p className="cycle-muted">现有 {p.materials} 材料 · 守护者与围栏各自升级</p>{pause&&<p className="cycle-pause" role="status">{pause}</p>}
   <div className="cycle-guardians">{GUARDIANS.map(kind=>{const current=level(p.upgrades?.guardians[kind]),cost=current===1?24:48,max=current===3;return <article key={kind}><img src={`/avatars/portraits/${PORTRAITS[kind]}.webp`} alt=""/><div><b>{GUARDIAN_LABEL[kind]} <span>Lv.{current}{p.guardian===kind?' · 在岗':''}</span></b><small>{guardianEffect(kind,current)}{!max&&<> → {guardianEffect(kind,current+1)}</>}</small><button className="cycle-small-button" data-upgrade-guardian={kind} disabled={busy||!!pause||max||p.materials<cost} onClick={()=>act('upgradeGuardian',{guardian:kind,expectedLevel:current})}>{max?'已满级':p.materials<cost?`还差${cost-p.materials}材料`:`升级 · ${cost}材料`}</button></div></article>;})}</div>
   <div className="cycle-shelters">{p.layout.buildings.filter(b=>b.kind==='shelter').map((building,i)=>{const current=level(p.upgrades?.shelters[building.id]),cost=current===1?16:32,max=current===3,speed=shelterDoorService(current).toFixed(1).replace('.0',''),next=shelterDoorService(current+1).toFixed(1);return <article key={building.id}><House size={24}/><div><b>保护区 {i+1} · Lv.{current}</b><small>{building.capacity}个安全位 · 进门{speed}秒{!max&&` → ${next}秒`}</small><button className="cycle-small-button" data-upgrade-shelter={building.id} disabled={busy||!!pause||max||p.materials<cost} onClick={()=>act('upgradeShelter',{buildingId:building.id,expectedLevel:current})}>{max?'已满级':p.materials<cost?`还差${cost-p.materials}材料`:`升级入口 · ${cost}材料`}</button></div></article>;})}{!p.layout.buildings.some(b=>b.kind==='shelter')&&<p className="cycle-muted">先建一处保护区，给小羊留好安全位置。</p>}</div>
   <p className="cycle-muted">入口更快，安全位数量不变；路线太远仍需调整布局。</p>
  </section>}
  {tab==='raids'&&<section data-cycle-section="raids">
   <div className={`cycle-risk ${warning?'warning':''}`}><TriangleAlert size={22}/><div><b>{warning?'远处有猛兽靠近':p.threat?(p.threat.phase==='complete'?'这次守护已经结束':'伙伴正在守护小家'):'山谷暂时平静'}</b><span>{warning?cycle?.phase==='ready'?'在远处徘徊，等待可行路线':`预警还剩${Math.ceil((cycle?.warningMs??0)/1000)}在线秒`:cycle?.blockedBy?'这一轮安全休息中':`当前压力：${risk.band==='high'?'高':risk.band==='medium'?'中':'低'}`}</span></div></div>
   <div className="cycle-risk-facts"><p><b>{risk.count} 位动物</b><span>安心区固定1只狼，约8–14在线分钟一轮；稀有度与财富不增压。</span></p><p><b>通常 {risk.wolves} 只狼</b><span>先有{RAID_RULES.warningMs/1000}秒预警，再沿真实道路靠近。</span></p><p><b>每天在线可能多次</b><span>离线不补算袭击，后台暂停危险；默认不会永久失去动物。</span></p></div>
   <div className="cycle-raid-steps"><span>听见预警</span><ArrowRight size={12}/><span>伙伴守护</span><ArrowRight size={12}/><span>动物回围栏</span></div>
   <button className="cycle-link" type="button" onClick={()=>setTab('defense')}>看看还能加强哪处保护 <ArrowRight size={12}/></button>
   <details className="cycle-more"><summary>来袭规则与当前试验值</summary><p>照顾完第一顿后开始计时。{p.id==='lab'?'演示档每30–60在线秒抽取一个间隔。':`按当前动物情况，间隔约${Math.round(risk.minIntervalMs/60_000)}–${Math.round(risk.maxIntervalMs/60_000)}在线分钟，具体时机不固定。`}稀有度、羊毛与材料财富不会增加来袭压力。</p><p>今天已发生 {today} 次；每日最多{RAID_RULES.dayCap}次，每在线小时最多{RAID_RULES.onlineHourCap}次。不会因刷新重新抽取时机。</p><p>守护者能力、入口速度、保护位和实际路径一起决定疏散结果。缺少合法预警路线时推迟来袭。</p></details>
  </section>}
 </div>;
}
