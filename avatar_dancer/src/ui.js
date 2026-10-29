import {bindAvatarInspection} from './avatar-inspection.js';
import {versionedAssetUrl} from './asset-revision.js';
// Original disco glyphs; ENCORE lime/pink anchors with lavender/mint companions.
// Preserve ENCORE's lane/input order.
export const DIRECTIONS = [
  {symbol:'←',color:'#f56aa8'}, {symbol:'↓',color:'#b7a4ff'},
  {symbol:'↑',color:'#ddff72'}, {symbol:'→',color:'#7ee5cc'},
];
const ARROWS = DIRECTIONS.map(d=>d.symbol);
export function loadingPresentation(kind, state={}) {
  const phase=state.phase||'loading', ready=phase==='ready', error=['error','missing','context-lost'].includes(phase);
  const assembling=kind==='model'&&!ready&&!error&&(phase==='assembling'||state.progress===1);
  const measured=typeof state.progress==='number'&&Number.isFinite(state.progress)&&!assembling;
  const percent=ready?100:measured?Math.round(Math.max(0,Math.min(1,state.progress))*100):null;
  const detail=error?(kind==='model'?'造型未能载入':'音乐未能载入'):ready?'准备就绪':kind==='model'?(assembling?'正在装配造型':'正在载入造型'):phase==='decoding'?'正在解码音乐':phase==='analyzing'?'正在准备谱面':'正在读取音乐';
  return {phase,ready,error,percent,title:detail,detail};
}
const loadingMarkup=kind=>`<div class="${kind}-loading inline-loading" data-kind="${kind}" hidden><span class="loading-detail" role="status" aria-live="polite"></span><span class="loading-percent" aria-hidden="true"></span><button class="loading-retry" hidden type="button">重试</button><span class="loading-meter" role="progressbar" aria-label="${kind==='model'?'造型载入':'音乐准备'}" aria-valuemin="0" aria-valuemax="100"><i></i></span></div>`;
export function availableOutfits(id,state={}) {
  if(id!=='jiaxin')return [0,1,2];
  return state.unlocked?[0,...(state.version===2&&state.outfits?.includes(1)?[1]:[])]:[];
}
const CHARACTERS = {
  jiji: { name: '吉吉', roman: 'JIJI', tag: 'THE SPOTLIGHT IS YOURS', looks: ['绯红序曲', '荧光脉冲', '珍珠歌剧'], colors: ['#c82d3c', '#d9ff60', '#eee3c6'] },
  jiaxin: { name: '我的分身', roman: 'MYSELF', tag: 'YOUR ALTER EGO', looks: ['黑白序章','埃及法老'], colors: ['#22232a','#dfbd66'] },
  lx: { name: 'LX', roman: 'LX', tag: 'MAKE EVERY BEAT YOURS', looks: ['银色失重', '紫电狂想', '赤色返场'], colors: ['#d9e1e6', '#6943ff', '#f84f58'] },
};
const fmt = n => Math.round(n || 0).toLocaleString('en-US');
const icon = (name) => ({ pause: '<path d="M8 5v14M16 5v14"/>', sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>', trophy:'<path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8m-6-3h4"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>' }[name]);
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon(name)}</svg>`;

export function createUI(callbacks = {}) {
  const root = document.getElementById('ui');
  if (!root) throw new Error('createUI requires #ui');
  const loadingTimers = {}, loadingStates={}, loadingKeys={}, loadingVisible={}, laneTimers = new Map(), targetTimers = new Map();
  const inputSources=new Map(),heldLanes=Array.from({length:4},()=>new Set()),flashingLanes=new Set(),pointerCaptures=new Map(),pointerClickUntil=new Map(),feedbackNoteIds=new Set();
  let mode = 'lobby', character = 'jiji', outfit = 0, muted = false, lastJudged = 0, feedbackTimer, closeUp = false, rankingOpen = false, avatarOpen = false, avatarStep = 'confirm', avatarKind = 'avatar', avatarTarget = 0, avatarBusy = false, avatarOperation = 0;
  let worn=null,startLabel='登场',aftershowTimer;
  const aftershowRuns=new Set();
  let avatarState={unlocked:false,outfits:[],points:300,busy:false,progress:0,...callbacks.getAvatarState?.()};
  const defaultOutfitPrompt='埃及法老套装：小麦色裸上身，夸张高耸的金蓝条纹法老头饰，黄金项圈、胸饰、臂环与腰饰，象牙白金裙襟；保留本人面容和眼镜，适合全身舞蹈。';
  let outfitPrompt=defaultOutfitPrompt;
  try{outfitPrompt=globalThis.localStorage?.getItem('encore-outfit-prompt-pharaoh-v1')?.slice(0,600)??defaultOutfitPrompt;}catch{}
  const chosenOutfits = { jiji: 0, lx: 0, jiaxin: 0 }, noteNodes = new Map(), cleanups = [];
  root.innerHTML = `
    <div class="screen-shade"></div>
    <header class="masthead"><div class="wordmark">ENCORE<span>分身舞者</span></div><div class="masthead-actions"><button class="friends-button" aria-label="今日好友总分排行榜">${svg('trophy')}<span>好友榜</span></button><button class="icon-button sound-button" aria-label="关闭声音">${svg('sound')}</button></div></header>
    <section class="lobby-view" aria-label="舞台准备">
      <div class="avatar-inspect-area" aria-label="左右拖动查看角色"></div>
      <div class="edition"><span class="live-dot"></span> YOUR MOMENT, ON REPEAT <span class="edition-no">VOL. 01</span></div>
      <div class="hero-copy"><p class="eyebrow">STEP INTO THE LIGHT</p><h1>这一刻，<br>你是主角<span>✳</span></h1><p class="hero-caption">跟随节拍 · 换上态度</p></div>
      <button class="detail-toggle" aria-pressed="false">看细节 <span>⊕</span></button><div class="character-caption"><span class="character-roman">JIJI</span><span class="character-tag">THE SPOTLIGHT IS YOURS</span></div>
      <div class="lobby-bottom">
        <div class="selection-heading"><span>01 / 选择舞者</span><span class="tiny-label">YOUR ALTER EGO</span></div>
        <div class="character-tabs" role="group" aria-label="选择舞者"><button class="character-tab active" data-character="jiji" aria-pressed="true"><span>吉吉</span><small>JIJI</small><b>↗</b></button><button class="character-tab" data-character="lx" aria-pressed="false"><span>LX</span><small>THE NEXT MOVE</small><b>↗</b></button></div>
        <div class="selection-heading look-heading"><span>02 / 舞台造型</span>${loadingMarkup('model')}<span class="wardrobe-meta"><span class="avatar-points" hidden></span><span class="look-counter">01 — 03</span></span></div>
        <div class="outfit-options" role="group" aria-label="选择造型"></div>
        <div class="track-row"><button type="button" class="track-art" aria-label="下一首" title="下一首"><i></i><i></i><i></i><i></i></button><div class="track-text"><strong class="track-title">POPSTARS</strong><span class="track-meta">用户提供音频 · 170 BPM</span>${loadingMarkup('song')}</div><button class="import-button" aria-label="导入本地音乐">${svg('upload')}<span>换首歌</span></button><input class="music-input" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" hidden></div>
        <button class="primary-button start-button"><span>登场</span><span class="button-en">LET’S DANCE</span><b>↗</b></button>
        <p class="privacy-note">耳机就位，舞台属于你 · 本地音乐不会上传</p>
      </div>
    </section>
    <section class="game-view" aria-label="节奏游戏" hidden>
      <div class="game-top"><div><span class="eyebrow">YOUR SCORE</span><strong class="score-value">000000</strong></div><button class="icon-button pause-button" aria-label="暂停游戏">${svg('pause')}</button></div>
      <div class="track-progress"><div></div></div>
      <div class="game-track"><span class="playing-title">POPSTARS</span><span class="progress-time">00:00</span></div>
      <div class="combo-display"><strong>0</strong><span>COMBO</span></div>
      <div class="judgement" role="status" aria-live="off"></div>
      <div class="note-highway" aria-hidden="true"><div class="lane-lines"><i></i><i></i><i></i><i></i></div><div class="notes"></div><div class="hit-line"><span>HIT ZONE</span></div><div class="hit-targets">${DIRECTIONS.map((d,i)=>`<span class="target-${i}" style="--lane:${d.color}">${d.symbol}</span>`).join('')}</div><div class="hit-effects"></div></div>
      <div class="lane-buttons" role="group" aria-label="节奏按键">${ARROWS.map((a,i)=>`<button class="lane-button lane-${i}" data-lane="${i}" style="--lane:${DIRECTIONS[i].color}" aria-label="${['左','下','上','右'][i]}方向"><span>${a}</span><small>${['A','S','W','D'][i]}</small></button>`).join('')}</div>
      <p class="play-hint">在光标重合时，轻触方向键</p>
    </section>
    <section class="pause-view modal-view" role="dialog" aria-modal="true" aria-label="游戏暂停" hidden><div class="pause-content"><p class="eyebrow">TAKE A BREATH</p><h2>舞台，<br>等你回来。</h2><p>节拍已暂停，准备好就继续。</p><button class="primary-button resume-button"><span>继续演出</span><b>↗</b></button><button class="text-button lobby-button">回到大厅 ↗</button></div></section>
    <section class="results-view modal-view" role="dialog" aria-modal="true" aria-label="演出成绩" hidden><div class="result-topline"><span>THE AFTERSHOW</span><span>ENCORE / 01</span></div><div class="result-hero"><div class="aftershow-window" aria-hidden="true"><div class="aftershow-portrait"></div><div class="aftershow-popcorn"></div></div><p class="eyebrow">YOU OWNED THE MOMENT</p><h2>谢幕，不散场<span>✳</span></h2><div class="result-score"><span>FINAL SCORE</span><strong>0</strong><b class="result-grade">S</b></div></div><div class="result-stats"><div><strong class="result-combo">0</strong><span>最高连击</span></div><div><strong class="result-accuracy">0%</strong><span>精准度</span></div><div><strong class="result-perfect">0</strong><span>PERFECT</span></div></div><div class="leaderboard-heading"><h3>本场好友舞台</h3><span>演示榜单 · 非真实排名</span></div><ol class="leaderboard"></ol><p class="result-message">每一次登场，都是新的高光。</p><button class="primary-button replay-button"><span>再跳一场</span><span class="button-en">ONE MORE TIME</span><b>↗</b></button><button class="text-button back-button">换个造型，再次登场</button></section>
    <section class="friends-view modal-view" role="dialog" aria-modal="true" aria-label="今日好友总分" hidden><div class="friends-heading"><span class="eyebrow">TODAY / FRIENDS ON STAGE</span><button class="icon-button friends-close" aria-label="关闭好友榜">${svg('close')}</button></div><h2>今日好友总分<span>✳</span></h2><p class="friends-intro">每一次完成演出，都让今天更闪亮。</p><div class="friends-summary"><span>你的今日总分</span><strong class="friends-own-score">0</strong><small>仅累计今日已完成演出</small></div><div class="leaderboard-heading"><h3>好友舞台</h3><span>今日累计 · 演示好友</span></div><ol class="leaderboard friends-ranking"></ol><p class="friends-note">好友分数为演示数据。你的总分仅保存在此设备，按本地日期每日重新累计。</p><button class="primary-button friends-back"><span>回到舞台</span><b>↗</b></button></section>
    <section class="avatar-view modal-view" role="dialog" aria-modal="true" aria-label="创建我的分身" hidden>
      <div class="avatar-heading"><span class="eyebrow">YOUR DIGITAL ALTER EGO</span><button class="icon-button avatar-close" aria-label="关闭创建分身">${svg('close')}</button></div>
      <div class="avatar-steps"><span>01 创建分身</span><i></i><span>02 准备舞台</span><i></i><span>03 登上舞台</span></div>
      <h2 class="avatar-title">眼镜、发型，<br>都是你的标记</h2><p class="avatar-subtitle">让另一个你，站上聚光灯下。</p>
      <div class="avatar-portrait"><div class="avatar-portrait-halo"></div><img class="avatar-photo" src="${versionedAssetUrl('/assets/avatars/jiaxin-preview.webp')}" alt="我的分身形象预览"><div class="avatar-portrait-scan"></div><span class="avatar-photo-label">YOUR NEXT SELF</span><div class="avatar-progress-orbit"></div></div>
      <div class="avatar-details"><span>保留原有眼镜与发型</span><span>长袖黑 T · 白裤 · 皮鞋</span></div>
      <div class="outfit-customization" hidden><label for="outfit-prompt">描述你的舞台灵感</label><textarea id="outfit-prompt" class="outfit-prompt" maxlength="600" rows="3" placeholder="例如：小麦色裸上身、夸张金蓝法老头饰，搭配黄金项圈、胸饰、臂环与腰饰；保留本人面容和眼镜。"></textarea><p>从颜色、衣服款式到配饰，把想法先记下来。</p></div>
      <div class="avatar-progress" hidden><div class="avatar-progress-track"><i></i></div><div><span class="avatar-progress-copy">正在准备形象</span><b class="avatar-progress-value">0%</b></div></div>
      <p class="avatar-cost">基础分身免费创建 · 获得 300 积分</p><p class="avatar-error" role="status" hidden></p>
      <button class="primary-button avatar-primary"><span>创建分身</span><b>↗</b></button><button class="text-button avatar-secondary">先逛逛舞台</button>
    </section>
    <div class="ui-toast" role="status" hidden></div>`;
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const listen = (el, event, fn, opts) => { el.addEventListener(event, fn, opts); cleanups.push(()=>el.removeEventListener(event, fn, opts)); };
  const invoke = (name,...args) => callbacks[name]?.(...args);
  const inspection=bindAvatarInspection($('.avatar-inspect-area'),{isEnabled:()=>mode==='lobby'&&!avatarOpen&&!rankingOpen,onRotate:delta=>invoke('onRotateAvatar',delta)});
  cleanups.push(()=>inspection.destroy());
  function drawCharacters() {
    $('.character-tabs').innerHTML=['jiji','lx',...(avatarState.unlocked?['jiaxin']:[])].map(id=>`<button class="character-tab ${id===character?'active':''}" data-character="${id}" aria-pressed="${id===character}"><span>${CHARACTERS[id].name}</span><small>${id==='jiaxin'?'MY AVATAR':CHARACTERS[id].roman}</small><b>↗</b></button>`).join('')+(avatarState.unlocked?'':'<button class="create-avatar-button" data-create-avatar="true"><b>＋</b><span>我的分身</span></button>');
  }
  function drawOutfits() {
    const c=CHARACTERS[character],owned=availableOutfits(character,avatarState);
    $('.outfit-options').innerHTML=c.looks.map((name,i)=>({name,i})).filter(({i})=>owned.includes(i)).map(({name,i})=>`<button class="outfit-option ${worn?.character===character&&worn.outfit===i?'active':''} ${i===outfit?'is-target':''}" data-outfit="${i}" aria-pressed="${worn?.character===character&&worn.outfit===i}" style="--look-color:${c.colors[i]}"><span class="look-swatch"><img class="look-preview" src="${versionedAssetUrl(`/assets/thumbs/${character}-${i}.webp`)}" alt="${name}" loading="lazy"><em>0${i+1}</em><b>✓</b></span><span class="look-name">${name}</span></button>`).join('')+(character==='jiaxin'?`<button class="outfit-option outfit-locked outfit-custom-entry ${owned.includes(1)?'compact':''}" data-custom-outfit aria-label="定制新造型"><span class="look-swatch"><span class="generate-spark">✳</span><span class="generate-label">定制新造型</span><span class="generate-caption">写下你的舞台灵感</span></span><span class="look-name">埃及法老 · 定制妆造</span></button>`:'');
    $('.look-counter').textContent=character==='jiaxin'?`${owned.length} 套已拥有`:`0${outfit+1} — 03`;
    $('.avatar-points').hidden=character!=='jiaxin';$('.avatar-points').textContent=`✦ ${fmt(avatarState.points)} 积分`;
    const onStage=CHARACTERS[worn?.character]||c;$('.character-caption').dataset.character=worn?.character||character;$('.character-roman').textContent=onStage.roman;$('.character-tag').textContent=onStage.tag;
    refreshLoadingMarks();
  }
  function selectCharacter(id,nextOutfit=chosenOutfits[id]||0) {
    inspection.cancel();
    if(!CHARACTERS[id]||(id==='jiaxin'&&!avatarState.unlocked))return;
    character=id;outfit=availableOutfits(id,avatarState).includes(nextOutfit)?nextOutfit:0;chosenOutfits[id]=outfit;
    drawCharacters();drawOutfits();invoke('onCharacter',character);invoke('onOutfit',outfit);
  }
  drawCharacters();drawOutfits();
  listen($('.model-loading .loading-retry'),'click',()=>invoke('onRetryModel'));
  listen($('.song-loading .loading-retry'),'click',()=>invoke('onRetrySong'));
  listen($('.detail-toggle'),'click',()=>{closeUp=!closeUp;$('.detail-toggle').setAttribute('aria-pressed',String(closeUp));$('.detail-toggle').innerHTML=closeUp?'看全身 <span>⊖</span>':'看细节 <span>⊕</span>';invoke('onCloseUp',closeUp);});
  listen($('.character-tabs'),'click',e=>{if(e.target.closest('[data-create-avatar]')){showAvatarCreation();return;}const b=e.target.closest('[data-character]');if(b)selectCharacter(b.dataset.character);});
  listen($('.outfit-options'),'click',e=>{const generate=e.target.closest('[data-custom-outfit]');if(generate){showAvatarCreation('outfit');return;}const b=e.target.closest('[data-outfit]');inspection.cancel();if(!b||!availableOutfits(character,avatarState).includes(+b.dataset.outfit))return;outfit=+b.dataset.outfit;chosenOutfits[character]=outfit;drawOutfits();invoke('onOutfit',outfit);});
  listen($('.outfit-prompt'),'input',()=>{outfitPrompt=$('.outfit-prompt').value.slice(0,600);try{globalThis.localStorage?.setItem('encore-outfit-prompt-pharaoh-v1',outfitPrompt);}catch{}});
  listen($('.avatar-close'),'click',()=>closeAvatarCreation());
  listen($('.avatar-secondary'),'click',()=>closeAvatarCreation());
  listen($('.avatar-primary'),'click',async()=>{
    if(avatarBusy)return;
    if(avatarKind==='outfit'&&avatarStep!=='ready'){
      if(availableOutfits('jiaxin',avatarState).includes(1)){selectCharacter('jiaxin',1);closeAvatarCreation();return;}
      if(avatarState.points<100)return;
    }
    if(avatarStep==='ready'){closeAvatarCreation();return;}
    const operation=++avatarOperation;avatarBusy=true;avatarStep='generating';avatarState={...avatarState,error:null,progress:0};renderAvatarCreation();
    try {
      const state=await invoke(avatarKind==='outfit'?'onGenerateOutfit':'onCreateAvatar',avatarTarget);
      if(operation!==avatarOperation)return;
      if(state)setAvatarState(state);
      if(!state?.unlocked||!availableOutfits('jiaxin',state).includes(avatarTarget))throw new Error(state?.error||'形象暂未就绪，请稍后重试');
      avatarBusy=false;avatarStep='ready';selectCharacter('jiaxin',avatarTarget);renderAvatarCreation();
    }catch(error){if(operation!==avatarOperation)return;avatarBusy=false;avatarStep='confirm';avatarState={...avatarState,error:error.message||'创建未完成，请重试'};renderAvatarCreation();}
  });
  listen($('.start-button'),'click',()=>invoke('onStart',{character,outfit}));
  listen($('.friends-button'),'click',()=>{const rows=invoke('onRank');if(Array.isArray(rows))showRanking(rows);});
  listen($('.friends-close'),'click',closeRanking);
  listen($('.friends-back'),'click',closeRanking);
  listen($('.pause-button'),'click',()=>invoke('onPause'));
  listen($('.resume-button'),'click',()=>invoke('onResume'));
  listen($('.lobby-button'),'click',()=>{setMode('lobby');invoke('onLobby');});
  listen($('.replay-button'),'click',()=>invoke('onReplay'));
  listen($('.back-button'),'click',()=>{setMode('lobby');invoke('onLobby');});
  listen($('.sound-button'),'click',()=>{muted=!muted;$('.sound-button').classList.toggle('muted',muted);$('.sound-button').setAttribute('aria-label',muted?'开启声音':'关闭声音');invoke('onMute',muted);});
  listen($('.track-art'),'click',()=>{if(mode==='lobby'&&!avatarOpen&&!rankingOpen)invoke('onNextTrack');});
  listen($('.import-button'),'click',()=>$('.music-input').click());
  listen($('.music-input'),'change',e=>{const file=e.target.files?.[0];if(file)invoke('onImport',file);e.target.value='';});
  function syncLane(lane) {
    const held=heldLanes[lane].size>0;
    $(`.lane-${lane}`).classList.toggle('held',held);
    $(`.lane-${lane}`).classList.toggle('pressed',held||flashingLanes.has(lane));
    $(`.target-${lane}`).classList.toggle('held',held);
  }
  function flashLane(lane) {
    if(!heldLanes[lane])return;
    flashingLanes.add(lane);clearTimeout(laneTimers.get(lane));syncLane(lane);
    laneTimers.set(lane,setTimeout(()=>{flashingLanes.delete(lane);laneTimers.delete(lane);syncLane(lane);},130));
  }
  function hit(lane){if(mode!=='playing')return;flashLane(lane);invoke('onHit',lane);}
  function pressInput(source,lane) {
    if(mode!=='playing'||inputSources.has(source))return;
    const alreadyHeld=heldLanes[lane].size>0;
    inputSources.set(source,lane);heldLanes[lane].add(source);syncLane(lane);
    // Keyboard aliases or a second finger on the same lane do not double-score.
    if(!alreadyHeld)hit(lane);
  }
  function releaseInput(source,cancel=false) {
    const lane=inputSources.get(source);if(lane===undefined)return;
    inputSources.delete(source);heldLanes[lane].delete(source);
    if(cancel&&!heldLanes[lane].size){clearTimeout(laneTimers.get(lane));laneTimers.delete(lane);flashingLanes.delete(lane);}
    syncLane(lane);
  }
  function clearInput() {
    inputSources.clear();heldLanes.forEach(set=>set.clear());flashingLanes.clear();
    laneTimers.forEach(clearTimeout);laneTimers.clear();targetTimers.forEach(clearTimeout);targetTimers.clear();
    for(let lane=0;lane<4;lane++){syncLane(lane);$(`.target-${lane}`).classList.remove('flash');}
    for(const [id,button] of pointerCaptures){try{if(button.hasPointerCapture?.(id))button.releasePointerCapture(id);}catch{}}
    pointerCaptures.clear();for(const lane of pointerClickUntil.keys())pointerClickUntil.set(lane,performance.now()+500);
  }
  $$('.lane-button').forEach(button=>{
    const lane=+button.dataset.lane,source=e=>`pointer:${e.pointerId??`legacy-${lane}`}`;
    listen(button,'pointerdown',e=>{
      if(mode!=='playing'||(e.pointerType==='mouse'&&e.button>0))return;
      e.preventDefault();pointerClickUntil.set(lane,Infinity);
      if(Number.isFinite(e.pointerId)){try{button.setPointerCapture(e.pointerId);pointerCaptures.set(e.pointerId,button);}catch{}}
      pressInput(source(e),lane);
    });
    const release=(e,cancel=false)=>{
      pointerClickUntil.set(lane,performance.now()+500);releaseInput(source(e),cancel);
      if(Number.isFinite(e.pointerId)){pointerCaptures.delete(e.pointerId);try{if(button.hasPointerCapture?.(e.pointerId))button.releasePointerCapture(e.pointerId);}catch{}}
    };
    listen(button,'pointerup',e=>release(e));
    listen(button,'pointercancel',e=>release(e,true));
    listen(button,'lostpointercapture',e=>release(e,true));
    listen(button,'click',e=>{
      if(e.detail!==0)return;
      // Keyboard/AT click has empty pointerType. Touch-generated clicks may have
      // detail=0 too, so consume the preceding pointer sequence, not every click.
      if(e.pointerType||((e.pointerType===undefined)&&(pointerClickUntil.get(lane)||0)>performance.now()))return;
      hit(lane);
    });
  });
  // Capture normally routes these to the button. Window fallback covers browsers
  // that reject capture, without preventing scrolling or filtering other touches.
  const releasePointerOutside=(e,cancel=false)=>{
    const source=`pointer:${e.pointerId}`,lane=inputSources.get(source);
    if(lane!==undefined)pointerClickUntil.set(lane,performance.now()+500);
    releaseInput(source,cancel);const button=pointerCaptures.get(e.pointerId);pointerCaptures.delete(e.pointerId);
    try{if(button?.hasPointerCapture?.(e.pointerId))button.releasePointerCapture(e.pointerId);}catch{}
  };
  listen(window,'pointerup',e=>releasePointerOutside(e));
  listen(window,'pointercancel',e=>releasePointerOutside(e,true));
  const keyMap={ArrowLeft:0,KeyA:0,ArrowDown:1,KeyS:1,ArrowUp:2,KeyW:2,ArrowRight:3,KeyD:3};
  listen(window,'keydown',e=>{if(e.isComposing)return;if(e.code==='Escape'&&avatarOpen){e.preventDefault();closeAvatarCreation();return;}if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Escape'&&rankingOpen){e.preventDefault();closeRanking();return;}if(e.code==='Escape'&&(mode==='playing'||mode==='paused')){e.preventDefault();invoke(mode==='playing'?'onPause':'onResume');return;}if(e.code in keyMap&&mode==='playing'){e.preventDefault();if(!e.repeat)pressInput(`key:${e.code}`,keyMap[e.code]);}});
  listen(window,'keyup',e=>{if(e.code in keyMap)releaseInput(`key:${e.code}`);});
  listen(window,'blur',clearInput);
  listen(document,'visibilitychange',()=>{if(document.hidden)clearInput();});
  listen(root,'keydown',e=>{
    if(e.key!=='Tab'||(!avatarOpen&&!rankingOpen&&!['paused','results'].includes(mode)))return;
    const panel=$(avatarOpen?'.avatar-view':rankingOpen?'.friends-view':mode==='paused'?'.pause-view':'.results-view');
    const focusable=[...panel.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  function setMode(next) {
    inspection.cancel();
    if(avatarOpen)closeAvatarCreation(false);
    if(rankingOpen)closeRanking(false);
    const previousMode=mode;
    mode=({select:'lobby',selection:'lobby',game:'playing',pause:'paused',result:'results'}[next]||next);
    if(mode!=='playing'||previousMode!==mode)clearInput();
    if(mode!=='results')clearAftershow();
    root.dataset.mode=mode; document.getElementById('app')?.setAttribute('data-mode',mode);
    $('.masthead').inert=['paused','results'].includes(mode);
    $('.game-view').inert=mode==='paused';
    $('.lobby-view').hidden=mode!=='lobby';$('.game-view').hidden=!['playing','paused'].includes(mode);$('.pause-view').hidden=mode!=='paused';$('.results-view').hidden=mode!=='results';
    if(mode==='playing'){closeUp=false;$('.detail-toggle').setAttribute('aria-pressed','false');$('.detail-toggle').innerHTML='看细节 <span>⊕</span>';}
    if(mode==='playing'&&previousMode!=='paused'){lastJudged=0;feedbackNoteIds.clear();$('.judgement').textContent='';}
    if(mode==='paused')$('.resume-button').focus({preventScroll:true});
    if(mode==='results')$('.replay-button').focus({preventScroll:true});
    if(previousMode==='paused'&&mode==='playing')$('.pause-button').focus({preventScroll:true});
    if(['paused','results'].includes(previousMode)&&mode==='lobby')$('.start-button').focus({preventScroll:true});
  }
  function showJudge(event) {
    const rating=event.rating||event;
    const el=$('.judgement');el.textContent=String(rating).toUpperCase();el.className=`judgement ${rating}`;
    void el.offsetWidth;el.classList.add('visible');
    if(Number.isInteger(event.lane)&&rating!=='miss'){
      const target=$(`.target-${event.lane}`);target?.classList.add('flash');clearTimeout(targetTimers.get(event.lane));targetTimers.set(event.lane,setTimeout(()=>{target?.classList.remove('flash');targetTimers.delete(event.lane);},180));
      const burst=document.createElement('div');burst.className=`hit-burst ${rating}`;burst.style.left=`${12.5+event.lane*25}%`;burst.style.setProperty('--lane',DIRECTIONS[event.lane].color);
      burst.innerHTML=`<span></span>${[0,45,90,135,180,225,270,315].map(angle=>`<i style="--angle:${angle}deg"></i>`).join('')}`;
      $('.hit-effects').append(burst);setTimeout(()=>burst.remove(),350);
      const line=$('.hit-line');line.classList.remove('punch');void line.offsetWidth;line.classList.add('punch');
    }
    clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>el.classList.remove('visible'),420);
    if(event.lane!==undefined&&rating!=='miss')flashLane(event.lane);
  }
  function updateGame(state) {
    $('.score-value').textContent=String(Math.round(state.score||0)).padStart(6,'0');
    $('.combo-display strong').textContent=state.combo||0;
    $('.combo-display').classList.toggle('has-combo',(state.combo||0)>1);
    setProgress(state.progress??state.time/state.duration,state.time);
    const time=state.time||0, travel=1.65, seen=new Set();
    for(const note of state.notes||[]){
      const delta=note.time-time;
      if(note.judged||delta>travel||delta<-.16)continue;
      const id=note.id??`${note.time}-${note.lane}`;seen.add(id);
      let el=noteNodes.get(id);
      if(!el){el=document.createElement('div');el.className=`falling-note note-lane-${note.lane}`;el.textContent=ARROWS[note.lane];el.style.setProperty('--lane',DIRECTIONS[note.lane].color);$('.notes').append(el);noteNodes.set(id,el);}
      el.style.left=`${note.lane*25}%`;el.style.top=`${(1-delta/travel)*100}%`;
    }
    for(const [id,el] of noteNodes)if(!seen.has(id)){el.remove();noteNodes.delete(id);}
    if(state.judged<lastJudged){feedbackNoteIds.clear();lastJudged=0;}
    if(state.judged>lastJudged){
      const idOf=note=>note.id??`${note.time}-${note.lane}`;
      const fresh=(state.notes||[]).filter(note=>note.judged&&!feedbackNoteIds.has(idOf(note)));
      // Preserve every lane's feedback in a same-frame chord; latest judgement
      // still owns the central label, rather than silently dropping its partner.
      fresh.sort((a,b)=>Number(idOf(a)===state.lastJudgement?.noteId)-Number(idOf(b)===state.lastJudgement?.noteId));
      for(const note of fresh){feedbackNoteIds.add(idOf(note));if(mode==='playing')showJudge(note);}
      if(mode==='playing'&&!fresh.length&&state.lastJudgement)showJudge(state.lastJudgement);
      lastJudged=state.judged;
    }
  }
  function setProgress(progress,time=0){$('.track-progress div').style.width=`${Math.max(0,Math.min(1,Number(progress)||0))*100}%`;$('.progress-time').textContent=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;}
  function setTrack(track,meta){const data=typeof track==='string'?{title:track,meta}:track||{};$('.track-title').textContent=data.title||data.name||'本地音乐';$('.playing-title').textContent=$('.track-title').textContent;$('.track-meta').textContent=data.meta||`${data.bpm?data.bpm+' BPM · ':''}${data.local?'本地音乐 · 自动谱面':'原创电子舞曲'}`;}
  function setAvatarState(state={}) {
    const previous=avatarState;avatarState={...avatarState,...state};
    const wardrobeChanged=previous.unlocked!==avatarState.unlocked||previous.points!==avatarState.points||String(previous.outfits)!==String(avatarState.outfits);
    if(previous.unlocked!==avatarState.unlocked)drawCharacters();
    if(wardrobeChanged)drawOutfits();
    if(avatarOpen)renderAvatarCreation();
  }
  function showAvatarCreation(kind='avatar',target=0) {
    inspection.cancel();
    if(mode!=='lobby'||avatarBusy)return;
    if(kind==='outfit'&&!avatarState.unlocked)return;
    if(kind==='avatar'&&avatarState.unlocked){selectCharacter('jiaxin');return;}
    if(rankingOpen)closeRanking(false);
    const latest=invoke('getAvatarState');if(latest)setAvatarState(latest);
    avatarKind=kind;avatarTarget=kind==='outfit'?1:target;avatarStep='confirm';avatarOpen=true;avatarState={...avatarState,error:null};
    $('.avatar-view').hidden=false;$('.lobby-view').inert=true;$('.masthead').inert=true;renderAvatarCreation();$(kind==='outfit'?'.outfit-prompt':'.avatar-primary').focus({preventScroll:true});
  }
  function renderAvatarCreation() {
    const creating=avatarStep==='generating',ready=avatarStep==='ready',costume=avatarKind==='outfit',owned=availableOutfits('jiaxin',avatarState).includes(1);
    $('.avatar-view').dataset.step=avatarStep;$('.avatar-view').dataset.kind=avatarKind;
    $('.avatar-view').setAttribute('aria-label',costume?'定制造型':'创建我的分身');
    $('.avatar-close').setAttribute('aria-label',costume?'关闭定制造型':'关闭创建分身');
    $('.avatar-heading .eyebrow').textContent=costume?'YOUR NEXT STAGE LOOK':'YOUR DIGITAL ALTER EGO';
    $('.avatar-steps').innerHTML=(costume?['01 描述灵感','02 生成妆造','03 换装登台']:['01 创建分身','02 准备舞台','03 登上舞台']).map(label=>`<span>${label}</span>`).join('<i></i>');
    $('.avatar-title').innerHTML=ready?(costume?'埃及法老，<br>即刻登场':'你的分身，<br>准备登台'):creating?(costume?'正在生成<br>专属舞台造型':'正在创建<br>你的分身舞者'):costume?'埃及法老，<br>为你加冕':avatarStep==='import'?'将导入<br>我的分身形象':'眼镜、发型，<br>都是你的标记';
    $('.avatar-subtitle').textContent=ready?(costume?'小麦色裸上身，黄金饰品与金蓝头饰为你加冕。':'聚光灯已经为你亮起。'):creating?'让形象与节拍，慢慢合而为一。':costume?'小麦色裸上身 × 黄金饰品 · 金蓝法老头饰。':'让另一个你，站上聚光灯下。';
    const portraitURL=versionedAssetUrl(ready?`/assets/thumbs/jiaxin-${avatarTarget}.webp`:costume?'/assets/thumbs/jiaxin-0.webp':'/assets/avatars/jiaxin-preview.webp');
    if($('.avatar-photo').dataset.asset!==portraitURL){$('.avatar-photo').src=portraitURL;$('.avatar-photo').dataset.asset=portraitURL;}
    $('.avatar-photo').alt=ready?'我的分身舞台造型':costume?'我的分身基础造型':'我的分身形象预览';
    $('.avatar-photo-label').textContent=ready?'READY FOR YOUR ENCORE':costume?'当前造型 · 黑白序章':'YOUR NEXT SELF';
    $('.outfit-customization').hidden=!costume||creating||ready;
    if(costume&&$('.outfit-prompt').value!==outfitPrompt)$('.outfit-prompt').value=outfitPrompt;
    $('.avatar-details').hidden=creating||costume;
    $('.avatar-progress').hidden=!creating;
    const modelLoading=avatarState.phase==='loading-model';
    const progress=Math.max(0,Math.min(1,Number(avatarState.progress)||0));
    $('.avatar-progress').classList.toggle('is-indeterminate',modelLoading);
    $('.avatar-progress-track i').style.width=`${progress*100}%`;
    $('.avatar-progress-value').textContent=modelLoading?'':`${Math.round(progress*100)}%`;
    $('.avatar-progress-copy').textContent=modelLoading?'正在载入舞台模型':progress<.34?'正在整理形象细节':progress<.72?'正在准备舞台造型':'正在连接舞台动作';
    $('.avatar-cost').textContent=costume?(owned?`埃及法老已拥有 · 当前余额 ${fmt(avatarState.points)} 积分`:`生成消耗 100 积分 · 当前余额 ${fmt(avatarState.points)} 积分`):ready?`基础分身已就位 · 当前余额 ${fmt(avatarState.points)} 积分`:'基础分身免费创建 · 获得 300 积分';
    $('.avatar-error').hidden=!avatarState.error;$('.avatar-error').textContent=avatarState.error||'';
    $('.avatar-primary').disabled=creating||(costume&&!owned&&avatarState.points<100);
    $('.avatar-primary span').textContent=ready?'让分身登台':creating?'正在准备…':costume?(owned?'穿上埃及法老':avatarState.points<100?'积分不足':'生成妆造 · 100 积分'):'创建分身';
    $('.avatar-secondary').textContent=creating?'取消准备':costume&&!ready?'保留草稿，返回舞台':ready?'回到舞台':'先逛逛舞台';
  }
  function closeAvatarCreation(restoreFocus=true) {
    if(avatarBusy){++avatarOperation;avatarBusy=false;invoke('onCancelAvatarJob');}
    avatarOpen=false;$('.avatar-view').hidden=true;$('.lobby-view').inert=false;$('.masthead').inert=false;
    if(restoreFocus)$('.start-button').focus({preventScroll:true});
  }
  function showRanking(rows=[]) {
    inspection.cancel();
    if(mode!=='lobby'||avatarOpen)return;
    const safe=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const sorted=[...rows].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
    $('.friends-ranking').innerHTML=sorted.map((row,i)=>`<li class="${row.self?'is-you':''}"><span class="rank">${String(i+1).padStart(2,'0')}</span><span class="friend-avatar">${safe(String(row.name||'舞者').slice(0,1))}</span><strong>${safe(row.name||'舞者')}${row.self?'<small>YOU</small>':''}</strong><b>${fmt(row.score)}</b></li>`).join('');
    $('.friends-own-score').textContent=fmt(rows.find(row=>row.self)?.score);
    rankingOpen=true;$('.friends-view').hidden=false;$('.lobby-view').inert=true;$('.masthead').inert=true;
    $('.friends-close').focus({preventScroll:true});
  }
  function closeRanking(restoreFocus=true) {
    rankingOpen=false;$('.friends-view').hidden=true;$('.lobby-view').inert=false;$('.masthead').inert=false;
    if(restoreFocus)$('.friends-button').focus({preventScroll:true});
  }
  function clearAftershow(){clearTimeout(aftershowTimer);aftershowTimer=undefined;$('.aftershow-popcorn').innerHTML='';}
  function getResultPortraitTarget(){return mode==='results'?$('.aftershow-portrait'):null;}
  function showAftershowEvent(event={}){
    if(mode!=='results'||event.type!=='popcorn'||event.runId===undefined||aftershowRuns.has(event.runId))return false;
    aftershowRuns.add(event.runId);if(aftershowRuns.size>32)aftershowRuns.delete(aftershowRuns.values().next().value);
    if(document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
    clearAftershow();
    const paths='<path d="M7 19C2 19 1 13 5 11C1 6 7 2 10 5C12 0 19 3 18 8C24 8 24 15 19 16C20 21 12 24 10 19Z" fill="currentColor"/><path d="M10 13q3-3 5 1" fill="none" stroke="#c89c59" stroke-width="1.5" stroke-linecap="round"/>';
    const flights=[[-14,-12],[-11,-22],[-8,-16],[-4,-26],[-1,-19],[3,-24],[7,-14],[11,-21],[14,-10],[-6,-11],[5,-8],[9,-17]];
    $('.aftershow-popcorn').innerHTML=flights.map(([dx,peak],i)=>`<svg class="aftershow-kernel" viewBox="0 0 24 24" aria-hidden="true" style="--dx:${dx}cqw;--peak:${peak}cqw;--dy:${2+(i%4)*2}cqw;--spin:${(i%2?1:-1)*(100+i*27)}deg;--delay:${(i%3)*25}ms;--kernel:${i%4===0?'#ffe1a2':'#fff1d0'}">${paths}</svg>`).join('');
    aftershowTimer=setTimeout(clearAftershow,1500);return true;
  }
  function showResults(state) {
    const score=state.score||0,accuracy=state.accuracy||0;
    $('.result-score strong').textContent=fmt(score);$('.result-grade').textContent=accuracy>=95?'S':accuracy>=85?'A':accuracy>=70?'B':accuracy>=50?'C':'D';
    $('.result-combo').textContent=state.maxCombo||0;$('.result-accuracy').textContent=`${accuracy.toFixed(1)}%`;$('.result-perfect').textContent=state.counts?.perfect||0;
    const rows=[{name:'MOMO',score:88500,avatar:'M'},{name:'小满',score:72650,avatar:'满'},{name:'你',score,avatar:character==='jiaxin'?'我':CHARACTERS[character].name,self:true},{name:'Yuki',score:51350,avatar:'Y'}].sort((a,b)=>b.score-a.score);
    $('.leaderboard').innerHTML=rows.map((row,i)=>`<li class="${row.self?'is-you':''}"><span class="rank">0${i+1}</span><span class="friend-avatar">${row.avatar}</span><strong>${row.name}${row.self?'<small>YOU</small>':''}</strong><b>${fmt(row.score)}</b></li>`).join('');
    setMode('results');
  }
  function refreshLoadingMarks(){
    const state=loadingStates.model,view=state&&loadingPresentation('model',state);
    const visible=loadingVisible.model&&view&&!view.ready;
    for(const el of $$('.outfit-option[data-outfit]')){
      const target=visible&&(state.character||character)===character&&+el.dataset.outfit===(state.outfit??outfit);
      el.classList.toggle('is-loading',Boolean(target&&!view.error));el.classList.toggle('load-error',Boolean(target&&view.error));
      el.classList.toggle('indeterminate',Boolean(target&&view.percent===null));el.setAttribute('aria-busy',String(Boolean(target&&!view.error)));
      el.style.setProperty('--load-progress',String((view?.percent??0)/100));
    }
    for(const el of $$('.character-tab')){
      const target=visible&&el.dataset.character===(state.character||character);
      el.classList.toggle('is-loading',Boolean(target&&!view.error));el.setAttribute('aria-busy',String(Boolean(target&&!view.error)));
    }
  }
  function renderLoading(kind){
    const state=loadingStates[kind],el=$(`.${kind}-loading`);if(!state||!el)return;
    const view=loadingPresentation(kind,state);loadingVisible[kind]=true;el.hidden=false;el.dataset.phase=view.phase;
    el.classList.toggle('indeterminate',view.percent===null);el.classList.toggle('is-error',view.error);
    el.style.setProperty('--load-progress',String((view.percent??0)/100));
    const detail=el.querySelector('.loading-detail');if(detail.textContent!==view.detail)detail.textContent=view.detail;
    el.querySelector('.loading-percent').textContent=view.percent===null?'':`${view.percent}%`;
    el.querySelector('.loading-retry').hidden=!view.error;
    const meter=el.querySelector('.loading-meter');
    if(view.percent===null)meter.removeAttribute('aria-valuenow');else meter.setAttribute('aria-valuenow',view.percent);
    meter.hidden=view.error;meter.setAttribute('aria-valuetext',view.detail);
    if(kind==='song'){$('.track-text').dataset.loading='true';$('.start-button > span:first-child').textContent=view.error?'登场':'准备音乐';}
    refreshLoadingMarks();
  }
  function setLoading(kind,state) {
    const el=$(`.${kind}-loading`);if(!el)return;
    const key=state?`${state.character||''}:${state.outfit??''}:${state.requestId??''}`:'';
    const changed=loadingKeys[kind]!==key;loadingKeys[kind]=key;loadingStates[kind]=state;
    const view=state&&loadingPresentation(kind,state);
    if(!state||state.phase==='idle'||view.ready){
      clearTimeout(loadingTimers[kind]);delete loadingTimers[kind];loadingVisible[kind]=false;el.hidden=true;
      if(kind==='model'&&view?.ready){worn={character:state.character||character,outfit:state.outfit??outfit};drawOutfits();}
      if(kind==='song'){$('.track-text').dataset.loading='false';$('.start-button > span:first-child').textContent=startLabel;}
      refreshLoadingMarks();return;
    }
    if(changed){clearTimeout(loadingTimers[kind]);delete loadingTimers[kind];loadingVisible[kind]=false;el.hidden=true;refreshLoadingMarks();}
    if(view.error||loadingVisible[kind]){clearTimeout(loadingTimers[kind]);delete loadingTimers[kind];renderLoading(kind);}
    else if(!loadingTimers[kind])loadingTimers[kind]=setTimeout(()=>{delete loadingTimers[kind];renderLoading(kind);},180);
  }
  function setStartState({disabled,reason='登场'}={}){startLabel=reason;$('.start-button').disabled=Boolean(disabled);$('.start-button > span:first-child').textContent=reason;}
  function toast(message){const el=$('.ui-toast');el.textContent=message;el.hidden=false;setTimeout(()=>el.hidden=true,3500);}
  setMode('lobby');
  return {getResultPortraitTarget,showAftershowEvent,showAvatarCreation,setAvatarState,setStartState,showRanking,setLoading,setMode,updateGame,setProgress,setTrack,showResults,showJudge,toast,flashLane,getSelection:()=>({character,outfit}),getWornSelection:()=>worn?{...worn}:null,destroy:()=>{clearAftershow();clearInput();if(avatarBusy)invoke('onCancelAvatarJob');++avatarOperation;cleanups.forEach(fn=>fn());clearTimeout(feedbackTimer);Object.values(loadingTimers).forEach(clearTimeout);laneTimers.forEach(clearTimeout);root.innerHTML='';}};
}
