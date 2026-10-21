import {useEffect,useRef,useState,useReducer,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {type Action,type Snapshot,type FarmEvent,type Command} from './model.ts';
import FarmView,{type FarmSheet} from './FarmView.tsx';
import PhoneViewport from './feed/PhoneViewport.tsx';
import type {ClubCameraMode} from './avatars/club-camera.ts';
import type {StickVector} from './feed/club-joystick.ts';
import type {FarmWorld} from './world.ts';
import {persistenceReducer,initialPersistence} from './persistence.ts';
import {journey} from './journey.ts';
import type {Reply} from '../server/store.ts';
import {FarmBoundary} from './FarmBoundary.tsx';
import './style.css';

function App(){
 const [farm,setFarm]=useState<Snapshot|null>(null),[event,setEvent]=useState<FarmEvent>(),[target,setTarget]=useState('all');
 const [message,setMessage]=useState('正在打开你的农场…'),[messageUntil,setMessageUntil]=useState(0),[assetStatus,setAssetStatus]=useState('正在准备草地…');
 const [io,dispatchIO]=useReducer(persistenceReducer,initialPersistence),[sheet,setSheet]=useState<FarmSheet>(null),[camera,setCamera]=useState<ClubCameraMode>('overview');
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [tick,setTick]=useState(()=>Date.now()),[clockOffset,setClockOffset]=useState(0),[inspectionVersion,bumpInspection]=useState(0);
 const pending=useRef<Command|null>(null),inFlight=useRef(false),seen=useRef(new Set<string>()),inspectQueue=useRef(new Set<string>());
 const host=useRef<HTMLDivElement>(null),world=useRef<FarmWorld|null>(null),current=useRef({farm,event,target,reduced,camera});
 useEffect(()=>{current.current={farm,event,target,reduced,camera};},[farm,event,target,reduced,camera]);
 const accept=useCallback((s:Snapshot)=>{setClockOffset(s.now-Date.now());setFarm(old=>old&&old.revision>s.revision?old:s);},[]);
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/farm');if(!r.ok)throw new Error('农场暂时连接不上');accept(await r.json());dispatchIO({type:'readOK'});}
  catch(e){dispatchIO({type:'readFailed',message:e instanceof Error?e.message:'连接失败'});}
 },[accept]);
 const send=useCallback(async(type:string,extra:Omit<Partial<Command>,'type'|'id'>={})=>{
  if(inFlight.current)return;
  let c:Command;
  if(type==='retry'){if(!pending.current)return;c=pending.current;}
  else{if(pending.current)return;c={id:crypto.randomUUID(),type,...extra};}
  inFlight.current=true;pending.current=c;dispatchIO({type:'submit',command:c});setMessage('正在回应并保存…');
  try{
   const r=await fetch('/api/farm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)}),data=await r.json();
   if(!r.ok)throw new Error(data.error||'本地保存失败');const reply=data as Reply;
   accept(reply.snapshot);setMessage(reply.message);setMessageUntil(reply.snapshot.now+6000);pending.current=null;dispatchIO({type:'saved'});
   if(reply.event&&!seen.current.has(reply.event.id)){seen.current.add(reply.event.id);setEvent(reply.event);}
  }catch(e){dispatchIO({type:'failed',message:(e instanceof Error?e.message:'保存失败')+' · 重试会沿用原指令，不会重复结算'});}
  finally{inFlight.current=false;}
 },[accept]);
 const onMove=useCallback((v:StickVector)=>world.current?.move({x:v.x,z:-v.y}),[]);
 const onStop=useCallback(()=>world.current?.move({x:0,z:0}),[]);
 const onSheet=useCallback((next:FarmSheet)=>{world.current?.move({x:0,z:0});setSheet(next);},[]);
 const inspect=useCallback((id:string)=>{
  if(id==='guardian'){onSheet('guardian');return;}
  if(!['pipi','momo','doudou'].includes(id))return;
  setTarget(id);onSheet('residents');inspectQueue.current.add(id);bumpInspection(v=>v+1);
 },[onSheet]);
 useEffect(()=>{
  void(async()=>{await load();await send('visit');})();
  const poll=setInterval(()=>{if(!pending.current&&!inFlight.current)void load();},15000),timer=setInterval(()=>setTick(Date.now()),250);
  return()=>{clearInterval(poll);clearInterval(timer);};
 },[load,send]);
 useEffect(()=>{
  if(!farm||inFlight.current||io.pending)return;
  for(const id of [...inspectQueue.current])if(farm.book.met.includes(id))inspectQueue.current.delete(id);
  const next=inspectQueue.current.values().next().value;if(next){inspectQueue.current.delete(next);void send('inspect',{target:next});}
 },[farm,io.busy,io.pending,inspectionVersion,send]);
 const ready=!!farm;
 useEffect(()=>{
  if(!ready||!host.current||!current.current.farm)return;let cancelled=false;const element=host.current;
  void import('./world.ts').then(({FarmWorld})=>{
   if(cancelled)return;
   try{const w=new FarmWorld(element,current.current.farm!,{select:inspect,status:setAssetStatus});world.current=w;w.set(current.current.farm!,current.current.event,current.current.target,current.current.reduced,current.current.camera);}
   catch(e){setAssetStatus('3D 无法启动，请确认 Chrome 支持 WebGL 后刷新。');console.error(e instanceof Error?e.message:'WebGL不可用');}
  }).catch(()=>{if(!cancelled)setAssetStatus('3D 模块加载失败，请刷新重试；关系记录已保留');});
  return()=>{cancelled=true;world.current?.dispose();world.current=null;};
 },[ready,inspect]);
 useEffect(()=>{if(farm)world.current?.set(farm,event,target,reduced,camera);},[farm,event,target,reduced,camera]);
 const now=tick+clockOffset,error=io.commandError||io.readError;
 const animal=farm?.animals.find(a=>a.id===target)||farm?.animals[0];
 const items=farm?journey(farm):[],rewards=items.filter(q=>q.ready&&!q.claimed).length,next=items.find(q=>!q.ready&&!q.claimed);
 const guide=farm?.company?'朋友在陪你，看看左上的陪伴进度':rewards?`手账里有${rewards}份羊毛可以收下`:next?.hint??'舞台搭好了，再和朋友玩一会儿';
 const nextLearn=animal?.habits.dance&&animal.habits.dance.count<3?Math.max(0,Math.ceil((animal.habits.dance.lastAt+12000-now)/1000)):0;
 if(!farm)return <main className="app-shell app-shell-v020"><PhoneViewport><section className="feed-window feed-v020 farm-feed"><div className="farm-loading"><h1>绒绒农场</h1><p>{error||message}</p>{error&&<button onClick={()=>void load()}>重新连接</button>}</div></section></PhoneViewport></main>;
 return <FarmView farm={farm} event={event} target={target} camera={camera} reduced={reduced} sheet={sheet} busy={io.busy} pending={!!io.pending} error={error} message={message} messageUntil={messageUntil} assetStatus={assetStatus} now={now} guide={guide} nextLearn={nextLearn} worldRef={host} onInspect={inspect} onTarget={setTarget} onSheet={onSheet} onCommand={(type,extra)=>{if(type==='retry'&&!pending.current)void load();else void send(type,extra);}} onAction={(action:Action)=>void send('act',{action,target})} onCamera={setCamera} onReduced={()=>setReduced(v=>!v)} onMove={onMove} onStop={onStop}/>;
}
createRoot(document.getElementById('root')!).render(<FarmBoundary><App/></FarmBoundary>);
