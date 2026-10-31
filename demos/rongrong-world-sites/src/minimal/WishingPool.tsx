'use client';
import {animalPortrait,isAnimalRuntimeActive} from './species.ts';
import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {ArrowLeft,ArrowRightLeft,BookOpen,Droplets,Info,Leaf,Sparkles,X} from 'lucide-react';
import {ATLAS_SPECIES_LABELS} from './animal-atlas.ts';
import {animalGrowthLabel,animalGrowthStage,type MinimalAnimal,type MinimalState} from './model.ts';
import './wish-pool.css';
import {PanelHelp} from './PanelHelp.tsx';

export type WishingPoolProps={state:MinimalState;onClose:()=>void;onOpenAtlas?:()=>void;onBackToShop?:()=>void};
const sizeLabels={normal:'普通',large:'大体型',giant:'巨型'};
const portrait=(animal:MinimalAnimal)=>animalPortrait(animal.species);
const canPreview=(state:MinimalState,animal:MinimalAnimal)=>isAnimalRuntimeActive(animal)&&animal.id!==state.carriedAnimalId&&animal.activity!=='carried';

/** A disconnected explanation and private draft, deliberately without a mutation/transport API. */
export default function WishingPool({state,onClose,onOpenAtlas,onBackToShop}:WishingPoolProps){
 const [selectedId,setSelectedId]=useState<string|null>(null),[changed,setChanged]=useState(false);
 const sheet=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),body=useRef<HTMLDivElement>(null),confirmation=useRef<HTMLElement>(null);
 const focusedChoice=useRef<string|null>(null);
 const selected=state.animals.find(animal=>animal.id===selectedId&&canPreview(state,animal));
 const available=state.animals.filter(animal=>canPreview(state,animal));
 const at=state.updatedAt;
 useEffect(()=>{
  const previous=document.activeElement;closeButton.current?.focus({preventScroll:true});
  return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[]);
 useLayoutEffect(()=>{
  if(selectedId&&!selected){setSelectedId(null);setChanged(true);}
  if(selected&&focusedChoice.current!==selected.id){confirmation.current?.focus({preventScroll:true});focusedChoice.current=selected.id;}
  else if(!selected&&focusedChoice.current){body.current?.focus({preventScroll:true});focusedChoice.current=null;}
 },[selectedId,selected]);
 const choose=(id:string)=>{setSelectedId(id);setChanged(false);if(body.current)body.current.scrollTop=0;};
 const cancel=()=>{setSelectedId(null);setChanged(false);};
 const handleKey=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
  if(event.key!=='Tab')return;
  const controls=sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');if(!controls?.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 return <div className="wish-pool-shade" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="wish-pool-sheet" role="dialog" aria-modal="true" aria-label="许愿池" aria-describedby="wish-pool-connection" data-connection="NOT_CONNECTED" ref={sheet} onKeyDown={handleKey}>
   <header className="wish-pool-header">{onBackToShop&&<button type="button" className="wish-pool-close" ref={closeButton} aria-label="返回商店" onClick={onBackToShop}><ArrowLeft size={19} aria-hidden="true"/></button>}<h2><Droplets size={22} aria-hidden="true"/>许愿池 <span>预览</span></h2><div className="wish-pool-header-actions">{!onBackToShop&&<button type="button" className="wish-pool-close" ref={closeButton} aria-label="关闭许愿池" onClick={onClose}><X size={19} aria-hidden="true"/></button>}<PanelHelp title="许愿池规则"><p>联机功能准备中，当前仅预览，不会转移动物或扣次数。</p><h3>交换</h3><p>只换不同种类的动物，不花金币。放入、收回或没换成，都不占次数。</p><p>每日成功交换 1 次，双方各计一次 · 北京时间。</p><p>接通后，放入即表示同意；有人选中就直接交换，不再等你确认。不保证换来没养过的种类，也不保证体型相同。</p><h3>收回</h3><p>正式开放后：同时只能放 1 只。无人交换可随时收回；到北京时间次日 00:00 自动收回。成功交换不能撤回。</p></PanelHelp></div></header>
   <p className="wish-pool-connection" id="wish-pool-connection"><Info size={16} aria-hidden="true"/><span>联机未开放 · 仅预览 · 不转移、不扣次数</span></p>
   <div className="wish-pool-body" ref={body} tabIndex={0} role="region" aria-label="许愿池内容">
    {changed&&<p className="wish-pool-changed" role="status">这只伙伴的状态变了，重新选一只吧。</p>}
    {selected?<section className="wish-pool-confirm" data-wish-confirm aria-label="许愿预览确认" ref={confirmation} tabIndex={-1}>
     <span className="wish-pool-step">交换预览</span>
     <div className="wish-pool-exchange"><div className="wish-pool-giving"><span>已选动物</span><>{portrait(selected)?<img src={portrait(selected)} alt={ATLAS_SPECIES_LABELS[selected.species]} width={128} height={128} draggable={false}/>:<Leaf size={48} data-resource-unavailable aria-label="资源暂不可用"/>}</><b>{selected.name}</b><small>{ATLAS_SPECIES_LABELS[selected.species]} · {selected.sex==='female'?'♀ 女生':'♂ 男生'}</small><small>{animalGrowthLabel(selected,at)} · {animalGrowthStage(selected,at)==='adult'?'体型':'成年体型'}：{sizeLabels[selected.size]}</small></div><ArrowRightLeft className="wish-pool-exchange-arrow" size={21} aria-hidden="true"/><div className="wish-pool-unknown"><span>交换目标</span><div className="wish-pool-mystery" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="M24 40C7 15 26 12 37 32C46 27 54 27 63 32C74 12 93 15 76 40C90 55 86 78 72 84C60 90 40 90 28 84C14 78 10 55 24 40Z"/></svg><i>?</i></div><b>任意不同种类</b><small>仅示意，并非真实挂单</small></div></div>
     <div className="wish-pool-consent"><ArrowRightLeft size={16} aria-hidden="true"/><b>任意不同种类</b><span>成功后不可撤回</span></div>
     {(selected.size!=='normal'||state.animals.filter(animal=>animal.species===selected.species).length===1)&&<div className="wish-pool-warning"><Leaf size={16} aria-hidden="true"/><p>{selected.size!=='normal'&&<strong>{animalGrowthStage(selected,at)==='adult'?'它是':'成年体型是'}{sizeLabels[selected.size]}。</strong>}{state.animals.filter(animal=>animal.species===selected.species).length===1&&<strong>你的牧场里，这个种类仅有 1 只。</strong>}</p></div>}
     <button type="button" className="wish-pool-submit" disabled>接通联机后可许愿</button><button type="button" className="wish-pool-cancel" onClick={cancel}>重新选择</button>
    </section>:<>
     <div className="wish-pool-stats" aria-label="交换规则摘要"><span><Sparkles size={16} aria-hidden="true"/><b>1 次</b><small>每日成功交换</small></span><span><ArrowRightLeft size={16} aria-hidden="true"/><b>不同种类</b><small>不花金币</small></span></div>
     <div className="wish-pool-section-heading"><h3>选择动物</h3><span>{available.length} 只可选</span></div>
     {state.animals.length?<div className="wish-pool-animals">{state.animals.map(animal=>{const enabled=canPreview(state,animal);return <button type="button" className="wish-pool-animal" key={animal.id} data-wish-animal={animal.id} aria-label={`选择${animal.name}`} disabled={!enabled} onClick={()=>choose(animal.id)}><>{portrait(animal)?<img src={portrait(animal)} alt="" width={92} height={92} draggable={false}/>:<Leaf size={48} data-resource-unavailable aria-label="资源暂不可用"/>}</><span><b>{animal.name}</b><small>{ATLAS_SPECIES_LABELS[animal.species]} · {animal.sex==='female'?'♀':'♂'} · {animalGrowthLabel(animal,at)}</small><small>{enabled?`${animalGrowthStage(animal,at)==='adult'?'体型':'成年体型'}：${sizeLabels[animal.size]}`:!isAnimalRuntimeActive(animal)?'伙伴资源暂不可用，或等待恢复放置':'正在举着，先放下来'}</small></span></button>;})}</div>:<div className="wish-pool-empty"><Leaf size={23} aria-hidden="true"/><b>暂无动物</b><p>商店买蛋 → 孵化</p><button type="button" onClick={onClose}>返回牧场</button></div>}
     {state.animals.length>0&&!available.length&&<p className="wish-pool-rule-note">{state.animals.some(a=>!isAnimalRuntimeActive(a))?'伙伴携带中或资源暂不可用 · 恢复后可选':'动物举起中 · 放下后可选'}</p>}
     <div className="wish-pool-no-listings"><Droplets size={18} aria-hidden="true"/><span>玩家交换 · 尚未开放</span></div>
    </>}
   </div>
   {!onBackToShop&&onOpenAtlas&&<footer className="wish-pool-footer"><button type="button" aria-label="返回动物图鉴" onClick={onOpenAtlas}><ArrowLeft size={16} aria-hidden="true"/><BookOpen size={17} aria-hidden="true"/><span>看看我的图鉴</span></button></footer>}
  </section>
 </div>;
}
