import {useEffect,useRef} from 'react';
import {Hand,Play,Square,RotateCcw,Sparkles,X} from 'lucide-react';
import type {LunarActorSummary} from './lunar-showcase-scene.ts';
import type {LunarShowcaseId} from './lunar-showcase-contract.ts';
const statusLabel=(actor:LunarActorSummary)=>actor.status==='loading'?'载入中':actor.status==='failed'?'载入失败':actor.status==='unavailable'?'尚未就绪':actor.carried?'临时举起':actor.finishing?'收势后休息':actor.actionId?'表演中':actor.lifePhase==='walk'?'散步中':actor.lifePhase?'休息看看':'DIY伙伴';
const growthLabel=(actor:LunarActorSummary)=>actor.growthStage==='adult'?(actor.growthScale!>=1.8?'巨大成年':'成年'):actor.growthStage==='juvenile'?'少年':'幼崽';
/** Presentation only: the World rechecks every capability and owns temporary actions. */
export function LunarShowcaseControls({actors,selectedId,onSelect,onAction,onRetry,onClose,onFocusCanvas}:{actors:readonly LunarActorSummary[];selectedId:LunarShowcaseId|null;onSelect:(id:LunarShowcaseId)=>void;onAction:(id:LunarShowcaseId,action:string)=>void;onRetry:(id:LunarShowcaseId)=>void;onClose?:()=>void;onFocusCanvas?:()=>void}){
 const loadingStatus=useRef<HTMLElement>(null),actionStrip=useRef<HTMLDivElement>(null),lastFocus=useRef<HTMLElement|null>(null);
 const speaking=actors.find(a=>a.status==='ready'&&!a.carried&&a.speech),carried=actors.find(a=>a.carried),selected=actors.find(a=>a.id===selectedId),ready=selected?.status==='ready';
 useEffect(()=>{const old=lastFocus.current,active=document.activeElement;if(old&&!old.isConnected&&(!active||active===document.body)){const target=actionStrip.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')??actionStrip.current?.closest('[data-lunar-controls]')?.querySelector<HTMLButtonElement>('[aria-label="关闭伙伴菜单"]')??loadingStatus.current;if(target)target.focus({preventScroll:true});else onFocusCanvas?.();}},[selected?.id,selected?.status,carried?.id,actors.map(a=>a.status).join(','),onFocusCanvas]);
 const pending=actors.filter(a=>a.status!=='ready');
 return <>
  {speaking&&<p className="lunar-floating-speech" data-showcase-speech role="status">{speaking.label}：{speaking.speech}</p>}
  {!!pending.length&&<aside className="lunar-loading-status" aria-label="伙伴模型状态" ref={loadingStatus} tabIndex={-1} onFocusCapture={event=>{lastFocus.current=event.target as HTMLElement;}}>{pending.map(a=><div key={a.id}><span role="status">{a.label} · {statusLabel(a)}</span>{a.status==='failed'&&<button type="button" onClick={()=>onRetry(a.id)}>重试{a.label}</button>}</div>)}</aside>}
  {!actors.length&&<p className="lunar-loading-status" role="status">DIY伙伴尚未在当前环境就绪</p>}
  {carried&&selected?.id!==carried.id&&<button className="lunar-carried-return" type="button" onClick={()=>onSelect(carried.id)}>手里的{carried.label} · 放下</button>}
  {selected&&<section className="lunar-showcase-controls" aria-label={`${selected.label}互动`} data-lunar-controls onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose?.();}}}>
  <div className="lunar-menu-heading"><img src={selected.portraitUrl} alt=""/><strong>{selected.label}</strong><button type="button" aria-label="关闭伙伴菜单" onClick={onClose}><X size={18} aria-hidden="true"/></button></div>
  {selected?<><div className="lunar-selected-label">{selected.growthStage&&<small>{growthLabel(selected)} · 示例成长，离岛重置</small>}<span>{selected.carried?'临时举起 · 不能带回家':!ready?statusLabel(selected):!selected.carryAllowed?'暂不支持举起 · 可以陪玩':'示例陪玩 · 不改变归属'}</span></div><div className="lunar-action-strip" data-showcase-actions ref={actionStrip} onFocusCapture={event=>{lastFocus.current=event.target as HTMLElement;}}>
   {selected.status==='failed'?<button type="button" onClick={()=>onRetry(selected.id)}><RotateCcw size={17} aria-hidden="true"/>重试模型</button>:!ready?<span role="status">{selected.status==='loading'?'模型载入中…':'模型尚未就绪'}</span>:selected.carried?<button type="button" onClick={()=>onAction(selected.id,'putdown')}><Hand size={17} aria-hidden="true"/>放下来</button>:<>{selected.growthStage&&<button type="button" disabled={!selected.canCare} title={selected.growthStage==='adult'?'已经成年，可以陪玩':!selected.canCare?'刚刚照料过，稍等片刻':'照料可加快本次示例成长'} onClick={()=>onAction(selected.id,'care')}><Sparkles size={17} aria-hidden="true"/>照料成长</button>}<button type="button" onClick={()=>onAction(selected.id,'greet')}><Sparkles size={17} aria-hidden="true"/>打招呼</button>{selected.actions.map(action=><button key={action.id} type="button" aria-pressed={selected.actionId===action.id} onClick={()=>onAction(selected.id,action.id)}><Play size={15} aria-hidden="true"/>{action.label}</button>)}<button type="button" disabled={!selected.carryAllowed} onClick={()=>onAction(selected.id,'pickup')}><Hand size={17} aria-hidden="true"/>举起来</button>{<button type="button" disabled={!selected.actionId&&(!selected.lifePhase||selected.lifePhase==='rest')} onClick={()=>onAction(selected.id,'stop')}><Square size={15} aria-hidden="true"/>停下</button>}</>}
  </div></>:null}
 </section>}
 </>;
}
