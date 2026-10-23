import {fishingWaitRange} from './fishing-time.js';
import {ECONOMY,TIER_LABELS} from './economy.js';
import {SPECIES_BY_ID} from './catalogue.js';
import {PLANT_STANDARD_METRES} from '../art/plant-sizing.js';
export function sizeLabel(item){return item.kind==='fish'?`大小 ${item.finalSize.toFixed(1)}cm`:`高 ${Math.round(100*PLANT_STANDARD_METRES[item.speciesId]*item.finalSize/item.standardSize)}cm`;}
export function inputFacts(kind,tier,firstPlantStarted=true){const i=tier-1,seconds=kind==='seed'&&tier===1&&!firstPlantStarted?ECONOMY.firstPlantSeconds:ECONOMY.growSeconds[i],upgrade=ECONOMY.upgradeChance[i]*100;return {seconds,wait:kind==='bait'?`${fishingWaitRange(tier).join('–')}秒内上钩`:seconds<60?`${seconds}秒`:`${seconds/60}分钟`,chance:upgrade?`${TIER_LABELS[i]} ${100-upgrade}% · ${TIER_LABELS[i+1]} ${upgrade}%`:`${TIER_LABELS[i]} 100%`,mutation:`原生 ${100-(ECONOMY.mutationChance.giant+ECONOMY.mutationChance.gold)*100}% · 巨型 ${ECONOMY.mutationChance.giant*100}% · 金色 ${ECONOMY.mutationChance.gold*100}%`};}
export function activityLabel(entry){const name=entry.byName||'朋友',object=SPECIES_BY_ID[entry.speciesId]?.name||'一件收获';return entry.kind==='gift'?`${name}送来了一件${object}`:`${name}${SPECIES_BY_ID[entry.speciesId]?.kind==='fish'?'钓走':'摘走'}了${object}`;}

export const displayActionLabel=item=>item.kind==='fish'?'放进鱼缸':'摆在岛上';
