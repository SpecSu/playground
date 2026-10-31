import {ArrowUp,Droplets,Leaf,TreePine,Wheat,X} from 'lucide-react';
import type {MinimalState,Tile} from './model.ts';
import {farmSupply,tileLevel,tileSupply,terrainUpgradeCost,TERRAIN_QUALITY_LABELS,type SupplyVector} from './terrain-supply.ts';
import SimpleFarmSheet from './SimpleFarmSheet.tsx';
import {PanelHelp} from './PanelHelp.tsx';
import './terrain-care.css';
const resources=[{key:'food',label:'青草',Icon:Wheat},{key:'water',label:'饮水',Icon:Droplets},{key:'rest',label:'休憩',Icon:TreePine}] as const;
export const growthRateLabel=(rate:number)=>`${Math.round(rate*1000)/10}%`;
export function SupplyChips({supply}:{supply:SupplyVector}){return <div className="terrain-supply-chips">{resources.filter(r=>supply[r.key]>0).map(({key,label,Icon})=><span key={key} className={`supply-${key}`}><Icon size={16} aria-hidden="true"/>{label} +{supply[key]}</span>)}</div>;}
export function TerrainUpgrade({tile,state,onUpgrade}:{tile:Tile;state:MinimalState;onUpgrade:(level:2|3)=>void}){
 const level=tileLevel(tile),cost=terrainUpgradeCost(tile),supply=tileSupply(tile),farm=farmSupply(state);
 if(tile.terrain==='desert'||tile.terrain==='glacier')return <div className="terrain-upgrade"><b>Lv.{level} · 原养护等级保留</b><p>此地形不提供额外照料容量，无需付费养护。</p><small>改回草地等地形后，原等级继续生效。</small></div>;
 const full=resources.filter(r=>supply[r.key]>0).every(r=>farm.satisfaction[r.key]>=1);
 const next=level===1?2:3,delta=tileSupply({...tile,level:next});
 for(const key of ['food','water','rest'] as const)delta[key]-=supply[key];
 return <div className="terrain-upgrade"><div className="terrain-quality"><Leaf size={15} aria-hidden="true"/><b>Lv.{level} · {TERRAIN_QUALITY_LABELS[level]}</b><PanelHelp title="养护说明"><p>这块地的自动供给容量。</p><p>补足供给，有助伙伴成长；最多加快 20%。当前够用时，升级只为更多伙伴预留容量。</p><p>养护升级消耗金币，不增加土地面积。升级前须孵出第一位伙伴。</p></PanelHelp></div><div className="terrain-upgrade-capacity"><span>供给</span><SupplyChips supply={supply}/></div>{cost!==null?<><div className="terrain-upgrade-preview"><span>Lv.{next}</span><SupplyChips supply={delta}/><span className="terrain-upgrade-status">{full?'当前够用':'供给不足'}</span></div><button className="terrain-upgrade-action" disabled={!state.hatchedCount||state.coins<cost} onClick={()=>onUpgrade(next)}><ArrowUp size={17} aria-hidden="true"/>{!state.hatchedCount?'孵化后解锁':state.coins<cost?`还差 ${cost-state.coins} 金币`:`升级 · ${cost} 金币`}</button></>:<span className="terrain-upgrade-max">已是珍景 · Lv.3</span>}</div>;
}
export function TerrainCareSheet({state,onClose,onEdit}:{state:MinimalState;onClose:()=>void;onEdit:()=>void}){
 const supply=farmSupply(state);
 return <SimpleFarmSheet label="牧场自动照料" onClose={onClose}><header><h2>自动照料</h2><div className="terrain-care-header-actions"><button className="egg-round" aria-label="关闭自动照料" onClick={onClose}><X size={20}/></button><PanelHelp title="照料说明"><p>这是持续供给的容量，不是会喝光、吃完的库存。草地供青草，溪流与池塘供饮水，林地和丘陵供休憩。</p><p>可到达的土地才计入照料；池塘从连通的岸边供水。基础照料始终保留，不足只会少一点加速，不会饿坏伙伴。</p><p>开辟、换风景或养护升级，都能增加容量。已够用的类别不会重复加速；原有旧版伙伴保留原成长节奏。</p></PanelHelp></div></header><div className="terrain-care-summary"><Leaf size={24} aria-hidden="true"/><div><small>成长加速</small><b>+{growthRateLabel(supply.growthBonusRate)}</b></div><span>{supply.animals} 只动物</span></div><div className="terrain-care-resources">{resources.map(({key,label,Icon})=><div className={`terrain-care-resource supply-${key}`} key={key}><Icon size={24} aria-hidden="true"/><div><b>{label}</b><small>容量 {supply.capacity[key]} / 需求 {supply.animals}</small><span className="terrain-capacity-track" role="progressbar" aria-label={`${label}满足率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(supply.satisfaction[key]*100)}><i style={{width:`${supply.satisfaction[key]*100}%`}}/></span></div><strong>{Math.round(supply.satisfaction[key]*100)}%</strong></div>)}</div><button className="egg-primary terrain-care-edit" onClick={onEdit}><Leaf size={18} aria-hidden="true"/>布置土地</button></SimpleFarmSheet>;
}
