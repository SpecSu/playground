'use client';
import {MINIMAL_DEFENSE_ENABLED} from './defense-policy.ts';
import {TerrainAppearancePicker} from './TerrainAppearance.tsx';
import DemoDebugControls from './DemoDebugControls.tsx';
import {localAnimalDeploymentStatus,localAnimalModelsRequested} from './local-animal-models.ts';
import AlpacaResourceControls from './AlpacaResourceControls.tsx';
import AmbientSoundControls from './AmbientSoundControls.tsx';
import {loadAtmosphereSettings,saveAtmosphereSettings,nearbyWaterAmbience,type AtmosphereSettings} from './atmosphere-settings.ts';
import EggIncubationPanel from './EggIncubationPanel.tsx';
import {RarityBadge,RarityHelp} from './RarityBadge.tsx';
import EggShopCatalog from './EggShopCatalog.tsx';
import {EGG_THEME_LABELS,type EggTheme} from './egg-catalog.ts';
import {openFarmSession,acknowledgeLegacyFork,LEGACY_BACKUP_KEY,LEGACY_ACK_KEY,LOCAL_HUNYUAN_STORAGE_KEY} from './save-migration.ts';
import {explorationIssue,terrainConversionIssue,conversionExpansionIssue} from './terrain-progression.ts';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Users,ArrowUp,Bell,BookOpen,Cloud,CloudLightning,CloudRain,CloudSnow,Coins,Droplets,Egg,Hand,Heart,Home,Leaf,Mountain,Moon,Plus,Settings2,Sun,ShoppingBag,Sparkles,TreePine,Volume2,VolumeX,WandSparkles,Wheat,X,ZoomIn,ZoomOut} from 'lucide-react';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import {MinimalWorld,type TerrainRenderStatus} from './World.ts';
import {advanceMinimalState,createMinimalState,minimalCommand,MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY,tileAt,playerWalkRoute,nearShop,isShopTile,isWalkableTile,sellValue,animalGrowthStage,animalGrowthLabel,animalGrowthRemainingMs,animalGrowthProgress,MINIMAL_RULES,canPlaceEgg,type MinimalState,type MinimalCommand,type Terrain,type Point} from './model.ts';
import {deriveWeather,WEATHER_KINDS,WEATHER_LABELS,type WeatherOverride} from './weather.ts';
import {FarmAudio,type FarmAudioStatus,type AudioGestureUnlock} from '../v5/estate-audio.ts';
import {MinimalAudioScenes} from './audio.ts';
import {enterVisitorAudio} from './visit-audio.ts';
import {VisitorAudioControl} from './VisitorAudioControl.tsx';
import {withRenderedPlayer} from './player-motion.ts';
import {GREETING_DURATION_MS} from './interaction-motion.ts';
import AnimalAtlas from './AnimalAtlas.tsx';
import WishingPool from './WishingPool.tsx';
import ConnectedWishingPool from './ConnectedWishingPool.tsx';
import CreativeStudio from './CreativeStudio.tsx';
import {AccountCard} from './AccountGate.tsx';
import type {AccountClient} from './account-client.ts';
import {predictCanonicalCommand,projectCanonicalState,CanonicalPresentationTimeline,canonicalFarmLocks} from './canonical-presentation.ts';
import {FriendsPanel} from './FriendsPanel.tsx';
import {VisitorFarm} from './VisitorFarm.tsx';
import BoardingPanel from './BoardingPanel.tsx';
import type {BoardingTarget} from './boarding-target.ts';
import './online-farm.css';
import {scheduleSceneStartup} from './scene-startup.ts';
import {farmSaveDiagnosticMessage} from './farm-save-diagnostics.ts';
import {ANIMAL_ATLAS_STORAGE_KEY,normalizeAnimalAtlasLedger,observeAnimalAtlas} from './animal-atlas.ts';
import {AtlasSaveGuard,FarmSaveGuard,readableAtlasSchema} from './save-guard.ts';
import SimpleFarmSheet from './SimpleFarmSheet.tsx';
import {PanelHelp} from './PanelHelp.tsx';
import {reachableShopApproach} from './approach-targets.ts';
import {TerrainCareSheet,TerrainUpgrade,growthRateLabel} from './TerrainCare.tsx';
import {farmSupply,tileSupply} from './terrain-supply.ts';
import {COMPANION_GREETING_GIFT_COINS,canClaimCompanionGift} from './companion-gift.ts';
import {dayKey} from './farm-calendar.ts';
import {animalBreedingStatus} from './breeding-status.ts';
import './minimal.css';

type Target={kind:'creative';id:string}|{kind:'tile';x:number;z:number;worldPoint?:Point}|{kind:'animal';id:string}|{kind:'egg';id:string}|{kind:'shop'};
type AnimalAction='care'|'pickup';
type Pending={expiresAt:number;id:number;target:Target|null;destination:Point;placeEggId?:string;at?:Point;action?:AnimalAction;attempt:number};
const speciesName={sheep:'绵羊',pig:'小猪',cow:'奶牛',bunny:'兔子',duck:'小鸭',alpaca:'羊驼',penguin:'企鹅'};
const weatherIcons={sunny:Sun,cloudy:Cloud,rain:CloudRain,snow:CloudSnow,storm:CloudLightning};
const AUDIO_STORAGE='dreamina-farm-audio-v1';
function loadAudioPreference():boolean{try{return window.localStorage.getItem(AUDIO_STORAGE)!=='muted';}catch{return true;}}
const WEATHER_STORAGE='dreamina-farm-weather-v1';
function loadWeatherPreference():WeatherOverride{try{const value=JSON.parse(window.localStorage.getItem(WEATHER_STORAGE)??'{}');return {weather:WEATHER_KINDS.includes(value.weather)?value.weather:'auto',time:['day','night'].includes(value.time)?value.time:'auto'};}catch{return {weather:'auto',time:'auto'};}}
const terrainInfo={meadow:{name:'草地',text:'慢慢吃草，晒晒太阳。',Icon:Wheat},creek:{name:'小溪',text:'浅浅的小溪可以走过，小动物会来喝水。',Icon:Droplets},pond:{name:'池塘',text:'池塘不能穿过，小动物会站在岸边低头喝水。',Icon:Droplets},hill:{name:'丘陵',text:'爬上小山，看看远方。',Icon:Mountain},grove:{name:'林地',text:'在树荫下歇一会儿。',Icon:TreePine},desert:{name:'沙漠',text:'暖色沙地，可通行；不额外提供照料容量。',Icon:Mountain},glacier:{name:'冰川',text:'冰雪地面，可通行；不额外提供照料容量。',Icon:Mountain}};
export function terrainCanOpen(state:MinimalState,p:Point){
 const tile=tileAt(state,p);
 return !!tile&&!tile.owned&&[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}].some(q=>{const neighbor=tileAt(state,q);return neighbor?.owned&&neighbor.terrain!=='pond'&&!isShopTile(q);});
}
export function animalApproach(state:MinimalState,position:Point):Point{
 const p={x:Math.round(position.x),z:Math.round(position.z)};
 const cardinal=[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}];
 const diagonal=[{x:p.x+1,z:p.z+1},{x:p.x+1,z:p.z-1},{x:p.x-1,z:p.z+1},{x:p.x-1,z:p.z-1}];
 for(const candidates of [cardinal,diagonal,[p]]){
  const destination=candidates.filter(q=>Math.hypot(q.x-position.x,q.z-position.z)<=1.6&&tileAt(state,q)?.owned&&!isShopTile(q)&&playerWalkRoute(state,state.player,q)!==null).sort((a,b)=>Math.hypot(a.x-state.player.x,a.z-state.player.z)-Math.hypot(b.x-state.player.x,b.z-state.player.z))[0];
  if(destination)return destination;
 }
 // No reachable endpoint: the existing move guard rejects this blocked center.
 return p;
}

export default function MinimalApp({session,accountClient,onOpenAccount,deferScene=false}:{session?:AccountClient;accountClient?:AccountClient;onOpenAccount?:()=>void;deferScene?:boolean}){
 const [visitingSample,setVisitingSample]=useState<string|null>(null),[friendsOpen,setFriendsOpen]=useState(false);
 const visitingRef=useRef<string|null>(null);
 const [worldReady,setWorldReady]=useState(false),worldReadyRef=useRef(false);
 const clockNow=()=>session?.now()??Date.now();
 const presentationTimeline=useRef<CanonicalPresentationTimeline|null>(null);
 const localHunyuanSave=!session&&!accountClient&&localAnimalModelsRequested();
 const atlasStorageKey=session?`${ANIMAL_ATLAS_STORAGE_KEY}:${session.account.uid}`:localHunyuanSave?`${ANIMAL_ATLAS_STORAGE_KEY}:local-hunyuan-v1`:ANIMAL_ATLAS_STORAGE_KEY;
 const [cloudError,setCloudError]=useState(''),[cloudBusy,setCloudBusy]=useState(false),[creativePlacing,setCreativePlacing]=useState<string|null>(null);
 const [studioMode,setStudioMode]=useState<'shop'|'collection'>('collection');
 const sessionMounted=useRef(false),queuedCloudStop=useRef(false);
 const queuedApproach=useRef<number|null>(null),queuedArrival=useRef<{point:Point;id:number}|null>(null),flushMovementRef=useRef<()=>void>(()=>{});
 const movementFlushTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const creativePlacingRef=useRef<string|null>(null);creativePlacingRef.current=creativePlacing;
 const [data,setData]=useState<MinimalState|null>(null),[target,setTarget]=useState<Target|null>(null),[sheet,setSheet]=useState<'bag'|'settings'|'atlas'|'wish'|'care'|'studio'|'boarding'|null>(null);
 const atlasLedger=useRef(normalizeAnimalAtlasLedger(undefined)),atlasSaved=useRef(''),atlasWritable=useRef(false);
 const discoveryOpener=useRef<HTMLElement|null>(null),shopWishEntry=useRef<HTMLButtonElement|null>(null),shopStudioEntry=useRef<HTMLButtonElement|null>(null),returnToShop=useRef<'wish'|'studio'|false>(false);
 const [atlasSaveOk,setAtlasSaveOk]=useState(true),[atlasConflict,setAtlasConflict]=useState(false);
 const atlasGuard=useRef<AtlasSaveGuard|null>(null),recoveryButton=useRef<HTMLButtonElement|null>(null);
 const farmWritable=useRef(false),saveGuard=useRef<FarmSaveGuard|null>(null),saveConflictRef=useRef(false);
 const [saveConflict,setSaveConflict]=useState(false),[saveRecovery,setSaveRecovery]=useState('');
 const legacyRecoveryRaw=useRef<{currentRaw:string|null}|null>(null);
 const [placing,setPlacing]=useState<string|null>(null),[converting,setConverting]=useState(false),[editingTerrain,setEditingTerrain]=useState(false);
 const [notice,setNotice]=useState(''),[saveOk,setSaveOk]=useState(true),[worldError,setWorldError]=useState(''),[walking,setWalking]=useState(false),[coinBurst,setCoinBurst]=useState(false),[hatchCue,setHatchCue]=useState(false);
 const [saleReceipt,setSaleReceipt]=useState<{id:string;value:number;source:'sale'|'companion-gift'}|null>(null);
 const [audioEnabled,setAudioEnabled]=useState(true),[audioStatus,setAudioStatus]=useState<FarmAudioStatus>('awaiting-gesture');
 const selectedModelBlocked=useRef(false);
 const [animalModels,setAnimalModels]=useState({loading:0,failed:0}),[retryingModels,setRetryingModels]=useState(false),[modelRetryMessage,setModelRetryMessage]=useState('');
 const [responseEnds,setResponseEnds]=useState<Record<string,number>>({}),responseEndsRef=useRef<Record<string,number>>({});
 const retryingModelsRef=useRef(false);
 const [weatherPreference,setWeatherPreference]=useState<WeatherOverride|null>(null),weatherPreferenceRef=useRef<WeatherOverride|null>(null);weatherPreferenceRef.current=weatherPreference;
 const [atmosphereSettings,setAtmosphereSettings]=useState<AtmosphereSettings|null>(null),atmosphereRef=useRef<AtmosphereSettings|null>(null);atmosphereRef.current=atmosphereSettings;
 const audio=useRef<FarmAudio|null>(null),audioScenes=useRef<MinimalAudioScenes|null>(null),audioFocused=useRef(true);
 const host=useRef<HTMLDivElement>(null),world=useRef<MinimalWorld|null>(null),live=useRef<MinimalState|null>(null),pending=useRef<Pending|null>(null);
 const selectionRef=useRef<Target|null>(null);
 const buyLocked=useRef(false),placingRef=useRef<string|null>(null),intent=useRef(0),actionLock=useRef<{id:string;action:AnimalAction;at:number}|null>(null);
 const sendRef=useRef<(c:MinimalCommand)=>boolean>(()=>false),selectRef=useRef<(t:Target)=>void>(()=>{}),interruptRef=useRef<()=>void>(()=>{}),arriveRef=useRef<(point:Point,id?:number)=>void>(()=>{});
 placingRef.current=placing;
 const updateAudio=(state:MinimalState)=>{if(!visitingRef.current&&audio.current&&audioScenes.current){audio.current.updateScene(audioScenes.current.update(state));audio.current.updateAtmosphere?.({weather:deriveWeather(clockNow(),weatherPreferenceRef.current??{}).kind,water:nearbyWaterAmbience(state)});}};
 const syncWorldAtmosphere=()=>{const view=world.current as (MinimalWorld&{setWeatherReducedMotion?:(value:boolean)=>void})|null;if(atmosphereRef.current)view?.setWeatherReducedMotion?.(atmosphereRef.current.reducedMotion);};
 const audioGesture=useRef<AudioGestureUnlock|null>(null);
 const unlockAudio=()=>{const engine=audio.current;if(engine)audioGesture.current={ready:engine.unlock(),startedAt:performance.now()};};
 const unlockFromGesture=(event:{target:EventTarget|null})=>{if((event.target as Element|null)?.closest?.('[data-audio-toggle]'))return;unlockAudio();};
 const toggleAudio=()=>{const enabled=!audioEnabled;setAudioEnabled(enabled);audio.current?.setEnabled(enabled);if(enabled)unlockAudio();try{window.localStorage.setItem(AUDIO_STORAGE,enabled?'enabled':'muted');}catch{/* Sound still works without storage. */}};
 const checkAtlas=()=>{
  if(!atlasWritable.current)return false;
  const status=atlasGuard.current?.check()??'unavailable';
  if(status==='ready')return true;
  atlasWritable.current=false;setAtlasSaveOk(false);if(status==='conflict')setAtlasConflict(true);return false;
 };
 const rememberAtlas=(state:MinimalState)=>{
  atlasLedger.current=observeAnimalAtlas(state,atlasLedger.current,state.updatedAt);
  // Observation remains in memory; unknown or foreign records are never merged/overwritten.
  if(!checkAtlas()){setAtlasSaveOk(false);return;}
  const serialized=JSON.stringify(atlasLedger.current);
  if(serialized===atlasSaved.current)return;
  const status=atlasGuard.current!.persist(serialized);
  if(status==='saved'){atlasSaved.current=serialized;setAtlasSaveOk(true);}
  else{setAtlasSaveOk(false);if(status==='conflict'){atlasWritable.current=false;setAtlasConflict(true);}}
 };
 const pauseForSave=()=>{
  saveConflictRef.current=true;setSaveConflict(true);setSheet(null);setPlacement(null);setTerrainEditing(false);setConverting(false);showTarget(null);discoveryOpener.current=null;returnToShop.current=false;pending.current=null;actionLock.current=null;intent.current++;setWalking(false);world.current?.cancelWalk();return false;
 };
 const pauseLocalStorage=()=>{
  farmWritable.current=false;setSaveOk(false);setSaveRecovery('浏览器存储暂时不可用，已暂停操作保护本机进度；恢复存储权限后重新载入。');return pauseForSave();
 };
 const preflight=()=>{
  if(saveConflictRef.current)return false;
  const unchanged=saveGuard.current?.check()??true;
  if(localHunyuanSave&&saveGuard.current?.isUnavailable())return pauseLocalStorage();
  if(!unchanged)return pauseForSave();
  return true;
 };
 const accept=(state:MinimalState,onAccepted?:()=>void)=>{
  if(!preflight())return false;
  const persisted=session?'saved':farmWritable.current?saveGuard.current?.persist(state)??'unavailable':'unavailable';
  if(persisted==='conflict'){preflight();return false;}
  if(localHunyuanSave&&persisted==='unavailable')return pauseLocalStorage();
  setSaveOk(persisted==='saved');
  // Only present a sale after its commit was checked, but before removing its model.
  onAccepted?.();rememberAtlas(session?.farm?.state??state);live.current=state;setData(state);world.current?.setAnimalLocks?.(session?.farm?canonicalFarmLocks(session.farm,session.view.ownOffer):[]);world.current?.update(state);updateAudio(state);return true;
 };
 const waitingAnimalId=()=>{
  const job=pending.current;if(!job?.action||job.target?.kind!=='animal')return undefined;
  if(performance.now()>=job.expiresAt){pending.current=null;actionLock.current=null;intent.current++;setWalking(false);world.current?.cancelWalk();setNotice('先歇一会儿，想互动时再点它吧。');return undefined;}
  return job.target.id;
 };
 // Online autonomous decisions always replay the canonical tick boundaries. A
 // displayed 250ms partial tick is never promoted into an authoritative base.
 const canonicalSnapshot=()=>projectCanonicalState(session!.farm!.state,clockNow(),canonicalFarmLocks(session!.farm!,session!.view.ownOffer));
 const acceptCanonical=()=>{if(!session?.farm)return;presentationTimeline.current=new CanonicalPresentationTimeline(session.farm.state,canonicalFarmLocks(session.farm!,session.view.ownOffer));accept(presentationTimeline.current.at(clockNow()));};
 const currentSnapshot=(now:number)=>{
  if(selectedModelBlocked.current)return structuredClone(live.current!);
  // Expiring UI intent is independent of simulation: online animals must follow
  // canonical decisions, but a delayed retry must never revive an old interaction.
  const waiting=waitingAnimalId();
  return withRenderedPlayer(session?(presentationTimeline.current??=new CanonicalPresentationTimeline(session.farm!.state,canonicalFarmLocks(session.farm!,session.view.ownOffer))).at(now):advanceMinimalState(live.current!,now,[],waiting),world.current?.playerMotionSnapshot?.());
 };
 const send=(command:MinimalCommand)=>{
  if(visitingRef.current||!worldReadyRef.current||!live.current||!preflight())return false;
  if(session&&(session.busy||session.pending)){setNotice(session.busy?'正在确认操作，请稍候。':'上一条指令待确认，请先重试。');return false;}
  const now=clockNow(),before=currentSnapshot(now),reply=session?predictCanonicalCommand(session.farm!,before,command,now,session.view.ownOffer):minimalCommand(before,command,now,[],waitingAnimalId());
  const feedback=()=>{
   if(reply.accepted)try{if(command.type==='care')audio.current?.interaction?.('care');else if(['placeEgg','collectEgg','hatch'].includes(command.type))audio.current?.interaction?.('place');}catch{/* Optional sound cannot change an accepted transaction. */}
   if(reply.accepted&&command.type==='sellAnimal'&&before.carriedAnimalId){const id=before.carriedAnimalId;try{world.current?.perform('sell',id);}catch{/* Optional handoff must never block an accepted sale. */}try{audio.current?.sale(`${before.createdAt}:${id}`,audioGesture.current??undefined);audioGesture.current=null;}catch{/* Currency and ownership do not depend on an audio device. */}setSaleReceipt({id,value:reply.state.coins-before.coins,source:'sale'});}
   if(reply.accepted&&command.type==='care'&&reply.state.lastCompanionGiftDay&&reply.state.lastCompanionGiftDay!==before.lastCompanionGiftDay&&reply.state.coins-before.coins===COMPANION_GREETING_GIFT_COINS){
    const id=`${before.createdAt}:${reply.state.lastCompanionGiftDay}`;
    try{audio.current?.companionGift(id,audioGesture.current??undefined);}catch{/* A quiet optional cue cannot block a checked gift. */}finally{audioGesture.current=null;}
    setSaleReceipt({id,value:COMPANION_GREETING_GIFT_COINS,source:'companion-gift'});
   }
  };
  if(session){
   if(!reply.accepted){setNotice(reply.message);return false;}
   presentationTimeline.current=new CanonicalPresentationTimeline(reply.state,canonicalFarmLocks(session.farm!,session.view.ownOffer));accept(reply.state);setCloudBusy(true);setCloudError('');
   void session.command(command).then(result=>{
    if(!sessionMounted.current)return;
    if(session.farm)acceptCanonical();
    if(result.accepted){feedback();if(!['move','welcome'].includes(command.type))setNotice(result.message);}
    else {queuedApproach.current=null;queuedArrival.current=null;queuedCloudStop.current=false;pending.current=null;actionLock.current=null;intent.current++;setWalking(false);world.current?.cancelWalk();setPlacement(null);buyLocked.current=false;showTarget(null);world.current?.reconcilePlayer?.(canonicalSnapshot());setNotice(result.message);}
   }).catch(error=>{if(sessionMounted.current){setCloudError(error instanceof Error?error.message:'连接中断，请重试');if(session.farm)acceptCanonical();}}).finally(()=>{if(sessionMounted.current){setCloudBusy(session.busy);flushMovementRef.current();}});
   return true;
  }
  const accepted=accept(reply.state,feedback);if(!accepted)return false;
  if(!reply.accepted||!['move','welcome'].includes(command.type))setNotice(reply.message);return reply.accepted;
 };sendRef.current=send;
 const showTarget=(selection:Target|null)=>{selectionRef.current=selection;setTarget(selection);world.current?.setSelection?.(selection);};
 const setPlacement=(id:string|null)=>{placingRef.current=id;setPlacing(id);world.current?.setPlacementMode(!!id);};
 // A retry may confirm that the predicted egg was never bought (or is no longer
 // in the bag). Reconcile only existing placement; never resurrect a cancelled intent.
 const reconcileConfirmedPlacement=(state:MinimalState)=>{
  const id=placingRef.current;if(!id||state.eggs.some(e=>e.id===id&&e.location==='bag'))return;
  if(pending.current?.placeEggId===id){intent.current++;pending.current=null;actionLock.current=null;setWalking(false);world.current?.cancelWalk();}
  buyLocked.current=false;setPlacement(null);
 };
 const setTerrainEditing=(active:boolean)=>{setEditingTerrain(active);world.current?.setTerrainEditMode?.(active);};
 const stop=(persist=true)=>{if(visitingRef.current)return;if(!persist)queuedCloudStop.current=false;queuedApproach.current=null;queuedArrival.current=null;const needsCloudStop=persist&&!!session&&!!(world.current?.playerMotionSnapshot?.()?.path.length??live.current?.playerPath.length);intent.current++;pending.current=null;actionLock.current=null;setWalking(false);const snapshot=live.current?currentSnapshot(clockNow()):null;world.current?.cancelWalk();if(snapshot)accept({...snapshot,playerPath:[],playerSpeed:0});if(needsCloudStop&&session){queuedCloudStop.current=true;if(!session.busy&&!session.pending){queuedCloudStop.current=false;void session.command({type:'stopMove'}).catch(error=>{if(sessionMounted.current)setCloudError(error.message);});}}};
 const dismiss=()=>{stop();showTarget(null);setConverting(false);setNotice('');};interruptRef.current=()=>{if(visitingRef.current)return;stop();setNotice('');};
 const close=()=>{dismiss();buyLocked.current=false;setPlacement(null);setCreativePlacing(null);setSheet(null);setTerrainEditing(false);};
 const openFriends=()=>{if(!visitingRef.current)close();setFriendsOpen(true);};
 const visitFriend=(destination:BoardingTarget)=>{
  if(destination.kind!=='sample'){setFriendsOpen(false);setSheet('boarding');return;}
  if(session&&(session.busy||session.pending)){setNotice('先等当前指令确认，再去好友家吧。');return;}
  if(!worldReadyRef.current||!preflight())return;
  if(!visitingRef.current)close();
  if(session&&(session.busy||session.pending)){setNotice('正在停下脚步，确认后再点一次串门。');return;}
  queuedApproach.current=null;queuedArrival.current=null;queuedCloudStop.current=false;pending.current=null;actionLock.current=null;intent.current++;setWalking(false);setFriendsOpen(false);setSheet(null);
  visitingRef.current=destination.sampleId;setVisitingSample(destination.sampleId);world.current?.cancelWalk();world.current?.setPlayerMotionVisible(false);
  if(audio.current){enterVisitorAudio(audio.current,destination.sampleId);audio.current.setVisible(document.visibilityState!=='hidden'&&audioFocused.current);}
  // Keep resume in this actual visit click, never in a load/effect/visibility callback.
  unlockAudio();
 };
 const returnHome=()=>{audio.current?.setVisible(false);visitingRef.current=null;setVisitingSample(null);setFriendsOpen(false);queuedApproach.current=null;queuedArrival.current=null;pending.current=null;actionLock.current=null;intent.current++;if(live.current)accept(currentSnapshot(clockNow()));const visible=document.visibilityState!=='hidden';world.current?.setPlayerMotionVisible(visible);audio.current?.setVisible(visible&&audioFocused.current&&!saveConflictRef.current);};
 const openRealBoarding=()=>{setFriendsOpen(false);if(visitingRef.current)returnHome();close();setSheet('boarding');};
 const openDiscovery=(panel:'atlas',opener:HTMLElement)=>{discoveryOpener.current=opener;close();setSheet(panel);};
 const openShopWish=()=>{if(session?.pending)return;const state=live.current;if(!state||walking||!nearShop(state)||state.carriedAnimalId)return;stop();returnToShop.current='wish';setSheet('wish');};
 const focusScene=()=>host.current?.querySelector('canvas')?.focus({preventScroll:true});
 const openShopStudio=()=>{if(session?.busy||session?.pending)return;const state=live.current;if(!state||walking||!nearShop(state)||state.carriedAnimalId)return;stop();returnToShop.current='studio';setStudioMode('shop');setSheet('studio');};
 const startApproach=(job:Pending)=>{
  if(pending.current?.id!==job.id)return;
  queuedApproach.current=null;
  if(!sendRef.current({type:'move',to:job.destination})){stop(false);return;}
  if(!world.current?.walkTo(job.destination,job.id)){stop();setNotice('这里暂时走不过去，试试旁边。');}
 };
 const approach=(selection:Target|null,to:Point,options:Partial<Pick<Pending,'placeEggId'|'at'|'action'|'attempt'>>={})=>{
  const job:Pending={expiresAt:performance.now()+120_000,id:++intent.current,target:selection,destination:to,attempt:0,...options};pending.current=job;queuedArrival.current=null;queuedCloudStop.current=false;setWalking(true);
  if(session&&(session.busy||session.pending)){queuedApproach.current=job.id;return;}
  startApproach(job);
 };
 const performAnimalAction=(id:string,action:AnimalAction)=>{
  if(action==='care'&&(responseEndsRef.current[id]??0)>performance.now())return;
  if(sendRef.current({type:action,animalId:id})){
   if(action==='care'){const ends={...responseEndsRef.current,[id]:performance.now()+GREETING_DURATION_MS};responseEndsRef.current=ends;setResponseEnds(ends);}
   world.current?.perform(action==='care'?'pet':'hold',id);if(action==='pickup')showTarget(null);
  }
 };
 arriveRef.current=(point,id)=>{
  // A renderer rebuilding or an abandoned session cannot consume an action intent.
  if(visitingRef.current||!sessionMounted.current||!worldReadyRef.current)return;
  const job=pending.current;
  if(!job||id!==job.id||Math.hypot(point.x-job.destination.x,point.z-job.destination.z)>.05)return;
  // An animation can arrive before its move receipt. Keep the same intent until
  // its canonical outcome is known; never trade an unknown move for another ID.
  if(session&&(session.busy||session.pending)){queuedArrival.current={point:{...point},id:job.id};return;}
  // The route has arrived, so no redundant stopMove may steal the action slot.
  stop(false);
  if(job.placeEggId&&job.at){if(sendRef.current({type:'placeEgg',eggId:job.placeEggId,at:job.at})){buyLocked.current=false;setPlacement(null);showTarget({kind:'egg',id:job.placeEggId});setNotice('');}return;}
  if(job.action&&job.target?.kind==='animal'){
   const animalId=job.target.id,current=live.current,a=current?.animals.find(a=>a.id===animalId);
   if(!current||!a||current.carriedAnimalId){setNotice('先把头顶的小伙伴放下来。');return;}
   if(Math.hypot(a.position.x-current.player.x,a.position.z-current.player.z)>1.6){
    if(job.attempt<1){approach(job.target,animalApproach(current,a.position),{action:job.action,attempt:job.attempt+1});return;}
    setNotice('小伙伴又跑远啦，点一次再走近。');return;
   }
   performAnimalAction(a.id,job.action);
  }
 };
 flushMovementRef.current=()=>{
  if(visitingRef.current||!sessionMounted.current||!worldReadyRef.current||session&&(session.busy||session.pending))return;
  const job=pending.current;
  if(job&&performance.now()>=job.expiresAt){stop();return;}
  if(job&&queuedApproach.current===job.id){startApproach(job);return;}
  const arrival=queuedArrival.current;
  if(job&&arrival?.id===job.id){queuedArrival.current=null;arriveRef.current(arrival.point,arrival.id);return;}
  if(queuedCloudStop.current&&session){queuedCloudStop.current=false;void session.command({type:'stopMove'}).catch(error=>{if(sessionMounted.current)setCloudError(error.message);});}
 };
 selectRef.current=(selection:Target)=>{
  if(visitingRef.current||friendsOpen||!worldReadyRef.current||worldError||!preflight())return;
  if(selection.kind==='creative'){close();setStudioMode('collection');setSheet('studio');return;}
  if(creativePlacingRef.current&&session){if(selection.kind!=='tile'){setNotice('选择一块已开辟的空地');return;}const id=creativePlacingRef.current;if(session.busy||session.pending)return;void session.creative({type:'place',assetId:id,at:{x:selection.x,z:selection.z}}).then(result=>{if(!sessionMounted.current)return;setNotice(result.message);if(result.accepted){setCreativePlacing(null);world.current?.setPlacementMode(false);}}).catch(error=>{if(sessionMounted.current)setCloudError(error.message);});return;}
  const previous=live.current;if(!worldReadyRef.current||!previous?.welcomeClaimed||worldError||!preflight())return;
  if(placingRef.current&&session&&(session.busy||session.pending)){setNotice('正在确认指令，稍后再放置');return;}
  if(placingRef.current&&selection.kind!=='tile'){setNotice('选一块空着的已开辟土地。');return;}
  const existing=selectionRef.current;
  if(!placingRef.current&&existing&&selection.kind!=='tile'&&existing.kind===selection.kind&&(selection.kind==='shop'||('id' in existing&&existing.id===selection.id))&&(selection.kind==='animal'||pending.current||selection.kind==='shop'&&nearShop(previous)))return;
  const ground=selection.kind==='tile'?tileAt(previous,selection):undefined;
  const rendered=world.current?.playerMotionSnapshot?.();
  const continueWalk=selection.kind==='tile'&&!placingRef.current&&!editingTerrain&&ground?.owned&&ground.terrain!=='pond'&&!isShopTile(selection)&&playerWalkRoute(previous,rendered?.position??previous.player,selection.worldPoint??selection)!==null;
  if(continueWalk){intent.current++;pending.current=null;actionLock.current=null;}else stop();
  const current=live.current!;setSheet(null);setConverting(false);setNotice('');
  if(selection.kind==='animal'){const a=current.animals.find(a=>a.id===selection.id);showTarget(a?selection:null);return;}
  if(selection.kind==='shop'){showTarget(selection);if(!nearShop(current)){const destination=reachableShopApproach(current);if(destination)approach(selection,destination);else setNotice('小店旁暂时没有可到达的岸边，先连通附近的土地。');}return;}
  if(selection.kind==='egg'){const egg=current.eggs.find(e=>e.id===selection.id&&e.location==='ground');showTarget(egg?selection:null);if(egg?.position&&Math.hypot(egg.position.x-current.player.x,egg.position.z-current.player.z)>1.6)approach(selection,animalApproach(current,egg.position));return;}
  const p={x:selection.x,z:selection.z},tile=tileAt(current,p);
  if(isShopTile(p)){if(placingRef.current){setNotice('商店不能放蛋，选一块空地吧。');return;}selectRef.current({kind:'shop'});return;}
  if(placingRef.current){showTarget(null);if(!canPlaceEgg(current,p)){setNotice('选一块空着的已开辟土地。');return;}approach(null,animalApproach(current,p),{placeEggId:placingRef.current,at:p});return;}
  if(!tile){showTarget(null);return;}
  if(!tile.owned||editingTerrain){showTarget(selection);return;}
  showTarget(null);
  if(tile.terrain==='pond'){setNotice('池塘不能穿过，点岸边走走吧。');return;}
  // Empty ground is navigation, never deferred terrain inspection.
  approach(null,selection.worldPoint??p);
 };
 useEffect(()=>{
  sessionMounted.current=true;
  const weather=loadWeatherPreference();weatherPreferenceRef.current=weather;setWeatherPreference(weather);let settings:AtmosphereSettings;try{settings=loadAtmosphereSettings(window.localStorage,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);}catch{settings=loadAtmosphereSettings(undefined);}atmosphereRef.current=settings;setAtmosphereSettings(settings);const engine=new FarmAudio(setAudioStatus),scenes=new MinimalAudioScenes();audio.current=engine;audioScenes.current=scenes;engine.setVolume?.(settings.volume);
  const enabled=loadAudioPreference();setAudioEnabled(enabled);engine.setEnabled(enabled);
  const visibility=()=>{
   const visible=document.visibilityState!=='hidden'&&!visitingRef.current;
   // Settle elapsed growth and expired events silently before restarting the score.
   engine.setVisible(false);
   if(!visible&&pending.current)interruptRef.current();
   if(visible&&live.current&&world.current)accept(currentSnapshot(clockNow()));
   world.current?.setPlayerMotionVisible?.(visible);
   if(document.visibilityState!=='hidden'&&audioFocused.current&&(!!visitingRef.current||!saveConflictRef.current))engine.setVisible(true);
  };
  const audioBlur=()=>{audioFocused.current=false;engine.setVisible(false);};
  const audioFocus=()=>{audioFocused.current=true;visibility();};
  visibility();document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',audioBlur);window.addEventListener('focus',audioFocus);
  let state:MinimalState;farmWritable.current=!session;
  if(session?.farm){presentationTimeline.current=new CanonicalPresentationTimeline(session.farm.state,canonicalFarmLocks(session.farm!,session.view.ownOffer));state=presentationTimeline.current.at(clockNow());setSaveOk(true);}else try{
   const storage=window.localStorage;
   const session=openFarmSession(storage,clockNow(),{localHunyuan:localHunyuanSave});state=session.state;saveGuard.current=session.guard;
   farmWritable.current=session.status==='ready';setSaveOk(session.status==='ready');
   if(session.status==='blocked'||session.status==='conflict'||session.status==='unavailable'){
    legacyRecoveryRaw.current=session.conflictKind==='legacy-diverged'?{currentRaw:session.currentRaw}:null;
    saveConflictRef.current=true;setSaveConflict(true);setSaveRecovery(session.status==='unavailable'?'浏览器存储暂时不可用，已暂停操作保护原进度；恢复存储权限后重新载入。':session.status==='blocked'?farmSaveDiagnosticMessage(session.diagnostic):localHunyuanSave?'本机演示存档或导入源已发生变化，原有进度已保留。关闭其他页面后重新载入。':session.currentRaw===null?'上次升级未完成，原始备份与当前旧版进度均已保留。关闭旧版页面后，可选择升级当前旧版进度。':'旧版页面与新版进度不一致，两个存档都已保留。关闭旧版页面后，可明确选择继续新版，不会合并两份资产。');
   }else if(state.biomeCompatibilityGrants?.length)setNotice(`旧牧场没有安全自然探索目标，已兼容开放：${state.biomeCompatibilityGrants.map(t=>EGG_THEME_LABELS[t]).join('、')}。未赠送动物或金币。`);
  }catch{farmWritable.current=false;state=createMinimalState(clockNow());setSaveOk(false);saveConflictRef.current=true;setSaveConflict(true);setSaveRecovery('浏览器存储暂时不可用，已暂停操作保护原进度；恢复存储权限后重新载入。');}
  try{
   const storage=window.localStorage;let raw=storage.getItem(atlasStorageKey);
   if(localHunyuanSave&&farmWritable.current&&raw===null){
    const old=storage.getItem(ANIMAL_ATLAS_STORAGE_KEY);
    if(old!==null){
     if(!readableAtlasSchema(JSON.parse(old)))throw new Error('Original atlas format unavailable');
     if(storage.getItem(atlasStorageKey)!==null||storage.getItem(ANIMAL_ATLAS_STORAGE_KEY)!==old)throw new Error('Atlas changed before local copy');
     if(new AtlasSaveGuard(storage,atlasStorageKey,null).persist(old)!=='saved')throw new Error('Local atlas copy unavailable');
     raw=storage.getItem(atlasStorageKey);if(raw!==old||storage.getItem(ANIMAL_ATLAS_STORAGE_KEY)!==old)throw new Error('Atlas changed during local copy');
    }
   }
   const parsed:unknown=raw===null?null:JSON.parse(raw);atlasLedger.current=normalizeAnimalAtlasLedger(parsed);atlasWritable.current=(!localHunyuanSave||farmWritable.current)&&(raw===null||readableAtlasSchema(parsed));atlasGuard.current=new AtlasSaveGuard(storage,atlasStorageKey,raw);
  }catch{atlasLedger.current=normalizeAnimalAtlasLedger(undefined);atlasWritable.current=false;}rememberAtlas(state);
  live.current=state;setData(state);updateAudio(state);
  const initializeScene=()=>{
   if(!sessionMounted.current||!host.current)return;let scene:MinimalWorld|null=null;
   const terrainStatus=(status:TerrainRenderStatus)=>{
    if(!sessionMounted.current||scene&&world.current!==scene)return;
    if(status.phase==='disposed')return;
    const ready=status.phase==='ready'&&!selectedModelBlocked.current;worldReadyRef.current=ready;setWorldReady(ready);
    if(status.phase==='error')setWorldError(status.error??'3D 场景暂时没有打开');
    else {if(!selectedModelBlocked.current)setWorldError('');if(ready){if(status.fallbackReason)setNotice('已切换兼容地表，牧场进度不变');visibility();}}
   };
   try{
    scene=new MinimalWorld(host.current,live.current??state,{now:clockNow,select:t=>{if(t.kind!=='showcase'&&t.kind!=='landmark')selectRef.current(t);},arrive:(point:Point,id?:number)=>arriveRef.current(point,id),interactionCancel:()=>interruptRef.current(),animalModelsChanged:status=>{setAnimalModels(status);if(localAnimalDeploymentStatus()==='ready'&&status.failed>0){selectedModelBlocked.current=true;worldReadyRef.current=false;setWorldReady(false);setWorldError('本机所选动物暂不可用，已暂停操作；请重试资源或重新载入。');}else if(selectedModelBlocked.current&&status.failed===0&&status.loading===0){selectedModelBlocked.current=false;setWorldError('');if(scene?.ready)void scene.ready.then(terrainStatus);}},status:(message:string)=>setNotice(message),terrainStatus});world.current=scene;
    scene.setAnimalLocks?.(session?.farm?canonicalFarmLocks(session.farm,session.view.ownOffer):[]);scene.setPlacementMode(!!placingRef.current);scene.setCreativeAssets?.(session?.farm?.creative?.assets??[]);scene.setWeatherPreferences(weatherPreferenceRef.current??{});syncWorldAtmosphere();
    if(scene.ready)void scene.ready.then(terrainStatus);else terrainStatus({phase:'ready',mode:'legacy'});
   }catch(error){worldReadyRef.current=false;setWorldReady(false);setWorldError(error instanceof Error?error.message:'3D 场景暂时没有打开');}
  };
  const cancelStartup=deferScene?scheduleSceneStartup(initializeScene):undefined;if(!deferScene)initializeScene();
  let currentView=session?.view;
  const unsubscribe=session?.subscribe(()=>{
   if(!sessionMounted.current)return;setCloudBusy(session.busy);
   if(session.view!==currentView&&session.farm){
    const changed=!currentView?.farm||session.farm.revision!==currentView.farm.revision||session.farm.state.updatedAt!==currentView.farm.state.updatedAt;
    const externalAdvance=!session.pending&&!!currentView?.farm&&session.farm.revision>currentView.farm.revision;
    if(externalAdvance&&pending.current)stop(false);currentView=session.view;
    // GET's newer serverTime does not make its unchanged persisted pose newer.
    // Keep a local pending prediction and active route on same-revision reads.
    if(changed){acceptCanonical();if(!pending.current&&(!session.pending||session.pending.route==='command'&&(session.pending.payload.command as {type?:string})?.type==='stopMove'))world.current?.reconcilePlayer?.(canonicalSnapshot());}
    world.current?.setCreativeAssets?.(session.farm.creative?.assets??[]);
   }
   if(!session.pending&&session.farm)reconcileConfirmedPlacement(session.farm.state);
   if(!session.busy&&!session.pending&&movementFlushTimer.current===null)movementFlushTimer.current=setTimeout(()=>{movementFlushTimer.current=null;flushMovementRef.current();},0);
  });
  world.current?.setCreativeAssets?.(session?.farm?.creative?.assets??[]);
  const storageChanged=(event:StorageEvent)=>{if(!session&&(event.key===null||(localHunyuanSave?event.key===LOCAL_HUNYUAN_STORAGE_KEY:event.key===MINIMAL_STORAGE_KEY||event.key===LEGACY_MINIMAL_STORAGE_KEY||event.key===LEGACY_BACKUP_KEY||event.key===LEGACY_ACK_KEY)))preflight();if(event.key===atlasStorageKey||event.key===null)checkAtlas();};window.addEventListener('storage',storageChanged);
  visibility();const timer=window.setInterval(()=>{if(visitingRef.current||!live.current||document.visibilityState==='hidden'||selectedModelBlocked.current)return;accept(currentSnapshot(clockNow()));},250);
  return()=>{sessionMounted.current=false;worldReadyRef.current=false;queuedApproach.current=null;queuedArrival.current=null;queuedCloudStop.current=false;if(movementFlushTimer.current!==null)clearTimeout(movementFlushTimer.current);cancelStartup?.();unsubscribe?.();window.clearInterval(timer);window.removeEventListener('storage',storageChanged);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',audioBlur);window.removeEventListener('focus',audioFocus);pending.current=null;engine.dispose();audio.current=null;audioScenes.current=null;world.current?.dispose();world.current=null;};
 },[]);
 useEffect(()=>{if(!atmosphereSettings)return;audio.current?.setVolume?.(atmosphereSettings.volume);syncWorldAtmosphere();try{saveAtmosphereSettings(window.localStorage,atmosphereSettings);}catch{/* Preferences are cosmetic. */}},[atmosphereSettings]);
 useEffect(()=>{world.current?.setPlacementMode(!!placing||!!creativePlacing);},[placing,creativePlacing]);
 useEffect(()=>{if(!sheet&&returnToShop.current){const entry=returnToShop.current;returnToShop.current=false;(entry==='studio'?shopStudioEntry.current:shopWishEntry.current)?.focus({preventScroll:true});}if(!sheet&&discoveryOpener.current){const opener=discoveryOpener.current;discoveryOpener.current=null;if(opener.isConnected)opener.focus({preventScroll:true});else focusScene();}},[sheet]);
 useEffect(()=>{if(!saleReceipt)return;const timer=window.setTimeout(()=>setSaleReceipt(null),1000);return()=>window.clearTimeout(timer);},[saleReceipt]);
 useEffect(()=>{if(saveConflict)recoveryButton.current?.focus({preventScroll:true});},[saveConflict]);
 useEffect(()=>{if(!coinBurst)return;const timer=window.setTimeout(()=>setCoinBurst(false),1300);return()=>window.clearTimeout(timer);},[coinBurst]);
 useEffect(()=>{if(!hatchCue)return;const timer=window.setTimeout(()=>setHatchCue(false),2400);return()=>window.clearTimeout(timer);},[hatchCue]);
 useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),4200);return()=>window.clearTimeout(timer);},[notice]);
 useEffect(()=>{
  const ends=Object.values(responseEnds);if(!ends.length)return;
  const timer=window.setTimeout(()=>{const now=performance.now(),remaining=Object.fromEntries(Object.entries(responseEndsRef.current).filter(([,end])=>end>now));responseEndsRef.current=remaining;setResponseEnds(remaining);},Math.max(1,Math.min(...ends)-performance.now()));
  return()=>window.clearTimeout(timer);
 },[responseEnds]);
 useEffect(()=>{if(!weatherPreference)return;world.current?.setWeatherPreferences(weatherPreference);if(live.current)updateAudio(live.current);try{window.localStorage.setItem(WEATHER_STORAGE,JSON.stringify(weatherPreference));}catch{/* Weather previews work without persistence. */}},[weatherPreference]);
 useEffect(()=>{
  if(!target||!data)return;
  const missing=target.kind==='animal'?!data.animals.some(a=>a.id===target.id):target.kind==='egg'?!data.eggs.some(e=>e.id===target.id):false;
  if(missing){stop();showTarget(null);setNotice('');}
 },[data,target]);
 const climate=deriveWeather(clockNow(),weatherPreference??{}),ClimateIcon=weatherIcons[climate.kind];
 const animal=target?.kind==='animal'?data?.animals.find(a=>a.id===target.id):undefined;
 const responding=!!animal&&(responseEnds[animal.id]??0)>performance.now();
 const careSupply=data?farmSupply(data):null;
 const growthAt=clockNow(),growth=animal?{stage:animalGrowthStage(animal,growthAt),label:animalGrowthLabel(animal,growthAt),remainingMs:animalGrowthRemainingMs(animal,growthAt)/(animal.growth?1+(careSupply?.growthBonusRate??0):1),progress:animalGrowthProgress(animal,growthAt)}:null;
 const giftStatus=animal&&data&&growth?(growth.stage!=='adult'?'成年后可领':growthAt<data.updatedAt||!!data.lastCompanionGiftDay&&dayKey(growthAt)<data.lastCompanionGiftDay?'日期恢复后可领':data.lastCompanionGiftDay===dayKey(growthAt)?'今日已收下':data.carriedAnimalId?'放下后打招呼可领':canClaimCompanionGift(data,animal,growthAt)?`今日心意 +${COMPANION_GREETING_GIFT_COINS}`:'走近打招呼可领'):null;
 const egg=target?.kind==='egg'?data?.eggs.find(e=>e.id===target.id):undefined;
 const tile=target?.kind==='tile'&&data?tileAt(data,target):undefined;
 const held=data?.animals.find(a=>a.id===data.carriedAnimalId),bag=data?.eggs.filter(e=>e.location==='bag')??[];
 const breeding=animal&&data?animalBreedingStatus(data,animal.id,clockNow()):undefined;
 const pair=breeding?.pair;
 const acceptedBreed=useRef<string|null>(null);
 const breedingIntent=intent.current;
 const attemptBreed=()=>{
  const selected=selectionRef.current;
  // DOM handlers can outlive a same-tick close, approach or selection change.
  // Validate intent synchronously, before committing a scarce daily attempt.
  if(!pair||pending.current||walking||intent.current!==breedingIntent||selected?.kind!=='animal'||selected.id!==pair[0]||document.visibilityState==='hidden'||!live.current||live.current.carriedAnimalId||saveConflictRef.current)return;
  const token=JSON.stringify([dayKey(clockNow()),...pair]);if(acceptedBreed.current===token)return;
  if(send({type:'breed',animalIds:pair})){acceptedBreed.current=token;showTarget(null);}
 };
 const openBag=()=>{close();setSheet('bag');};
 const beginPlace=(id:string)=>{close();setPlacement(id);setNotice('');};
 const cancelPlace=()=>{dismiss();buyLocked.current=false;setPlacement(null);};
 const buy=(theme:EggTheme='grassland')=>{if(buyLocked.current||placingRef.current||pending.current)return;buyLocked.current=true;if(send({type:'buyEgg',theme})){const e=live.current?.eggs.at(-1);if(e)beginPlace(e.id);}else buyLocked.current=false;};
 const requestAnimalAction=(action:AnimalAction)=>{
  if(!animal||!live.current||pending.current||live.current.carriedAnimalId)return;
  if(action==='care'&&(responseEndsRef.current[animal.id]??0)>performance.now())return;
  const locked=actionLock.current;if(locked?.id===animal.id&&locked.action===action&&performance.now()-locked.at<500)return;
  actionLock.current={id:animal.id,action,at:performance.now()};setNotice('');
  const current=currentSnapshot(clockNow()),a=current.animals.find(a=>a.id===animal.id);if(!a)return;
  if(Math.hypot(a.position.x-current.player.x,a.position.z-current.player.z)>1.6){approach({kind:'animal',id:a.id},animalApproach(current,a.position),{action});return;}
  performAnimalAction(a.id,action);
 };
 const retryModels=async()=>{
  const scene=world.current;if(!scene||retryingModelsRef.current)return;retryingModelsRef.current=true;setRetryingModels(true);setModelRetryMessage('');
  try{const result=await scene.retryAnimalModels();if(world.current===scene&&result.failed)setModelRetryMessage('还有模型暂未载入，可以稍后再试。');}
  catch{if(world.current===scene)setModelRetryMessage('暂时没能载入模型，可以稍后再试。');}
  finally{retryingModelsRef.current=false;if(world.current===scene)setRetryingModels(false);}
 };
 const eggFar=!!egg?.position&&!!data&&Math.hypot(egg.position.x-data.player.x,egg.position.z-data.player.z)>1.6;
 const onboarding=data?.welcomeClaimed&&!data.animals.length&&!data.eggs.length;
 const canConvertLandscape=!!data&&(Object.keys(terrainInfo) as Terrain[]).some(terrain=>!conversionExpansionIssue(data,terrain));
 const shopReason=saveConflict?'存档需要先恢复':!worldReady?'画面正在准备':cloudBusy||session?.busy?'正在确认上一条指令…':session?.pending?'上一条指令待确认，请先重试':walking?'LX 正在走近商店…':'';
 const pendingHint=walking?(pending.current?.action==='care'?'走近中 · 到达后打招呼':pending.current?.action==='pickup'?'走近中 · 到达后举起':target?.kind==='shop'?'LX 正在走近商店…':target?.kind==='egg'?'LX 正在走近这颗蛋…':'LX 正在走过去…'):'';
 const animationLabURL=new URL(window.location.href);animationLabURL.searchParams.set('animationLab','1');
 return <main className="app-shell minimal-shell"><PhoneViewport><section className={`minimal-farm egg-farm ${MINIMAL_DEFENSE_ENABLED&&data?.wolfEvent?'has-wolves':''}`} aria-label="绒绒世界" aria-busy={!worldReady&&!worldError} onPointerDownCapture={unlockFromGesture} onKeyDownCapture={event=>{unlockFromGesture(event);if(visitingRef.current||friendsOpen)return;if(event.key==='Escape'&&!sheet){event.stopPropagation();close();focusScene();}}} onClickCapture={event=>{if(visitingRef.current||friendsOpen){unlockFromGesture(event);return;}if(!worldReadyRef.current&&!worldError){event.preventDefault();event.stopPropagation();return;}unlockFromGesture(event);}}><div data-home-farm className="home-farm-layer" inert={!!visitingSample||friendsOpen} aria-hidden={!!visitingSample} style={{visibility:visitingSample?'hidden':undefined}}><div className="minimal-world" ref={host}/>{!worldReady&&!worldError&&<div className="farm-scene-loading" role="status"><span><Leaf size={28}/></span><b>小牧场醒来啦</b><small>正在铺好土地，迎接小伙伴…</small></div>}
  <header className="egg-top"><div className="egg-avatar"><img src="/avatars/portraits/human-lx.webp" alt="LX"/><span>{session?`${session.account.handle} 的牧场`:'LX 的牧场'}</span></div><div className={`egg-coins ${coinBurst?'egg-coins-pop':saleReceipt?'egg-sale-wallet':''}`}><Coins size={18}/><b>{data?.coins??0}</b>{saleReceipt&&<span key={saleReceipt.id} className="egg-sale-receipt" data-receipt-source={saleReceipt.source} aria-hidden="true"><Coins size={13}/>+{saleReceipt.value}</span>}</div><button className="egg-round" aria-label="好友牧场" onClick={openFriends}><Users size={18}/></button><button className="egg-round" aria-label="设置与说明" onClick={()=>{close();setSheet('settings');}}><Settings2 size={18}/></button></header>
  <button className="egg-weather-badge" aria-label="牧场天气设置" onClick={()=>{close();setSheet('settings');}}><ClimateIcon size={15}/>{climate.label} · {climate.daylight<.5?'夜晚':'白天'}</button>
  {coinBurst&&<div className="egg-coin-burst" aria-hidden="true">{Array.from({length:7},(_,i)=><i key={i} style={{'--coin-index':i} as CSSProperties}><Coins size={27}/></i>)}</div>}
  {worldError?<div className="egg-error"><b>画面暂时没有打开</b><p>{worldError}</p><button onClick={()=>window.location.reload()}>重新打开</button></div>:<>
   {data&&!data.welcomeClaimed&&!saveConflict&&<div className="egg-welcome"><div className="egg-welcome-card"><span className="egg-welcome-art"><Egg size={58}/><Sparkles size={24}/></span><small>一颗蛋，会带来谁？</small><h1>你的小牧场<br/>今天开张啦</h1><button className="egg-primary" onClick={()=>{if(send({type:'welcome'})){setCoinBurst(true);setNotice('');}}}><Coins size={20}/>领取 120 金币</button></div></div>}
   {data?.welcomeClaimed&&<>
    <div className="egg-side"><button className="egg-round" aria-label="回到牧场" onClick={()=>world.current?.focus()}><Home size={17}/></button>{bag.length>0&&<button className="egg-round egg-bag" aria-label={`蛋袋，${bag.length}颗蛋`} onClick={openBag}><Egg size={21}/><i>{bag.length}</i></button>}</div>
    {(data.hatchedCount>0||data.collection.length>0||data.animals.length>0)&&!placing&&!held&&!editingTerrain&&!hatchCue&&(!MINIMAL_DEFENSE_ENABLED||!data.wolfEvent)&&<nav className="egg-discovery-dock" aria-label="伙伴与发现" inert={!!sheet}><button type="button" aria-label="动物图鉴" onClick={event=>openDiscovery('atlas',event.currentTarget)}><BookOpen size={17} aria-hidden="true"/><span>图鉴</span></button><button type="button" className="egg-care-entry" aria-label="牧场自动照料" onClick={()=>{close();setSheet('care');}}><Leaf size={17}/><span>照料 +{growthRateLabel(careSupply?.growthBonusRate??0)}</span></button></nav>}
    {MINIMAL_DEFENSE_ENABLED&&!!data.wolfEvent&&<button className="egg-wolf" disabled={data.wolfEvent.helped} onClick={()=>{if(send({type:'help'}))world.current?.perform('help');}}><Bell size={17}/>{data.wolfEvent.helped?'刀盾狗正在赶走它们':'小狼来了，帮伙伴一下'}</button>}
    {!sheet&&target&&!placing&&<section className={`egg-context ${held||editingTerrain?'has-toolbar':''}`} aria-label="场景动作" aria-busy={walking}><div className="egg-context-heading"><span>{target.kind==='shop'?'商店':target.kind==='animal'?'动物':target.kind==='egg'?'孵化':'土地'}</span></div><button className="egg-close" aria-label="关闭场景动作" onClick={()=>{dismiss();focusScene();}}><X size={17}/></button><div className="egg-context-body">
     {target.kind==='shop'&&<><div className="egg-context-help"><PanelHelp title="商店说明"><p>动物蛋每颗 30 金币。开垦对应自然生态后永久解锁；伙伴资源就绪、余额和位置足够时才能购买。</p><p>买蛋后放到对应生态才能孵化。暂时没有合适孵化地，不会取消已经解锁的购买资格。</p><p>出售后动物会离开牧场，金币立即到账。已发现的种类保留在图鉴。</p><p>{session?'许愿池可交换动物、蛋和自定义物品。':'许愿池尚未开放联机；当前只能预览，不会转移动物或扣次数。'}</p></PanelHelp></div>{held?<><small className="egg-section-label">出售动物</small><h2>{held.creative?held.name:speciesName[held.species]} {held.sex==='female'?'♀ 女生':'♂ 男生'}</h2><p>{walking?'LX 正在走近商店…':'出售后会离开牧场'}</p><button className="egg-primary" disabled={walking||!nearShop(data)} onClick={event=>{if(send({type:'sellAnimal'})){event.currentTarget.disabled=true;showTarget(null);}}}><Coins size={19}/>出售 · {sellValue(held)} 金币</button></>:<><EggShopCatalog state={data} disabledReason={shopReason} onBuy={buy} onExplore={point=>{selectRef.current({kind:'tile',...point});world.current?.focusTile?.(point);}}/><button type="button" className="egg-shop-wish" ref={shopStudioEntry} aria-label="蛋蛋小铺自定义" disabled={walking||!nearShop(data)||cloudBusy||!!session?.pending} onClick={openShopStudio}><WandSparkles size={19} aria-hidden="true"/><span><b>自定义小愿望</b><small>小伙伴 · 地皮 · 物件</small></span><em>固定样例</em></button>{(session||data.hatchedCount>0||data.collection.length>0||data.animals.length>0)&&<button type="button" className="egg-shop-wish" ref={shopWishEntry} aria-label="商店许愿池" disabled={walking||!nearShop(data)} onClick={openShopWish}><Droplets size={19} aria-hidden="true"/><span><b>许愿池</b><small>{session?'物品交换':'动物交换'}</small></span><em>{session?'已连接':'未开放 · 预览'}</em></button>}{data.coins<30&&!data.animals.length&&!data.eggs.length&&<button className="egg-pair" disabled={walking||!nearShop(data)} onClick={()=>{if(send({type:'emergencyEgg'})){const e=live.current?.eggs.at(-1);if(e)beginPlace(e.id);}}}><Egg size={17}/>店长送你一颗起步蛋</button>}</>}</>}
     {egg&&<EggIncubationPanel state={data} egg={egg} walking={walking} far={eggFar} onHatch={()=>{if(send({type:'hatch',eggId:egg.id})){showTarget(null);setNotice('');setHatchCue(true);}}} onCollect={()=>{if(send({type:'collectEgg',eggId:egg.id})){showTarget(null);setNotice('收回啦，孵化进度会保留');}}}/>}
     {animal&&growth&&<><div className="egg-context-help"><RarityHelp/><PanelHelp title="动物说明"><p>打招呼可增加亲密度；成年动物可赠送金币，全牧场每天一次。</p>{animal.creative?<p>固定样例伙伴可成长、照料、举放和出售；画面使用程序动作，暂不支持繁育。</p>:<p>同种成年异性伙伴有机会产下对应物种蛋。每天整座牧场最多 1 枚，每只动物每天尝试一次。</p>}<p>幼崽 → 少年 → 成年，每约 {MINIMAL_RULES.stageMs/60_000} 分钟进入下一阶段；土地照料最多加快 20%。繁育日按 UTC+8 自然日计算，不加速。</p></PanelHelp></div><div className="egg-animal-heading"><div><h2>{animal.name}</h2><RarityBadge rarity={animal.rarity}/><p className="egg-animal-meta">{animal.creative?'小伙伴':speciesName[animal.species]}<span aria-label={animal.sex==='female'?'性别：女生':'性别：男生'}>{animal.sex==='female'?'♀ 女生':'♂ 男生'}</span><span className="egg-bond"><Heart size={11}/>亲密 {animal.bond}</span></p></div><span className="egg-growth-stage" aria-label="成长阶段">{growth.label}</span></div><div className={`egg-growth ${growth.stage==='adult'?'is-grown':''}`} key={growth.stage}>{growth.stage==='adult'?<small><Leaf size={12}/>已长大</small>:<><div className="egg-growth-track" role="progressbar" aria-label="到下一阶段的成长进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(99,Math.floor(growth.progress*100))}><i style={{width:`${growth.progress*100}%`}}/></div><small>约 {Math.max(1,Math.ceil(growth.remainingMs/1000))} 秒后{growth.stage==='baby'?'成为少年':'成年'}</small>{animal.growth&&<small className="egg-growth-bonus"><Leaf size={12}/>土地照料 +{growthRateLabel(careSupply?.growthBonusRate??0)}</small>}</>}</div><p className="egg-companion-gift-status" data-companion-gift-status><Coins size={12}/><span>{giftStatus} · 全牧场每天一次</span></p>{breeding?.show&&<p className="egg-breeding-status" data-breeding-status><Heart size={12}/>{breeding.message}</p>}{held?<p>{held.id===animal.id?'举起中':'请先放下另一只动物'}</p>:<div className="egg-actions"><button className="egg-primary" disabled={walking} onClick={()=>requestAnimalAction('pickup')}><ArrowUp size={17}/>举起来</button><button disabled={walking||responding} onClick={()=>requestAnimalAction('care')}><Hand size={17}/>{responding?'回应中…':'打招呼'}</button>{pair&&<button className="egg-pair" disabled={walking} aria-label="和同种伙伴碰碰鼻尖" onClick={attemptBreed}><Heart size={16}/><span>碰碰鼻尖</span></button>}</div>}</>}
     {tile&&(()=>{const info=terrainInfo[tile.terrain],Icon=info.Icon;return <><h2><Icon size={19}/>{tile.owned?info.name:`未开辟的${info.name}`}</h2><div className="egg-tile-status"><span>{tile.owned?'已开辟':'未开辟'}</span><span>{isWalkableTile(data,tile)?'可通行':isShopTile(tile)?'商店占地':tile.terrain==='pond'?'不可通行':'开辟后可通行'}</span><PanelHelp title={`${info.name}说明`}><p>{info.text}</p><p>开辟相邻地块需要 40 金币；更换地形需要 20 金币。</p></PanelHelp></div>{tile.owned&&editingTerrain&&<TerrainAppearancePicker tile={tile} ecologyLabel={info.name} disabled={saveConflict||!!session?.busy||!!session?.pending} onPaint={appearance=>send({type:'paintTerrain',at:{x:tile.x,z:tile.z},appearance})}/>}{tile.owned&&editingTerrain&&!isShopTile(tile)&&<TerrainUpgrade tile={tile} state={data} onUpgrade={toLevel=>send({type:'upgradeTerrain',at:tile,toLevel})}/>}<>{!tile.owned&&!data.hatchedCount?<button className="egg-primary" onClick={()=>selectRef.current({kind:'shop'})}><Egg size={17}/>先去孵第一颗蛋</button>:!tile.owned?<button className="egg-primary" disabled={!terrainCanOpen(data,tile)||data.coins<40} onClick={()=>send({type:'expand',at:tile})}><Plus size={17}/>{!terrainCanOpen(data,tile)?'先开辟旁边的地块':data.coins<40?'还差 '+(40-data.coins)+' 金币':'开辟 · 40 金币'}</button>:canConvertLandscape&&<><button onClick={()=>setConverting(!converting)}><Leaf size={16}/>换种风景 · 20</button>{converting&&<><p className="egg-convert-supply-note">改成沙漠或冰川：本格青草/饮水/休憩 {tileSupply(tile).food}/{tileSupply(tile).water}/{tileSupply(tile).rest} → 0/0/0，基础照料不变。</p><div className="egg-terrains">{(Object.keys(terrainInfo) as Terrain[]).map(t=>{const T=terrainInfo[t].Icon,reason=conversionExpansionIssue(data,t)??explorationIssue(data.exploredBiomes,t)??terrainConversionIssue(data.tiles,tile,t);return <div key={t} className="terrain-choice"><button title={reason??undefined} disabled={tile.terrain===t||data.coins<20||!!reason} onClick={()=>{if(send({type:'convert',at:tile,terrain:t}))setConverting(false);}}><T size={20}/>{terrainInfo[t].name}</button>{reason&&<small>{reason}</small>}</div>;})}</div></>}</>}</></>;})()}
     {walking&&animal&&<div className="egg-context-status" role="status"><span>{pendingHint}</span><button aria-label="取消靠近" onClick={()=>{stop();setNotice('');}}>取消</button></div>}
     {notice&&!walking&&<p className="egg-context-notice" role="status">{notice}</p>}
    </div></section>}
    {!sheet&&<div className="egg-bottom">
     {notice&&!target&&!placing&&!held&&!editingTerrain&&<span className="egg-toast" role="status">{notice}</span>}
     {placing?<div className="egg-place-bar"><Egg size={24}/><span>{session?.pending?'正在确认指令，稍后再放置':notice|| (walking?'LX 正在走过去':'点一块亮起的空地，把蛋放下来')}</span><button aria-label="取消放蛋" onClick={cancelPlace}><X size={18}/></button></div>:editingTerrain?<div className="egg-edit-bar"><Leaf size={18}/><span>点土地，换外观或养护</span><button onClick={()=>{dismiss();setTerrainEditing(false);}}>完成布置</button></div>:held?<div className="egg-carry-bar"><button className="egg-primary" onClick={()=>selectRef.current({kind:'shop'})}><ShoppingBag size={18}/>带去商店出售</button><button onClick={()=>{if(send({type:'putdown'}))setNotice('');}}><ArrowUp size={17} className="egg-down"/>放下</button></div>:onboarding&&!target?<button className="egg-primary egg-first-shop" onClick={()=>selectRef.current({kind:'shop'})}><Egg size={22}/>{walking?'去商店的路上…':data.hatchedCount?'去商店，再挑一颗蛋':'去商店，买第一颗蛋'}</button>:walking&&!target?<span className="egg-toast">LX 正在走过去…</span>:null}
    </div>}
   </>}
   {notice&&held&&!target&&!sheet&&<div className="egg-carry-notice egg-toast" role="status">{notice}</div>}
   {hatchCue&&<div className="egg-hatch-cue" role="status"><Sparkles size={15}/>啪嗒！新伙伴来啦，点它认识一下</div>}
  </>}
  {(sheet==='bag'||sheet==='settings')&&<SimpleFarmSheet label={sheet==='bag'?'我的蛋袋':'设置与说明'} onClose={()=>setSheet(null)}><header><h2>{sheet==='bag'?'我的蛋袋':'设置'}</h2><div className="egg-sheet-header-actions"><button className="egg-round" aria-label="关闭面板" onClick={()=>setSheet(null)}><X size={20}/></button>{sheet==='settings'&&<PanelHelp title="牧场玩法"><h3>操作</h3><p>点商店买蛋 → 放地上孵 → 留下来养，或举去商店卖。</p><p>拖拽旋转视角，单击地面走动；双指捏合或滚轮缩放。</p><h3>成长与繁育</h3><p>同种成年异性伙伴有机会产下对应物种蛋。每天整座牧场最多 1 枚，每只动物每天尝试一次。</p><p>在对应生态累计孵化 10–15 秒；收回或换到其他生态时暂停，进度保留。幼崽 → 少年 → 成年，每约 {MINIMAL_RULES.stageMs/60_000} 分钟进入下一阶段；土地照料最多加快 20%。繁育日按 UTC+8 自然日计算，不加速。</p><h3>音乐与天气</h3><p>{MINIMAL_DEFENSE_ENABLED?'开启声音后，小狼来时音乐会稍微紧张，离开后慢慢恢复。':'开启声音后，可以听到轻松的背景音乐与随场景变化的环境声。'}</p><p>模拟天气，不是真实天气预报。昼夜默认按 UTC+8；不改变动物收益，也没有灾害惩罚。</p><h3>存档</h3><p>{session?session.demoName?'测试账号由当前部署独立保存，原账号与本机存档保留。':'云端账号独立保存，原本机存档保留。':'当前浏览器本机保存，旧版存档保留。'}</p></PanelHelp>}</div></header>{sheet==='bag'?<>{bag.map(e=><button className="egg-bag-item" key={e.id} onClick={()=>beginPlace(e.id)}><span className="egg-painted"><Egg size={32}/>{e.source==='shop'&&<i>?</i>}</span><span><b>{e.source==='shop'?'神秘动物蛋':`${speciesName[e.species]}蛋`}</b><RarityBadge rarity={e.rarity}/><small>{e.theme?`${EGG_THEME_LABELS[e.theme]}生态 · `:''}{e.incubation?'换地继续孵化':'放置孵化'}</small></span><ArrowUp size={19}/></button>)}{!bag.length&&<p>暂无动物蛋</p>}</>:<>{(session||accountClient)&&<AccountCard client={(session??accountClient)!}/>}{session?.demoName&&<DemoDebugControls key={session.account.uid} client={session} disabledReason={saveConflict?'存档需要先恢复':walking?'先停下再调试':''}/>} {accountClient&&!session&&<><small>本机牧场 · 原进度保留</small><button type="button" className="online-secondary" onClick={onOpenAccount}>连接云端牧场</button></>}<p><a href={`${animationLabURL.pathname}${animationLabURL.search}${animationLabURL.hash}`} style={{display:'inline-flex',alignItems:'center',minHeight:'var(--farm-tap,44px)',minWidth:'var(--farm-tap,44px)',color:'inherit'}}>动作预览</a></p>{(animalModels.failed>0||retryingModels)&&<div className="egg-model-retry" role="status"><small>{retryingModels?'正在重试动物模型…':data?.animals.some(a=>a.species==='alpaca'||a.species==='penguin')?`${animalModels.failed} 个动物模型暂未载入，存档已保留；新伙伴可能暂时无法互动。`:`${animalModels.failed} 个动物模型暂未载入，存档和照料不受影响。`}</small><button aria-label="重试动物模型" disabled={retryingModels} onClick={()=>void retryModels()}>{retryingModels?'正在重试…':'重试动物模型'}</button>{modelRetryMessage&&<small>{modelRetryMessage}</small>}</div>}{localAnimalDeploymentStatus()==='ready'&&<small>新牛和小兔优先喝浅溪或池水。</small>}{data&&<AlpacaResourceControls state={data} disabled={saveConflict||walking||!!session?.busy||!!session?.pending} onCommand={command=>send(command)}/>}<div className="egg-settings-row"><button onClick={()=>{close();setTerrainEditing(true);}}><Leaf size={18}/>编辑风景</button></div><div className="egg-settings-row"><button onClick={()=>world.current?.zoom(.12)}><ZoomIn size={18}/>放大</button><button onClick={()=>world.current?.zoom(-.12)}><ZoomOut size={18}/>缩小</button></div><div className="egg-settings-row"><button data-audio-toggle aria-label="牧场背景音乐" aria-pressed={audioEnabled} onClick={toggleAudio}>{audioEnabled?<Volume2 size={18}/>:<VolumeX size={18}/>}音乐与环境声 · {audioEnabled?'开':'关'}</button></div>{atmosphereSettings&&<AmbientSoundControls volume={atmosphereSettings.volume} reducedMotion={atmosphereSettings.reducedMotion} onVolumeChange={volume=>setAtmosphereSettings(current=>current?{...current,volume}:current)} onReducedMotionChange={reducedMotion=>setAtmosphereSettings(current=>current?{...current,reducedMotion}:current)}/>} {audioStatus==='unavailable'&&<small>当前浏览器暂不支持声音，不影响游玩。</small>}<fieldset className="egg-weather-settings"><legend>牧场天气 · 模拟</legend><div className="egg-weather-options"><button aria-pressed={!weatherPreference?.weather||weatherPreference.weather==='auto'} onClick={()=>setWeatherPreference(p=>({...p,weather:'auto'}))}>自动变化</button>{WEATHER_KINDS.map(kind=>{const Icon=weatherIcons[kind];return <button key={kind} aria-label={`预览天气：${WEATHER_LABELS[kind]}`} aria-pressed={weatherPreference?.weather===kind} onClick={()=>setWeatherPreference(p=>({...p,weather:kind}))}><Icon size={17}/>{WEATHER_LABELS[kind]}</button>;})}</div><div className="egg-weather-times">{([{value:'auto',label:'随时间'},{value:'day',label:'白天'},{value:'night',label:'夜晚'}] as const).map(option=><button key={option.value} aria-label={`昼夜：${option.label}`} aria-pressed={(weatherPreference?.time??'auto')===option.value} onClick={()=>setWeatherPreference(p=>({...p,time:option.value}))}>{option.value==='night'?<Moon size={15}/>:<Sun size={15}/>} {option.label}</button>)}</div></fieldset><small>{session?session.demoName?'测试账号 · 服务端已连接':'云端账号 · 已连接':saveOk?'本机存档 · 已保存':'暂时无法保存，请先不要关闭页面。'}</small>{!atlasSaveOk&&<small>{atlasConflict?'图鉴暂时只读，原记录保留':'图鉴暂时无法保存，请先不要关闭页面。'}</small>}</>}</SimpleFarmSheet>}
  {sheet==='boarding'&&<BoardingPanel client={session??accountClient} onClose={()=>setSheet(null)}/>}
  {sheet==='care'&&data&&<TerrainCareSheet state={data} onClose={()=>setSheet(null)} onEdit={()=>{close();setTerrainEditing(true);}}/>}
  {sheet==='atlas'&&data&&<AnimalAtlas state={data} ledger={atlasLedger.current} onClose={()=>setSheet(null)}/>}
  {sheet==='wish'&&data&&(session?<ConnectedWishingPool client={session} onClose={()=>setSheet(null)} onBack={()=>setSheet(null)}/>:<WishingPool state={data} onClose={()=>setSheet(null)} onBackToShop={()=>setSheet(null)}/>)}
  {sheet==='studio'&&<CreativeStudio client={session} mode={studioMode} onClose={()=>setSheet(null)} onBack={studioMode==='shop'?()=>setSheet(null):undefined} onEditLand={()=>{close();setTerrainEditing(true);}} onOpenShop={()=>{close();selectRef.current({kind:'shop'});}} onPlace={id=>{close();setCreativePlacing(id);setNotice('选择一块空地，摆放你的作品');}}/>}
  {creativePlacing&&!sheet&&<div className="account-connection-banner"><WandSparkles size={16}/>点空地摆放<button onClick={()=>{setCreativePlacing(null);world.current?.setPlacementMode(false);}}>取消</button></div>}
  {session&&(cloudError||session.pending&&!cloudBusy)&&<div className="account-connection-banner" role="status">{cloudError||'上次指令尚未确认'}<button disabled={cloudBusy} onClick={()=>{setCloudError('');void session.retry().then(result=>{if(sessionMounted.current){if(!result.accepted)stop(false);setNotice(result.message);}}).catch(error=>{if(sessionMounted.current)setCloudError(error.message);});}}>重试</button></div>}
  {saveConflict&&<div className="egg-save-warning" role="alert">{saveRecovery||'其他页面更新了牧场，'}{legacyRecoveryRaw.current&&<button onClick={()=>{const choice=legacyRecoveryRaw.current;if(!choice)return;const result=acknowledgeLegacyFork(window.localStorage,choice.currentRaw);if(result==='saved')window.location.reload();else setSaveRecovery(result==='conflict'?'进度又变了，请重新载入后选择。':'暂时无法记录选择，两个存档仍已保留。');}}>{legacyRecoveryRaw.current.currentRaw===null?'继续升级当前旧版进度':'保留新版进度继续'}</button>}<button ref={recoveryButton} onClick={()=>window.location.reload()}>载入最新进度</button></div>}
  {!saveConflict&&!saveOk&&!sheet&&<div className="egg-save-warning">暂时无法保存，请不要关闭页面。</div>}
  {!saveConflict&&saveOk&&atlasConflict&&<div className="egg-save-warning" role="status">图鉴暂时只读，原记录保留</div>}
  {!saveConflict&&saveOk&&!atlasConflict&&!atlasSaveOk&&!sheet&&<div className="egg-save-warning">图鉴暂时无法保存，请不要关闭页面。</div>}
 </div>
 {visitingSample&&<VisitorFarm sampleId={visitingSample} viewerKey={session?.account.uid??(localHunyuanSave?'local-hunyuan':'local-farm')} onHome={returnHome} onFriends={openFriends} audioControl={<VisitorAudioControl enabled={audioEnabled} status={audioStatus} volume={atmosphereSettings?.volume??.65} onToggle={toggleAudio} onUnlock={unlockAudio}/>}/>}
 {friendsOpen&&<FriendsPanel onVisit={visitFriend} onClose={()=>setFriendsOpen(false)} onOpenBoarding={openRealBoarding}/>}
 </section></PhoneViewport></main>;
}
