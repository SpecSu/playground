import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import './panel-help.css';

/** Rules stay beside their controls, but never cover the first screen until requested. */
export function PanelHelp({title,children}:{title:string;children:ReactNode}){
 const [open,setOpen]=useState(false),id=useId();
 const opener=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!open)return;
  const trigger=opener.current,parent=trigger?.closest<HTMLElement>('[role="dialog"],.egg-context');
  const wasInert=parent?.inert;if(parent)parent.inert=true;
  const controls=()=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')??[]);
  const focus=()=>controls()[0]?.focus({preventScroll:true});focus();
  const key=(event:globalThis.KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setOpen(false);}
   else if(event.key==='Tab'){
    const items=controls(),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    event.stopImmediatePropagation();
   }
  };
  const keepFocus=(event:FocusEvent)=>{if(dialog.current&&!dialog.current.contains(event.target as Node))focus();};
  document.addEventListener('keydown',key,true);document.addEventListener('focusin',keepFocus);
  return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('focusin',keepFocus);if(parent)parent.inert=wasInert??false;if(trigger?.isConnected)trigger.focus({preventScroll:true});};
 },[open]);
 return <><button type="button" className="panel-help-button" aria-label={title} aria-haspopup="dialog" aria-expanded={open} ref={opener} onClick={event=>{event.stopPropagation();setOpen(true);}}>?</button>{open&&createPortal(<div className="panel-help-shade" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)setOpen(false);}}><section className="panel-help-dialog" data-panel-help role="dialog" aria-modal="true" aria-labelledby={id} ref={dialog}><header><h2 id={id}>{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={()=>setOpen(false)}><X size={20} aria-hidden="true"/></button></header><div className="panel-help-body" tabIndex={0} role="region" aria-label={`${title}内容`}>{children}</div></section></div>,opener.current?.closest('.egg-farm')??document.body)}</>;
}
