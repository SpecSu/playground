import {useEffect,useMemo,useRef,useState} from 'react';
import type {Profile} from './estate.ts';
import {BUILDING_RULES,type BuildingKind,type GridPoint,type LayoutEdit} from './layout.ts';
import {developmentPreview,developmentPreviewKey,suggestDevelopment,type DevelopmentKind} from './development.ts';

type Ghost={x:number;z:number;kind:BuildingKind;valid:boolean;interactive?:boolean};
type Send=(type:string,extra?:Record<string,unknown>)=>void;
export type QuickBuildPanelProps={profile:Profile;busy:boolean;placementPoint?:GridPoint;send:Send;onGhost:(ghost?:Ghost)=>void;onClose:()=>void;onPlanner:()=>void;onTheme?:()=>void;onExplore?:()=>void};
type Selection={edit:Extract<LayoutEdit,{type:'place'}>;version:number};
const choices:{kind:DevelopmentKind;name:string;effect:string}[]=[
 {kind:'tower',name:'瞭望台',effect:'登台发现远处来袭'},
 {kind:'shelter',name:'保护围栏',effect:'多6个安全小窝'},
 {kind:'factory',name:'饲料坊',effect:'做饲料给小羊'},
];
/** Small original facility drawings mirror the existing playable models. */
function FacilityArt({kind}:{kind:DevelopmentKind}){
 return <svg viewBox="0 0 100 62" aria-hidden="true" focusable="false">
  <ellipse cx="50" cy="54" rx="35" ry="6" fill="#8baf82" opacity=".3"/>
  {kind==='tower'?<>
   <path d="M31 25v28m38-28v28M40 23v26m20-26v26" stroke="#b88b5e" strokeWidth="4"/>
   <path d="m24 23 26-12 26 12-26 13z" fill="#e3c18c"/>
   <path d="m25 20 25-16 25 16-25 8z" fill="#9dbea4"/>
   <path d="m41 36-8 18m21-16-8 18M38 43l12 2m-15 4 12 2" stroke="#d5ad78" strokeWidth="2.5"/>
  </>:kind==='shelter'?<>
   <path d="m15 40 33-17 38 15-34 19z" fill="#c9ba7b"/>
   <path d="M16 24v22m16-30v22m16-29v22M48 9l37 14m0 0v22M69 18v20" stroke="#d2b58a" strokeWidth="4"/>
   <path d="m16 31 32-16 37 15M16 39l32-16 37 15" fill="none" stroke="#e6ce9d" strokeWidth="3"/>
   <ellipse cx="44" cy="38" rx="12" ry="8" fill="#f8efdc"/><circle cx="55" cy="37" r="5" fill="#d4b9a0"/>
   <path d="M16 35v15m17-8v15m35-14v14m17-20v15m-69-8 17 7m35 0 17-8" stroke="#d9bc8d" strokeWidth="4"/>
  </>:<>
   <path d="m24 24 25-12 27 13v27L49 60 24 49z" fill="#dbcaa1"/>
   <path d="m49 36 27-11v27l-27 8z" fill="#b6ba91"/>
   <path d="m20 24 29-15 31 15-31 14z" fill="#90b6a0"/>
   <path d="M62 16V6l9-3v16" fill="#b39e82"/>
   <path d="M36 37v16l10 4V40z" fill="#9d8868"/>
   <path d="m58 38 11-4v9l-11 4z" fill="#d7ead1"/>
   <ellipse cx="25" cy="49" rx="9" ry="5" fill="#acb679"/><path d="m20 47 3 4 4-4m-1 7 5-5" stroke="#e2daaa" strokeWidth="2"/>
  </>}
 </svg>;
}

export default function QuickBuildPanel({profile:p,busy,placementPoint,send,onGhost,onClose,onPlanner,onTheme,onExplore}:QuickBuildPanelProps){
 const [selection,setSelection]=useState<Selection|null>(null),[reason,setReason]=useState('');
 const submitted=useRef(false),legalityKey=developmentPreviewKey(p);
 const preview=useMemo(()=>selection?developmentPreview(p,selection.edit,selection.version):null,[legalityKey,selection]);
 const blocked=!!p.threat||!!p.layout.construction;
 const selected=choices.find(choice=>choice.kind===selection?.edit.kind);
 const shortReason=p.threat?'先陪大家回家，再布置小家':p.layout.construction?'正在建造，回到场景看看吧':selection&&selection.version!==p.layout.version?'小家刚有变化，请重新选一次':preview&&!preview.ok&&p.materials<preview.cost?`还差${preview.cost-p.materials}金币，去山谷找找吧`:preview&&!preview.ok?'这里放不下，拖到空地再试试':reason;
 useEffect(()=>{onGhost(selection&&!blocked?{...selection.edit,valid:!!preview?.ok,interactive:true}:undefined);return()=>onGhost();},[selection,blocked,preview?.ok,onGhost]);
 useEffect(()=>{if(!placementPoint||!Number.isFinite(placementPoint.x)||!Number.isFinite(placementPoint.z))return;setSelection(old=>old?{...old,edit:{...old.edit,x:Math.round(placementPoint.x),z:Math.round(placementPoint.z)}}:old);},[placementPoint]);
 const choose=(kind:DevelopmentKind)=>{
  const plan=suggestDevelopment(p,kind);submitted.current=false;setSelection(plan.edit?{edit:plan.edit,version:p.layout.version}:null);
  setReason(plan.edit?'':kind==='factory'&&p.layout.buildings.some(b=>b.kind==='factory')?'已经有饲料坊啦，先把饲料送给小羊':'暂时没有合适空地，可以自己摆放');
 };
 const confirm=()=>{if(submitted.current||busy||blocked||!selection||!preview?.ok)return;submitted.current=true;send('layout',{edit:selection.edit,baseVersion:selection.version});onClose();};
 return <div className={`quick-build-panel ${selection?'is-placing':''}`} data-quick-build-panel>
  {!selection&&<div className="quick-build-caption"><span>选一件，放进小家</span><small>现有 {p.materials} 金币</small></div>}
  {!selection&&<div className="quick-build-choices">{choices.map(choice=><button key={choice.kind} type="button" className={selected?.kind===choice.kind?'selected':''} data-quick-kind={choice.kind} disabled={busy||blocked} aria-pressed={selected?.kind===choice.kind} onClick={()=>choose(choice.kind)}><FacilityArt kind={choice.kind}/><b>{choice.name}</b><span>{choice.effect}</span><small>{BUILDING_RULES[choice.kind].cost} 金币</small></button>)}</div>}
  {selection&&<div className="quick-build-drag-title" data-placement-controls><b>{selected?.name}</b><span>拖动虚影，放到喜欢的位置</span><button data-placement-cancel onClick={()=>{setSelection(null);setReason('');submitted.current=false;}}>换一个</button></div>}
  {shortReason?<p className="quick-build-status" role="status">{shortReason}</p>:selection?<p className="quick-build-status" role="status">绿色可放 · 拖到屏幕边缘移动视野</p>:<p className="quick-build-status">先看看位置，确认后才花金币</p>}
  {selection&&!blocked&&<button type="button" className="quick-build-confirm" data-command="quick-build-confirm" disabled={busy||!preview?.ok} onClick={confirm}>建这里 · 花{preview?.cost??0}金币</button>}
  {selection&&preview&&p.materials<preview.cost&&onExplore&&<button className="quick-build-explore" data-quick-explore onClick={onExplore}>去探索找金币</button>}
  {p.layout.construction&&<button type="button" className="quick-build-confirm" onClick={onClose}>回去看建造</button>}
  {!selection&&<div className="quick-build-links"><button type="button" data-quick-planner onClick={onPlanner}>自己摆放</button>{onTheme&&<button type="button" data-quick-theme onClick={onTheme}>做件作品</button>}{onExplore&&<button type="button" data-quick-explore onClick={onExplore}>去探索</button>}</div>}
 </div>;
}
