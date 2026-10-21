import {useEffect,useRef,useState,useReducer,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {type Action,type Snapshot,type FarmEvent,type Command} from './model.ts';
import FarmView,{type FarmSheet} from './FarmView.tsx';
import PhoneViewport from './feed/PhoneViewport.tsx';
import type {ClubCameraMode} from './avatars/club-camera.ts';
import type {StickVector} from './feed/club-joystick.ts';
import type {FarmWorld} from './world.ts';
import {persistenceReducer,initialPersistence} from './persistence.ts';
import type {Reply} from '../server/store.ts';
import './style.css';
import {FarmBoundary} from './FarmBoundary.tsx';


function App(){
 const [farm,setFarm]=useState<Snapshot|null>(null),[event,setEvent]=useState<FarmEvent>(),[target,setTarget]=useState('all');
 const [message,setMessage]=useState('正在打开你的农场…'),[assetStatus,setAssetStatus]=useState('正在准备草地…');
 const [io,dispatchIO]=useReducer(persistenceReducer,initialPersistence);const busy=io.busy,error=io.commandError||io.readError;
 const [sheet,setSheet]=useState<FarmSheet>(null),[camera,setCamera]=useState<ClubCameraMode>('overview');
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [tick,setTick]=useState(()=>Date.now());const [clockOffset,setClockOffset]=useState(0);const pending=useRef<Command|null>(null),seen=useRef(new Set<string>());
 const host=useRef<HTMLDivElement>(null),world=useRef<FarmWorld|null>(null),current=useRef({farm,event,target,reduced,camera});useEffect(()=>{current.current={farm,event,target,reduced,camera};},[farm,event,target,reduced,camera]);
 function accept(s:Snapshot){setClockOffset(s.now-Date.now());setFarm(old=>old&&old.revision>s.revision?old:s);}
 async function load(){try{const r=await fetch('/api/farm');if(!r.ok)throw new Error('农场暂时连接不上');accept(await r.json());dispatchIO({type:'readOK'});}catch(e){dispatchIO({type:'readFailed',message:e instanceof Error?e.message:'连接失败'});}}
 async function send(type:string,extra:Omit<Partial<Command>,'type'|'id'>={}){
   if(busy)return;
   const c=pending.current||{id:crypto.randomUUID(),type,...extra};pending.current=c;dispatchIO({type:'submit',command:c});setMessage('正在回应并保存…');
   try{const r=await fetch('/api/farm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});const data=await r.json();if(!r.ok)throw new Error(data.error||'本地保存失败');const reply=data as Reply;
     accept(reply.snapshot);setMessage(reply.message);pending.current=null;dispatchIO({type:'saved'});
     if(reply.event&&!seen.current.has(reply.event.id)){seen.current.add(reply.event.id);setEvent(reply.event);}
   }catch(e){dispatchIO({type:'failed',message:(e instanceof Error?e.message:'保存失败')+' · 点击重试会沿用同一个指令，不会重复结算'});}
 }
 useEffect(()=>{void(async()=>{await load();await send('visit');})();const poll=setInterval(()=>{if(!pending.current)void load();},15000);const timer=setInterval(()=>setTick(Date.now()),250);return()=>{clearInterval(poll);clearInterval(timer);};},[]);
 const ready=!!farm;
 useEffect(()=>{if(!ready||!host.current||!current.current.farm)return;let cancelled=false;const element=host.current;
   void import('./world.ts').then(({FarmWorld})=>{if(cancelled)return;try{const w=new FarmWorld(element,current.current.farm!,{select:id=>setTarget(id),status:setAssetStatus});world.current=w;w.set(current.current.farm!,current.current.event,current.current.target,current.current.reduced,current.current.camera);}catch(e){setAssetStatus('3D 无法启动，请确认 Chrome 支持 WebGL 后刷新。');console.error(e instanceof Error?e.message:'WebGL 不可用');}}).catch(()=>{if(!cancelled)setAssetStatus('3D 模块加载失败，请刷新重试；关系记录已保留');});
   return()=>{cancelled=true;world.current?.dispose();world.current=null;};
 },[ready]);
 useEffect(()=>{if(farm)world.current?.set(farm,event,target,reduced,camera);},[farm,event,target,reduced,camera]);
 const onMove=useCallback((vector:StickVector)=>world.current?.move({x:vector.x,z:-vector.y}),[]);
 const onStop=useCallback(()=>world.current?.move({x:0,z:0}),[]);
 const onSheet=useCallback((next:FarmSheet)=>{world.current?.move({x:0,z:0});setSheet(next);},[]);
 const now=tick+clockOffset;
 const animal=farm?.animals.find(a=>a.id===target)||farm?.animals[0];
 const learned=farm?.animals.some(a=>(a.habits.dance?.count??0)>=3),imitated=farm?.animals.some(a=>(a.habits.dance?.count??0)>=2);
 const guide=!imitated?'对大家跳舞，看看三种回应':!learned?'隔一会再跳舞，让它们慢慢学会':!farm?.sharedEvents?'让奶蛙带一次合拍':!farm.demoMode?'下次来访，它们还会记得你':'去舞台一起蹦，也可以留下星点卷毛';
 const nextLearn=animal?.habits.dance?Math.max(0,Math.ceil((animal.habits.dance.lastAt+12000-now)/1000)):0;
 if(!farm)return <main className="app-shell app-shell-v020"><PhoneViewport><section className="feed-window feed-v020 farm-feed"><div className="farm-loading"><h1>绒绒农场</h1><p>{error||message}</p>{error&&<button onClick={()=>void load()}>重新连接</button>}</div></section></PhoneViewport></main>;
 return <FarmView farm={farm} target={target} camera={camera} reduced={reduced} sheet={sheet} busy={busy} pending={!!io.pending} error={error} message={message} assetStatus={assetStatus} now={now} guide={guide} nextLearn={nextLearn} worldRef={host} onTarget={setTarget} onSheet={onSheet} onCommand={(type,extra)=>void send(type,extra)} onAction={(action:Action)=>void send('act',{action,target})} onCamera={setCamera} onReduced={()=>setReduced(v=>!v)} onMove={onMove} onStop={onStop}/>;
}
createRoot(document.getElementById('root')!).render(<FarmBoundary><App/></FarmBoundary>);
