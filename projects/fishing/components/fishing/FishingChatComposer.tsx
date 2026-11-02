'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUp,MessageCircle,X} from 'lucide-react';
import {normalizeFishingChatDraft,shouldSendFishingChatKey,validateFishingChatText} from '@/lib/fishing-chat';

export type FishingChatComposerProps={joined:boolean;disabled:boolean;interrupt:boolean;onSend:(text:string)=>Promise<boolean>;onFocusChange?:(focused:boolean)=>void};
/** Draft belongs to this mounted composer, including when the keyboard is dismissed for a bite. */
export default function FishingChatComposer({joined,disabled,interrupt,onSend,onFocusChange}:FishingChatComposerProps){
 const [draft,setDraft]=useState(''),[focused,setFocused]=useState(false),[sending,setSending]=useState(false);
 const input=useRef<HTMLInputElement>(null),composing=useRef(false),compositionEndedAt=useRef(-Infinity),busy=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!joined||interrupt){input.current?.blur();composing.current=false;queueMicrotask(()=>{if(alive.current){setFocused(false);onFocusChange?.(false);}});}},[joined,interrupt,onFocusChange]);
 const dismiss=()=>{input.current?.blur();composing.current=false;setFocused(false);onFocusChange?.(false);};
 const send=async(event?:FormEvent)=>{
  event?.preventDefault();
  if(!joined||disabled||interrupt||busy.current||composing.current||Date.now()-compositionEndedAt.current<=250)return;
  const text=validateFishingChatText(draft);if(!text)return;
  busy.current=true;setSending(true);const submittedDraft=draft;
  try{if(await onSend(text)){if(alive.current)setDraft(current=>current===submittedDraft?'':current);dismiss();}}
  catch{/* The room reports network errors; an unacknowledged draft stays editable. */}
  finally{busy.current=false;if(alive.current)setSending(false);}
 };
 if(!joined)return null;
 return <form className={`fishing-chat-composer${focused?' is-focused':''}`} onSubmit={event=>void send(event)} aria-label="同船聊天">
  <MessageCircle className="chat-composer-icon" size={19} aria-hidden="true"/>
  <input ref={input} aria-label="和同船朋友说句话" placeholder="说点什么..." value={draft} disabled={disabled||interrupt||sending} type="text" enterKeyHint="send" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={320}
   onChange={event=>setDraft(composing.current?event.target.value:normalizeFishingChatDraft(event.target.value))}
   onPaste={event=>{event.preventDefault();const start=event.currentTarget.selectionStart??draft.length,end=event.currentTarget.selectionEnd??start,pasted=event.clipboardData.getData('text/plain');const prefix=normalizeFishingChatDraft(draft.slice(0,start)+pasted);const next=normalizeFishingChatDraft(draft.slice(0,start)+pasted+draft.slice(end));setDraft(next);const caret=Math.min(prefix.length,next.length);queueMicrotask(()=>input.current?.setSelectionRange(caret,caret));}}
   onCompositionStart={()=>{composing.current=true;}}
   onCompositionEnd={event=>{composing.current=false;compositionEndedAt.current=Date.now();setDraft(normalizeFishingChatDraft(event.currentTarget.value));}}
   onFocus={()=>{setFocused(true);onFocusChange?.(true);}} onBlur={()=>{setFocused(false);onFocusChange?.(false);composing.current=false;}}
   onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();dismiss();return;}if(event.key!=='Enter'||composing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;event.preventDefault();if(shouldSendFishingChatKey(event.nativeEvent,false,compositionEndedAt.current,Date.now()))void send();}}/>
  {focused&&<button type="button" className="chat-dismiss" aria-label="收起键盘并保留草稿" onPointerDown={event=>event.preventDefault()} onClick={dismiss}><X size={15}/></button>}
  <button type="submit" className="chat-send" onPointerDown={event=>event.preventDefault()} aria-label="发送聊天" aria-busy={sending} disabled={disabled||interrupt||sending||!validateFishingChatText(draft)}><ArrowUp size={18}/></button>
 </form>;
}
