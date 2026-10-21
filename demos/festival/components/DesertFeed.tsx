'use client';
/* The approved feed/profile SVG geometry is preserved verbatim. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ClipboardEvent, type ReactNode } from 'react';
import { Flame, Hammer, LoaderCircle, LogOut, Maximize, MessageCircle, ScanEye, Smile, Sparkles, UserRoundPlus, Users, X, Compass, ArrowUp, Volume2, VolumeX } from 'lucide-react';
import PhoneViewport from './PhoneViewport';
import ProfilePage, { getProfileMedia, type ProfilePanelName } from './ProfilePage';
import FeedHeart from './FeedHeart';
import ClubJoystick from './ClubJoystick';
import FestivalMemoryPhoto from './FestivalMemoryPhoto';
import { useFestivalMemoryPhoto } from '@/hooks/useFestivalMemoryPhoto';
import DesertScene, { type DesertStick, type DesertView } from './DesertScene';
import { useFestivalRoom } from '@/hooks/useFestivalRoom';
import { useFestivalAudio } from '@/hooks/useFestivalAudio';
import { CLUB_AVATAR_CATALOG, CLUB_AVATAR_PICKER_OPTIONS, DEFAULT_AVATAR_PRESET } from '@/lib/club-avatar-catalog';
import { projectParticipant, FESTIVAL_MONUMENT_RADIUS, isFestivalBuildLocked } from '@/lib/festival-types';
import { FESTIVAL_PREDICTION_TTL_MS, selectFestivalMovement, type FestivalPrediction, type FestivalRenderedSelf } from '@/lib/festival-motion';
import { AVATAR_PRESETS, resolveAvatarPreset, type AvatarPreset } from '@/lib/room-types';
import { INSTALLATION_DESIGNS } from '@/src/desert/installations';
import { isFestivalSendKey, isValidFestivalChat, limitFestivalDraft, normalizeFestivalChat } from '@/lib/festival-chat';
import { countdownLabel, INSTALLATION_CONSTRUCTION_MS } from '@/src/desert/visual-math';
import './FeedInterface.css';
import './DesertFeed.css';

type SheetName=ProfilePanelName|'join'|'create'|'actions'|'about'|'search'|'following'|null;
const ART_NAMES=INSTALLATION_DESIGNS.map(design=>design.name);
const ART_NOTES=['巨型人形 · 日环','镜面人体 · 解构','肋骨巨兽 · 废土','失衡积木 · 后现代','金属轨道 · 动力','轻盈风帆 · 建筑','透光花瓣 · 玻璃','废土天线 · 电波','双重日环 · 地标','无尽楼梯 · 超现实','悬垂触须 · 混合材质','缠绕双塔 · 记忆'];
const EMOTES=[{id:'wave',name:'招呼',icon:'👋'},{id:'love',name:'比心',icon:'❤️'},{id:'laugh',name:'大笑',icon:'🤣'},{id:'spin',name:'转圈',icon:'💫'},{id:'dance',name:'跳舞',icon:'🪩'},{id:'ghost',name:'鬼脸',icon:'👻'}] as const;
const FESTIVAL_LIKE_BASE=962;
const LIKE_KEY='dreamina-desert-festival:liked:v1',PROFILE_KEY='dreamina-desert-festival:profile:v1';
const LIVE_MEDIA={id:'live-room',kind:'live' as const,src:'/festival-preview.png',alt:'火人节荒原艺术场景示意',count:'0'};
function Sheet({title,eyebrow='',onClose,children,className=''}:{title:string;eyebrow?:string;onClose:()=>void;children:ReactNode;className?:string}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const nodes=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]);(nodes()[0]??panel.current)?.focus({preventScroll:true});const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key!=='Tab')return;const items=nodes();if(!items.length){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected&&!previous.closest('[inert],[hidden]'))previous.focus({preventScroll:true});};},[onClose]);
 return <div className="sheet-layer"><button className="sheet-backdrop" onClick={onClose} aria-label="关闭面板" tabIndex={-1}/><div className={className?`sheet ${className}`:'sheet'} role="dialog" aria-modal="true" aria-labelledby="desert-sheet-title" ref={panel} tabIndex={-1}><div className="sheet-handle"/><div className="sheet-heading"><div><h2 id="desert-sheet-title">{title}</h2>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}</div><button className="icon-button" aria-label="关闭面板" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
export default function DesertFeed(){
 const {snapshot,connection,feedback,setFeedback,pending,send,serverTime,getSnapshot,reconnect}=useFestivalRoom();
 const [page,setPage]=useState<'feed'|'profile'>('feed'),[sheet,setSheet]=useState<SheetName>(null),[panelTitle,setPanelTitle]=useState('');
 const [feedTab,setFeedTab]=useState<'recommended'|'following'>('recommended'),[liked,setLiked]=useState(false),[toast,setToast]=useState('');
 const [name,setName]=useState(''),[preset,setPreset]=useState<AvatarPreset>(DEFAULT_AVATAR_PRESET),[text,setText]=useState(''),[search,setSearch]=useState('');
 const [view,setView]=useState<DesertView>('vista'),[focusVersion,setFocusVersion]=useState(0),[selectedKind,setSelectedKind]=useState<number|null>(null);
 const [now,setNow]=useState(0),[statusTime,setStatusTime]=useState(''),[joystickReset,setJoystickReset]=useState(0),[buildPending,setBuildPending]=useState(false);
 const [chatFocused,setChatFocused]=useState(false),[chatSending,setChatSending]=useState(false);
 const chatInput=useRef<HTMLInputElement>(null),composing=useRef(false),composedAt=useRef(-Infinity),draftRef=useRef(''),draftVersion=useRef(0),chatGeneration=useRef(0);
 const joystick=useRef<DesertStick>({x:0,y:0,active:false}),snapshotRef=useRef(snapshot),serverTimeRef=useRef(serverTime);const buildLock=useRef(false),joinLock=useRef(false),sayLock=useRef(false),sheetGeneration=useRef(0);
 const prediction=useRef<FestivalPrediction|null>(null),predictionToken=useRef(0),movementVersion=useRef(0),renderedSelf=useRef<FestivalRenderedSelf|null>(null);
 useEffect(()=>{snapshotRef.current=snapshot;serverTimeRef.current=serverTime;},[snapshot,serverTime]);
 const self=snapshot?.participants.find(p=>p.id===snapshot.self.id),joined=snapshot?.self.role==='participant'&&!!self,count=snapshot?.participants.length??0;
 const ready=connection==='live'&&!!snapshot;
 const audio=useFestivalAudio(page==='feed'&&ready,getSnapshot,serverTime);
 const soundLabel=audio.playing?'关闭音乐与音效':audio.unavailable?'声音暂不可用，点击重试':audio.needsGesture?'点击重试开启声音':'开启音乐与音效';
 const phase=snapshot?((now||snapshot.serverNow)<snapshot.round.burnAt?'building':(now||snapshot.serverNow)<snapshot.round.ashesAt?'burning':'ashes'):'building';
 const buildingLocked=isFestivalBuildLocked(self?.buildTask,now||snapshot?.serverNow||0,snapshot?.round.burnAt??0);
 const ownAvatar=CLUB_AVATAR_CATALOG.find(a=>a.id===resolveAvatarPreset(self?.preset??preset))??CLUB_AVATAR_CATALOG[0];
 const allWorks=[...(snapshot?.installations??[]),...(snapshot?.ambientInstallations??[])];
 const allPeople=[...(snapshot?.participants??[]),...(snapshot?.ambientParticipants??[])];
 const ownWorks=snapshot?.installations.filter(art=>art.actorId===snapshot.self.id)??[];
 const stopMovement=useCallback(()=>{
  const wasActive=joystick.current.active;joystick.current={x:0,y:0,active:false};const current=getSnapshot();
  const p=current?.participants.find(person=>person.id===current.self.id);if(!p){prediction.current=null;return;}
  if(isFestivalBuildLocked(p.buildTask,serverTimeRef.current(),current!.round.burnAt)||(p.buildTask&&!wasActive)){prediction.current=null;return;}
  const now=serverTimeRef.current(),local=prediction.current,rendered=renderedSelf.current,at=rendered?.actorId===p.id?rendered:projectParticipant(selectFestivalMovement(p,local,now),now);
  if(wasActive||at.speed>0){const token=++predictionToken.current;prediction.current={actorId:p.id,x:at.x,z:at.z,targetX:at.x,targetZ:at.z,moveAt:now,heading:at.heading,expiresAt:now+FESTIVAL_PREDICTION_TTL_MS,token};void send({type:'stop'},true).finally(()=>{if(prediction.current?.token===token)prediction.current=null;});}
  // A second release must not erase an already pending stop prediction.
 },[send,getSnapshot]);
 const closeChat=useCallback(()=>{chatGeneration.current++;composing.current=false;chatInput.current?.blur();setChatFocused(false);},[]);
 const onPhotoPresent=useCallback(()=>{stopMovement();setJoystickReset(value=>value+1);},[stopMovement]);
 const memoryPhoto=useFestivalMemoryPhoto({getSnapshot,now:now||snapshot?.serverNow||0,active:page==='feed',blocked:!!sheet||selectedKind!==null||chatFocused,onPresent:onPhotoPresent});
 const closeSheet=useCallback(()=>{sheetGeneration.current++;setSheet(null);},[]);
 const openSheet=useCallback((next:SheetName,title='')=>{closeChat();stopMovement();sheetGeneration.current++;setPanelTitle(title);setSheet(next);setJoystickReset(x=>x+1);},[stopMovement,closeChat]);
 const selectPage=useCallback((next:'feed'|'profile')=>{closeChat();stopMovement();closeSheet();setSelectedKind(null);setPage(next);},[stopMovement,closeSheet,closeChat]);
 const showProfile=useCallback(()=>{if(self){setName(self.name);setPreset(resolveAvatarPreset(self.preset));}openSheet('join');},[self,openSheet]);
 const onJoystickInput=useCallback((v:{x:number;y:number},active:boolean)=>{joystick.current={...v,active};},[]);
 const onMove=useCallback((x:number,z:number)=>{
  const state=getSnapshot(),p=state?.participants.find(person=>person.id===state.self.id);
  if(!p||state?.self.role!=='participant'||connection!=='live'||!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(x,z)>79||Math.hypot(x,z)<FESTIVAL_MONUMENT_RADIUS)return false;
  if(isFestivalBuildLocked(p.buildTask,serverTimeRef.current(),state.round.burnAt)){joystick.current={x:0,y:0,active:false};prediction.current=null;setToast('正在搭建，完成后可移动；仍可拖动查看视角');return false;}
  movementVersion.current++;
  if(p.buildTask&&serverTimeRef.current()<p.buildTask.arrivalAt)setToast('已取消搭建，继续漫游');
  const now=serverTimeRef.current(),local=prediction.current,rendered=renderedSelf.current,at=rendered?.actorId===p.id?rendered:projectParticipant(selectFestivalMovement(p,local,now),now),token=++predictionToken.current;
  prediction.current={actorId:p.id,x:at.x,z:at.z,targetX:x,targetZ:z,moveAt:now,heading:at.heading,expiresAt:now+FESTIVAL_PREDICTION_TTL_MS,token};
  void send({type:'move',x,z},true).finally(()=>{if(prediction.current?.token===token)prediction.current=null;});
  return true;
 },[send,getSnapshot,connection]);
 const notify=useCallback((message:string)=>setToast(message),[]);
 const buildSelectionVersion=useRef(0);
 const cancelPlacement=()=>{buildSelectionVersion.current++;setSelectedKind(null);};
 useEffect(()=>{
  let cancelled=false;queueMicrotask(()=>{if(cancelled)return;try{setLiked(localStorage.getItem(LIKE_KEY)==='1');const saved=JSON.parse(localStorage.getItem(PROFILE_KEY)??'null');if(saved?.name)setName(saved.name);if(AVATAR_PRESETS.includes(saved?.preset))setPreset(resolveAvatarPreset(saved.preset));}catch{/* Private browsing still works. */}});
  const timer=setInterval(()=>{setNow(serverTime());setStatusTime(new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));},250);
  return()=>{cancelled=true;clearInterval(timer);};
 },[serverTime]);
 useEffect(()=>{const hide=()=>{if(document.visibilityState!=='visible')stopMovement();};window.addEventListener('blur',stopMovement);document.addEventListener('visibilitychange',hide);return()=>{window.removeEventListener('blur',stopMovement);document.removeEventListener('visibilitychange',hide);};},[stopMovement]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),6500);return()=>clearTimeout(timer);},[feedback,setFeedback]);
 useEffect(()=>{if(!selectedKind&&selectedKind!==0)return;if(phase!=='building')queueMicrotask(()=>{setSelectedKind(null);setToast('焚烧开始。一起看作品回归荒原');});},[phase,selectedKind]);
 const join=async(event:FormEvent)=>{event.preventDefault();if(joinLock.current)return;joinLock.current=true;try{const generation=sheetGeneration.current;const clean=name.trim();if(!clean)return;audio.requestFromGesture();const ok=await send({type:joined?'profile':'join',name:clean,preset});if(!ok)return;if(getSnapshot()?.self.role!=='participant'){setToast('房间暂时满员，可以先围观，出现空位后再加入');return;}try{localStorage.setItem(PROFILE_KEY,JSON.stringify({name:clean,preset}));}catch{}if(sheetGeneration.current===generation)closeSheet();setView('follow');setFocusVersion(x=>x+1);setToast(joined?'分身已同步':'欢迎来到荒原。点击地面，开始漫游');}finally{joinLock.current=false;}};
 const startCreate=()=>{setPage('feed');if(buildingLocked){setToast('正在搭建，完成后再创作下一件作品');return;}if(!joined){showProfile();return;}if(phase!=='building'){setToast('这一轮正在燃烧。灰烬散去后，重新开始');return;}if(ownWorks.length>=3){setToast('这一轮你已留下 3 件作品，等下一轮再创造');return;}openSheet('create');};
 const selectArt=(kind:number)=>{if(buildingLocked){setToast('正在搭建，完成后再创作下一件作品');return;}if(!joined){showProfile();return;}if(phase!=='building'){setToast('这一轮正在燃烧，下一轮再创作');return;}stopMovement();buildSelectionVersion.current++;setSelectedKind(kind);closeSheet();setView('aerial');setFocusVersion(x=>x+1);setToast('点击任意空旷沙地，自由放置你的作品');};
 const onPlace=useCallback((x:number,z:number)=>{const current=getSnapshot();if(selectedKind===null||buildLock.current||!current)return;const builder=current.participants.find(p=>p.id===current.self.id);if(isFestivalBuildLocked(builder?.buildTask,serverTimeRef.current(),current.round.burnAt)){setToast('正在搭建，完成后再创作下一件作品');return;}const version=buildSelectionVersion.current;buildLock.current=true;prediction.current=null;setBuildPending(true);void send({type:'build',kind:selectedKind,x,z,roundIndex:current.round.index}).then(ok=>{if(ok){if(buildSelectionVersion.current===version)setSelectedKind(null);setToast('正在走向搭建位置，到达后开始敲打搭建');}}).finally(()=>{buildLock.current=false;setBuildPending(false);});},[selectedKind,send,getSnapshot]);
 const updateDraft=(value:string)=>{const next=composing.current?value:limitFestivalDraft(value);draftVersion.current++;draftRef.current=next;setText(next);};
 const pasteChat=(event:ClipboardEvent<HTMLInputElement>)=>{
  event.preventDefault();const current=event.currentTarget,old=draftRef.current,start=current.selectionStart??old.length,end=current.selectionEnd??start;
  updateDraft(old.slice(0,start)+normalizeFestivalChat(event.clipboardData.getData('text'))+old.slice(end));
 };
 const blurChat=()=>{if(composing.current){composing.current=false;composedAt.current=Date.now();updateDraft(draftRef.current);}setChatFocused(false);};
 const focusChat=()=>{stopMovement();setJoystickReset(value=>value+1);chatGeneration.current++;setChatFocused(true);};
 const submitText=async(event:Pick<FormEvent,'preventDefault'>)=>{
  event.preventDefault();const current=getSnapshot(),actor=current?.participants.find(person=>person.id===current.self.id);
  const message=normalizeFestivalChat(draftRef.current).trim();
  if(!ready||current?.self.role!=='participant'||!actor||!isValidFestivalChat(message)||sayLock.current||composing.current||Date.now()-composedAt.current<=200)return;
  sayLock.current=true;setChatSending(true);const version=draftVersion.current,generation=chatGeneration.current,actorId=actor.id,joinedAt=actor.joinedAt;
  try{const ok=await send({type:'say',text:message});const latest=getSnapshot(),owner=latest?.participants.find(person=>person.id===actorId);
   if(ok&&latest?.self.id===actorId&&latest.self.role==='participant'&&owner?.joinedAt===joinedAt&&draftVersion.current===version){draftRef.current='';setText('');if(chatGeneration.current===generation)closeChat();}
  }finally{sayLock.current=false;setChatSending(false);}
 };
 useEffect(()=>{if(!joined||!ready)queueMicrotask(closeChat);},[joined,ready,closeChat]);
 const leave=async()=>{const generation=sheetGeneration.current;stopMovement();const ok=await send({type:'leave'});if(ok){if(sheetGeneration.current===generation){closeSheet();setView('vista');}setToast('已离开，仍可围观这一轮');}};
 const chooseEmote=async(emote:string)=>{const generation=sheetGeneration.current;const ok=await send(emote==='ghost'?{type:'say',text:'👻'}:{type:'emote',emote});if(ok&&sheetGeneration.current===generation)closeSheet();};
 const invite=async()=>{try{await navigator.clipboard.writeText(window.location.href);setToast('邀请链接已复制，发给朋友一起进入荒原');}catch{setToast('可复制浏览器地址，邀请朋友进入同一个荒原');}};
 const toggleLike=()=>{const next=!liked;setLiked(next);try{localStorage.setItem(LIKE_KEY,next?'1':'0');}catch{}};
 const targetTime=phase==='building'?snapshot?.round.burnAt:phase==='burning'?snapshot?.round.ashesAt:snapshot?.round.endsAt;
 const remaining=targetTime?Math.max(0,targetTime-(now||snapshot?.serverNow||0)):0;
 const clockCaption='燃烧仪式倒计时';
 const clockValue=!snapshot?'--:--':countdownLabel(remaining);
 const mediaPreview=[...getProfileMedia('works',liked),...getProfileMedia('appearances',liked)].find(item=>item.alt===panelTitle);
 return <main className="app-shell app-shell-v020 desert-shell">
  <aside className="demo-caption desert-caption" aria-hidden="true"><span>火人节 · v0.3.3</span><h1>让想象生长。<br/>让一切燃烧。</h1><p>在无垠荒原，留下一个梦。<br/>五分钟后，一起见证它消失。</p><div className="desert-coordinates">40°47′ N &nbsp; 119°12′ W<br/><b>DESERT RITUAL / DREAMINA</b></div></aside>
  <PhoneViewport keyboardOpen={chatFocused&&joined}><section className={`feed-window feed-v020 desert-feed ${joined?'joined':''} ${chatFocused?'chat-is-focused':''}`} aria-label="火人节 · 实时共享荒原">
   <section className={`app-page feed-page ${page!=='feed'?'is-background':''}`} aria-label="首页" aria-hidden={page!=='feed'} inert={page!=='feed'||!!sheet||memoryPhoto.isOpen}>
    <div className="club-stage"><DesertScene active={page==='feed'} ownMarkerEnabled={ready&&joined} snapshot={snapshot} getSnapshot={getSnapshot} serverTime={serverTime} selectedKind={selectedKind} view={view} focusVersion={focusVersion} movementVersion={movementVersion} joystick={joystick} prediction={prediction} renderedSelf={renderedSelf} onMove={onMove} onPlace={onPlace} onMessage={notify} onCelebrationPhoto={memoryPhoto.onCapture}/></div>
    <div className="stage-top-shade"/><div className="stage-bottom-shade"/>
    <header className="feed-header"><div className="feed-tabs" role="tablist" aria-label="动态分类"><button role="tab" aria-selected={feedTab==='following'} onClick={()=>{setFeedTab('following');openSheet('following');}}>关注</button><button role="tab" aria-selected={feedTab==='recommended'} onClick={()=>{setFeedTab('recommended');closeSheet();}}>推荐</button></div><button className="header-icon bell" onClick={()=>openSheet('notifications')} aria-label="通知"><img src="/feed-ui/icons/bell.svg" alt=""/></button><button className="header-icon search" onClick={()=>openSheet('search')} aria-label="搜索"><img src="/feed-ui/icons/search.svg" alt=""/></button></header>
    <div className="festival-status-strip"><div className="festival-status-title"><span>火人节</span></div>{phase==='building'?<div className="burn-clock" role="timer" aria-label={`${clockCaption}，${clockValue}`}><div className="burn-clock-plate"><span className="burn-clock-digits">{clockValue}</span></div><span className="burn-clock-caption">{clockCaption}</span></div>:<div className="festival-phase-status" role={phase==='burning'?'status':'timer'}>{phase==='burning'?'燃烧仪式进行中':`${clockValue} 荒原重生`}</div>}<div className="festival-status-actions"><button className="festival-sound-toggle" onClick={audio.toggleFromGesture} aria-label={soundLabel} title={soundLabel} aria-pressed={audio.playing} disabled={!ready}>{audio.playing?<Volume2 size={19}/>:<VolumeX size={19}/>}</button></div></div>
    {buildingLocked&&self?.buildTask&&<div className="placement-banner" role="status"><div><Hammer size={15}/><span>搭建中 · {Math.min(99,Math.max(0,Math.floor(((now||snapshot!.serverNow)-self.buildTask.arrivalAt)/(self.buildTask.finishAt-self.buildTask.arrivalAt)*100)))}%<small>完成后可移动 · 可拖动查看视角</small></span></div></div>}
    {!buildingLocked&&selectedKind!==null&&<div className="placement-banner" role="status"><div><Hammer size={15}/><span>{buildPending?'正在搭建…':`搭建 ${ART_NAMES[selectedKind]}`}<small>点击任意空旷沙地 · 绿圈可搭建，红圈不可搭建</small></span></div><button onClick={cancelPlacement} aria-label="取消搭建"><X size={18}/></button></div>}
    <div className="creator-caption"><div className="creator-copy"><div className="creator-line"><button className="creator-name" onClick={()=>selectPage('profile')}>@苏贝壳</button><span className={`live-tag feed-live-tag ${!ready?'is-connecting':''}`} role="status" aria-label={`实时共享房间，在线${count}人，最多10人`}><i/><span>{ready?'实时':connection==='connecting'?'连接中':'重连中'}</span><span className="status-separator">·</span><span>在线 {count}/10</span></span></div><p>造一个梦，然后让它燃烧。</p></div><button className="feed-like" type="button" aria-pressed={liked} aria-label={liked?'取消点赞':'点赞'} title="点赞只保存在此设备" onClick={toggleLike}><FeedHeart/><span className="feed-like-count">{FESTIVAL_LIKE_BASE+(liked?1:0)}</span></button></div>
    {(connection==='offline'||connection==='reconnecting')&&<div className="connection-warning" role="alert"><span>共享房间连接中断，正在重试。{snapshot?'当前为上次同步的状态。':''}</span><button onClick={()=>void reconnect()}>重试</button></div>}
    {joined&&<form className="festival-chat" onSubmit={submitText} aria-label="荒原聊天"><div className="festival-chat-field"><MessageCircle size={18} aria-hidden="true"/><input ref={chatInput} type="text" value={text} aria-label="说点什么..." placeholder="说点什么..." autoComplete="off" enterKeyHint="send" disabled={!ready} onFocus={focusChat} onBlur={blurChat} onChange={event=>updateDraft(event.target.value)} onPaste={pasteChat} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={event=>{composing.current=false;composedAt.current=Date.now();updateDraft(event.currentTarget.value);}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeChat();return;}if(event.key==='Enter'){const native=event.nativeEvent;if(composing.current||native.isComposing||native.keyCode===229)return;event.preventDefault();if(isFestivalSendKey({key:event.key,shiftKey:event.shiftKey,isComposing:native.isComposing,keyCode:native.keyCode},composing.current,composedAt.current))void submitText(event);}}}/><button type="submit" className="festival-chat-send" aria-label="发送短句" disabled={!ready||chatSending||!isValidFestivalChat(normalizeFestivalChat(text))} onPointerDown={event=>event.preventDefault()}>{chatSending?<LoaderCircle size={17} className="spin"/>:<ArrowUp size={18}/>}</button></div>{chatFocused&&<button type="button" className="festival-chat-cancel" aria-label="取消输入" onPointerDown={event=>event.preventDefault()} onClick={closeChat}>取消</button>}</form>}
    <section className="lower-controls" aria-label="火人节互动控制">
     <div className="interaction-dock">{joined&&<ClubJoystick onInput={onJoystickInput} enabled={ready&&!chatFocused&&!buildingLocked&&page==='feed'&&!sheet&&!memoryPhoto.isOpen&&selectedKind===null} resetKey={joystickReset} onStop={stopMovement}/>}
      <button className="join-control" onClick={showProfile} disabled={!ready||pending} aria-label={joined?`修改你的形象，${self?.name}`:'进入荒原'}>{joined?<span className="joined-avatar" aria-hidden="true" style={ownAvatar.previewImage?{backgroundImage:`url("${ownAvatar.previewImage}")`}:undefined}>{ownAvatar.previewImage?null:ownAvatar.previewIcon}</span>:<UserRoundPlus className="join-icon"/>}<span className="join-label">{joined?'我的分身':'进入荒原'}</span></button>
      {joined&&<><button className="dock-control create-art-control" onClick={startCreate} disabled={!ready||buildingLocked} aria-label="搭建艺术装置"><Hammer/><span>创作</span></button><button className="dock-control" onClick={()=>openSheet('actions')} disabled={!ready} aria-label="表情与动作"><Smile/><span>表情</span></button></>}
      <button className="dock-control festival-view-control" onClick={()=>{setView(view==='vista'?'follow':view==='follow'?'aerial':'vista');setFocusVersion(x=>x+1);}} aria-label={`切换到${view==='vista'?'沉浸':view==='follow'?'俯瞰':'远眺'}视角`}>{view==='vista'?<ScanEye/>:view==='follow'?<Maximize/>:<Compass/>}<span>视角</span></button>
     </div>
    </section>
   </section>
   <div className="profile-mount" hidden={page!=='profile'} inert={!!sheet||memoryPhoto.isOpen}><ProfilePage liked={liked} onOpenFeed={()=>selectPage('feed')} onOpenPanel={openSheet} onManageAvatar={showProfile} liveMedia={LIVE_MEDIA} liveTitle="火人节荒原" bio="来和我一起，在荒原造一个梦"/></div>
   <div className="status-bar" aria-hidden="true"><span className="status-time">{statusTime}</span><div className="status-symbols"><img className="signal" src="/feed-ui/icons/signal.svg" alt=""/><img className="wifi" src="/feed-ui/icons/wifi.svg" alt=""/><img className="battery" src="/feed-ui/icons/battery.svg" alt=""/></div></div>
   <nav className="bottom-nav" aria-label="主导航" inert={memoryPhoto.isOpen}><button className={page==='feed'?'selected':''} aria-current={page==='feed'?'page':undefined} onClick={()=>selectPage('feed')}>首页</button><button className="create-button" onClick={startCreate} aria-label="创建"><img src="/feed-ui/icons/plus.svg" alt=""/></button><button className={page==='profile'?'selected':''} aria-current={page==='profile'?'page':undefined} onClick={()=>selectPage('profile')}>我的</button></nav>
   {sheet==='join'&&<Sheet className="festival-avatar-sheet" title={joined?'我的分身':'选个分身，进入荒原'} eyebrow="带上想象力，其他都可以留在这里。" onClose={closeSheet}>
    <form onSubmit={join} className="join-form">
     <div className="festival-avatar-field"><label className="field-label" htmlFor="desert-name">荒原里的名字</label><input id="desert-name" className="nickname-input" value={name} onChange={event=>setName([...event.target.value].slice(0,20).join(''))} placeholder="怎么称呼你？" autoComplete="nickname" maxLength={40} required/></div>
     <div className="festival-avatar-scroll">
      <div className="avatar-options option-grid avatar-grid" role="group" aria-label="选择形象">{CLUB_AVATAR_PICKER_OPTIONS.map(avatar=><button key={avatar.id} type="button" className={`avatar-option option-card ${avatar.category==='human'?'avatar-option-human':''} ${preset===avatar.id?'selected':''}`} aria-label={avatar.label} aria-pressed={preset===avatar.id} onClick={()=>setPreset(avatar.id)}><span className="avatar-preview" aria-hidden="true" style={avatar.previewImage?{backgroundImage:`url("${avatar.previewImage}")`}:undefined}>{avatar.previewImage?null:avatar.previewIcon}</span><small>{avatar.label}</small></button>)}</div>
      {joined&&<button className="list-row leave-button" type="button" onClick={()=>void leave()} disabled={pending}><LogOut size={15}/>离开荒原</button>}
      <p className="privacy-note">昵称和分身会同步给这个房间的所有人。最多 10 人同时漫游；满员时可以围观。</p>
     </div>
     <div className="festival-avatar-footer"><button className="primary-button" type="submit" disabled={pending||!ready||!name.trim()}><span>{joined?'保存形象':count>=10?'尝试加入 · 房间已满':'进入荒原'}</span>{pending&&<LoaderCircle size={16} className="spin"/>}</button></div>
    </form>
   </Sheet>}
   {sheet==='create'&&<Sheet title="选择艺术装置" onClose={closeSheet}><div className="installation-grid">{INSTALLATION_DESIGNS.map((design,kind)=><button key={design.id} className={`installation-card ${selectedKind===kind?'selected':''}`} aria-pressed={selectedKind===kind} onClick={()=>selectArt(kind)} disabled={phase!=='building'||pending} style={{'--art-color':design.color} as React.CSSProperties}><div className="installation-image"><img src={`/installation-previews/${design.id}.png`} alt="" onError={event=>{event.currentTarget.hidden=true;}}/><span aria-hidden="true">{design.icon}</span></div><strong>{ART_NAMES[kind]}</strong><small>{ART_NOTES[kind]}</small></button>)}</div><p className="sheet-note">每人每轮最多搭建 3 件。作品属于这一刻：倒计时归零后，大家的作品一起燃烧，化为灰烬。</p></Sheet>}
   {sheet==='actions'&&<Sheet title="表情与动作" onClose={closeSheet}><div className="option-grid desert-emotes">{EMOTES.map(emote=><button key={emote.id} className="option-card" disabled={!joined||pending} onClick={()=>void chooseEmote(emote.id)}><span className="option-icon">{emote.icon}</span><span>{emote.name}</span></button>)}</div>{!joined&&<button className="primary-button" onClick={showProfile}>先进入荒原</button>}</Sheet>}

   {sheet==='about'&&<Sheet title="每个梦，都值得燃烧一次。" eyebrow="火人节 / DESERT RITUAL" onClose={closeSheet}><p className="sheet-description">一片没有边界感的荒原，一座 Dreamina 石雕，和此刻在这里的你们。</p><div className="about-facts"><p><Hammer size={19}/><span>点击「创作」，从 12 种艺术装置中选一个，再点击任意空旷沙地。分身会走过去敲打搭建，作品在 {INSTALLATION_CONSTRUCTION_MS / 1000} 秒内逐步成形；点击作品可环绕欣赏，拖动旋转、滚动缩放，视角按钮退出聚焦。绿色轮廓可放置，红色表示太靠近地标、作品或分身。</span></p><p><Flame size={19}/><span>所有人共享 5 分钟创作倒计时。之后经历 35 秒燃烧与坍塌，10 秒灰烬，再开启下一轮。</span></p><p><Users size={19}/><span>最多 10 位真人同时在场。另有 4 位环境伙伴自在漫游、聊天和创作，不占名额或计入在线人数。所有人共享作品与燃烧时刻，中央雕塑与营地保留。</span></p></div><button className="primary-button" onClick={()=>void invite()}>复制邀请链接</button><p className="privacy-note">v0.3.3 · 短句只在房间短暂停留，没有聊天记录。个人主页保留统一框架的示例资料。</p><p className="privacy-note"><a href="/audio/festival/CREDITS.txt" target="_blank" rel="noopener noreferrer">音乐与音效 · 来源及授权</a></p></Sheet>}
   {sheet==='invite'&&<Sheet title="邀请好友" eyebrow="把这一片荒原，分享给想见的人。" onClose={closeSheet}><div className="invite-card desert-invite"><img src="/festival-preview.png" alt="荒原场景示意"/><strong>来和我一起，造一个梦。</strong><p>同一个倒计时，同一场火。</p></div><button className="primary-button" onClick={()=>void invite()}>复制荒原邀请链接</button><p className="sheet-note">朋友打开同一链接，即可进入这个共享房间。房间最多 10 人同时漫游。</p></Sheet>}
   {sheet==='notifications'&&<Sheet title="通知" eyebrow="这一轮荒原里的作品" onClose={closeSheet}>{allWorks.length?[...allWorks].sort((a,b)=>b.createdAt-a.createdAt).slice(0,8).map(art=><div className="list-row" key={art.id}><Sparkles size={15}/><span>{allPeople.find(p=>p.id===art.actorId)?.name??'一位旅人'} 搭建了 {ART_NAMES[art.kind]}</span></div>):<p className="preview-placeholder">风正好，空地还在等第一个梦。</p>}<p className="sheet-note">仅显示这一轮的装置，没有接入账号通知。</p></Sheet>}
   {sheet==='search'&&<Sheet title="搜索" eyebrow="搜索当前荒原、在场的人与艺术装置" onClose={closeSheet}><input className="search-input" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="搜索分身或作品" aria-label="搜索内容"/><button className="list-row" onClick={()=>selectPage('feed')}>火人节 · 共享荒原<span className="row-end">在线 {count} ›</span></button>{snapshot?.participants.filter(p=>search.trim()&&p.name.includes(search.trim())).map(p=><button className="list-row" key={p.id} onClick={()=>{selectPage('feed');setToast(`${p.name} 正在荒原里`);}}>{p.name}<span className="row-end">在线分身 ›</span></button>)}{ART_NAMES.map((name,i)=>({name,i})).filter(item=>search.trim()&&item.name.includes(search.trim())).map(item=><button className="list-row" key={item.i} onClick={()=>joined?selectArt(item.i):showProfile()}>{item.name}<span className="row-end">艺术装置 ›</span></button>)}</Sheet>}
   {sheet==='following'&&<Sheet title="关注" onClose={closeSheet}><p className="preview-placeholder">当前 Demo 是这一片实时荒原，暂未接入账号关注关系。</p><button className="primary-button" onClick={()=>{setFeedTab('recommended');closeSheet();}}>回到推荐</button></Sheet>}
   {sheet==='settings'&&<Sheet title="设置" onClose={closeSheet}><button className="list-row" onClick={()=>openSheet('edit-profile')}>资料与分身<span className="row-end">›</span></button><button className="list-row" onClick={()=>openSheet('about')}>关于火人节<span className="row-end">›</span></button><div className="list-row">版本<span className="row-end">v0.3.3</span></div><p className="sheet-note">点赞仅保存在此设备。个人主页的统计和媒体为统一界面的示例内容。</p></Sheet>}
   {sheet==='edit-profile'&&<Sheet title="资料与分身" onClose={closeSheet}><div className="invite-card"><img src="/feed-ui/archive-placeholder.svg" alt="示例主页头像"/><strong>Demo 用户</strong><p>来和我一起，在荒原造一个梦</p></div><button className="primary-button" onClick={showProfile}>编辑荒原昵称与分身</button><p className="sheet-note">主页保留示例资料。荒原内的昵称与形象会真实同步给所有在场的人。</p></Sheet>}
   {sheet==='credits'&&<Sheet title="我的积分" eyebrow="参考界面的示例数据" onClose={closeSheet}><div className="invite-card"><strong>527</strong><p>示例积分</p></div><p className="sheet-note">没有接入积分账户、充值或消费功能。</p></Sheet>}
   {(sheet==='drafts'||sheet==='media')&&<Sheet title={panelTitle||(sheet==='drafts'?'草稿箱':'作品预览')} eyebrow="统一界面的示例内容" onClose={closeSheet}>{mediaPreview&&<img className="media-preview-image" src={mediaPreview.src} alt={mediaPreview.alt}/>}<p className="preview-placeholder">{sheet==='drafts'?'主页保留了参考设计的 2 份草稿展示。':'此项目为主页布局中的示例内容。'}</p><p className="sheet-note">没有接入作品账号或媒体播放服务。火人节荒原可以直接体验。</p><button className="primary-button" onClick={()=>selectPage('feed')}>进入火人节荒原</button></Sheet>}
   {memoryPhoto.isOpen&&memoryPhoto.photo&&<FestivalMemoryPhoto key={memoryPhoto.photo.roundIndex} photo={memoryPhoto.photo} onClose={memoryPhoto.dismiss}/>}
   {(toast||feedback)&&<div className="feed-toast" role="status" aria-live="polite">{feedback||toast}</div>}
  </section></PhoneViewport>
 </main>;
}
