import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Shield,House,TriangleAlert} from 'lucide-react';
import type {EstateAnimal,Profile} from './estate.ts';
import {GUARDIAN_LABEL} from './estate.ts';
import {guardianUpgradeRules,shelterDoorService,type GuardianKind} from './threat.ts';
import {tierNumber,createHusbandry,type AnimalHusbandry,type HerdEconomy} from './herd-economy.ts';
import {type ProductionState} from './v6-production.ts';
import MarketPanel from '../v7/MarketPanel.tsx';
import ResourceIcon from '../v7/ResourceIcon.tsx';
import {productionStatus} from './v7-economy.ts';
import {RAID_RULES,raidDay,raidRisk,type RaidCycle} from './raid-cycle.ts';

type Send=(type:string,extra?:Record<string,unknown>)=>void;
type CycleAnimal=EstateAnimal&{husbandry?:AnimalHusbandry};
type CycleProfile=Profile&{economy?:HerdEconomy;production?:ProductionState;raidCycle?:RaidCycle;upgrades?:{guardians:Record<GuardianKind,number>;shelters:Record<string,number>}};
export type FarmCyclePanelProps={profile:Profile;now:number;busy:boolean;send:Send;onInspect?:(id:string)=>void;onCraft?:()=>void};
const COLORS:Record<import('./herd-economy.ts').MaterialTier,string>={white:'白',green:'绿',blue:'蓝',red:'红',gold:'金'};
const GUARDIANS:GuardianKind[]=['dog','cat','frog'];
const PORTRAITS:Record<GuardianKind,string>={dog:'sword-shield-dog',cat:'miaocuijiao',frog:'milk-frog'};
const level=(value:number|undefined)=>Math.max(1,Math.min(3,Math.floor(value??1)));
const husbandry=(a:CycleAnimal,now:number,profile:'home'|'lab'='home')=>a.husbandry??createHusbandry(now,profile,a.life,a.appearance);
const guardianEffect=(kind:GuardianKind,n:number)=>{const rule=guardianUpgradeRules(kind,n);return kind==='dog'?`守住${rule.duration}秒`:kind==='cat'?`看见${rule.sight}格 · 归拢${rule.range}格`:`安抚${rule.range}格 · ${rule.duration}秒`;};
/** Hold an intent until its snapshot/busy lifecycle changes, including same-frame double taps. */
function useIntent(busy:boolean,snapshot:unknown,send:Send){
 const submitted=useRef(false);useEffect(()=>{if(!busy)submitted.current=false;},[busy,snapshot]);
 return (type:string,extra?:Record<string,unknown>)=>{if(busy||submitted.current)return;submitted.current=true;send(type,extra);};
}

/** Optional detailed-care content, never automatically added to the small scene card. */
export function AnimalProduction({animal,busy,send,production,profile,compact=false}:{animal:EstateAnimal;now:number;busy:boolean;send:Send;economy?:HerdEconomy;production?:ProductionState;profile?:Profile;compact?:boolean;blockedReason?:string}){
 const a=animal as CycleAnimal,act=useIntent(busy,profile??animal,send);if(a.memorial)return null;
 const status=profile?productionStatus(profile,a.id):undefined,lots=(profile?.production??production)?.pending.filter(l=>l.animalId===a.id)??[],total=lots.reduce((n,l)=>n+l.amount,0),tier=status?.tier??a.husbandry?.rarity??'white';
 return <section className={`animal-production ${compact?'compact':''}`} data-animal-production={a.id}><div className="cycle-row"><b><ResourceIcon kind="wool" tier={tier} size={23}/>{COLORS[tier]}色稀有度 · {COLORS[tier]}毛</b><span>{total}份待领</span></div><p className="cycle-muted">稀有度决定产色{status?` · 每批${status.quantity}份 · 耗生产粮${status.feedPerCycle}份`:''}</p>{status&&<p className="cycle-muted">{({ready:'正常生产',feed:'缺生产粮，暂停生产',injury:'受伤停产，需要照料',lost:'走失停产，需要营救',shelter:'缺可达安全床位，暂停生产',full:'已存满6批',memorial:'已纪念',event:'守护事件中，暂停生产'})[status.reason]}</p>}<button className="cycle-small-button" data-cycle-claim={a.id} disabled={busy||!total||!!profile?.threat&&profile.threat.phase!=='complete'} onClick={()=>act('claimWool',{target:a.id})}>领取羊毛</button>{!compact&&<details className="cycle-more"><summary>生产与成长</summary><p>每{profile?.id==='lab'?'30秒':'12小时'}一批，基础2份；成长与有效照料增加产量，最多4份。每只最多存6批。</p><p>缺粮、受伤、走失或缺可达安全床位时停产，不补发停产周期。动物数量与稀有度会影响来袭压力。</p></details>}</section>;
}

export default function FarmCyclePanel({profile,now,busy,send,onInspect,onCraft}:FarmCyclePanelProps){
 const p=profile as CycleProfile,[tab,setTab]=useState<'products'|'defense'|'raids'>('products'),act=useIntent(busy,profile,send);
 const animals=p.animals.filter(a=>!a.memorial) as CycleAnimal[];
 const products=animals.map(a=>({animal:a,h:husbandry(a,now,p.id)}));
 const risk=raidRisk(products.map(({animal,h})=>({id:animal.id,rarity:tierNumber(h.rarity)})));
 const guarded=!!p.threat,pause=guarded?'等这次守护结束后再升级':p.layout.construction?'先等眼前设施建好':'';
 const cycle=p.raidCycle,warning=cycle?.phase==='warning'||cycle?.phase==='ready',today=cycle?.history.filter(e=>e.day===raidDay(now)).length??0;
 return <div className="farm-cycle-panel" data-farm-cycle>
  <p className="cycle-loop"><ResourceIcon kind="wool" size={20}/>收羊毛<ArrowRight size={11}/>做披风<ArrowRight size={11}/><Shield size={13}/>布置小家</p>
  {p.id==='lab'&&<p className="cycle-demo">独立演示档 · 生产周期30秒 · 来袭30–60在线秒</p>}
  <nav className="cycle-tabs" aria-label="农场经营">{(['products','defense','raids'] as const).map((id,i)=><button key={id} type="button" data-cycle-tab={id} aria-pressed={tab===id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{['产物','守护','来袭'][i]}</button>)}</nav>
  {tab==='products'&&<section data-cycle-section="products"><MarketPanel profile={p} now={now} busy={busy} send={send} onInspect={onInspect} onCraft={onCraft}/></section>}
  {tab==='defense'&&<section data-cycle-section="defense">
   <p className="cycle-muted">现有 {p.materials} 金币 · 守护者与围栏各自升级</p>{pause&&<p className="cycle-pause" role="status">{pause}</p>}
   <div className="cycle-guardians">{GUARDIANS.map(kind=>{const current=level(p.upgrades?.guardians[kind]),cost=current===1?24:48,max=current===3;return <article key={kind}><img src={`/avatars/portraits/${PORTRAITS[kind]}.webp`} alt=""/><div><b>{GUARDIAN_LABEL[kind]} <span>Lv.{current}{p.guardian===kind?' · 在岗':''}</span></b><small>{guardianEffect(kind,current)}{!max&&<> → {guardianEffect(kind,current+1)}</>}</small><button className="cycle-small-button" data-upgrade-guardian={kind} disabled={busy||!!pause||max||p.materials<cost} onClick={()=>act('upgradeGuardian',{guardian:kind,expectedLevel:current})}>{max?'已满级':p.materials<cost?`还差${cost-p.materials}金币`:`升级 · ${cost}金币`}</button></div></article>;})}</div>
   <div className="cycle-shelters">{p.layout.buildings.filter(b=>b.kind==='shelter').map((building,i)=>{const current=level(p.upgrades?.shelters[building.id]),cost=current===1?16:32,max=current===3,speed=shelterDoorService(current).toFixed(1).replace('.0',''),next=shelterDoorService(current+1).toFixed(1);return <article key={building.id}><House size={24}/><div><b>保护区 {i+1} · Lv.{current}</b><small>{building.capacity}个安全位 · 进门{speed}秒{!max&&` → ${next}秒`}</small><button className="cycle-small-button" data-upgrade-shelter={building.id} disabled={busy||!!pause||max||p.materials<cost} onClick={()=>act('upgradeShelter',{buildingId:building.id,expectedLevel:current})}>{max?'已满级':p.materials<cost?`还差${cost-p.materials}金币`:`升级入口 · ${cost}金币`}</button></div></article>;})}{!p.layout.buildings.some(b=>b.kind==='shelter')&&<p className="cycle-muted">先建一处保护区，给小羊留好安全位置。</p>}</div>
   <p className="cycle-muted">入口更快，安全位数量不变；路线太远仍需调整布局。</p>
  </section>}
  {tab==='raids'&&<section data-cycle-section="raids">
   <div className={`cycle-risk ${warning?'warning':''}`}><TriangleAlert size={22}/><div><b>{warning?'远处有猛兽靠近':p.threat?(p.threat.phase==='complete'?'这次守护已经结束':'伙伴正在守护小家'):'山谷暂时平静'}</b><span>{warning?cycle?.phase==='ready'?'在远处徘徊，等待可行路线':`预警还剩${Math.ceil((cycle?.warningMs??0)/1000)}在线秒`:cycle?.blockedBy?'这一轮安全休息中':`当前压力：${risk.band==='high'?'高':risk.band==='medium'?'中':'低'}`}</span></div></div>
   <div className="cycle-risk-facts"><p><b>{risk.count} 位动物</b><span>动物越多、越稀有，来袭压力越高；金币和库存不加压。</span></p><p><b>通常 {risk.wolves} 只狼</b><span>先有{RAID_RULES.warningMs/1000}秒预警，再沿真实道路靠近。</span></p><p><b>每天在线可能多次</b><span>离线不补算袭击，后台暂停危险；受伤与走失会停产，照料或营救后恢复。</span></p></div>
   <div className="cycle-raid-steps"><span>听见预警</span><ArrowRight size={12}/><span>伙伴守护</span><ArrowRight size={12}/><span>动物回围栏</span></div>
   <button className="cycle-link" type="button" onClick={()=>setTab('defense')}>看看还能加强哪处保护 <ArrowRight size={12}/></button>
   <details className="cycle-more"><summary>来袭规则与当前试验值</summary><p>照顾完第一顿后开始计时。{p.id==='lab'?'演示档每30–60在线秒抽取一个间隔。':`自然档间隔约${Math.round(risk.minIntervalMs/60_000)}–${Math.round(risk.maxIntervalMs/60_000)}在线分钟，具体时机不固定。`}数量与稀有度决定压力；金币和库存不加压。</p><p>今天已发生 {today} 次；每日最多{RAID_RULES.dayCap}次，每在线小时最多{RAID_RULES.onlineHourCap}次。不会因刷新重新抽取时机。</p><p>守护者能力、入口速度、保护位和实际路径一起决定疏散结果。缺少合法预警路线时推迟来袭。</p></details>
  </section>}
 </div>;
}
