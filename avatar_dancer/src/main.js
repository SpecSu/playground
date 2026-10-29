import './style.css';
import {versionCharacterManifest} from './asset-revision.js';
import {createUI} from './ui.js';
import {RhythmGame} from './rhythm.js';
import {AudioTransport,makeChart,estimateTempo} from './audio.js';
import {createPerformancePlaylist} from './performance-playlist.js';
import {createStage} from './stage.js';
import {createDailyScores} from './daily-scores.js';
import {createAvatarCreationStore} from './avatar-creation.js';
import {createAvatarGeneration} from './avatar-generation.js';

const audio=new AudioTransport();
const performancePlaylist=createPerformancePlaylist();
const dailyScores=createDailyScores();
let stageSession=0;
let stage,ui,game,metadata={title:'POPSTARS',bpm:169.99,duration:59.348367,offset:7.11},busy=false,trackReady=false,selected={character:'jiji',outfit:0};
let assetManifest=null,modelFailed=false,retryImportFile=null;
let importVersion=0,operationVersion=0,importPending=false,stageLoading=false,stageUnavailable=false,initializing=true,selectionVersion=0;
const avatarStore=createAvatarCreationStore();
const avatarFlow=createAvatarGeneration({
  store:avatarStore,
  isAvailable(id,outfit){
    const people=assetManifest?.characters||assetManifest;
    const person=Array.isArray(people)?people.find(p=>p.id===id):people?.[id];
    const asset=person?.outfits?.[outfit];
    return !initializing&&!stageUnavailable&&Boolean(stage?.setCharacter)&&Boolean(typeof asset==='string'?asset:asset?.model||asset?.url||asset?.modelUrl);
  },
  load:(id,outfit)=>stage.setCharacter(id,outfit),
  restore:()=>stage?.setCharacter(selected.character,selected.outfit),
  onState:state=>{ui?.setAvatarState?.(state);syncStartAvailability();},
});
const setMode=mode=>{if(mode!=='results')stage?.setResultPortraitTarget?.(null);ui.setMode(mode);stage?.setMode(mode);audio.setLobby(mode==='lobby');if(mode==='lobby'&&!metadata.local){const next=performancePlaylist.peek();ui.setTrack({title:next.title,meta:`下一首 · ${Math.round(next.bpm)} BPM · 顺序轮播`,bpm:next.bpm});}};
function syncStartAvailability(){
  const avatarBusy=avatarFlow.getState().busy;
  const disabled=stageUnavailable||initializing||busy||importPending||stageLoading||modelFailed||avatarBusy;
  const reason=stageUnavailable?'舞台未就绪':initializing?'准备舞台':avatarBusy?'准备分身':stageLoading?'准备造型':modelFailed?'重试造型':busy||importPending?'准备音乐':'登场';
  const button=document.querySelector('.start-button');if(button)button.disabled=disabled;
  ui?.setStartState?.({disabled,reason});
}
async function start(){
  if(stageUnavailable){ui.toast('当前浏览器无法开启 3D 舞台，请使用支持 WebGL 的浏览器');return;}
  if(initializing||stageLoading||modelFailed){ui.toast('正在准备舞台和造型，请稍等…');return;}
  if(importPending){ui.toast('正在读取歌曲，请稍等…');return;}
  if(avatarFlow.getState().busy){ui.toast('分身正在准备，请稍等或先取消');return;}
  if(busy)return;
  ui.setLoading?.('song',null);
  ui.setLoading?.('song',{phase:'loading'});
  const operation=++operationVersion;busy=true;syncStartAvailability();
  try{
    if(!metadata.local){
      const next=performancePlaylist.peek();
      if(metadata.playlistId!==next.id||!Array.isArray(metadata.chart)){
        const response=await fetch(next.metadataUrl);if(!response.ok)throw new Error('谱面暂时无法加载，请重试');
        const song=await response.json();if(operation!==operationVersion||importPending)return;
        if(!Array.isArray(song.chart)||!song.chart.length)throw new Error('谱面暂时无法加载，请重试');
        metadata={...song,playlistId:next.id};trackReady=false;
      }
    }
    if(!trackReady){ui.setLoading?.('song',{phase:'loading'});const loaded=await audio.load(metadata.audioUrl||'/assets/audio/popstars-gameplay.mp3');if(!loaded||operation!==operationVersion)return;trackReady=true;ui.setLoading?.('song',{phase:'ready'});}
    if(operation!==operationVersion||importPending)return;
    const duration=Math.min(audio.duration,metadata.local?90:metadata.duration),chart=metadata.local?makeChart(metadata.bpm,duration,metadata.offset):metadata.chart.filter(n=>n.time<duration-.15).map(n=>({...n}));
    if(!chart.length)throw new Error('这首歌曲太短，请选择至少 12 秒的音频');
    audio.stop();const playing=await audio.play();if(!playing||operation!==operationVersion||importPending)return;
    stage?.setBPM?.(metadata.bpm,metadata.offset);game.start(chart,{duration});if(!metadata.local)performancePlaylist.commitStart(metadata.playlistId,operation);ui.setTrack({title:metadata.title,meta:`${metadata.local?'本地音乐':'用户提供音频'} · ${Math.round(metadata.bpm)} BPM · ${chart.length} 音符`,bpm:metadata.bpm,local:!!metadata.local});ui.setLoading?.('song',null);setMode('playing');
  }catch(e){if(operation===operationVersion){ui.setLoading?.('song',{phase:'error'});ui.toast(e.message||'暂时无法开始，请重试');}}
  finally{if(operation===operationVersion){busy=false;syncStartAvailability();}}
}
function pause(){
  if(game.state.status!=='playing')return;
  game.pause();
  // pause() advances the clock first and may finish the round via onEnd.
  // Keep its results screen instead of overwriting it with a paused overlay.
  if(game.state.status!=='paused')return;
  audio.pause();setMode('paused');
}
async function resume(){if(importPending||game.state.status!=='paused')return;const operation=operationVersion;const playing=await audio.play();if(playing&&operation===operationVersion&&game.state.status==='paused'){game.resume();setMode('playing');}}
async function nextTrack(){
  if(game.state.status!=='idle'||avatarFlow.getState().busy)return;
  const next=performancePlaylist.selectNext();
  const operation=++operationVersion;++importVersion;
  importPending=false;retryImportFile=null;busy=true;trackReady=false;
  audio.cancelLoad();audio.stop();
  // Selection is synchronous; asynchronous metadata may only fill this choice.
  metadata={...next,playlistId:next.id,local:false};
  ui.setTrack({title:next.title,meta:`下一首 · ${Math.round(next.bpm)} BPM`,bpm:next.bpm,local:false});
  ui.setLoading?.('song',{phase:'loading'});syncStartAvailability();
  try{
    const response=await fetch(next.metadataUrl);if(!response.ok)throw new Error('谱面暂时无法加载，请重试');
    const song=await response.json();if(operation!==operationVersion)return;
    if(!Array.isArray(song.chart)||!song.chart.length)throw new Error('谱面暂时无法加载，请重试');
    metadata={...song,playlistId:next.id,local:false};
    ui.setTrack({title:metadata.title,meta:`下一首 · ${Math.round(metadata.bpm)} BPM · ${Math.round(metadata.duration)} 秒 · ${metadata.chart.length} 音符`,bpm:metadata.bpm,local:false});
    ui.setLoading?.('song',null);
  }catch(error){if(operation===operationVersion){ui.setLoading?.('song',{phase:'error'});ui.toast(error.message||'歌曲暂时无法载入，请重试');}}
  finally{if(operation===operationVersion){busy=false;syncStartAvailability();}}
}
async function importTrack(file){
  if(file.size>50*1024*1024){ui.toast('请选择小于 50 MB 的音频');return;}
  // Reserve ownership before file IO, not after it: older reads/decodes must never commit.
  retryImportFile=file;
  const version=++importVersion;++operationVersion;importPending=true;busy=false;
  ui.setLoading?.('song',null);
  audio.cancelLoad();audio.stop();game.reset();setMode('lobby');ui.setLoading?.('song',{phase:'loading'});syncStartAvailability();
  try{
    const bytes=await file.arrayBuffer();if(version!==importVersion)return;
    ui.setLoading?.('song',{phase:'decoding'});
    const buffer=await audio.decode(bytes,{minDuration:12});if(!buffer||version!==importVersion)return;
    ui.setLoading?.('song',{phase:'analyzing'});
    trackReady=true;metadata={local:true,title:file.name.replace(/\.[^.]+$/,''),...estimateTempo(buffer),duration:audio.duration};
    stage?.setBPM?.(metadata.bpm,metadata.offset);
    ui.setTrack({title:metadata.title,meta:`本地音乐 · 估测 ${metadata.bpm} BPM${buffer.duration>90?' · 游玩前 90 秒':''}`,bpm:metadata.bpm,local:true});
    retryImportFile=null;ui.setLoading?.('song',{phase:'ready'});ui.toast('歌曲已载入，仅在此设备播放');
  }catch(error){if(version===importVersion){ui.setLoading?.('song',{phase:'error'});ui.toast(error.message?.includes('至少')?error.message:'无法读取这首歌曲，请换一个音频文件');}}
  finally{if(version===importVersion){importPending=false;syncStartAvailability();}}
}
async function applyOutfit(index){
  if(selected.character==='jiaxin'&&!avatarStore.getState().outfits.includes(index))return;
  if(busy){++operationVersion;busy=false;audio.cancelLoad();audio.stop();ui.setLoading?.('song',null);}
  const changed=selected.outfit!==index;selected.outfit=index;
  const selection=++selectionVersion,operation=operationVersion,target={character:selected.character,outfit:index};
  if(initializing)return;
  stageLoading=true;modelFailed=false;ui.setLoading?.('model',{phase:'loading',...target});syncStartAvailability();
  try{
    const loaded=await stage?.setCharacter(target.character,index);
    if(selection!==selectionVersion)return;
    stageLoading=false;modelFailed=loaded!==true;
    ui.setLoading?.('model',{phase:loaded===true?'ready':'error',...target});syncStartAvailability();
    if(loaded===true&&changed&&operation===operationVersion&&game.state.status==='idle'&&!busy&&!avatarFlow.getState().busy)stage?.spinShowcase?.();
  }catch{
    if(selection!==selectionVersion)return;stageLoading=false;modelFailed=true;
    ui.setLoading?.('model',{phase:'error',...target});syncStartAvailability();
  }
}
async function retryModel(){
  if(initializing)return;
  if(!assetManifest||!stage||stage.available===false){stage?.dispose?.();stageUnavailable=false;initializing=true;modelFailed=false;syncStartAvailability();return init();}
  stageUnavailable=false;return applyOutfit(selected.outfit);
}
ui=createUI({
  onRank:()=>dailyScores.getRows(),
  getAvatarState:()=>avatarFlow.getState(),
  onCreateAvatar:()=>avatarFlow.createAvatar(),
  onGenerateOutfit:index=>avatarFlow.generateOutfit(index),
  onCancelAvatarJob:()=>avatarFlow.cancel(),
  onCloseUp:value=>stage?.setCloseUp?.(value),
  onRotateAvatar:delta=>!initializing&&!stageLoading&&!busy&&!avatarFlow.getState().busy&&game.state.status==='idle'?(stage?.rotateAvatar?.(delta)??false):false,
  onCharacter(id){if(id==='jiaxin'&&!avatarStore.getState().unlocked)return;selected.character=id;selected.outfit=ui.getSelection().outfit;selectionVersion++;},
  onOutfit:applyOutfit,
  onRetryModel:retryModel,
  onRetrySong:()=>retryImportFile?importTrack(retryImportFile):start(),
  onStart:start,onPause:pause,onResume:resume,onReplay:start,
  onLobby(){avatarFlow.cancel();ui.setLoading?.('song',null);++operationVersion;++importVersion;importPending=false;busy=false;audio.cancelLoad();audio.stop();game.reset();setMode('lobby');syncStartAvailability();},
  onMute:value=>audio.mute(value),
  onHit(lane){const judged=game.hit(lane);if(judged){audio.tap(lane,judged.rating);}else if(game.state.status==='playing'){stage?.hit(lane,'miss',{kind:'wrong'});}},
  onImport:importTrack,onNextTrack:nextTrack,
});
game=new RhythmGame({getTime:()=>audio.time,onJudge:j=>{stage?.hit(j.lane,j.rating,{kind:'note',noteTime:j.note.time});},onEnd(state){dailyScores.recordCompleted(state);audio.pause();stage?.setMode('results');ui.showResults(state);stage?.setResultPortraitTarget?.(ui.getResultPortraitTarget?.()||null);}});
async function init(){
  ui.setLoading?.('model',{phase:'loading'});
  try{const next=performancePlaylist.peek(),response=await fetch(next.metadataUrl);if(response.ok){const originalMetadata=await response.json();if(importVersion===0)metadata={...metadata,...originalMetadata,playlistId:next.id};}}catch{}
  if(importVersion===0)ui.setTrack({title:metadata.title,meta:`用户提供音频 · ${Math.round(metadata.bpm)} BPM · 精编谱面`,bpm:metadata.bpm});
  try{
    const session=++stageSession;
    stage=await createStage(document.querySelector('#stage'),{onAftershowEvent:event=>{if(session===stageSession&&game.state.status==='ended')ui.showAftershowEvent?.({...event,runId:`${session}:${event.runId}`});},onLoadProgress:progress=>{
      ui.setLoading?.('model',progress);
      stageLoading=['loading','assembling'].includes(progress.phase);
      modelFailed=['error','missing','context-lost'].includes(progress.phase);syncStartAvailability();
    }});
    if(stage.available===false){stageUnavailable=true;ui.setLoading?.('model',null);return;}
    const response=await fetch('/assets/characters/manifest.json',{cache:'no-store'});if(!response.ok)throw new Error('角色配置加载失败');assetManifest=versionCharacterManifest(await response.json());await stage.setAssetManifest?.(assetManifest);
    let applied=-1;while(applied!==selectionVersion){applied=selectionVersion;await stage.setCharacter?.(selected.character,selected.outfit);}
    stage?.setBPM?.(metadata.bpm,metadata.offset);stage?.setMode?.('lobby');
  }catch(error){stageUnavailable=true;ui.setLoading?.('model',{phase:'error'});console.error('Stage initialization',error);ui.toast('3D 舞台暂时无法加载，请检查浏览器 WebGL 支持');}
  finally{initializing=false;stageLoading=false;ui.setAvatarState?.(avatarFlow.getState());syncStartAvailability();}
}
let last=performance.now(),lastAvatarProgress=0;
function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;game.update();if(now-lastAvatarProgress>80&&avatarFlow.getState().busy){ui.setAvatarState?.(avatarFlow.getState());lastAvatarProgress=now;}ui.updateGame(game.state);stage?.update(dt,audio.playing?audio.time:now/1000);requestAnimationFrame(frame);}
syncStartAvailability();requestAnimationFrame(frame);init();
// Autoplay policy: ambience begins only after a trusted interaction, never on page load.
const unlockAudio=()=>audio.unlock().catch(()=>{});
document.addEventListener('pointerdown',unlockAudio,{passive:true});
document.addEventListener('keydown',unlockAudio);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state.status==='playing')pause();audio.setActive(!document.hidden);});
window.addEventListener('pagehide',()=>{if(game.state.status==='playing')pause();audio.setActive(false);});
window.addEventListener('pageshow',()=>audio.setActive(!document.hidden));
window.addEventListener('resize',()=>stage?.resize());
window.__encoreDiagnostics=()=>({game:game.state.status,stage:stage?.getDiagnostics?.(),initializing,stageLoading,stageUnavailable,audio:{duration:audio.duration,time:audio.time,playing:audio.playing,loading:audio.loading,lobbyPlaying:!!audio.lobbySource,muted:audio.muted,unlocked:audio.unlocked,active:audio.active,importPending},selection:selected,worn:ui.getWornSelection?.()||null,playlist:{current:metadata.playlistId||null,next:performancePlaylist.peek().id,local:!!metadata.local},avatar:avatarFlow.getState()});
