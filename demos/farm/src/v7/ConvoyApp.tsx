import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Copy,Flag,Map,Shield,Truck,Pause,Eye,DoorOpen,RotateCcw} from 'lucide-react';
import {ConvoyWorld} from './ConvoyWorld.ts';
import {CONVOY_END,CONVOY_GATES,CONVOY_SCOUT,GUARDIAN_NAMES,routeCells,type ConvoyCommand,type ConvoyGuardian,type ConvoyReply,type ConvoyRoute,type ConvoySnapshot,type Point} from './convoy.ts';
import './convoy.css';
const guardianInfo={dog:'挡住狼8秒，给车队争取时间',cat:'引开狼6秒，让车队趁机通过',frog:'泡泡减慢狼，附近货物暂时受保护'};
export function convoyNextStop(s:ConvoySnapshot):Point{
 const room=s.room,gate=CONVOY_GATES[room.route];if(!room.gates[room.route])return {x:7,z:gate.z};return CONVOY_END;
}
export function convoyInstruction(s:ConvoySnapshot):string{
 if(s.room.phase!=='active')return s.room.lastHint;
 if(s.selfRole==='carrier')return s.room.gates[s.room.route]?'门已开！点「带队回家」，也能点亮路分段走。':'你负责带车。先走到门前，守护者负责开门。';
 return !s.room.gates[s.room.route]?'你负责守护。先到门旁，再开门让车队通过。':s.room.elapsed<6?'可以去观察点侦察，再沿路跟着车队。':'靠近狼，使用守护技能；运货者继续带队。';
}
const uuid=()=>crypto.randomUUID();
export default function ConvoyApp(){
 const [snapshot,setSnapshot]=useState<ConvoySnapshot|null>(null),[guardian,setGuardian]=useState<ConvoyGuardian>('dog'),[route,setRoute]=useState<ConvoyRoute>('short');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[mapOpen,setMapOpen]=useState(false);
 const host=useRef<HTMLDivElement>(null),world=useRef<ConvoyWorld|null>(null),current=useRef<ConvoySnapshot|null>(null),roomId=useRef(''),sequence=useRef(0),chain=useRef(Promise.resolve()),retry=useRef<ConvoyCommand|null>(null),mounted=useRef(true),controller=useRef<AbortController|null>(null),initial=useRef(false);
 const accept=useCallback((reply:ConvoyReply)=>{
  if(!mounted.current)return;if(reply.snapshot){const next=reply.snapshot,old=current.current;if(!old||old.room.id!==next.room.id||next.room.revision>=old.room.revision){current.current=next;sequence.current=Math.max(sequence.current,next.sequence);roomId.current=next.room.id;setSnapshot(next);world.current?.set(next);}}
  if(reply.message)setMessage(reply.message);setFailed(false);
 },[]);
 const execute=useCallback(async(command:ConvoyCommand)=>{
  if(!mounted.current)return;setBusy(true);retry.current=command;
  try{const response=await fetch('/api/convoy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});if(!response.ok)throw new Error(`服务暂不可用（${response.status}）`);const reply=await response.json() as ConvoyReply;accept(reply);retry.current=null;
   if(reply.accepted&&reply.snapshot){const url=new URL(location.href);url.searchParams.set('convoy',reply.snapshot.room.id);history.replaceState(null,'',url);}
  }catch(error){if(mounted.current){setFailed(true);setMessage(error instanceof Error?error.message:'连接中断，进度已保留；请重试');}}
  finally{if(mounted.current)setBusy(false);}
 },[accept]);
 const send=useCallback((type:string,extras:Partial<ConvoyCommand>={})=>{
  chain.current=chain.current.then(async()=>{if(!mounted.current)return;const command:ConvoyCommand={id:uuid(),type,...extras};if(type!=='create'){command.roomId=roomId.current;if(!['join','pulse','pause'].includes(type))command.sequence=++sequence.current;}await execute(command);});
 },[execute]);
 const move=useRef<(point:Point)=>void>(()=>{});move.current=p=>{if(!busy&&current.current?.room.phase==='active')send('move',p);};
 useEffect(()=>{
  mounted.current=true;const query=new URLSearchParams(location.search).get('convoy');if(query&&query!=='new'&&!initial.current){initial.current=true;roomId.current=query;send('join');}
  const poll=async()=>{
   if(!roomId.current||document.hidden||controller.current)return;const abort=new AbortController();controller.current=abort;
   try{const response=await fetch(`/api/convoy?room=${encodeURIComponent(roomId.current)}`,{signal:abort.signal});if(!response.ok)throw new Error('护送连接中断，正在保留进度');const reply=await response.json() as ConvoyReply;if(reply.snapshot){const oldMessage=reply.message;reply.message='';accept(reply);reply.message=oldMessage;}}
   catch(error){if(!abort.signal.aborted&&mounted.current){setFailed(true);setMessage(error instanceof Error?error.message:'连接暂时中断');}}
   finally{if(controller.current===abort)controller.current=null;}
  };
  const timer=window.setInterval(()=>void poll(),350);
  const pause=()=>{if(roomId.current)navigator.sendBeacon('/api/convoy',new Blob([JSON.stringify({id:uuid(),type:'pause',roomId:roomId.current})],{type:'application/json'}));};
  const visibility=()=>{if(document.hidden){controller.current?.abort();pause();}else void poll();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);
  return()=>{mounted.current=false;clearInterval(timer);controller.current?.abort();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);pause();};
 },[accept,send]);
 useEffect(()=>{
  if(!snapshot||world.current||!host.current)return;
  try{world.current=new ConvoyWorld(host.current,p=>move.current(p),setMessage);world.current.set(snapshot);}
  catch(error){setMessage(error instanceof Error?`场景未能启动：${error.message}`:'场景未能启动，请刷新重试');setFailed(true);}
 },[snapshot]);
 useEffect(()=>()=>{world.current?.dispose();world.current=null;},[]);
 const invite=async()=>{try{await navigator.clipboard.writeText(location.href);setMessage('链接已复制。用这台Mac的Chrome无痕窗口打开，接管守护；普通标签页还是你。');}catch{setMessage(`请复制地址栏，在Chrome无痕窗口打开：${location.href}`);}};
 const back=()=>{const url=new URL(location.href);url.searchParams.delete('convoy');location.assign(url);};
 const restart=()=>{const url=new URL(location.href);url.searchParams.set('convoy','new');location.assign(url);};
 if(!snapshot)return <main className="convoy-shell"><section className="convoy-feed convoy-start"><button className="convoy-back" onClick={back}><ArrowLeft size={18}/>农场</button><div className="convoy-intro-art"><Truck size={54}/><Shield size={44}/></div><h1>一起送它们回家</h1><p>你带车，我开路。</p><p className="convoy-muted">最多3分钟 · 同一服务双设备原型</p><div className="convoy-choice"><b>这次带谁守护</b><div className="convoy-choice-row">{(['dog','cat','frog'] as const).map(g=><button key={g} aria-pressed={guardian===g} onClick={()=>setGuardian(g)}>{GUARDIAN_NAMES[g]}</button>)}</div><small>{guardianInfo[guardian]}</small></div><div className="convoy-choice"><b>选择一条回家路</b><button aria-pressed={route==='short'} onClick={()=>setRoute('short')}>短路 · 12格 <small>狼跑得快，需要及时断后</small></button><button aria-pressed={route==='covered'} onClick={()=>setRoute('covered')}>掩护路 · 26格 <small>走得更远，草丛会减慢狼</small></button></div><button className="convoy-primary" disabled={busy} onClick={()=>send('create',{guardian,route})}>{busy?'正在连接…':'出发 · 由NPC伙伴先陪同'}</button><p className="convoy-muted">进入后可邀请第二个独立设备身份接管守护。<br/>这里没有好友账号或公网匹配。</p><p className="convoy-notice">仅训练货物与NPC羊，不转移农场资产，不发金币。</p>{message&&<p role="status" className="convoy-message">{message}</p>}{failed&&<button disabled={busy} onClick={()=>retry.current?void execute(retry.current):send('join')}>重试原请求</button>}</section></main>;
 const {room,selfRole}=snapshot,isCarrier=selfRole==='carrier',gate=CONVOY_GATES[room.route],active=room.phase==='active',cooldown=Math.max(0,Math.ceil(room.cooldownUntil-room.elapsed));
 return <main className="convoy-shell"><section className="convoy-feed"><div ref={host} className="convoy-world" aria-label="护送场景，点击地面行走，或使用WASD"/><header className="convoy-header"><button aria-label="返回农场" onClick={back}><ArrowLeft size={18}/></button><div><b>{isCarrier?'你来运货':'你来守护'}</b><small>{snapshot.guardControl==='npc'?'NPC守护伙伴':snapshot.carrierControl==='npc'?'另一设备暂离 · NPC带车':'两位设备正在协作'}</small></div><span>{Math.max(0,180-Math.floor(room.elapsed))}s</span><button aria-label="邀请另一个独立设备" onClick={()=>void invite()}><Copy size={17}/></button></header><div className="convoy-status"><span>训练货物 <b>{Math.ceil(room.integrity)}%</b></span><span>{room.route==='short'?'短路':'掩护路'} · {room.gates[room.route]?'门已开':'门未开'}</span><button aria-pressed={mapOpen} onClick={()=>setMapOpen(!mapOpen)}><Map size={15}/>路线</button></div><div className="convoy-guide" role="status">{convoyInstruction(snapshot)}</div>
 {mapOpen&&<div className="convoy-map"><svg viewBox="0 0 160 140" aria-label="护送路线小地图">{(['short','covered']as const).map(r=><polyline key={r} points={routeCells(r).map(p=>`${p.x*10},${p.z*10}`).join(' ')} fill="none" stroke={r===room.route?'#f1bd68':'#acc696'} strokeWidth="5"/>)}<circle cx={room.carrier.x*10} cy={room.carrier.z*10} r="5" fill="#638fb1"/><circle cx={room.guard.x*10} cy={room.guard.z*10} r="5" fill="#a17ac5"/><rect x={gate.x*10-4} y={gate.z*10-4} width="8" height="8" fill={room.gates[room.route]?'#72b985':'#b86557'}/><text x="117" y="30" fontSize="8">庇护所</text></svg><small>蓝：运货　紫：守护</small></div>}
 <div className="convoy-footer">{message&&<div className={`convoy-toast${failed?' is-error':''}`} role="status">{message}</div>}{failed&&<button disabled={busy} onClick={()=>retry.current?void execute(retry.current):send('pulse')}>重试连接（保留原请求）</button>}{active?<><div className="convoy-actions">{isCarrier?<><button className="convoy-primary" disabled={busy} onClick={()=>send('move',convoyNextStop(snapshot))}><Truck size={18}/>{room.gates[room.route]?'带队回家':'先到门前'}</button><button disabled={busy} onClick={()=>send('stop')}><Pause size={17}/>停下等伙伴</button></>:<><button disabled={busy} onClick={()=>send('move',{x:7,z:gate.z})}><Flag size={17}/>到门旁</button><button disabled={busy} onClick={()=>send('gate',{open:!room.gates[room.route]})}><DoorOpen size={17}/>{room.gates[room.route]?'关门':'开门'}</button><button disabled={busy} onClick={()=>Math.hypot(room.guard.x-CONVOY_SCOUT.x,room.guard.z-CONVOY_SCOUT.z)<=1.5?send('scout'):send('move',CONVOY_SCOUT)}><Eye size={17}/>{room.scouted?'已侦察':'去侦察'}</button><button className="convoy-primary" disabled={busy||cooldown>0} onClick={()=>send('ability')}><Shield size={17}/>{cooldown?`${cooldown}秒`:'守护'}</button></>}</div><small>{isCarrier?'点击亮路带车；你不能同时指挥守护。':'点击地面移动；技能要靠近狼才能生效。'}</small></>:<div className="convoy-finish"><b>{room.phase==='success'?'护送完成':'这趟训练结束'}</b><p>{room.result?.outcome==='delivered'?`货物保全 ${room.result.integrity}% · 用时 ${Math.ceil(room.result.elapsed)}秒`:'自家动物、关系与库存均未受影响。'}</p><button className="convoy-primary" onClick={restart}><RotateCcw size={17}/>换路线再来一趟</button></div>}<div className="convoy-notice">训练原型 · 不转移资产 / 不发金币 · 仅本服务设备联机</div></div></section></main>;
}
