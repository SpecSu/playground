import {useEffect,useRef,type ReactNode,type KeyboardEvent} from 'react';
import {ArrowLeft,X} from 'lucide-react';
import './online-farm.css';
function panelControls(panel:HTMLElement|null){
 return Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]).filter(element=>{
  if(element.closest('[inert],[hidden],[aria-hidden="true"]')||element.matches(':disabled'))return false;
  for(let parent:HTMLElement|null=element;parent;parent=parent.parentElement){const style=window.getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden')return false;if(parent===panel)break;}
  for(let details=element.parentElement?.closest('details');details;details=details.parentElement?.closest('details')){
   if(!details.open){const summary=Array.from(details.children).find(child=>child.tagName==='SUMMARY');if(!summary||!summary.contains(element))return false;}
  }
  return true;
 });
}
export default function GamePanel({title,icon,help,onClose,onBack,children}:{title:string;icon:ReactNode;help?:ReactNode;onClose:()=>void;onBack?:()=>void;children:ReactNode}){
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement;panel.current?.querySelector<HTMLElement>('button')?.focus({preventScroll:true});return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
 const key=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
  if(event.key!=='Tab')return;const controls=panelControls(panel.current);const first=controls[0],last=controls.at(-1);if(!first||!last)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 return <div className="online-panel-shade" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="online-panel" role="dialog" aria-modal="true" aria-label={title} ref={panel} onKeyDown={key}>
  <header className="online-panel-header"><button type="button" className="online-icon" aria-label={onBack?`返回${title}`:`关闭${title}`} onClick={onBack??onClose}>{onBack?<ArrowLeft size={20}/>:<X size={20}/>}</button><h2>{icon}{title}</h2>{help??<span/>}</header>
  <div className="online-panel-body">{children}</div>
 </section></div>;
}
