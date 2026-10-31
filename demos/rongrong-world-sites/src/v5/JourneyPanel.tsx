import {useEffect,useMemo,useState} from 'react';
import {Compass,Hammer,Leaf,Shield,ScanEye} from 'lucide-react';
import type {Profile} from './estate.ts';
import {BUILDING_RULES,previewEdit,type BuildingKind,type LayoutEdit} from './layout.ts';
import {LANDMARKS,discoveredLandmarkIds} from './journey.ts';
import {DEVELOPMENT_CHOICES,developmentActors,developmentPreviewKey,suggestDevelopment,type DevelopmentKind} from './development.ts';
type Ghost={x:number;z:number;kind:BuildingKind;valid:boolean};
type Send=(type:string,extra?:Record<string,unknown>)=>void;
export type JourneyPanelProps={profile:Profile;busy:boolean;send:Send;onGhost:(ghost?:Ghost)=>void;onClose:()=>void;onBuild?:()=>void};
const names={tower:'观察台',shelter:'露天保护区',factory:'饲料厂'};
const icons={tower:ScanEye,shelter:Shield,factory:Leaf};
export default function JourneyPanel({profile:p,busy,send,onGhost,onClose,onBuild}:JourneyPanelProps){
 const [edit,setEdit]=useState<Extract<LayoutEdit,{type:'place'}>|null>(null),[reason,setReason]=useState('');
 const discovered=discoveredLandmarkIds(p);
 const legalityKey=developmentPreviewKey(p);
 // A pulse changes the snapshot object every 200ms. Only graph/ledger changes
 // or crossing a cell boundary need another expensive navigation validation.
 const preview=useMemo(()=>edit?previewEdit(p.layout,edit,{materials:p.materials,baseVersion:p.layout.version,actors:developmentActors(p),surveyed:p.surveyed,locked:!!p.threat}):null,[legalityKey,edit]);
 const choice=edit?DEVELOPMENT_CHOICES.find(c=>c.kind===edit.kind):null;
 useEffect(()=>{onGhost(edit?{x:edit.x,z:edit.z,kind:edit.kind,valid:!!preview?.ok}:undefined);return ()=>onGhost();},[edit,preview?.ok,onGhost]);
 const select=(kind:DevelopmentKind)=>{const proposal=suggestDevelopment(p,kind);setEdit(proposal.edit);setReason(proposal.reason??'');};
 const walk=(to:{x:number;z:number})=>{send('move',{to});onClose();};
 return <div data-journey-panel>
  <section className="estate-callout"><b><Compass size={17}/> 今天，想把小家变成什么样？</b><p>先照顾幼崽，也可以沿路探索。发现的地点、完成的建设和走过的路都会保存。</p><div className="estate-stat-row"><span>金币 <b>{p.materials}</b></span><span>发现 <b>{discovered.length}/{LANDMARKS.length}</b></span><span>建设用地 <b>{p.layout.owned.length}格</b></span></div></section>
  <h3>选一条发展方向</h3>
  <p className="sheet-note">三个方案共用金币；先看位置和效果，确认后才施工。你也可以自己布置。</p>
  {DEVELOPMENT_CHOICES.map(item=>{const Icon=icons[item.kind],rule=BUILDING_RULES[item.kind],selected=edit?.kind===item.kind;return <section className={`estate-preview ${selected?'valid':''}`} key={item.kind} data-development-kind={item.kind}>
   <b><Icon size={16}/> {item.title} · {names[item.kind]}</b><p>{item.description}</p><p className="sheet-note">{item.tradeoff}</p><button className="actions-join" aria-pressed={selected} disabled={busy} onClick={()=>select(item.kind)}>预览位置 · {rule.cost}金币 · {rule.durationMs/1000}秒</button>
  </section>;})}
  {reason&&<p className="sheet-note" role="status">{reason}</p>}
  {edit&&preview&&choice&&<section className={`estate-preview ${preview.ok?'valid':'invalid'}`} aria-live="polite" data-development-preview>
   <b>{names[choice.kind]} · ({edit.x},{edit.z})</b><p>金币 {p.materials} → {p.materials-preview.cost} · 施工{preview.durationMs/1000}在线秒</p><p>保护位 {preview.beforeMetrics.capacity} → {preview.metrics.capacity} · 最远回家 {preview.beforeMetrics.maxReachablePath} → {preview.metrics.maxReachablePath}格</p>
   {preview.reasons.map(item=><p key={item}>· {item}</p>)}
   <button className="estate-primary" data-command="develop" disabled={busy||!preview.ok} onClick={()=>{send('layout',{edit,baseVersion:p.layout.version});onClose();}}><Hammer size={17}/> 确认建设 · {preview.cost}金币</button>
   <p className="sheet-note">完成后再试一次无损疏散，比较实际路径与队列。</p>
  </section>}
  {p.layout.construction&&<section className="estate-callout"><b>工程进行中</b><progress max={p.layout.construction.durationMs} value={p.layout.construction.elapsedMs}/><p>回到场景继续施工，完成后出现真实设施。</p><button className="actions-join" onClick={onClose}>回到庄园</button></section>}
  {onBuild&&<button className="actions-join" onClick={onBuild}>自己规划 · 道路、入口与搬迁</button>}
  <h3>走出庄园，看看山谷</h3>
  <p className="sheet-note">每处首次抵达带回8金币。已发现地点可反复散步；探索不等于拥有土地。</p>
  {LANDMARKS.map(point=><section className="estate-callout" key={point.id}><b>{discovered.includes(point.id)?'✓':'◇'} {point.name}</b><p>{point.benefit}</p><button className="actions-join" data-landmark={point.id} disabled={busy||!!p.threat} onClick={()=>walk(point.position)}>{discovered.includes(point.id)?'再去走走':'带我去发现'}</button></section>)}
  <p className="sheet-note">东侧建设地块需要先勘察，再花30金币拓荒。金币、地形与回家路线会影响你怎样安排庄园。</p>
  <button className="actions-join" disabled={busy||!!p.threat} onClick={()=>walk({x:5,z:7})}>回到小家</button>
 </div>;
}
