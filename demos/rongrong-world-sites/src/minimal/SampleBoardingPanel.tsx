import {useEffect,useId,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {BOARDING_TERMS} from './boarding-contract.ts';
import type {SampleBoardingSnapshot} from './boarding-target.ts';
import {sampleBoardingCandidates,type DemoBoardingAdapter} from './sample-boarding.ts';
import {sampleFarm} from './sample-farms.ts';
import {PanelHelp} from './PanelHelp.tsx';
import './friends.css';
export function SampleBoardingPanel({sampleId,realmId,adapter,onClose}:{sampleId:string;realmId:string;adapter:DemoBoardingAdapter;onClose:()=>void}){
 const [snapshot,setSnapshot]=useState<SampleBoardingSnapshot|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),requestOrder=useRef(0),sequence=useRef(0),busyRef=useRef(false),close=useRef<HTMLButtonElement>(null),section=useRef<HTMLElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
 const title=useId(),candidates=sampleBoardingCandidates(sampleId,realmId),card=sampleFarm(sampleId,0).card;
 const [partnerId,setPartnerId]=useState(candidates.hosts[0]?.id??'');
 const requestId=()=>`demo-${Date.now()}-${++sequence.current}`;
 useEffect(()=>{
  const epoch=++generation.current;let alive=true;setSnapshot(null);setConsent(false);setBusy(false);busyRef.current=false;setError('');setPartnerId(sampleBoardingCandidates(sampleId,realmId).hosts[0]?.id??'');
  const refresh=async()=>{if(busyRef.current)return;const token=++requestOrder.current;try{const result=await adapter.read(sampleId);if(alive&&epoch===generation.current&&token===requestOrder.current&&!busyRef.current&&result.sampleId===sampleId)setSnapshot(result);}catch(e){if(alive&&epoch===generation.current&&token===requestOrder.current&&!busyRef.current)setError(e instanceof Error?e.message:'演示暂时不可用');}};
  void refresh();const timer=window.setInterval(()=>void refresh(),1000),previous=document.activeElement as HTMLElement|null;close.current?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(document.querySelector('[data-panel-help]'))return;if(e.key==='Escape'){e.preventDefault();closeRef.current();}else if(e.key==='Tab'){const nodes=Array.from(section.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')??[]),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);
  return()=>{alive=false;generation.current++;window.clearInterval(timer);document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[sampleId,realmId,adapter]);
 const run=async(work:()=>Promise<SampleBoardingSnapshot>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');const epoch=generation.current;requestOrder.current++;
  try{const result=await work();if(epoch===generation.current&&result.sampleId===sampleId)setSnapshot(result);}catch(e){if(epoch===generation.current)setError(e instanceof Error?e.message:'演示暂时不可用');}finally{if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
 };
 const terminal=!!snapshot&&!['idle','pending','active'].includes(snapshot.status);
 return <div className="friends-shade sample-boarding-shade" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={section} className="friends-panel sample-boarding-panel" role="dialog" aria-modal="true" aria-labelledby={title}>
  <header className="friends-heading"><h2 id={title}>寄养演示</h2><div><PanelHelp title="寄养演示说明"><p>这里只操作这个用户空间的演示伙伴，不会移动、锁定或配对你真正的动物。对方也只是示例角色。</p><p>演示沿用正式寄养的顺序：邀请 → 好友确认 → 寄养 → 产蛋或未产蛋。邀请 {BOARDING_TERMS.inviteMs/60_000} 分钟到期，确认后等待 {BOARDING_TERMS.stayMs/60_000} 分钟。</p><p>成功时蛋归发起方，帮手得到 {BOARDING_TERMS.helperCoins} 枚演示金币；不成功、取消或到期都没有奖励。所有演示结果不能出售、兑换或带回正式牧场。</p><p>“快进这次演示”只推动这条演示记录，不改变正式冷却或真实时间。刷新页面后演示记录会清空。</p></PanelHelp><button type="button" className="friends-close" ref={close} aria-label="关闭寄养演示" onClick={onClose}><X size={20}/></button></div></header>
  <div className="sample-boarding-body"><p className="sample-boarding-host">{card.farmName} <span className="friend-sample-badge">示例</span></p>
  <div className="demo-parent-pair"><div><small>我的演示伙伴</small><strong>{candidates.visitor.name}</strong><span>演示 · 不改变正式动物</span></div><span aria-hidden="true">♡</span><div><label htmlFor={`${title}-partner`}>{card.name}的示例伙伴</label><select id={`${title}-partner`} value={partnerId} disabled={busy||snapshot?.status==='active'} onChange={e=>setPartnerId(e.target.value)}>{candidates.hosts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><span>同物种 · 异性</span></div></div>
  {!snapshot?<p role="status">正在打开演示记录…</p>:<><p className="demo-boarding-status" role="status">{snapshot.message}</p>{snapshot.status==='pending'&&<p className="demo-status-detail">待确认 · {BOARDING_TERMS.inviteMs/60_000} 分钟内有效</p>}{snapshot.status==='active'&&<p className="demo-status-detail">确认后等待 {BOARDING_TERMS.stayMs/60_000} 分钟，或仅快进演示</p>}
  {(snapshot.status==='idle'||terminal)&&<label className="demo-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>蛋归发起方，帮手得 {BOARDING_TERMS.helperCoins} 枚演示金币</span></label>}
  <div className="demo-results"><span>演示蛋 {snapshot.demoEggs}</span><span>帮手演示金币 {snapshot.demoCoins}</span></div><p className="demo-separation">不可带回正式牧场</p>
  <div className="demo-boarding-buttons">{(snapshot.status==='idle'||terminal)&&<button type="button" disabled={busy||!consent} onClick={()=>void run(()=>adapter.invite({sampleId,parentId:candidates.visitor.id,requestId:requestId()}))}>{terminal?'再演示一次':'发出演示邀请'}</button>}{snapshot.status==='pending'&&<button type="button" disabled={busy||!partnerId} onClick={()=>void run(()=>adapter.confirm({sampleId,partnerId,requestId:requestId()}))}>模拟好友同意</button>}{snapshot.status==='active'&&<button type="button" disabled={busy} onClick={()=>void run(()=>adapter.fastForwardDemo(sampleId))}>快进这次演示</button>}{['pending','active'].includes(snapshot.status)&&<button type="button" className="demo-secondary" disabled={busy} onClick={()=>void run(()=>adapter.cancel({sampleId,requestId:requestId()}))}>取消演示</button>}</div></>}{error&&<p role="alert">{error}</p>}
  </div>
 </section></div>;
}
