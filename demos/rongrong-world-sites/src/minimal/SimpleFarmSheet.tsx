import {useEffect,useRef,type ReactNode,type KeyboardEvent} from 'react';

/** The small settings/bag sheets use the same keyboard contract as the atlas. */
export default function SimpleFarmSheet({label,onClose,children}:{label:string;onClose:()=>void;children:ReactNode}){
 const sheet=useRef<HTMLElement>(null);
 useEffect(()=>{
  const opener=document.activeElement;
  sheet.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({preventScroll:true});
  return()=>{
   if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});
   else document.querySelector<HTMLElement>('.minimal-world canvas')?.focus({preventScroll:true});
  };
 },[]);
 const keyDown=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
  if(event.key!=='Tab')return;
  const controls=sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');if(!controls?.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 return <div className="egg-sheet-shade" onClick={onClose}><section className="egg-sheet" role="dialog" aria-modal="true" aria-label={label} ref={sheet} onKeyDown={keyDown} onClick={event=>event.stopPropagation()}>{children}</section></div>;
}
