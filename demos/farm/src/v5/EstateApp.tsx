import {useCallback,useEffect,useRef,useState} from 'react';
import type {ClubCameraMode} from '../avatars/club-camera.ts';
import type {StickVector} from '../feed/club-joystick.ts';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import EstateView,{type EstateSheet} from './EstateView.tsx';
import {type EstateSnapshot,type EstateCommand} from './estate.ts';
import type {Theme} from './creation.ts';
import type {BuildingKind,GridPoint} from './layout.ts';
import type {EstateWorld} from './EstateWorld.ts';
import type {EstateResponse} from '../../server/estate-store.ts';

type Ghost={x:number;z:number;kind:BuildingKind;valid:boolean};
export default function EstateApp(){
 const [data,setData]=useState<EstateSnapshot|null>(null),[target,setTarget]=useState(''),[sheet,setSheet]=useState<EstateSheet>(null),[camera,setCamera]=useState<ClubCameraMode>('third-person');
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('正在打开你的庄园…'),[assetStatus,setAssetStatus]=useState(''),[ghost,setGhost]=useState<Ghost>(),[previewTheme,setPreviewTheme]=useState<Theme>();
 const host=useRef<HTMLDivElement>(null),world=useRef<EstateWorld|null>(null),state=useRef(data),pending=useRef<EstateCommand|null>(null),inFlight=useRef(false),mounted=useRef(true),current=useRef({target,reduced,camera,ghost,previewTheme});
 state.current=data;current.current={target,reduced,camera,ghost,previewTheme};
 const accept=useCallback((next:EstateSnapshot)=>{if(!mounted.current)return;state.current=next;setData(old=>old&&old.revision>next.revision?old:next);setTarget(old=>next.profile.animals.some(a=>a.id===old)?old:next.profile.animals[0]?.id??'');},[]);
 const queue=useRef<{command:EstateCommand;quiet:boolean}[]>([]),dispatchRef=useRef<(c:EstateCommand,quiet:boolean)=>Promise<boolean>>(async()=>false);
 const dispatch=useCallback(async(c:EstateCommand,quiet:boolean)=>{
  inFlight.current=true;pending.current=c;if(!quiet)setBusy(true);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch('/api/estate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c),signal:controller.signal});const reply=await r.json();if(!r.ok)throw new Error(reply.error??'本地保存失败');const result=reply as EstateResponse;pending.current=null;accept(result.snapshot);if(mounted.current){setError('');if(c.type!=='move'||!result.accepted)setMessage(result.message);}return result.accepted;}
  catch(e){if(mounted.current)setError(`${e instanceof Error?e.message:'连接失败'} · 重试沿用原请求，不会重复扣除`);return false;}
  finally{clearTimeout(timeout);inFlight.current=false;const next=!pending.current?queue.current.shift():undefined;if(next&&mounted.current)void dispatchRef.current(next.command,next.quiet);else if(mounted.current)setBusy(false);}
 },[accept]);
 dispatchRef.current=dispatch;
 const send=useCallback(async(type:string,extra:Record<string,unknown>={},quiet=false)=>{
  if(type==='retry'){if(inFlight.current||!pending.current)return false;return dispatch(pending.current,false);}
  if(pending.current&&!inFlight.current)return false;
  const capture=type==='creation'&&(extra.command as {type?:string})?.type==='saveWork'?world.current?.capture():undefined;
  const c:EstateCommand={id:crypto.randomUUID(),type,...(capture?{capture}:{}),session:state.current?.profile.session,...(type==='cancel'?{jobId:state.current?.profile.job?.id}:{}),...extra};
  if(inFlight.current){if(quiet&&type!=='move')return false;if(type==='move')queue.current=queue.current.filter(q=>q.command.type!=='move');queue.current.push({command:c,quiet});if(!quiet)setBusy(true);return true;}
  return dispatch(c,quiet);
 },[dispatch]);
 const load=useCallback(async()=>{try{const r=await fetch('/api/estate');if(!r.ok)throw new Error('庄园暂时连接不上');accept(await r.json());setError('');return true;}catch(e){setError(e instanceof Error?e.message:'连接失败');return false;}},[accept]);
 useEffect(()=>{mounted.current=true;void(async()=>{if(await load()){const ok=await send('enter');if(ok&&state.current?.profile.tutorial==='choose')setSheet('guardian');}})();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&state.current&&!inFlight.current&&!pending.current){const p=state.current.profile;if(p.job?.type==='feed'&&current.current.target&&p.job.target!==current.current.target)void send('cancel',{jobId:p.job.id},true);else void send('pulse',{},true);}},500);
  const visible=()=>{if(document.visibilityState==='hidden'){world.current?.move({x:0,z:0});return;}if(!inFlight.current&&!pending.current)void send('enter');};document.addEventListener('visibilitychange',visible);return()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[load,send]);
 const inspect=useCallback((id:string)=>{world.current?.move({x:0,z:0});if(id==='guardian'){setSheet('guardian');return;}const p=state.current?.profile;if(!p?.animals.some(a=>a.id===id))return;if(p.job?.type==='feed'&&p.job.target!==id)void send('cancel');setTarget(id);setPreviewTheme(undefined);setGhost(undefined);setSheet('animal');},[send]);
 const destination=useCallback((to:GridPoint)=>{if(!pending.current||inFlight.current)void send('move',{to},true);},[send]);
 const ready=!!data;
 useEffect(()=>{if(!ready||!host.current||!state.current)return;let cancelled=false;const el=host.current;void import('./EstateWorld.ts').then(({EstateWorld})=>{if(cancelled)return;try{const scene=new EstateWorld(el,state.current!,{select:inspect,destination,status:setAssetStatus});world.current=scene;const c=current.current;scene.set(state.current!,c.target,c.reduced,c.camera,c.ghost,c.previewTheme);}catch(e){setAssetStatus('3D 无法启动，请检查 Chrome 的 WebGL 支持；存档仍保留');console.error(e instanceof Error?e.message:'WebGL error');}}).catch(()=>{if(!cancelled)setAssetStatus('3D 模块加载失败，请刷新重试');});return()=>{cancelled=true;world.current?.dispose();world.current=null;};},[ready,inspect,destination]);
 useEffect(()=>{if(data)world.current?.set(data,target,reduced,camera,ghost,previewTheme);},[data,target,reduced,camera,ghost,previewTheme]);
 const onSheet=useCallback((next:EstateSheet)=>{world.current?.move({x:0,z:0});setSheet(next);if(next!=='creation')setPreviewTheme(undefined);if(next!=='build')setGhost(undefined);},[]);
 const onMove=useCallback((v:StickVector)=>world.current?.move({x:v.x,z:-v.y}),[]),onStop=useCallback(()=>world.current?.move({x:0,z:0}),[]);
 const command=useCallback((type:string,extra:Record<string,unknown>={})=>{if(type==='retry'&&!pending.current)void load();else void send(type,extra);},[load,send]);
 if(!data)return <main className="app-shell app-shell-v020"><PhoneViewport><section className="feed-window feed-v020 farm-feed"><div className="farm-loading"><h1>绒绒庄园</h1><p>{error||message}</p>{error&&<button onClick={()=>void load()}>重新连接</button>}</div></section></PhoneViewport></main>;
 return <EstateView data={data} target={target} sheet={sheet} camera={camera} reduced={reduced} busy={busy} message={message} error={error} assetStatus={assetStatus} worldRef={host} onCommand={command} onSheet={onSheet} onInspect={inspect} onCamera={setCamera} onMove={onMove} onStop={onStop} onReduced={()=>setReduced(v=>!v)} onGhost={setGhost} onThemePreview={setPreviewTheme}/>;
}
