import {Egg,PackageOpen,Sparkles} from 'lucide-react';
import {SPECIES_LABELS,type FarmEgg,type MinimalState} from './model.ts';
import {EGG_THEME_LABELS} from './egg-catalog.ts';
import {eggIncubationStatus} from './egg-incubation.ts';
import {RarityBadge} from './RarityBadge.tsx';
export default function EggIncubationPanel({state,egg,walking,far,onHatch,onCollect}:{state:MinimalState;egg:FarmEgg;walking:boolean;far:boolean;onHatch:()=>void;onCollect:()=>void}){
 const status=eggIncubationStatus(state,egg),habitat=EGG_THEME_LABELS[egg.theme??'grassland'];
 return <><div className="egg-shop-heading"><span className="egg-painted"><Egg size={35}/></span><div><h2>{egg.source==='bred'?`${SPECIES_LABELS[egg.species]}蛋`:`${habitat}动物蛋`}</h2><RarityBadge rarity={egg.rarity}/><p>{walking?'LX 正在走近这颗蛋…':far?'点这颗蛋继续走近':status.paused?'孵化暂停':status.ready?'可孵化':`再等 ${Math.max(1,Math.ceil(status.remainingMs/1000))} 秒`}</p></div></div>{status.paused&&<div className="egg-incubation-whisper" role="status"><b>这里不太适合我…</b><span>想去{habitat} · 收回换个地方，进度还在</span></div>}<div className="egg-incubation-actions">{status.ready&&<button className="egg-primary" disabled={walking||far} onClick={onHatch}><Sparkles size={19}/>孵化</button>}<button type="button" disabled={walking||far} onClick={onCollect}><PackageOpen size={17}/>收回蛋袋</button></div></>;
}
