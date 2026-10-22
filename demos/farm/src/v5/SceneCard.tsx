import {useLayoutEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
/** A bounded nonmodal card. The uncovered world still receives pointer input. */
export default function SceneCard({kind,title,children,onClose}:{kind:string;title:string;children:ReactNode;onClose:()=>void}){
 const panel=useRef<HTMLDivElement>(null),heading=useId(),close=useRef(onClose);close.current=onClose;
 useLayoutEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.focus({preventScroll:true});const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}};document.addEventListener('keydown',escape);return()=>{document.removeEventListener('keydown',escape);if(panel.current?.contains(document.activeElement)&&previous?.isConnected&&!previous.closest('[inert],[hidden]'))previous.focus({preventScroll:true});};},[]);
 return <div className="scene-card-layer"><section ref={panel} tabIndex={-1} className="scene-card" role="dialog" aria-modal="false" aria-labelledby={heading} data-scene-card={kind}><header className="scene-card-heading"><h2 id={heading}>{title}</h2><button onClick={onClose} aria-label="关闭面板"><X size={18}/></button></header>{children}</section></div>;
}
