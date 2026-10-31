import {useEffect,useRef,useState} from 'react';
import type {Profile} from '../v5/estate.ts';
import {TIERS,type MaterialTier} from '../v5/herd-economy.ts';
import {V7_RULES,v7Summary,previewHatch,productionStatus} from '../v5/v7-economy.ts';
import InventoryPanel from './InventoryPanel.tsx';
import ResourceIcon,{QUALITY} from './ResourceIcon.tsx';
type Send=(type:string,extra?:Record<string,unknown>)=>void;
const COLOR:Record<MaterialTier,string>={white:'白',green:'绿',blue:'蓝',red:'红',gold:'金'};
const BAND={low:'低',medium:'中',high:'高'};
export default function MarketPanel({profile:p,now,busy,send,onInspect,onCraft}:{profile:Profile;now:number;busy:boolean;send:Send;onInspect?:(id:string)=>void;onCraft?:()=>void}){
 const summary=v7Summary(p,now),[boxTier,setBoxTier]=useState<MaterialTier>('white'),[preview,setPreview]=useState<{boxId:string;value:ReturnType<typeof previewHatch>}|null>(null),lock=useRef(false);
 useEffect(()=>{if(!busy)lock.current=false;},[busy,p]);
 useEffect(()=>{if(preview&&p.v7?.eggs.some(egg=>egg.id===preview.boxId&&egg.status==='hatched'))setPreview(null);},[p,preview]);
 const act=(type:string,extra?:Record<string,unknown>)=>{if(busy||lock.current)return;lock.current=true;send(type,extra);};
 const animals=p.animals.filter(a=>!a.memorial),statuses=animals.map(a=>({animal:a,status:productionStatus(p,a.id)})),ready=(p.production?.pending??[]).reduce((n,l)=>n+l.amount,0);
 const threat=p.threat&&p.threat.phase!=='complete',stale=preview&&(preview.value.version!==summary.version||preview.value.layoutVersion!==p.layout.version||preview.value.expectedCount!==animals.length);
 return <div className="v7-market" data-v7-market>
  <div className="v7-balance inventory-balances"><div><ResourceIcon kind="coin" size={37}/><span><b>{summary.coins} 金币</b><small>可用余额</small></span></div><div><ResourceIcon kind="feed" size={37}/><span><b>生产粮 {summary.productionFeed}份</b><small>日需{summary.dailyFeedDemand}份</small></span></div><small>当前庄园估值 {summary.valuation.total}</small></div>
  <p className="cycle-muted">收取 → 留用、卖出或合成 → 买粮与羊箱。买箱后预览承载，再确认孵化。</p>
  <div className="cycle-row cycle-heading"><h3>收获 · {animals.length}/12 位住民</h3><button className="cycle-small-button" data-cycle-command="claim-all" disabled={busy||ready===0||!!threat} onClick={()=>act('claimWool')}>收取 {ready}份</button></div>
  {!!threat&&<p className="cycle-pause">先完成眼前守护，再收取暴露产物。</p>}
  <p className="cycle-muted">稀有度决定产色；每只每{p.id==='lab'?'30秒':'12小时'}一批，成长和照料可增至4份。每只存6批。</p>
  <details className="cycle-more"><summary>每只产量与停产原因</summary>{statuses.map(({animal:a,status:s})=><div className="v7-producer" key={a.id}><button className="cycle-animal-name" onClick={()=>onInspect?.(a.id)} disabled={!onInspect}>{a.name} · {COLOR[s.tier]}毛</button><span>一批{s.quantity}份 · 耗粮{s.feedPerCycle}份 · 待领{s.pendingUnits}份</span><small>{({ready:'正常生产',feed:'缺生产粮，补粮后从新周期开始',injury:'受伤停产，需要照料',lost:'走失停产，需要营救',shelter:'缺可达安全床位，暂时停产',full:'已存满6批',memorial:'已纪念',event:'守护事件中，暂停生产'})[s.reason]}</small></div>)}<p>免费照料食物与生产粮分账。缺粮、受伤、走失或没有可达安全床位时不产，也不补发停产周期。离线最多结算6周期。</p></details>
  <div className="cycle-row v7-feed"><span>日需{summary.dailyFeedDemand}份粮 · 缺{summary.feedGap}份</span><button className="cycle-small-button" data-v7-buy-feed disabled={busy||summary.coins<V7_RULES.feedPackPrice} onClick={()=>act('v7-buy-feed',{packs:1})}>买{V7_RULES.feedPack}粮 · {V7_RULES.feedPackPrice}金币</button></div>
  <InventoryPanel profile={p} busy={busy} send={send} onCraft={onCraft} showBalance={false}/>
  <h3 className="inventory-box-heading"><ResourceIcon kind="crate" tier={boxTier} size={42}/>迎接新小羊</h3><div className="cycle-row"><label className="v7-field">确定品质<select data-v7-box-tier value={boxTier} onChange={e=>setBoxTier(e.target.value as MaterialTier)}>{TIERS.map(t=><option key={t} value={t}>{COLOR[t]}羊箱 · {V7_RULES.boxPrice[t]}金币</option>)}</select></label><button className="cycle-small-button" data-v7-buy-box={boxTier} disabled={busy||summary.coins<V7_RULES.boxPrice[boxTier]} onClick={()=>act('v7-buy-box',{tier:boxTier,species:'sheep'})}>买箱</button></div><p className="cycle-muted">物种：羊 · 品质确定，无随机。买箱不加估值，不会立刻增加动物。</p>
  {summary.eggs.filter(e=>e.status==='boxed').map(egg=><div className="cycle-row v7-egg" key={egg.id}><span className="inventory-crate"><ResourceIcon kind="crate" tier={egg.tier} size={44}/><span><b>{COLOR[egg.tier]}羊箱</b><small>{QUALITY[egg.tier].rank} {QUALITY[egg.tier].name} · 待孵化</small></span></span><button className="cycle-small-button" data-v7-preview={egg.id} disabled={busy} onClick={()=>{setPreview({boxId:egg.id,value:previewHatch(p,egg.tier)});act('v7-preview-hatch',{boxId:egg.id});}}>预览承载</button></div>)}
  {preview&&<section className="v7-hatch-preview" data-v7-hatch-preview aria-label="孵化承载预览"><b>{COLOR[preview.value.tier]}羊孵化预览</b><p>金币 {preview.value.coins} · 日需粮 {preview.value.dailyFeedDemand} · 缺粮 {preview.value.feedGap}</p><p>占地 {preview.value.landDemand}/{preview.value.landAvailable} · 可达床位 {preview.value.reachableBeds} · 缺床 {preview.value.missingBeds}</p><p>未来来袭压力：{BAND[preview.value.futureRaidBand]} · 更多、更稀有动物会增加压力。</p>{preview.value.reasons.map(r=><p key={r} role="status">{r}</p>)}{stale&&<p role="status">庄园已变化，请重新预览。</p>}<div className="v7-actions"><button className="cycle-small-button" data-v7-hatch disabled={busy||!preview.value.ok||!!stale||!!threat} onClick={()=>act('v7-hatch',{boxId:preview.boxId,expectedLayoutVersion:preview.value.layoutVersion,expectedCount:preview.value.expectedCount,expectedVersion:preview.value.version})}>确认孵化</button><button className="cycle-small-button" data-v7-cancel disabled={busy} onClick={()=>{act('v7-cancel-hatch',{boxId:preview.boxId});setPreview(null);}}>取消 · 保留箱子</button></div></section>}
  <details className="cycle-more"><summary>当前庄园估值与试验规则</summary><p>当前庄园估值只计在养动物、已建有效设施和已装备披风/狗盾；金币、库存、未孵化箱和AI外观不计分。没有联网排行榜。</p><p>每只羊需要下一天生产粮、可达床位和足够可行走土地；确认孵化会再次核验。价格、产量与压力都是本轮可配置试验值。</p></details>
 </div>;
}
