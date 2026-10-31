import {useId} from 'react';
import {RarityHelp} from './RarityBadge.tsx';
import {Egg,LockKeyhole,MapPin,Check} from 'lucide-react';
import {SPECIES_LABELS,type MinimalState,type Point} from './model.ts';
import {EGG_THEMES,EGG_THEME_LABELS,eggPurchaseAvailability,type EggTheme} from './egg-catalog.ts';
import {naturalBiomeTarget} from './terrain-progression.ts';
import './egg-shop-catalog.css';
export default function EggShopCatalog({state,disabledReason,onBuy,onExplore}:{state:MinimalState;disabledReason:string;onBuy:(theme:EggTheme)=>void;onExplore:(point:Point)=>void}){
 const id=useId();
 return <div className="egg-theme-catalog" aria-label="生态动物蛋"><div className="egg-theme-catalog-heading"><h2>蛋蛋小铺</h2><RarityHelp/></div>{EGG_THEMES.map(theme=>{
  const purchase=eggPurchaseAvailability(state,theme,undefined,disabledReason),{offer}=purchase,target=offer.explored?null:naturalBiomeTarget(state,theme),name=EGG_THEME_LABELS[theme],reasonId=`${id}-${theme}-reason`;
  return <article key={theme} data-egg-theme={theme} data-purchase-state={purchase.code} className={`egg-theme-card theme-${theme}${purchase.available?'':' is-locked'}`}><div className="egg-theme-title"><Egg size={24} aria-hidden="true"/><h3>{name}动物蛋</h3><span>{purchase.available?<><Check size={13} aria-hidden="true"/>可购买</>:<><LockKeyhole size={13} aria-hidden="true" data-purchase-lock/>{offer.explored?'已探索 · 暂锁定':'未探索'}</>}</span></div>
   {offer.contentReady?<p className="egg-theme-pool">可孵出：{offer.species.map(s=>SPECIES_LABELS[s]).join('、')}</p>:<p className="egg-theme-preparing">伙伴尚未就绪</p>}
   <button type="button" className="egg-primary" data-buy-theme={theme} disabled={!purchase.available} aria-describedby={purchase.available?undefined:reasonId} aria-label={`购买${name}动物蛋`} onClick={()=>{if(purchase.available)onBuy(theme);}}>买一颗 · {offer.price}</button>
   {!purchase.available&&<small id={reasonId} className="egg-theme-lock-reason">{purchase.reason}</small>}
   {target?<button type="button" className="egg-theme-explore" onClick={()=>onExplore(target)}><MapPin size={15} aria-hidden="true"/>查看{name}目标</button>:!offer.explored?<small>暂无可达的探索目标</small>:null}
  </article>;
 })}</div>;
}
