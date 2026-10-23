import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Cloud,ArrowRight,Shield,House,Leaf,TriangleAlert,Plus} from 'lucide-react';
import type {EstateAnimal,Profile} from './estate.ts';
import {GUARDIAN_LABEL} from './estate.ts';
import {guardianUpgradeRules,shelterDoorService,type GuardianKind} from './threat.ts';
import {shelterEntries} from './layout.ts';
import {TIERS,TIER_LABEL,TIER_COLOR,TIER_VALUE,tierNumber,createHusbandry,productSummary,cultivationPreview,emptyStacks,type MaterialTier as Tier,type AnimalHusbandry,type HerdEconomy} from './herd-economy.ts';
import {RAID_RULES,raidDay,raidRisk,type RaidCycle} from './raid-cycle.ts';

type Send=(type:string,extra?:Record<string,unknown>)=>void;
type CycleAnimal=EstateAnimal&{husbandry?:AnimalHusbandry};
type CycleProfile=Profile&{economy?:HerdEconomy;raidCycle?:RaidCycle;upgrades?:{guardians:Record<GuardianKind,number>;shelters:Record<string,number>}};
export type FarmCyclePanelProps={profile:Profile;now:number;busy:boolean;send:Send;onInspect?:(id:string)=>void};
const COLORS:Record<Tier,string>={white:'白',green:'绿',blue:'蓝',red:'红',gold:'金'};
const GUARDIANS:GuardianKind[]=['dog','cat','frog'];
const PORTRAITS:Record<GuardianKind,string>={dog:'sword-shield-dog',cat:'miaocuijiao',frog:'milk-frog'};
const level=(value:number|undefined)=>Math.max(1,Math.min(3,Math.floor(value??1)));
const woolStyle=(tier:Tier)=>({'--wool-color':TIER_COLOR[tier]} as CSSProperties);
const husbandry=(a:CycleAnimal,now:number,profile:'home'|'lab'='home')=>a.husbandry??createHusbandry(now,profile,a.life,a.appearance);
const duration=(ms:number|null)=>{if(ms===null)return '已存满';const seconds=Math.ceil(ms/1000);return seconds<60?`${seconds}秒`:`${Math.floor(seconds/60)}分${seconds%60}秒`;};
const guardianEffect=(kind:GuardianKind,n:number)=>{const rule=guardianUpgradeRules(kind,n);return kind==='dog'?`守住${rule.duration}秒`:kind==='cat'?`看见${rule.sight}格 · 归拢${rule.range}格`:`安抚${rule.range}格 · ${rule.duration}秒`;};
/** Hold an intent until its snapshot/busy lifecycle changes, including same-frame double taps. */
function useIntent(busy:boolean,snapshot:unknown,send:Send){
 const submitted=useRef(false);useEffect(()=>{if(!busy)submitted.current=false;},[busy,snapshot]);
 return (type:string,extra?:Record<string,unknown>)=>{if(busy||submitted.current)return;submitted.current=true;send(type,extra);};
}
function TierMark({tier}:{tier:Tier}){return <span className="cycle-tier" style={woolStyle(tier)}><Cloud size={14}/>{COLORS[tier]} · {TIER_LABEL[tier]}</span>;}

/** Optional detailed-care content, never automatically added to the small scene card. */
export function AnimalProduction({animal,now,busy,send,economy,compact=false,blockedReason}:{animal:EstateAnimal;now:number;busy:boolean;send:Send;economy?:HerdEconomy;compact?:boolean;blockedReason?:string}){
 const a=animal as CycleAnimal,h=husbandry(a,now,a.life.ageMultiplier===240?'lab':'home'),summary=productSummary(h,now),act=useIntent(busy,animal,send);
 const wallet:HerdEconomy=economy??{version:1,warehouse:emptyStacks()},cultivation=cultivationPreview(h,wallet);
 if(a.memorial)return null;
 return <section className={`animal-production ${compact?'compact':''}`} data-animal-production={a.id}>
  <div className="cycle-row"><b>Lv.{summary.level} · 羊毛</b><TierMark tier={summary.tier}/></div>
  <p className="cycle-muted">稀有度：{TIER_LABEL[summary.rarity]}（{COLORS[summary.rarity]}） · 已积累 {summary.total}/{summary.cap}</p>
  <div className="cycle-row"><span className="cycle-muted">{summary.full?'小羊等你来收获':`下一份 ${duration(summary.nextReadyInMs)}`}</span><button className="cycle-small-button" data-cycle-claim={a.id} disabled={busy||summary.total===0} onClick={()=>act('claimWool',{target:a.id})}>领取羊毛</button></div>
  {!compact&&<><div className="cycle-cultivate"><span>{cultivation.nextRarity?<>培育为 <TierMark tier={cultivation.nextRarity}/></>:'已是传说稀有度'}</span>{cultivation.nextRarity&&<button className="cycle-small-button" data-cultivate={a.id} disabled={busy||!!blockedReason||!cultivation.ok} onClick={()=>act('cultivate',{target:a.id,expectedRarity:h.rarity})}>培育</button>}</div><p className="cycle-muted" role="status">{blockedReason||cultivation.message}</p><details className="cycle-more"><summary>等级和稀有度有什么用？</summary><p>有效喂养提升等级，决定羊毛等级。培育提升稀有度，也会提高来袭压力。幼崽、少年、成年是另一条成长线。</p><p>{h.profile==='lab'?'演示档每15秒':'自然档每10分钟'}一份，每只最多存6份；领取后继续积累。</p></details></>}
 </section>;
}

export default function FarmCyclePanel({profile,now,busy,send,onInspect}:FarmCyclePanelProps){
 const p=profile as CycleProfile,[tab,setTab]=useState<'products'|'defense'|'raids'>('products'),act=useIntent(busy,profile,send);
 const animals=p.animals.filter(a=>!a.memorial) as CycleAnimal[],economy:HerdEconomy=p.economy??{version:1,warehouse:emptyStacks()};
 const products=animals.map(a=>({animal:a,h:husbandry(a,now,p.id)})).map(item=>({...item,summary:productSummary(item.h,now)}));
 const ready=products.reduce((sum,item)=>sum+item.summary.total,0),risk=raidRisk(products.map(({animal,h})=>({id:animal.id,rarity:tierNumber(h.rarity)})));
 const capacity=[...new Map(shelterEntries(p.layout).map(entry=>[entry.buildingId,entry.capacity])).values()].reduce((a,b)=>a+b,0);
 const guarded=!!p.threat,pause=guarded?'等这次守护结束后再升级':p.layout.construction?'先等眼前设施建好':'';
 const adoptionReason=guarded?'等这次守护结束':p.layout.construction?'先等眼前设施建好':animals.length>=12?'小家已有12位住民':!p.milestones.includes('first-meal')?'先照顾好大家的第一顿':capacity<=animals.length?'先建一处保护区，留出安全位':p.materials<20?`还差${20-p.materials}材料`:'';
 const cycle=p.raidCycle,warning=cycle?.phase==='warning'||cycle?.phase==='ready',today=cycle?.history.filter(e=>e.day===raidDay(now)).length??0;
 return <div className="farm-cycle-panel" data-farm-cycle>
  <p className="cycle-loop"><Cloud size={13}/>收羊毛<ArrowRight size={11}/>换材料<ArrowRight size={11}/><Shield size={13}/>保护小家</p>
  {p.id==='lab'&&<p className="cycle-demo">独立演示档 · 产毛15秒 · 来袭30–60在线秒</p>}
  <nav className="cycle-tabs" aria-label="农场经营">{(['products','defense','raids'] as const).map((id,i)=><button key={id} type="button" data-cycle-tab={id} aria-pressed={tab===id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{['产物','守护','来袭'][i]}</button>)}</nav>
  {tab==='products'&&<section data-cycle-section="products">
   <div className="cycle-row cycle-heading"><h3>羊毛仓库</h3><button className="cycle-small-button" data-cycle-command="claim-all" disabled={busy||ready===0} onClick={()=>act('claimWool')}>领取 {ready} 份</button></div>
   <div className="cycle-wool-grid">{TIERS.map(tier=><article key={tier} data-wool-tier={tier} style={woolStyle(tier)}><Cloud size={23}/><b>{COLORS[tier]} · {TIER_LABEL[tier]}</b><strong>{economy.warehouse[tier]}</strong><button type="button" data-exchange-tier={tier} disabled={busy||economy.warehouse[tier]<1} onClick={()=>act('exchangeWool',{tier,amount:1})}><span>兑换1份</span><small>+{TIER_VALUE[tier]}材料</small></button></article>)}</div>
   <p className="cycle-muted">留下羊毛可以培育；换来的材料用于建设和升级。</p>
   <div className="cycle-animal-list">{products.map(({animal:a,summary})=><article key={a.id}><div><button className="cycle-animal-name" disabled={!onInspect} onClick={()=>onInspect?.(a.id)}>{a.name}<span>Lv.{summary.level} · {COLORS[summary.rarity]}色稀有度</span></button><small>{summary.total?`可领${summary.total}份`:`下一份 ${duration(summary.nextReadyInMs)}`}</small></div><TierMark tier={summary.tier}/></article>)}</div>
   <details className="cycle-more"><summary><Leaf size={13}/> 培育小伙伴</summary>{products.map(({animal:a})=><div className="cycle-animal-detail" key={a.id}><b>{a.name}</b><AnimalProduction animal={a} now={now} busy={busy} send={send} economy={economy} blockedReason={guarded?'等这次守护结束后再培育':undefined}/></div>)}</details>
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
   <div className="cycle-risk-facts"><p><b>{risk.count} 位动物</b><span>数量与稀有度越高，来袭越频繁、狼群越大。</span></p><p><b>通常 {risk.wolves} 只狼</b><span>先有{RAID_RULES.warningMs/1000}秒预警，再沿真实道路靠近。</span></p><p><b>每天在线可能多次</b><span>离线不补算袭击，后台暂停危险；默认不会永久失去动物。</span></p></div>
   <div className="cycle-raid-steps"><span>听见预警</span><ArrowRight size={12}/><span>伙伴守护</span><ArrowRight size={12}/><span>动物回围栏</span></div>
   <button className="cycle-link" type="button" onClick={()=>setTab('defense')}>看看还能加强哪处保护 <ArrowRight size={12}/></button>
   <details className="cycle-more"><summary>来袭规则与当前试验值</summary><p>照顾完第一顿后开始计时。{p.id==='lab'?'演示档每30–60在线秒抽取一个间隔。':`按当前动物情况，间隔约${Math.round(risk.minIntervalMs/60_000)}–${Math.round(risk.maxIntervalMs/60_000)}在线分钟，具体时机不固定。`}更稀有、更多动物需要更强保护。</p><p>今天已发生 {today} 次；每日最多{RAID_RULES.dayCap}次，每在线小时最多{RAID_RULES.onlineHourCap}次。不会因刷新重新抽取时机。</p><p>守护者能力、入口速度、保护位和实际路径一起决定疏散结果。缺少合法预警路线时推迟来袭。</p></details>
  </section>}
 </div>;
}
