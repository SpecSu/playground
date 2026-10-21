import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
/** Same bottom-sheet focus lifecycle and geometry as the archived LiveFeed. */
export default function FeedSheet({title,subtitle,children,onClose,notice}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;notice?:ReactNode}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const focusables=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')??[]);
  (focusables()[0]??panel.current)?.focus({preventScroll:true});
  const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();if(event.key!=='Tab')return;const items=focusables();if(!items.length){event.preventDefault();return;}if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}};
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);if(previous?.isConnected&&!previous.closest('[inert],[hidden]'))previous.focus({preventScroll:true});};
 },[onClose]);
 return <div className="sheet-layer"><button className="sheet-backdrop" onClick={onClose} aria-label="关闭面板" tabIndex={-1}/><div className="sheet" role="dialog" aria-modal="true" aria-labelledby="farm-sheet-title" ref={panel} tabIndex={-1}><div className="sheet-handle"/><div className="sheet-heading"><div><h2 id="farm-sheet-title">{title}</h2>{subtitle&&<p className="eyebrow">{subtitle}</p>}</div><button className="icon-button sheet-close" onClick={onClose} aria-label="关闭面板"><X size={20}/></button></div>{notice}{children}</div></div>;
}
