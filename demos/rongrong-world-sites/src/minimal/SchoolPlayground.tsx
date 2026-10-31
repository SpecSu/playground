import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Home,Users,Plus,Minus,PersonStanding,Pause,Play,X} from 'lucide-react';
import {PanelHelp} from './PanelHelp.tsx';
import {SCHOOL_PLAYGROUND_FRIEND as friend} from './playground-friend.ts';
import {PLAYGROUND_ADMISSION} from './playground-catalog.ts';
import {playgroundRunRecord} from './playground-run-contract.ts';
import {LunarShowcaseAssetLibrary} from './lunar-showcase-assets.ts';
import {activeLunarShowcaseScope} from './lunar-showcase-resources.ts';
import type {SchoolPlaygroundWorld} from './SchoolPlaygroundWorld.ts';
import type {PlaygroundSnapshot} from './playground-scene.ts';
import './friends.css';import './playground.css';
const loading:PlaygroundSnapshot={status:'loading',paused:false,blocked:false,selectedId:null,count:0,message:'正在准备八人跑队…'};
/** Dedicated sample visitor: parent owns the paused home World/camera/session. */
export function SchoolPlayground({onHome,onFriends,viewerKey='local-guest',audioControl}:{onHome:()=>void;onFriends:()=>void;viewerKey?:string;audioControl?:ReactNode}){
 const loadingStatus=useRef<HTMLParagraphElement>(null),focusRecovery=useRef<HTMLElement|null>(null);
 const pickerId=useId(),pickerButton=useRef<HTMLButtonElement>(null),picker=useRef<HTMLDivElement>(null);
 const host=useRef<HTMLDivElement>(null),world=useRef<SchoolPlaygroundWorld|null>(null),leaving=useRef(false),blocked=useRef(false);
 const [snapshot,setSnapshot]=useState<PlaygroundSnapshot>(loading),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[notice,setNotice]=useState(''),[pickerOpen,setPickerOpen]=useState(false),[infoOpen,setInfoOpen]=useState(false);
 useEffect(()=>{let alive=true,current:SchoolPlaygroundWorld|undefined,focused=true;leaving.current=false;setSnapshot(loading);setError('');setNotice('');setPickerOpen(false);setInfoOpen(false);
  const modalRoot=host.current?.closest('.egg-farm')??document.body;
  const sync=()=>{if(!alive)return;blocked.current=document.hidden||!focused||[...modalRoot.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(n=>!n.closest('[hidden],[aria-hidden="true"]'));current?.setVisible(!blocked.current);};
  const blur=()=>{focused=false;sync();},focus=()=>{focused=true;sync();};const observer=new window.MutationObserver(sync);observer.observe(modalRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','aria-modal']});window.addEventListener('blur',blur);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',sync);sync();
  const asset=PLAYGROUND_ADMISSION,scope=activeLunarShowcaseScope();
  if(!asset)setError('真正的跑步动作正在准备 · 不使用旧走路动作代替');
  else if(!scope)setError('示例模型资源尚未授权，请回家后重试');
  else void import('./SchoolPlaygroundWorld.ts').then(({SchoolPlaygroundWorld})=>{if(!alive||!host.current)return;const library=new LunarShowcaseAssetLibrary(scope,[playgroundRunRecord(asset.record,asset.run)]);current=new SchoolPlaygroundWorld(host.current,library,asset.run,{changed:value=>{if(alive&&!leaving.current)setSnapshot(value);},ground:(_accepted,message)=>{if(alive){setInfoOpen(false);setPickerOpen(false);setNotice(message);}},select:()=>{if(alive){if(picker.current?.contains(document.activeElement))pickerButton.current?.focus({preventScroll:true});setInfoOpen(true);setPickerOpen(false);setNotice('');}}});world.current=current;sync();setSnapshot(current.snapshot());}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'操场暂时没有打开，请重试');});
  return()=>{alive=false;observer.disconnect();window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',sync);current?.dispose();if(world.current===current)world.current=null;};
 },[viewerKey,attempt]);
 useEffect(()=>{const previous=focusRecovery.current;if(!previous)return;const active=document.activeElement;if(active&&active!==document.body&&active!==previous){focusRecovery.current=null;return;}if(active===previous&&previous.isConnected)return;const target=loadingStatus.current??host.current?.querySelector<HTMLCanvasElement>('canvas');if(target){target.focus({preventScroll:true});focusRecovery.current=target===loadingStatus.current?target:null;}},[snapshot.status,error,attempt]);
 useEffect(()=>{if(pickerOpen)(picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')??picker.current?.querySelector<HTMLButtonElement>('button'))?.focus({preventScroll:true});},[pickerOpen]);
 const send=(input:unknown)=>{if(blocked.current||leaving.current)return;const reply=world.current?.command(input);if(reply)setNotice(reply.message);};
 const home=()=>{if(leaving.current)return;leaving.current=true;world.current?.dispose();world.current=null;onHome();};
 const ready=snapshot.status==='ready'&&!error;
 const choose=(id:string)=>{send({type:'select',instanceId:id});setNotice('');setInfoOpen(true);setPickerOpen(false);pickerButton.current?.focus({preventScroll:true});};
 return <section className="visitor-farm school-playground" aria-label="学校操场（示例串门）"><div ref={host} className="visitor-world egg-scene"/>{audioControl}
  <header className="visitor-location"><div><strong>{friend.name}的操场</strong><span>校园跑道 · 操场示例</span></div><button type="button" onClick={home}><Home size={18} aria-hidden="true"/>回家</button></header>
  <div className="visitor-tools"><button type="button" aria-label="打开好友列表" onClick={()=>{world.current?.setVisible(false);onFriends();}}><Users size={22} aria-hidden="true"/></button><PanelHelp title="操场怎么玩"><p>这是独立的32×24米校园示例，展示名和头像由用户提供，尚未关联真人账号。八个跑步者复用同一豆包模板，各有独立骨骼与跑步相位，不是八个新物种或账号。</p><p>点击地面走过去，镜头会跟着你。点豆包打开小菜单，靠近后可以挥手打招呼；也可以暂停或继续跑队。跑队采用真正的慢跑动作，弯道外列的步频随实际路程调整，保持两列四排。</p><p>八位豆包会一起跑步、为靠近的玩家短暂停让。为保持队形，跑队不支持单人举起、寄养、出售或带走。这里没有正式金币、背包或可转移资产，离开就结束本次展示。模型保留原来的材质和衣服结构，非实时生成。</p></PanelHelp></div>
  <div className="visitor-zoom"><button type="button" aria-label="拉近视角" onClick={()=>world.current?.zoom(.2)}><Plus size={20}/></button><button type="button" aria-label="拉远视角" onClick={()=>world.current?.zoom(-.2)}><Minus size={20}/></button></div>
  {(error||snapshot.status==='failed')?<div className="visitor-status" role="alert"><span>{error||snapshot.message}</span><button type="button" onClick={e=>{if(document.activeElement===e.currentTarget)focusRecovery.current=e.currentTarget;setAttempt(n=>n+1);}}>重试操场</button></div>:!ready?<p ref={loadingStatus} tabIndex={-1} className="visitor-status" role="status">{snapshot.message}</p>:null}
  {notice&&<p className="visitor-notice" role="status">{notice}</p>}
  <footer className="playground-controls">
   {infoOpen&&snapshot.selectedId&&<div className="playground-selected" role="status"><span><strong>豆包 · {snapshot.selectedId.split('-').at(-1)}号</strong><small>临时互动 · 不可带走</small></span><button type="button" onClick={()=>send({type:'greet',instanceId:snapshot.selectedId})}>打招呼</button><button type="button" aria-label="关闭跑步者信息" onClick={()=>{setInfoOpen(false);pickerButton.current?.focus({preventScroll:true});}}><X size={17}/></button></div>}
   {pickerOpen&&<div ref={picker} id={pickerId} className="playground-picker" aria-label="选择示例跑步者" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPickerOpen(false);pickerButton.current?.focus({preventScroll:true});}}}>{Array.from({length:8},(_,i)=>{const id=`school-runner-${i+1}`;return <button key={id} type="button" data-playground-runner aria-label={`查看跑步者${i+1}`} aria-pressed={snapshot.selectedId===id} disabled={!ready} onClick={()=>choose(id)}><PersonStanding size={18} aria-hidden="true"/><span>{i+1}</span></button>;})}</div>}
   <div className="playground-toolbar"><button type="button" className="playground-pause" disabled={!ready} onClick={()=>send({type:snapshot.paused?'resume':'pause'})}>{snapshot.paused?<Play size={16} aria-hidden="true"/>:<Pause size={16} aria-hidden="true"/>}{snapshot.paused?'继续跑步':'全队暂停'}</button><button ref={pickerButton} type="button" aria-label="选择跑步者" aria-expanded={pickerOpen} aria-controls={pickerOpen?pickerId:undefined} disabled={!ready} onClick={()=>{if(!pickerOpen)setInfoOpen(false);setPickerOpen(open=>!open);}}><PersonStanding size={20} aria-hidden="true"/></button></div>
   <small className="playground-hint">点地面行走 · 点伙伴互动 · ＋ / − 缩放</small>
  </footer>
 </section>;
}
