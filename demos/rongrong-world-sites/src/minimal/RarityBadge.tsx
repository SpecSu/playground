import {ANIMAL_RARITIES,RARITY_LABELS,RARITY_SYMBOLS,RARITY_PROBABILITIES,rarityOf,type AnimalRarity} from './animal-rarity.ts';
import {PanelHelp} from './PanelHelp.tsx';
import './rarity.css';
export function RarityBadge({rarity,fixed=false}:{rarity?:AnimalRarity;fixed?:boolean}){
 const value=rarityOf(rarity);return <span className={`rarity-badge rarity-${value}`} aria-label={`个体品质：${RARITY_LABELS[value]}${fixed?' · 固定样例':''}`}><span aria-hidden="true">{RARITY_SYMBOLS[value]}</span>{RARITY_LABELS[value]}{fixed&&<small>固定</small>}</span>;
}
export function RarityHelp(){return <PanelHelp title="个体品质与概率"><p>每个物种都有五档个体品质，与体型、性别和生态类别无关。</p><ul className="rarity-probabilities">{ANIMAL_RARITIES.map(rarity=><li key={rarity}><RarityBadge rarity={rarity}/><b>{Math.round(RARITY_PROBABILITIES[rarity]*100)}%</b></li>)}</ul><p>新动物蛋取得时确定一次，收回、孵化、交换不会重抽。品质不额外增加金币或成长速度。</p><p>旧伙伴与旧蛋默认白色；创作工坊的固定样例也是白色，不参与随机品质。</p></PanelHelp>;}
