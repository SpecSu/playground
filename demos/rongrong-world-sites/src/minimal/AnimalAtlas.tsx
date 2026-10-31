'use client';
import {useEffect,useRef,type KeyboardEvent} from 'react';
import {ArrowRight,BookOpen,Check,Leaf,Sparkles,X} from 'lucide-react';
import {getAnimalAtlasEntries,type AnimalAtlasLedger} from './animal-atlas.ts';
import type {MinimalState} from './model.ts';
import {PanelHelp} from './PanelHelp.tsx';
import './atlas.css';

export type AnimalAtlasProps={state:MinimalState;ledger?:AnimalAtlasLedger;onClose:()=>void;onOpenWishPool?:()=>void};
const stageLabels={baby:'幼崽',juvenile:'少年',adult:'成年'};

/** User-opened album only. Mounting it cannot buy, trade, navigate, or change saves. */
export default function AnimalAtlas({state,ledger,onClose,onOpenWishPool}:AnimalAtlasProps){
 const sheet=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const entries=getAnimalAtlasEntries(state,ledger),discovered=entries.filter(entry=>entry.discovered).length;
 useEffect(()=>{
  const previous=document.activeElement;closeButton.current?.focus({preventScroll:true});
  return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[]);
 const handleKey=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
  if(event.key!=='Tab')return;
  const controls=sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');if(!controls?.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 return <div className="animal-atlas-shade" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="animal-atlas-sheet" role="dialog" aria-modal="true" aria-label="动物图鉴" ref={sheet} onKeyDown={handleKey}>
   <header className="animal-atlas-header">
    <div><h2><BookOpen size={22} aria-hidden="true"/>动物图鉴</h2></div>
    <div className="animal-atlas-header-actions"><button type="button" ref={closeButton} className="animal-atlas-close" aria-label="关闭动物图鉴" onClick={onClose}><X size={19} aria-hidden="true"/></button><PanelHelp title="图鉴说明"><p>遇见过，就会一直留在这里。图鉴记录已发现的种类，动物离开牧场后仍会保留。</p><p>卡片显示当前数量、成长阶段和已记录的成年状态。未发现的种类只显示剪影。</p><p>图鉴只供查看，不会购买、交换或转移动物。</p></PanelHelp></div>
   </header>
   <div className="animal-atlas-summary"><span><Check size={15} aria-hidden="true"/>已发现 <b>{discovered} / {entries.length}</b></span><span><Leaf size={15} aria-hidden="true"/>牧场里 <b>{state.animals.length}</b> 只</span></div>
   <div className="animal-atlas-progress" role="progressbar" aria-label="动物发现进度" aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={discovered}><span style={{width:`${discovered/entries.length*100}%`}}/></div>
   <div className="animal-atlas-body" role="region" aria-label="动物图鉴列表" tabIndex={0}><div className="animal-atlas-grid">
    {entries.map(entry=><article className={`animal-atlas-card ${entry.discovered?'is-discovered':'is-unknown'}`} key={entry.species} data-atlas-species={entry.species} data-discovered={entry.discovered} aria-label={entry.discovered?`${entry.label}，牧场里 ${entry.ownedCount} 只`:'待发现的动物'}>
     <div className="animal-atlas-portrait">{entry.portrait?<img className={entry.discovered?'':'animal-atlas-unknown'} src={entry.portrait} alt={entry.discovered?entry.label:''} aria-hidden={entry.discovered?undefined:true} width={256} height={256} draggable={false}/>:<Leaf size={48} aria-hidden="true"/>}{entry.discovered?<span className="animal-atlas-stamp" aria-hidden="true"><Check size={12}/></span>:<span className="animal-atlas-question" aria-hidden="true">?</span>}</div>
     <h3>{entry.discovered?entry.label:'待发现'}</h3>
     <p className="animal-atlas-owned">{entry.discovered?(entry.ownedCount?`牧场里 ${entry.ownedCount} 只`:'已发现'):'未发现'}</p>
     {entry.discovered&&<div className="animal-atlas-memories">
      {entry.record?.adultSeen?<span><Leaf size={11} aria-hidden="true"/>见过成年</span>:entry.currentAnimals.length>0&&<span>{[...new Set(entry.currentAnimals.map(animal=>stageLabels[animal.stage]))].join(' · ')}</span>}
      {entry.record?.receivedViaWish&&<span><Sparkles size={11} aria-hidden="true"/>许愿池伙伴</span>}
     </div>}
    </article>)}
   </div></div>
   {onOpenWishPool&&<footer className="animal-atlas-footer"><button type="button" aria-label="前往许愿池" onClick={onOpenWishPool}><Sparkles size={17} aria-hidden="true"/><span>许愿池</span><ArrowRight size={17} aria-hidden="true"/></button></footer>}
  </section>
 </div>;
}
