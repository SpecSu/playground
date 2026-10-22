import {useCallback,useEffect,useRef,useState} from 'react';
import type {ClubCameraMode} from '../avatars/club-camera.ts';
import type {StickVector} from '../feed/club-joystick.ts';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import EstateView,{type EstateSheet} from './EstateView.tsx';
import {type EstateSnapshot,type EstateCommand} from './estate.ts';
import type {Theme} from './creation.ts';
import type {BuildingKind,GridPoint} from './layout.ts';
import type {EstateWorld} from './EstateWorld.ts';
import {initialOpening,advanceOpening,skipOpening,selectOpeningGuardian,openingPresentation,type OpeningState} from './opening.ts';
import {deriveOpeningScene,openingAttention} from './opening-scene.ts';
import OpeningOverlay from './OpeningOverlay.tsx';
import './opening.css';
import type {GuardianKind} from './threat.ts';
import type {EstateResponse} from '../../server/estate-store.ts';

type Replay={opening:OpeningState;running:boolean};
type Ghost={x:number;z:number;kind:BuildingKind;valid:boolean};
export const ESTATE_PULSE_INTERVAL_MS=200;
export default function EstateApp(){
 const [data,setData]=useState<EstateSnapshot|null>(null),[target,setTarget]=useState(''),[sheet,setSheet]=useState<EstateSheet>(null),[camera,setCamera]=useState<ClubCameraMode>('third-person');
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('正在打开你的庄园…'),[assetStatus,setAssetStatus]=useState(''),[ghost,setGhost]=useState<Ghost>(),[previewTheme,setPreviewTheme]=useState<Theme>();
 const [assetsReady,setAssetsReady]=useState(false),[replay,setReplay]=useState<Replay|null>(null),[commandFeedback,setCommandFeedback]=useState('');
 const replayLoaded=useRef(false);
 const enteredSession=useRef(''),automaticFinish=useRef(''),pendingQuiet=useRef(false);
 const host=useRef<HTMLDivElement>(null),world=useRef<EstateWorld|null>(null),state=useRef(data),pending=useRef<EstateCommand|null>(null),inFlight=useRef(false),mounted=useRef(true),current=useRef({target,reduced,camera,ghost,previewTheme,sheet,assetsReady,replay});
 state.current=data;current.current={target,reduced,camera,ghost,previewTheme,sheet,assetsReady,replay};
 const accept=useCallback((next:EstateSnapshot)=>{if(!mounted.current)return;state.current=next;setData(old=>old&&old.revision>next.revision?old:next);setTarget(old=>{if(next.profile.animals.some(a=>a.id===old))return old;const feeding=next.profile.job?.type==='feed'?next.profile.job.target:undefined;return next.profile.animals.find(a=>a.id===feeding)?.id??next.profile.animals[0]?.id??'';});},[]);
 const queue=useRef<{command:EstateCommand;quiet:boolean}[]>([]),dispatchRef=useRef<(c:EstateCommand,quiet:boolean,exact?:boolean)=>Promise<boolean>>(async()=>false);
 const dispatch=useCallback(async(queued:EstateCommand,quiet:boolean,exact=false)=>{
  // A queued click may follow enter/profile, which replaces the session. Bind
  // new requests at dispatch; an uncertain retry must retain its exact payload.
  const c=exact?queued:{...queued,session:state.current?.profile.session};
  inFlight.current=true;pending.current=c;pendingQuiet.current=quiet;if(!quiet||c.type==='finishTutorial')setBusy(true);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch('/api/estate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c),signal:controller.signal});const reply=await r.json();if(!r.ok)throw new Error(reply.error??'本地保存失败');const result=reply as EstateResponse;pending.current=null;if(result.accepted&&['enter','profile','resetProfile'].includes(c.type))enteredSession.current=result.snapshot.profile.session;accept(result.snapshot);if(result.accepted&&['profile','resetProfile'].includes(c.type)&&mounted.current){world.current?.stopInput();queue.current=queue.current.filter(item=>!['move','steer'].includes(item.command.type));setSheet(null);setPreviewTheme(undefined);setGhost(undefined);if(c.type==='resetProfile'){queue.current=[];automaticFinish.current='';setTarget(result.snapshot.profile.animals[0]?.id??'');setReplay(null);try{sessionStorage.removeItem('farm-opening-replay');}catch{/* Replay is optional. */}}}if(result.accepted&&c.type==='finishTutorial'&&!quiet&&mounted.current){setTarget(result.snapshot.profile.animals[0]?.id??'');setSheet('animal');}if(mounted.current){setError('');if(!result.accepted)setCommandFeedback(result.message);else if(c.type!=='pulse')setCommandFeedback('');if(!['move','steer'].includes(c.type)||!result.accepted)setMessage(result.message);}return result.accepted;}
  catch(e){if(mounted.current)setError(`${e instanceof Error?e.message:'连接失败'} · 重试沿用原请求，不会重复扣除`);return false;}
  finally{clearTimeout(timeout);inFlight.current=false;const next=!pending.current?queue.current.shift():undefined;if(next&&mounted.current)void dispatchRef.current(next.command,next.quiet);else if(mounted.current)setBusy(false);}
 },[accept]);
 dispatchRef.current=dispatch;
 const send=useCallback(async(type:string,extra:Record<string,unknown>={},quiet=false)=>{
  if(type==='retry'){if(inFlight.current||!pending.current)return false;return dispatch(pending.current,pendingQuiet.current,true);}
  if(pending.current&&!inFlight.current)return false;
  const capture=type==='creation'&&(extra.command as {type?:string})?.type==='saveWork'?world.current?.capture():undefined;
  const c:EstateCommand={id:crypto.randomUUID(),type,...(capture?{capture}:{}),session:state.current?.profile.session,...(type==='cancel'?{jobId:state.current?.profile.job?.id}:{}),...extra};
  if(inFlight.current){if(quiet&&!['move','steer'].includes(type))return false;if(['move','steer'].includes(type))queue.current=queue.current.filter(q=>!['move','steer'].includes(q.command.type));queue.current.push({command:c,quiet});if(!quiet)setBusy(true);return true;}
  return dispatch(c,quiet);
 },[dispatch]);
 const load=useCallback(async()=>{try{const r=await fetch('/api/estate');if(!r.ok)throw new Error('庄园暂时连接不上');accept(await r.json());setError('');return true;}catch(e){setError(e instanceof Error?e.message:'连接失败');return false;}},[accept]);
 useEffect(()=>{mounted.current=true;void(async()=>{if(await load()){await send('enter');}})();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&state.current&&!inFlight.current&&!pending.current){const p=state.current.profile;if(p.job?.type==='feed'&&current.current.target&&p.job.target!==current.current.target)void send('cancel',{jobId:p.job.id},true);else void send('pulse',{presentationReady:current.current.assetsReady,presentationCovered:!!current.current.sheet,presentationPaused:!!current.current.replay},true);}},ESTATE_PULSE_INTERVAL_MS);
  const visible=()=>{if(document.visibilityState==='hidden'){world.current?.stopInput();return;}if(!inFlight.current&&!pending.current)void send('enter');};document.addEventListener('visibilitychange',visible);return()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[load,send]);
 useEffect(()=>{
  const p=data?.profile;
  if(!data||!p||replay||p.tutorial!=='defend'||p.opening?.stage!=='done'||p.threat?.phase!=='complete'||enteredSession.current!==p.session||inFlight.current||pending.current)return;
  const key=`${data.playerId}:${p.id}:${p.session}:${p.threat.id}`;
  if(automaticFinish.current===key)return;
  automaticFinish.current=key;
  // Finishing the cinematic restores normal play; feeding remains an optional
  // scene/card action instead of another modal gate in front of the ground.
  void send('finishTutorial',{},true);
 },[data,replay,send]);
 const inspect=useCallback((id:string,openCard=true)=>{if(current.current.replay)return;const opening=state.current?.profile.opening;if(opening&&openingPresentation(opening).controlsLocked)return;world.current?.stopInput();if(id==='guardian'){setSheet('guardian');return;}const p=state.current?.profile;if(!p?.animals.some(a=>a.id===id))return;if(p.job?.type==='feed'&&p.job.target!==id)void send('cancel');setTarget(id);setPreviewTheme(undefined);setGhost(undefined);if(openCard)setSheet('animal');},[send]);
 const steer=useCallback((direction:GridPoint)=>{if(!pending.current||inFlight.current)void send('steer',{direction,presentationReady:current.current.assetsReady,presentationCovered:!!current.current.sheet},true);},[send]);
 const destination=useCallback((to:GridPoint)=>{if(!pending.current||inFlight.current)void send('move',{to},true);},[send]);
 const ready=!!data;
 useEffect(()=>{if(!ready||!host.current||!state.current)return;let cancelled=false;const el=host.current;void import('./EstateWorld.ts').then(({EstateWorld})=>{if(cancelled)return;try{const c=current.current,opening=c.replay?.opening??state.current!.profile.opening,initial=opening?deriveOpeningScene(state.current!,opening,{replay:!!c.replay,retreatProgress:state.current!.profile.openingRetreatMs===undefined?undefined:state.current!.profile.openingRetreatMs/3000}):state.current!;const scene=new EstateWorld(el,initial,{select:inspect,destination,steer,status:setAssetStatus,assetsReady:setAssetsReady});world.current=scene;scene.set(initial,c.target,c.reduced,c.camera,c.ghost,c.previewTheme,opening,!!c.replay,opening?openingAttention(state.current!,opening,{replay:!!c.replay,retreatProgress:state.current!.profile.openingRetreatMs===undefined?undefined:state.current!.profile.openingRetreatMs/3000}):null);}catch(e){setAssetStatus('3D 无法启动，请检查 Chrome 的 WebGL 支持；存档仍保留');console.error(e instanceof Error?e.message:'WebGL error');}}).catch(()=>{if(!cancelled)setAssetStatus('3D 模块加载失败，请刷新重试');});return()=>{cancelled=true;world.current?.dispose();world.current=null;};},[ready,inspect,destination,steer]);
 useEffect(()=>{if(data){const opening=replay?.opening??data.profile.opening;const projected=opening&&(!!replay||opening.stage!=='done'||data.profile.threat?.phase==='complete')?deriveOpeningScene(data,opening,{replay:!!replay,retreatProgress:data.profile.openingRetreatMs===undefined?undefined:data.profile.openingRetreatMs/3000}):data;world.current?.set(projected,target,reduced,camera,ghost,previewTheme,opening,!!replay,opening?openingAttention(data,opening,{replay:!!replay,retreatProgress:data.profile.openingRetreatMs===undefined?undefined:data.profile.openingRetreatMs/3000}):null);}},[data,target,reduced,camera,ghost,previewTheme,replay]);
 useEffect(()=>{if(data?.profile.tutorial==='defend'&&data.profile.threat?.phase==='complete'&&data.profile.opening?.stage!=='done'&&sheet&&sheet!=='reset'){world.current?.stopInput();setSheet(null);}},[data,sheet]);
 const onSheet=useCallback((next:EstateSheet)=>{if(current.current.replay)return;const opening=state.current?.profile.opening;if(opening&&openingPresentation(opening).controlsLocked&&next!==null)return;world.current?.stopInput();setSheet(next);if(next!=='creation')setPreviewTheme(undefined);if(next!=='build')setGhost(undefined);},[]);
 const onMove=useCallback((v:StickVector)=>world.current?.move({x:v.x,z:-v.y}),[]),onStop=useCallback(()=>world.current?.move({x:0,z:0}),[]);
 const exitReplay=useCallback(()=>{setReplay(null);setSheet(null);try{sessionStorage.removeItem('farm-opening-replay');}catch{/* Storage can be disabled. */}},[]);
 const startReplay=useCallback(()=>{world.current?.stopInput();setSheet(null);setReplay({opening:initialOpening('choose'),running:false});},[]);
 useEffect(()=>{if(!data||replayLoaded.current)return;replayLoaded.current=true;try{const saved=JSON.parse(sessionStorage.getItem('farm-opening-replay')??'null');if(saved?.owner===data.playerId&&saved.replay?.opening?.version===1&&['establish','rustle','approach','startle','choose','arrival','defend','done'].includes(saved.replay.opening.stage)&&Number.isFinite(saved.replay.opening.elapsed)&&saved.replay.opening.elapsed>=0&&(saved.replay.opening.guardian===null||['dog','cat','frog'].includes(saved.replay.opening.guardian)))setReplay({opening:saved.replay.opening,running:saved.replay.running===true});}catch{/* A private replay is optional. */}},[data]);
 useEffect(()=>{if(!data||!replay)return;try{sessionStorage.setItem('farm-opening-replay',JSON.stringify({owner:data.playerId,replay}));}catch{/* Existing farm saves use SQLite. */}},[data,replay]);
 useEffect(()=>{if(!replay)return;let previous=performance.now();const timer=setInterval(()=>{const now=performance.now(),dt=Math.min(.2,Math.max(0,(now-previous)/1000));previous=now;if(document.hidden||!current.current.assetsReady)return;setReplay(old=>{if(!old)return old;if(old.opening.stage==='defend'&&old.running){const elapsed=old.opening.elapsed+dt;return {...old,opening:{...old.opening,elapsed,stage:elapsed>=8?'done':'defend'}};}return {...old,opening:advanceOpening(old.opening,dt,{ready:true,visible:true,covered:false})};});},100);return()=>clearInterval(timer);},[!!replay]);
 const command=useCallback((type:string,extra:Record<string,unknown>={})=>{if(type==='requestReset'){world.current?.stopInput();setSheet('reset');return;}if(type==='replayOpening'){startReplay();return;}if(type==='retry'&&!pending.current)void load().then(ok=>{if(ok)void send('enter');});else void send(type,extra);},[load,send,startReplay]);
 const selectGuardian=(guardian:GuardianKind)=>{if(replay)setReplay(old=>old?{...old,opening:selectOpeningGuardian(old.opening,guardian)}:old);else void send('guardian',{guardian});};
 const skip=()=>{if(replay)setReplay(old=>old?{...old,opening:skipOpening(old.opening)}:old);else void send('skipOpening');};
 const defend=()=>{if(replay){setReplay(old=>old?{...old,running:true}:old);return;}const p=state.current?.profile;if(!p?.guardian)return;const kind=p.guardian==='dog'?'block':p.guardian==='cat'?'gather':'calm';const wolf=p.threat?.wolves.find(w=>!['retreated','boundary'].includes(w.status));void send('guardianCommand',{command:{kind,target:kind==='block'?wolf?.position:p.animals[0]?.position,...(kind==='block'&&wolf?{wolfId:wolf.id}:{})}});};
 const care=()=>{if(replay){exitReplay();return;}void send('finishTutorial');};
 if(!data)return <main className="app-shell app-shell-v020"><PhoneViewport><section className="feed-window feed-v020 farm-feed"><div className="farm-loading"><h1>绒绒庄园</h1><p>{error||message}</p>{error&&<button onClick={()=>command('retry')}>重新连接</button>}</div></section></PhoneViewport></main>;
 const opening=replay?.opening??data.profile.opening??initialOpening(data.profile.tutorial),cinematic=!!replay||data.profile.tutorial!=='done';
 const shownOpening=!replay&&data.profile.threat?.phase==='complete'&&opening.stage==='done'?{...opening,stage:'done' as const}:opening;
 const overlay=cinematic?<OpeningOverlay opening={shownOpening} retreating={!replay&&data.profile.tutorial==='defend'&&data.profile.threat?.phase==='complete'&&opening.stage!=='done'} ready={assetsReady} replay={!!replay} busy={busy} error={error||(/失败|无法/.test(assetStatus)?assetStatus:'')} onRetry={()=>error?command('retry'):location.reload()} onSkip={skip} onSelect={selectGuardian} onDefend={defend} onExitReplay={exitReplay} onCare={care} onReset={()=>command('requestReset')}/>:undefined;
 return <EstateView openingOverlay={overlay} interactionLocked={!!replay||cinematic&&(openingPresentation(opening).controlsLocked||shownOpening.stage==='done'||data.profile.threat?.phase==='complete')} data={data} target={target} sheet={sheet} camera={camera} reduced={reduced} busy={busy} message={message} commandFeedback={commandFeedback} error={error} assetStatus={assetStatus} worldRef={host} onCommand={command} onSheet={onSheet} onInspect={inspect} onTarget={id=>inspect(id,false)} onCamera={setCamera} onMove={onMove} onStop={onStop} onReduced={()=>setReduced(v=>!v)} onGhost={setGhost} onThemePreview={setPreviewTheme}/>;
}
