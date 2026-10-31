import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Home,Users,Plus,Minus} from 'lucide-react';
import type {MinimalWorld,WorldTarget} from './World.ts';
import {playerWalkRoute,SPECIES_LABELS,type MinimalState,type Point} from './model.ts';
import {isAnimalRuntimeActive} from './species.ts';
import {sampleFarm} from './sample-farms.ts';
import {VisitorSession,type VisitorCommand} from './visitor-session.ts';
import {SampleBoardingPanel} from './SampleBoardingPanel.tsx';
import {createSampleBoardingAdapter} from './sample-boarding.ts';
import {PanelHelp} from './PanelHelp.tsx';
import {LunarShowcaseControls} from './LunarShowcaseControls.tsx';
import {LunarShowcaseAssetLibrary} from './lunar-showcase-assets.ts';
import {activeLunarShowcaseScope} from './lunar-showcase-resources.ts';
import type {LunarActorSummary} from './lunar-showcase-scene.ts';
import type {LunarShowcaseId} from './lunar-showcase-contract.ts';
import './friends.css';
import type {VisitorLandmarkStatus} from './visitor-landmark-scene.ts';
import {PyramidInterior} from './PyramidInterior.tsx';
import {SchoolPlayground} from './SchoolPlayground.tsx';
import {SCHOOL_PLAYGROUND_FRIEND} from './playground-friend.ts';
type Action='pickup'|'care';
type Pending={id:number;animalId:string;action:Action;expires:number};
/** Owns exactly one visit World. The caller retains, hides and pauses its home World. */
type VisitorFarmProps={sampleId:string;onHome:()=>void;onFriends:()=>void;viewerKey?:string;audioControl?:ReactNode};
export function VisitorFarm(props:VisitorFarmProps){return props.sampleId===SCHOOL_PLAYGROUND_FRIEND.target.sampleId?<SchoolPlayground key={props.viewerKey} onHome={props.onHome} onFriends={props.onFriends} viewerKey={props.viewerKey} audioControl={props.audioControl}/>:<OrdinaryVisitorFarm {...props}/>;}
function OrdinaryVisitorFarm({sampleId,onHome,onFriends,viewerKey='local-guest',audioControl}:VisitorFarmProps){
 const [boardingOpen,setBoardingOpen]=useState(false);
 const [interiorOpen,setInteriorOpen]=useState(false),interiorActive=useRef(false),interiorEntry=useRef<HTMLButtonElement>(null),restoreInteriorFocus=useRef(false);
 const [landmarkStatus,setLandmarkStatus]=useState<VisitorLandmarkStatus>('absent');
 const [showcase,setShowcase]=useState<readonly LunarActorSummary[]>([]),[showcaseSelected,setShowcaseSelected]=useState<LunarShowcaseId|null>(null);
 const interactionBlocked=useRef(false);
 const demoAdapter=useMemo(()=>createSampleBoardingAdapter({realmId:viewerKey}),[viewerKey]);
 const host=useRef<HTMLDivElement>(null),scene=useRef<MinimalWorld|null>(null),session=useRef<VisitorSession|null>(null),pending=useRef<Pending|null>(null),intent=useRef(0),leaving=useRef(false);
 const [state,setState]=useState<MinimalState|null>(null),[selected,setSelected]=useState<string|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false);
 const callbacks=useRef({select:(_target:WorldTarget)=>{},arrive:(_p:Point,_id?:number)=>{}});
 const layout=sampleFarm(sampleId,0),card=layout.card,isLunar=card.themeId==='lunar';
 const publish=()=>{const s=session.current;if(!s?.active)return;const data=s.state;setState(data);scene.current?.update(data);};
 const stop=()=>{intent.current++;pending.current=null;session.current?.stop(scene.current?.playerMotionSnapshot());scene.current?.cancelWalk();};
 const openInterior=()=>{if(sampleId!=='oasis'||!ready||interactionBlocked.current||interiorActive.current)return;stop();interiorActive.current=true;interactionBlocked.current=true;scene.current?.setVisitorInteriorOpen(true);setInteriorOpen(true);};
 const closeInterior=()=>{interiorActive.current=false;restoreInteriorFocus.current=true;scene.current?.setVisitorInteriorOpen(false);setInteriorOpen(false);};
 useEffect(()=>{if(!interiorOpen&&restoreInteriorFocus.current){restoreInteriorFocus.current=false;interiorEntry.current?.focus({preventScroll:true});}},[interiorOpen]);
 const send=(command:VisitorCommand)=>{const s=session.current;if(!s?.active||interactionBlocked.current)return false;if(command.type==='pickup'&&scene.current?.showcaseSummary().some(a=>a.carried)){setNotice('先放下手里的DIY伙伴');return false;}s.tick(Date.now(),scene.current?.playerMotionSnapshot());const reply=s.command(command,Date.now());setNotice(reply.message);if(reply.accepted){publish();if(command.type==='care')scene.current?.perform('pet',command.animalId);if(command.type==='pickup')scene.current?.perform('hold',command.animalId);}return reply.accepted;};
 const perform=(action:Action)=>{if(!selected||!ready||interactionBlocked.current)return;stop();const s=session.current;if(!s?.active)return;s.tick(Date.now(),scene.current?.playerMotionSnapshot());const snapshot=s.state,a=snapshot.animals.find(a=>a.id===selected);if(!a)return;
  if(Math.hypot(a.position.x-snapshot.player.x,a.position.z-snapshot.player.z)<=1.6){send({type:action,animalId:a.id});return;}
  const candidates=snapshot.tiles.filter(t=>t.owned&&Math.hypot(t.x-a.position.x,t.z-a.position.z)<=1.4&&playerWalkRoute(snapshot,snapshot.player,t)!==null).sort((a,b)=>Math.hypot(a.x-snapshot.player.x,a.z-snapshot.player.z)-Math.hypot(b.x-snapshot.player.x,b.z-snapshot.player.z));
  const to=candidates[0];if(!to){setNotice('先走到小伙伴旁边的空地吧');return;}
  const id=++intent.current;pending.current={id,animalId:a.id,action,expires:performance.now()+30_000};if(!send({type:'move',to:{x:to.x,z:to.z}})||!scene.current?.walkTo(to,id)){stop();setNotice('这里暂时走不过去');}
 };
 callbacks.current.select=target=>{if(!ready||!session.current?.active||interactionBlocked.current)return;if(target.kind==='landmark'&&target.id==='golden-pyramid'){openInterior();return;}stop();setShowcaseSelected(target.kind==='showcase'?target.id:null);if(target.kind==='showcase'){setSelected(null);scene.current?.setSelection(null);setNotice('');}else if(target.kind==='animal'){setSelected(target.id);scene.current?.setSelection(target);setNotice('');}else if(target.kind==='tile'){setSelected(null);scene.current?.setSelection(null);const to=target.worldPoint??{x:target.x,z:target.z};if(scene.current?.walkTo(to,++intent.current)){if(!send({type:'move',to}))stop();}else{stop();setNotice('伙伴挡着啦，点旁边走');}}else if(target.kind==='shop'){setSelected(null);setNotice('这是主人的小店，串门时只参观。');}else setSelected(null);};
 callbacks.current.arrive=(p,id)=>{const job=pending.current,s=session.current;if(!s?.active)return;s.stop({position:p,path:[],speed:0});publish();if(!job||job.id!==id||job.id!==intent.current)return;pending.current=null;if(performance.now()>job.expires){setNotice('这次互动已取消，想玩时再点一下');return;}send({type:job.action,animalId:job.animalId});};
 const selectShowcase=(id:LunarShowcaseId)=>{if(!ready||interactionBlocked.current)return;stop();setSelected(null);setShowcaseSelected(id);scene.current?.setSelection(null);setNotice('');};
 const actShowcase=(id:LunarShowcaseId,action:string)=>{if(!ready||interactionBlocked.current)return;stop();const reply=scene.current?.showcaseAction(id,action);if(reply)setNotice(reply.message);setShowcase(scene.current?.showcaseSummary()??[]);};
 const leave=()=>{if(leaving.current)return;leaving.current=true;stop();session.current?.dispose();scene.current?.dispose();scene.current=null;onHome();};
 useEffect(()=>{
  let alive=true;leaving.current=false;interiorActive.current=false;setInteriorOpen(false);setReady(false);setLandmarkStatus('absent');setBoardingOpen(false);setError('');setSelected(null);setShowcaseSelected(null);setShowcase([]);setNotice('');pending.current=null;intent.current++;interactionBlocked.current=document.hidden;
  const visitor=VisitorSession.sample(sampleId,Date.now());session.current=visitor;setState(visitor.state);let world:MinimalWorld|undefined,focused=true;
  const modalRoot=host.current?.closest('.egg-farm')??document.body;
  const syncVisibility=()=>{if(!alive)return;const modal=[...modalRoot.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(node=>!node.closest('[hidden],[aria-hidden="true"]'));const blocked=document.hidden||!focused||modal||interiorActive.current;if(blocked&&!interactionBlocked.current)stop();interactionBlocked.current=blocked;world?.setPlayerMotionVisible(!blocked);world?.pauseShowcase(blocked);};
  const blur=()=>{focused=false;syncVisibility();},focus=()=>{focused=true;syncVisibility();};
  const observer=new window.MutationObserver(syncVisibility);observer.observe(modalRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','aria-modal']});window.addEventListener('blur',blur);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',syncVisibility);
  void import('./World.ts').then(({MinimalWorld})=>{if(!alive||!host.current)return;world=new MinimalWorld(host.current,visitor.state,{select:t=>{if(alive)callbacks.current.select(t);},arrive:(p,id)=>{if(alive)callbacks.current.arrive(p,id);},interactionCancel:()=>{if(alive)stop();},status:message=>{if(alive)setNotice(message);},animalModelsChanged:()=>{if(alive)setState(visitor.state);},showcaseChanged:()=>{if(alive)setShowcase(world?.showcaseSummary()??[]);},landmarkChanged:status=>{if(alive)setLandmarkStatus(status);}});scene.current=world;syncVisibility();world.setVisitorScenery(sampleFarm(sampleId,Date.now()));if(sampleId==='lunar'){const scope=activeLunarShowcaseScope();if(scope)world.setLunarShowcase(new LunarShowcaseAssetLibrary(scope));setShowcase(world.showcaseSummary());syncVisibility();}world.focusTile({x:2,z:3});world.zoom(-.45);world.frameVisitorOverview(world.visitorLandmarkBounds());if(alive)setReady(true);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'示例牧场暂时无法载入');});
  const timer=window.setInterval(()=>{if(!alive||!world||interactionBlocked.current||!visitor.active)return;visitor.tick(Date.now(),world.playerMotionSnapshot());publish();if(pending.current&&performance.now()>pending.current.expires){stop();setNotice('这次互动已取消，想玩时再点一下');}},250);
  return()=>{alive=false;intent.current++;pending.current=null;window.clearInterval(timer);document.removeEventListener('visibilitychange',syncVisibility);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);observer.disconnect();visitor.dispose();world?.dispose();if(scene.current===world)scene.current=null;if(session.current===visitor)session.current=null;};
 },[sampleId,viewerKey]);
 const animal=state?.animals.find(a=>a.id===selected),carried=state?.animals.find(a=>a.id===state.carriedAnimalId);
 const unavailable=[...new Set(state?.animals.filter(a=>!isAnimalRuntimeActive(a)).map(a=>SPECIES_LABELS[a.species])??[])].join('、');
 return <section className="visitor-farm" aria-label={`${card.farmName}（示例串门）`}><div className="visitor-exterior" inert={interiorOpen} aria-hidden={interiorOpen||undefined}><div className="visitor-world egg-scene" ref={host}/>{audioControl}
  <header className="visitor-location"><div><strong>{card.name}的岛</strong><span>{card.farmName} · 示例</span></div><button type="button" onClick={leave}><Home size={18} aria-hidden="true"/>回家</button></header>
  <div className="visitor-tools"><button type="button" aria-label="打开好友列表" onClick={()=>{stop();onFriends();}}><Users size={22} aria-hidden="true"/></button><PanelHelp title="串门怎么玩"><p>这是{card.farmName}的示例场景。点空地走动、点动物互动，也可以拖动视角、双指缩放。</p><p>举起来只是临时陪玩，不改变动物归属。回家、换牧场或刷新都会释放。不能卖掉、带走动物，也不能修改主人的土地。</p><p>这里没有正式金币、礼物或可带走的蛋。展示姓名与头像按提供顺序对应，可更正；未关联真人账号，也不表示已绑定3D形象。</p>{isLunar&&<p>月球是外观，底层仍是冰川生态。DIY伙伴是用户提供的生成模型，经压缩并配上离线骨骼动作（含手工动作与用户提供的HY-Motion重定向动作），不是实时生成或普通物种换皮；模型就绪后会自己散步、休息并反复做动作；幼崽和少年会随本次串门时间成长，照料可加快成长。坤坤鸡与雨姐是已长大的巨大示例。成长与陪玩只在本次示例生效，离岛重置，不代表正式获得这些角色。只支持界面列出的动作，暂不支持举起的伙伴会明确标注。这些DIY角色暂不支持寄养；其他示例牧场可体验独立的寄养演示。</p>}</PanelHelp></div>
  {!isLunar&&<button type="button" className="visitor-boarding-entry" onClick={()=>{stop();setBoardingOpen(true);}}>寄养演示</button>}{unavailable&&<p className="visitor-pending-diy" role="status">{unavailable}模型暂未就绪 · 未用其他小伙伴代替</p>}
  {sampleId==='oasis'&&<button ref={interiorEntry} type="button" className="visitor-pyramid-entry" data-pyramid-entry disabled={!ready} onClick={openInterior}>△ 进入金字塔内部</button>}
  <div className="visitor-zoom"><button type="button" aria-label="拉近视角" onClick={()=>scene.current?.zoom(.2)}><Plus size={20}/></button><button type="button" aria-label="拉远视角" onClick={()=>scene.current?.zoom(-.2)}><Minus size={20}/></button></div>
  {!ready&&!error&&<p className="visitor-status" role="status">正在打开示例牧场…</p>}{error&&<p className="visitor-status" role="alert">{error} · 可以先回家</p>}
  {landmarkStatus==='failed'&&<p className="visitor-landmark-status" role="status">地标暂未载入 <button type="button" data-landmark-retry onClick={()=>{if(interactionBlocked.current)return;scene.current?.retryVisitorLandmark();host.current?.querySelector('canvas')?.focus({preventScroll:true});}}>重试地标</button></p>}
  {notice&&<p className="visitor-notice" role="status">{notice}</p>}
  {isLunar&&<LunarShowcaseControls actors={showcase} selectedId={showcaseSelected} onSelect={selectShowcase} onFocusCanvas={()=>host.current?.querySelector('canvas')?.focus({preventScroll:true})} onClose={()=>{setShowcaseSelected(null);scene.current?.setSelection(null);host.current?.querySelector('canvas')?.focus({preventScroll:true});}} onAction={actShowcase} onRetry={id=>{if(!interactionBlocked.current){stop();scene.current?.retryShowcase(id);}}}/>}
  {!isLunar&&<footer className="visitor-actions">{carried?<><div><strong>{carried.name}</strong><span>临时举起 · 仍属于{card.name}</span></div><button type="button" onClick={()=>{stop();send({type:'putdown'});}}>放下来</button></>:animal?<><div><strong>{animal.name}</strong><span>{isAnimalRuntimeActive(animal)?`${card.name}的小伙伴 · 示例`:'模型暂未就绪，暂不能互动'}</span></div><button type="button" disabled={!isAnimalRuntimeActive(animal)} onClick={()=>perform('care')}>打招呼</button><button type="button" disabled={!isAnimalRuntimeActive(animal)} onClick={()=>perform('pickup')}>举起来</button></>:<p>点空地走走，点小伙伴一起玩</p>}</footer>}
  {!isLunar&&boardingOpen&&<SampleBoardingPanel sampleId={sampleId} realmId={viewerKey} adapter={demoAdapter} onClose={()=>setBoardingOpen(false)}/>}
 </div>{interiorOpen&&<PyramidInterior onClose={closeInterior}/>}
 </section>;
}
