import {shareGardenInvitation} from './garden-invite.js';
import {createCreationPhoto} from './creation-photo.js';
import {createGrowthTapController,sameGrowingPlant} from './growth-tap.js';
import {createWalletDoubleTapController} from './wallet-doubletap.js';
import {createCloudTravel} from './cloud-travel.js';
import {initialEdgePreview,chooseEdgePreview} from './edge-placement.js';
import {PLAYER_AVATAR,playerOutfit} from './player-style.js';
import {createPhotoSampleView} from './photo-sample-view.js';
import {giftRecipient} from './gifts.js';
import {landPalette} from './terrain-palettes.js';
import {legacyRecoveryEligible} from './navigation.js';
import {createCoinReward} from './coin-reward.js';
import {capturePurchaseScroll,restorePurchaseScroll,patchSeedContent,createPurchaseIntentGuard} from './purchase-view.js';
import {isBuilt} from './construction.js';
import {getBlueprint,RELOCATION_PRICE} from './blueprints.js';
import {BASIC_VARIETIES,allCatalogueVarieties,CREATIVE_SAMPLES,DEMO_GARDENS,DEMO_VARIETIES,BUILDINGS,matchIdeas} from './catalogue.js';
import {createState,reduce,getVariety,isMature,dayKey,compatibleRemixSamples,reusablePersonalVariety} from './state.js';
import {SAVE_KEY,loadGame,archiveDamaged,createSaveCoordinator} from './storage.js';
import {ArtAssets} from './assets.js';
import {createScene} from './scene.js';
import {GardenAudio,interactionLine} from './interactions.js';
import {photoStatus,renderPhotoContent,renderSeedPurchaseContent,purchaseSummary,esc,renderHUD,renderDock,renderTools,renderPanel,renderContext,renderMode} from './ui.js';
import {icon} from './icons.js';
import {keyboardInset} from './scene-math.js';
import {createSelectionLoader,preparePlantContact,newCreation,resolveCreationIdea,newBlueprintCreation,resolveBlueprintIdea,rollBuildingExample,rollPlantExample} from './ui-state.js';
const $=id=>document.getElementById(id),shell=$('garden');
const ui={friendSession:null,giftSelection:null,giftTab:'seeds',giftThanks:'',photoState:null,visitPeriod:'today',purchaseSession:null,panel:null,bagTab:'seeds',detailId:null,visitId:null,visitorTileId:null,selection:null,mode:null,editing:false,creation:newCreation(),blueprintCreation:newBlueprintCreation()};
const creationPhoto=createCreationPhoto({onChange:()=>{if(['create','blueprint-create'].includes(ui.panel))render();}});
let creationPhotoPick=null;
let inviteBusy=false,inviteSession=0;
let photoView=null,styleRevision=0,stylePromise=Promise.resolve(false);
let storage=null;try{storage=window.localStorage;}catch{}
let lockManager=null;try{lockManager=window.navigator.locks;}catch{}
const loaded=loadGame(storage);let blocked=loaded.status==='corrupt',temporary=loaded.status==='unavailable'||!lockManager?.request;
const temporaryMessage=loaded.status==='unavailable'?loaded.message:'这个浏览器暂不支持安全保存。已进入临时体验，已有存档不会覆盖；关闭页面后本次更改会丢失。';
const uid=()=>globalThis.crypto?.randomUUID?.()??`visitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
let state=loaded.state??createState(Date.now(),uid());
const saves=createSaveCoordinator({storage,head:loaded.head??null,locks:lockManager});let dirty=false,saveBusy=false,saveConflict=false,lastSyncToast=0,urgentSave=false,allowNavigation=false;
let navigationStuck=false,selectedPlantReadiness=null;let saveWarning=false,lastHudKey=null,pageFocused=true;
let saveTimer=null,toastTimer=null,thoughtTimer=null,lastProgressSecond=0,scene=null,ready=false;const constructionReadiness=new Map();
const purchaseIntent=createPurchaseIntentGuard();let purchaseActivation=null,recentPurchaseId=null;
const audio=new GardenAudio(),interactionCounts=new Map(),avatarLoader=createSelectionLoader();audio.setMuted(state.settings.muted);
const makeCoinReward=()=>createCoinReward(shell,{target:()=>$('hud').querySelector?.('.wallet.coins'),playSound:()=>{audio.playSaleCoin().catch(()=>{});},document});let coinReward=makeCoinReward();
const walletTap=createWalletDoubleTapController({isReady:()=>ready&&!blocked&&!saveConflict&&!cloudTravel.busy&&pageFocused&&!document.hidden,onSingleTap:()=>onAction('coins'),onDoubleTap:event=>{const source=coinReward.capture(event.target?.closest?.('[data-action="coins"]')??event.target),before=state.coins;audio.unlock();const result=dispatch({type:'DEMO_COINS'});if(result.ok)coinReward.sale({id:`demo-supply-${uid()}`,value:state.coins-before,source});}});const walletPointers=new Set();
const growthReady=()=>ready&&!blocked&&!saveConflict&&!cloudTravel.busy&&pageFocused&&!document.hidden&&!ui.visitId&&!ui.mode&&!ui.editing;
const growthTap=createGrowthTapController({now:()=>performance.now(),isReady:()=>growthReady()&&!ui.panel,isCurrent:p=>ui.selection?.kind==='plant'&&ui.selection.id===p.id&&state.plants.some(current=>sameGrowingPlant(p,current)&&!isMature(current,Math.max(Date.now(),state.lastSeenAt))),onDoubleTap:handleGrowthSkip});const growthPointers=new Set();
function growthTarget(event){const node=event.target?.closest?.('[data-growth-plant]');if(!node?.dataset?.growthPlant)return null;const d=node.dataset;return {id:d.growthPlant,tileId:d.tileId,varietyId:d.varietyId,plantedAt:Number(d.plantedAt),readyAt:Number(d.readyAt)};}
function handleGrowthSkip(plant){if(!growthReady()||!plant)return;dispatch({type:'DEMO_READY_PLANT',plantId:plant.id,tileId:plant.tileId,varietyId:plant.varietyId,plantedAt:plant.plantedAt,readyAt:plant.readyAt},{silent:true});}
const assets=new ArtAssets(()=>{if(ready)paintThumbs();});
let travelIntent=0;
const cloudTravel=createCloudTravel({currentWorld:()=>currentWorld().id,reducedMotion:()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,prepare:prepareTravel,commit:commitTravel,onPhase:phase=>{
 const overlay=$('cloud-travel');overlay.dataset.phase=phase.phase;overlay.dataset.reducedMotion=String(phase.reducedMotion);overlay.style.setProperty('--cloud-duration',`${phase.duration}ms`);overlay.hidden=phase.phase==='idle';shell.dataset.travelling=String(phase.phase!=='idle');
 if(phase.phase!=='idle'){scene?.cancelInteractions?.();scene?.setActivityAllowed?.(false);scene?.setSceneActive?.(false);}else{scene?.setSceneActive?.(ready&&!blocked&&!cloudTravel.busy&&pageFocused&&!document.hidden);scene?.setActivityAllowed?.(activityAllowed());}
}});cloudTravel.setHidden(!!document.hidden);
async function prepareTravel(target,{signal}){
 const garden=DEMO_GARDENS.find(g=>g.id===target),keys=garden?[...garden.plants.map(p=>allCatalogueVarieties()[p.varietyId]?.artKey),...(garden.exhibits??[]).map(b=>b.artKey)]:[...state.plants.map(p=>getVariety(state,p.varietyId)?.artKey),...(state.buildings??[]).map(b=>getBlueprint(state,b.blueprintId)?.artKey)];
 if(signal.aborted)return {partial:true};const promises=[...new Set(keys.filter(Boolean))].map(key=>{const sprite=assets.sprite(key);return sprite?assets.loadImage(sprite.image,{retry:true}):Promise.resolve(null);});if(garden)promises.push(assets.loadAvatar(garden.avatarKey,{retry:true}));const results=await Promise.allSettled(promises);return {partial:results.some(r=>r.status!=='fulfilled'||!r.value)};
}
function commitTravel(target){
 const garden=DEMO_GARDENS.find(g=>g.id===target);if(blocked||document.hidden||!pageFocused||(!garden&&target!=='my-inspiration-garden'))return false;
 clearFriendSession();avatarLoader.cancel();ui.purchaseSession=null;ui.visitId=garden?.id??null;ui.visitorTileId=garden?.spawnTileId??null;ui.selection=null;ui.panel=null;ui.mode=null;ui.editing=false;ui.demolishId=null;$('thought').hidden=true;syncWorld(true);render();return true;
}
function cancelTravel(){travelIntent++;cloudTravel.cancel();}
function requestTravel(target,{silent=false,after=null}={}){
 const intent=++travelIntent;ownerActivity();avatarLoader.cancel();const journey=cloudTravel.request(target);return journey.then(result=>{if(intent!==travelIntent||!result.ok||currentWorld().id!==target)return result;if(after)after();else if(!silent){const garden=DEMO_GARDENS.find(g=>g.id===target);toast(result.partial?'先到花园看看，部分插画正在慢慢载入。':garden?.intro??'回来啦，种子与灵感都在种植里。',false,3800);}return result;});
}
function reconcilePlayerStyle(){ui.outfitPending=null;const key=playerOutfit(state),revision=++styleRevision;return stylePromise=assets.loadOutfit(key).then(ok=>{if(!ok||revision!==styleRevision||key!==playerOutfit(state))return false;assets.setOutfit(key);if(ready){paintThumbs();syncWorld();}return true;}).catch(()=>false);}
const allVarieties=()=>ui.visitId?{...state.varieties,...allCatalogueVarieties()}:{...allCatalogueVarieties(),...state.varieties};
function currentWorld(){
 const garden=DEMO_GARDENS.find(g=>g.id===ui.visitId);
 if(garden)return {...garden,avatarTileId:ui.visitorTileId??garden.spawnTileId,avatarKey:PLAYER_AVATAR,
  residents:[{id:garden.hostId??garden.authorId,name:garden.hostName??garden.authorName,avatarKey:garden.avatarKey,...garden.ownerPosition}]};
 return {id:'my-inspiration-garden',palette:landPalette(state.settings.landPalette),lastSeenAt:state.lastSeenAt,tiles:state.tiles,edges:state.edges,plants:state.plants,avatarTileId:state.avatarTileId,avatarKey:PLAYER_AVATAR,props:[],exhibits:(state.buildings??[]).map(b=>{const blueprint=getBlueprint(state,b.blueprintId),tile=state.tiles.find(t=>t.id===b.tileId);return {...blueprint,...b,x:tile.x,y:tile.y,displayName:blueprint.name,personal:true,sourceDisclosure:blueprint.sourceDisclosure??'离线样例 · AI生成的虚构照片'};})};
}
function activityAllowed(){return !cloudTravel.busy&&!ui.friendSession&&ready&&!blocked&&!cloudTravel.busy&&pageFocused&&!document.hidden&&!ui.mode&&!ui.editing&&!ui.demolishId&&!ui.activePlantGesture;}
function clearFriendSession(){if(['gift','photo'].includes(ui.panel))ui.panel=null;ui.friendSession=null;ui.giftSelection=null;ui.giftThanks='';photoView?.close();scene?.cancelResident?.();if(ui.selection?.kind==='resident')ui.selection=null;}
function ownerActivity(options={}){growthTap.cancelPending();growthPointers.clear();scene?.cancelGrowthTap?.();walletTap?.cancelPending();if(options.interrupt!==false)clearFriendSession();scene?.noteOwnerActivity?.(options);}
function syncWorld(fit=false){const world=currentWorld();scene?.setSceneActive?.(ready&&!blocked&&!cloudTravel.busy&&pageFocused&&!document.hidden);scene?.setActivityAllowed?.(activityAllowed());scene?.setSceneActive?.(ready&&!blocked&&!cloudTravel.busy&&pageFocused&&!document.hidden);scene?.setWorld(world,allVarieties(),{theme:world.theme??'home',fit});scene?.setSelection(ui.selection);scene?.setMode(ui.mode);}
function paintThumbs(){document.querySelectorAll('canvas[data-art]').forEach(c=>assets.thumb(c,c.dataset.art));document.querySelectorAll('canvas[data-avatar-portrait]').forEach(c=>assets.portraitThumb(c,c.dataset.avatarPortrait));document.querySelectorAll('canvas[data-outfit-portrait]').forEach(c=>assets.outfitThumb(c,c.dataset.outfitPortrait,{selecting:ui.outfitPending===c.dataset.outfitPortrait}));document.querySelectorAll('canvas[data-source]').forEach(c=>assets.sourceThumb(c,c.dataset.source));}
function measureOverlay(){
 if(ui.activePlantGesture)return;
 const tray=!$('tray').hidden?$('tray').getBoundingClientRect().height+100:!$('context').hidden?$('context').getBoundingClientRect().height+100:ui.mode?70:87;
 shell.style.setProperty('--overlay-height',`${tray}px`);scene?.setTrayHeight(ui.panel?tray:87);if(!ui.panel&&!$('context').hidden){const host=$('world').getBoundingClientRect(),context=$('context').getBoundingClientRect();scene?.ensureSelectionVisible?.({top:125,bottom:context.top-host.top-10});}
}
function rememberContextMaturity(){const p=ui.selection?.kind==='plant'&&!ui.panel?currentWorld().plants.find(p=>p.id===ui.selection.id):null;selectedPlantReadiness=p?{id:p.id,ready:isMature(p,Math.max(Date.now(),state.lastSeenAt))}:null;}
function updateNavigationHint(){const hint=$('navigation-note');hint.hidden=!navigationStuck;hint.textContent=!navigationStuck?'':state.coins>=18?'先扩出一块空土地，角色再回到岛上。':legacyRecoveryEligible(state)?'旧版布局没有落脚空间，可到建造里选择「旧版布局恢复」。':'旧版布局暂时没有落脚空间，等小屋建好后可到建造里恢复。';}
function render(){
 creationPhoto.sync(ui.panel);ui.creationPhoto=creationPhoto.snapshot();
 if(ui.recoveryId&&(ui.panel!=='build'||!legacyRecoveryEligible(state)))ui.recoveryId=null;
 if(ui.panel!=='profile'){avatarLoader.cancel();ui.outfitPending=null;}
 if(ui.activePlantGesture)return;
 if(ui.bagTab==='buildings')ui.bagTab='seeds';
 if(ui.demolishId&&(ui.visitId||ui.panel||ui.mode||ui.selection?.kind!=='exhibit'||ui.selection.id!==ui.demolishId))ui.demolishId=null;
 const hudKey=PLAYER_AVATAR;
 if(hudKey!==lastHudKey){$('hud').innerHTML=renderHUD(state,assets.avatars.avatars,saveStatus());lastHudKey=hudKey;}else{for(const [key,value,label]of [['coins',state.coins,'金币'],['crystals',state.crystals,'灵感水晶']]){const wallet=$('hud').querySelector?.(`.wallet.${key}`),number=wallet?.querySelector?.('b');if(number)number.textContent=String(value);wallet?.setAttribute?.('aria-label',`${label} ${value}`);}}updateSaveIndicator();$('dock').innerHTML=renderDock(ui.panel);$('view-tools').innerHTML=renderTools(state);
 const garden=DEMO_GARDENS.find(g=>g.id===ui.visitId);
 $('garden-label').innerHTML=garden?`<p class="island-label">${esc(garden.name)}<span class="demo-badge">示范</span></p><div class="island-subtitle">${esc(garden.hostName??garden.authorName)} · ${esc(garden.subtitle)}</div><button class="home-button" data-action="go-home">${icon('home')}回自己的花园</button>`:`<p class="island-label">我的灵感岛</p><div class="island-subtitle">${state.plantedCount===0?'从四块土地，一颗白萝卜开始。':state.plants.length?'把喜欢的植物，留在身边。':'给一点奇思妙想，留个位置。'}<span class="demo-badge">本地 Demo</span></div>`;
 const tray=$('tray'),scroller=tray.querySelector?.('.tray-content'),sameList=tray.dataset.panel===ui.panel&&tray.dataset.tab===ui.bagTab&&ui.panel==='bag',scroll=sameList?capturePurchaseScroll(scroller,recentPurchaseId):null;
 const kept=sameList&&ui.bagTab==='seeds'&&!ui.detailId&&patchSeedContent(scroller,renderSeedPurchaseContent(state,ui),document);
 if(!kept){const panelHTML=ui.panel?renderPanel(state,ui,assets.avatars.avatars,assets.wardrobe):'';tray.hidden=!panelHTML;tray.innerHTML=panelHTML;}
 tray.dataset.panel=ui.panel??'';tray.dataset.tab=ui.bagTab;restorePurchaseScroll(tray.querySelector?.('.tray-content'),scroll);
 const contextHTML=!ui.panel&&!ui.mode?.kind.startsWith('move')&&ui.selection?renderContext(state,ui,currentWorld()):'';$('context').hidden=!contextHTML;$('context').innerHTML=contextHTML;rememberContextMaturity();
 $('mode-bar').hidden=!ui.mode;$('mode-bar').innerHTML=renderMode(state,ui);$('dock').hidden=!!ui.mode;
 paintThumbs();syncWorld();updateNavigationHint();requestAnimationFrame(measureOverlay);
}
function toast(message,error=false,duration=3000){if(!message)return;clearTimeout(thoughtTimer);$('thought').hidden=true;clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,duration);}
function thought(message,duration=2600){clearTimeout(toastTimer);$('toast').hidden=true;clearTimeout(thoughtTimer);$('thought').textContent=message;$('thought').hidden=false;thoughtTimer=setTimeout(()=>$('thought').hidden=true,duration);}
function saveStatus(){return temporary?'临时体验':saveConflict?'请同步进度':saveWarning?'暂未保存':dirty||saveBusy?'正在保存…':'慢慢种，轻轻玩';}
function updateSaveIndicator(){const node=$('save-state');if(node)node.textContent=saveStatus();}
function storageNote(message,isSaveWarning=false){saveWarning=isSaveWarning;$('storage-note').hidden=!message;$('storage-note').textContent=message??'';updateSaveIndicator();}
function pauseForConflict(message='另一个标签页保存了新的进度。'){
 if(saveConflict)return;cancelTravel();ui.purchaseSession=null;ownerActivity();avatarLoader.cancel();saveConflict=true;blocked=true;clearTimeout(saveTimer);saveTimer=null;ui.mode=null;ui.editing=false;ui.panel=null;ui.selection=null;ui.activePlantGesture=null;render();
 const overlay=document.createElement('div');overlay.className='storage-block';overlay.innerHTML=`<div><h2>先接上最新的进度</h2><p>${esc(message)}</p><p>为避免覆盖金币和水晶，这一页已暂停。读取最新存档后继续；这页还没保存的操作不会自动合并。</p><button class="primary full" data-action="reload-from-disk">读取最新进度</button></div>`;shell.append(overlay);
}
async function flushSave(){
 clearTimeout(saveTimer);saveTimer=null;if(blocked||temporary||saveConflict||!dirty)return;if(saveBusy){urgentSave=true;updateSaveIndicator();return;}
 saveBusy=true;updateSaveIndicator();const snapshot=state;const result=await saves.save(snapshot);saveBusy=false;
 if(result.conflict){pauseForConflict(result.message);return;}
 if(result.temporaryRequired){temporary=true;storageNote(result.message);return;}
 if(!result.ok){storageNote(result.message,true);return;}
 const repeatImmediately=urgentSave;urgentSave=false;
 if(state===snapshot)dirty=false;else if(repeatImmediately)queueMicrotask(flushSave);else scheduleSave();
 if(saveWarning)storageNote('');else updateSaveIndicator();
}
function scheduleSave(){if(blocked||temporary||saveConflict)return;clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,180);}
window.addEventListener('storage',event=>{
 if(event.key!==SAVE_KEY||event.newValue===saves.head||temporary||saveConflict)return;
 if(dirty||saveBusy||saves.pending){pauseForConflict();return;}
 const latest=loadGame(storage);if(!latest.state){pauseForConflict('另一页改变了本地存档，请确认最新进度后继续。');return;}
 cancelTravel();ui.recoveryId=null;ui.purchaseSession=null;ownerActivity();avatarLoader.cancel();scene?.cancelInteractions();ui.activePlantGesture=null;state=latest.state;saves.adopt(latest.head);audio.setMuted(state.settings.muted);reconcilePlayerStyle();ui.mode=null;ui.editing=false;ui.selection=null;render();
 if(latest.status==='recovered'){storageNote(latest.message);return;}
 if(Date.now()-lastSyncToast>5000){lastSyncToast=Date.now();toast('已接上另一页保存的最新进度。',false,1800);}
});
function dispatch(action,{silent=false}={}){
 if(blocked)return {ok:false};const result=reduce(state,action,Date.now());
 if(!result.ok){if(!silent)toast(result.message,true);return result;}
 if(result.state!==state){if(!['SET_MUTED','REVEAL','INTERACT_DEMO','TRAVEL'].includes(action.type))ownerActivity(action.type==='GIFT_ITEM'?{interrupt:false,cancelContacts:false}:{});state=result.state;dirty=true;updateSaveIndicator();if(['TRAVEL','INTERACT_DEMO','REVEAL'].includes(action.type))scheduleSave();else flushSave();}
 if(!silent&&result.message)toast(result.message);
 if(typeof result.effect==='string'&&!['SELL','SELL_PACKED_PLANT'].includes(action.type))audio.play(result.effect);
 render();return result;
}
function closePanel(){inviteSession++;if(ui.friendSession)clearFriendSession();ui.recoveryId=null;scene?.cancelUncommittedTouch?.();ui.purchaseSession=null;ui.panel=null;ui.detailId=null;render();}
function openPanel(type){
 inviteSession++;
 creationPhoto.reset();
 clearFriendSession();
 scene?.cancelUncommittedTouch?.(); ui.purchaseSession=null;
 if(type==='shop'){type='bag';ui.bagTab='seeds';}
 ui.plantingTileId=null;
 ui.mode=null;ui.editing=false;ui.selection=null;ui.detailId=null;ui.panel=type;
 if(type==='create')ui.creation=newCreation();
 render();
}
function goHome({silent=false,after=null}={}){
 if(!ui.visitId&&!cloudTravel.busy){after?.();return Promise.resolve({ok:true,reason:'same-world'});}return requestTravel('my-inspiration-garden',{silent,after});
}
function startSeedPurchase(id){
 if(ui.panel!=='bag'||ui.bagTab!=='seeds'||!purchaseSummary(state,id))return;const before=state.inventory[id]??0;recentPurchaseId=id;const result=dispatch({type:'BUY_SEED',varietyId:id},{silent:true});if(!result.ok){toast(result.message,true);return;}
 if(before===0&&purchaseActivation)purchaseIntent.reflow({id,x:purchaseActivation.clientX,y:purchaseActivation.clientY,at:performance.now()});
}

function beginBuilding(blueprintId,buildingId=null){
 if(ui.visitId||cloudTravel.busy)return goHome({silent:true,after:()=>beginBuilding(blueprintId,buildingId)});
 const p=getBlueprint(state,blueprintId);if(!p)return;const sprite=assets.sprite(p.artKey);if(sprite)assets.loadImage(sprite.image,{retry:true});if(!buildingId&&(!Object.hasOwn(state.blueprints??{},blueprintId)||state.coins<60)){toast('每座建筑需要60金币，图纸会一直留着。',true);return;}
 ownerActivity();goHome({silent:true});ui.panel=null;ui.selection=null;ui.editing=false;ui.mode={kind:buildingId?'restore-building':'construct-building',blueprintId,buildingId,name:p.name,artKey:p.artKey,sampleId:p.sampleId,footprint:p.footprint};render();
}
function beginRelocation(buildingId){
 const b=(state.buildings??[]).find(b=>b.id===buildingId);if(ui.visitId||!b)return;
 if(!isBuilt(b,Math.max(Date.now(),state.lastSeenAt))){toast('小屋还在建设，完成后才能搬迁。',true);return;}
 if(state.coins<RELOCATION_PRICE){toast(`搬迁需要${RELOCATION_PRICE}金币，本次没有花费。`,true);return;}
 const p=getBlueprint(state,b.blueprintId);ownerActivity();ui.panel=null;ui.selection=null;ui.demolishId=null;ui.editing=false;ui.mode={kind:'relocate-building',buildingId,blueprintId:b.blueprintId,name:p.name,artKey:p.artKey,sampleId:p.sampleId,footprint:p.footprint};render();
}
function openBlueprintCreator(parentId=null){if(ui.visitId&&parentId&&Object.hasOwn(state.blueprints??{},parentId)){toast('本地已有不同来源的同编号图纸，原图纸保留，本次未消耗。',true);return;}openPanel('blueprint-create');ui.blueprintCreation=newBlueprintCreation(parentId);render();}
function submitBlueprint(){
 if(blocked||cloudTravel.busy)return;
 const c=ui.blueprintCreation,result=resolveBlueprintIdea(state,c,c.idea);c.error=result.error;c.reuseId=result.reuseId;if(!result.sample||result.reuseId){render();return;}
 const created=dispatch({type:'CREATE_BLUEPRINT',sampleId:result.sample.id,parentId:c.parentId,requestId:uid()},{silent:true});if(!created.ok){c.error=created.message;render();return;}const id=created.effect.blueprintId;if(state.coins>=60)beginBuilding(id);else{openPanel('build');toast('永久图纸已收好，攒够60金币就能建造。');}
}
function beginRestore(plantId){
 if(ui.visitId||cloudTravel.busy)return goHome({silent:true,after:()=>beginRestore(plantId)});
 const p=(state.plantBag??[]).find(p=>p.id===plantId);if(!p)return;ownerActivity();goHome({silent:true});ui.panel=null;ui.selection=null;ui.editing=false;ui.mode={kind:'restore',plantId,varietyId:p.varietyId};render();
}
function beginPlant(varietyId){
 if(ui.visitId||cloudTravel.busy)return goHome({silent:true,after:()=>beginPlant(varietyId)});
 if(!(state.inventory[varietyId]>0)){toast('这颗种子已经种完啦。',true);return;}
 ownerActivity();goHome({silent:true});ui.panel=null;ui.selection=null;ui.editing=false;ui.mode={kind:'plant',varietyId,preferredTileId:ui.plantingTileId??null};ui.plantingTileId=null;render();
}
function handlePlantControl(contact){
 const world=currentWorld(),prepared=preparePlantContact(ui,contact.phase,contact.plantId,world.plants);Object.assign(ui,prepared.ui);
 const terminal=contact.phase==='end'||contact.phase==='cancel',plant=prepared.plant,v=plant&&(ui.visitId?allCatalogueVarieties()[plant.varietyId]:getVariety(state,plant.varietyId));
 if(blocked||!plant||!v){if(terminal)render();return;}
 if(contact.phase==='start'){
  scene.setSelection({kind:'plant',id:plant.id});
  if(!ui.visitId)dispatch({type:'REVEAL',plantId:plant.id},{silent:true});
 }
 if(contact.phase==='end'||contact.phase==='cancel'){scene.setSelection(ui.selection);render();}
 const count=interactionCounts.get(plant.id)??0;
 if(contact.events.length){
  if(ui.visitId&&state.demoInteractions[`${ui.visitId}:${plant.id}`]!==dayKey(Date.now()))dispatch({type:'INTERACT_DEMO',gardenId:ui.visitId,plantId:plant.id},{silent:true});
  interactionCounts.set(plant.id,count+1);
  const special=contact.events.find(e=>['fireflies','dream','poke'].includes(e.type));
  if(special?.type==='fireflies')thought('三下轻轻的问候，叫来了一小群萤火虫。',3500);
  else if(special?.type==='dream')thought('嘘……你把它哄进一个软软的好梦。',3200);
  else if(special?.type==='poke')thought('唔……别急，让太阳花再眯一会儿。');
  else if(contact.phase==='start'&&(count===0||v.interaction==='whisper')&&['whisper','bubble','paint','gramophone','float','sway'].includes(v.interaction))thought(interactionLine(v.interaction,count));
 }
 audio.unlock().then(()=>{for(const event of contact.events){if(event.type==='tap')audio.play(v.interaction,count);else audio.playGesture(event);}});
}
function handleExhibitControl(contact){
 const terminal=contact.phase==='end'||contact.phase==='cancel';if(terminal&&ui.activePlantGesture===contact.plantId)ui.activePlantGesture=null;
 if(blocked){if(terminal)render();return;} // Presentation-only: no state/economy transaction.
 const exhibit=currentWorld().exhibits?.find(e=>e.id===contact.plantId);if(!exhibit||!isBuilt(exhibit,Math.max(Date.now(),state.lastSeenAt))){if(terminal)render();return;}
 if(contact.phase==='loading'){toast('正在准备小鱼和猫咪表情，马上就好…',false,2500);return;}
 if(contact.phase==='failed'){toast('小鱼和表情暂时没加载好，轻碰猫咪再试一次。',true);return;}
 if(contact.phase==='start'){ui.activePlantGesture=exhibit.id;scene.setSelection({kind:'exhibit',id:exhibit.id});}
 if(contact.phase==='end'||contact.phase==='cancel'){ui.activePlantGesture=null;if(contact.phase==='end'){ui.panel=null;ui.selection={kind:'exhibit',id:exhibit.id};}render();}
 const contactWorld=currentWorld().id;audio.unlock().then(()=>{if(currentWorld().id!==contactWorld||!currentWorld().exhibits?.some(e=>e.id===exhibit.id))return;for(const event of contact.events)audio.playGesture(event);});
}
function handleApproach(event){
 if(event.kind==='resident'){const session=ui.friendSession;if(!session||session.residentId!==event.id||session.gardenId!==ui.visitId)return;if(event.phase==='ready'&&event.nonce===session.sceneNonce){session.ready=true;ui.selection={kind:'resident',id:event.id};render();}else if(event.phase==='cancel'||event.phase==='unreachable'){clearFriendSession();if(['gift','photo'].includes(ui.panel))ui.panel=null;render();if(event.phase==='unreachable')toast('这里暂时走不过去，换个位置再找朋友吧。',true);}return;}

 if(event.phase==='start'){ui.activePlantGesture=event.id;return;}
 if(ui.activePlantGesture===event.id)ui.activePlantGesture=null;
 if(event.phase==='cancel')return;
 if(blocked||!currentWorld()[event.kind==='plant'?'plants':'exhibits']?.some(e=>e.id===event.id))return;
 ui.selection={kind:event.kind,id:event.id};if(ui.panel)return;render();if(event.phase==='unreachable'){toast(event.kind==='plant'?'附近没有可到达的空地，先留一点互动空间吧。':'这里被建筑挡住了，暂时走不过去。',true);return;}if(event.phase==='ready')toast('到啦，再轻碰一下，和它玩一会儿。',false,2200);
}
function handleTarget(target){
 if(blocked||cloudTravel.busy)return;
 if(target.kind!=='resident'&&ui.friendSession)clearFriendSession();
 const mode=ui.mode;
 if(mode&&['plant','restore','construct-building','restore-building','relocate-building'].includes(mode.kind)){
  const tile=target.kind==='tile'?target.tile:null;
  if(!tile){toast(target.kind==='plant'?'这里已经有一位小居民啦。':'轻点一块发亮的空土地。',true);return;}
  const buildingMode=['construct-building','restore-building','relocate-building'].includes(mode.kind);
  const actorPosition=scene.getActorPosition?.();const result=dispatch(mode.kind==='relocate-building'?{type:'RELOCATE_BUILDING',buildingId:mode.buildingId,tileId:tile.id,actorPosition}:mode.kind==='construct-building'?{type:'CONSTRUCT_BUILDING',blueprintId:mode.blueprintId,tileId:tile.id,actorPosition}:mode.kind==='restore-building'?{type:'RESTORE_BUILDING',buildingId:mode.buildingId,tileId:tile.id,actorPosition}:mode.kind==='restore'?{type:'RESTORE_PLANT',tileId:tile.id,plantId:mode.plantId}:{type:'PLANT',tileId:tile.id,varietyId:mode.varietyId});
  if(result.ok){scene.showBurst(tile.id,buildingMode?'build':'plant');if(buildingMode||mode.kind==='restore'||!state.inventory[mode.varietyId]){ui.mode=null;ui.selection=buildingMode?{kind:'exhibit',id:mode.kind==='relocate-building'?mode.buildingId:state.buildings.at(-1).id}:{kind:'plant',id:state.plants.at(-1).id};render();}}
  return;
 }
 if(mode&&['land','platform','fence','wall','move-tile','move-edge'].includes(mode.kind)){
  const cell=target.cell??target.tile;let action;
  if(['land','platform'].includes(mode.kind))action={type:'BUILD',kind:mode.kind,x:cell?.x,y:cell?.y};
  else if(['fence','wall'].includes(mode.kind)){const choice=chooseEdgePreview(state,mode,target,Math.max(Date.now(),state.lastSeenAt));mode.edgePreview=choice.preview;if(!choice.confirm){if(choice.message)toast(choice.message,true);render();return;}action={type:'BUILD',kind:mode.kind,tileId:choice.preview.tileId,edge:choice.preview.edge};}
  else if(mode.kind==='move-tile')action={type:'MOVE_BUILDING',targetId:mode.targetId,x:cell?.x,y:cell?.y,actorPosition:scene.getActorPosition?.()};
  else action={type:'MOVE_BUILDING',targetId:mode.targetId,tileId:target.tile?.id,edge:target.edge};
  const result=dispatch(action);
  if(result.ok&&['fence','wall'].includes(mode.kind)){mode.edgePreview=initialEdgePreview(state,mode.kind,Math.max(Date.now(),state.lastSeenAt),scene.getActorPosition?.());render();}
  if(result.ok&&mode.kind.startsWith('move')){ui.mode={kind:'edit'};ui.editing=true;ui.selection={kind:mode.kind==='move-edge'?'edge':'tile',id:mode.targetId};render();}
  return;
 }
 if(mode?.kind==='edit'){
  if(target.kind==='plant'){const plant=currentWorld().plants.find(p=>p.id===target.id);ui.selection=plant?{kind:'tile',id:plant.tileId}:null;}
  else if(target.kind==='exhibit'){const building=currentWorld().exhibits?.find(b=>b.id===target.id);ui.selection=building?.tileId?{kind:'tile',id:building.tileId}:null;}
  else if(['tile','edge'].includes(target.kind))ui.selection={kind:target.kind,id:target.id};else ui.selection=null;render();return;
 }
 if(target.kind==='resident'){beginResident(target.id);return;}
 if(target.kind==='exhibit'){scene.approachTarget?.('exhibit',target.id);ui.selection={kind:'exhibit',id:target.id};ui.panel=null;render();return;}
 if(target.kind==='plant'){const plant=currentWorld().plants.find(p=>p.id===target.id);if(!plant)return;scene.approachTarget?.('plant',target.id);ui.selection={kind:'plant',id:target.id};ui.panel=null;render();return;}
 if(target.kind==='tile'){
  if(!isBuilt(target.tile,Math.max(Date.now(),state.lastSeenAt))){ui.panel=null;ui.selection={kind:'tile',id:target.id??target.tile.id};render();return;}
  ui.panel=null;ui.selection=ui.visitId?null:{kind:'tile',id:target.id};
  const actorPosition=scene.getActorPosition?.();if(scene.walkToTile?.(target.id)===false){toast('这里被建筑挡住了，暂时走不过去。',true);return;}if(ui.visitId){ui.visitorTileId=target.id;render();}else dispatch({type:'TRAVEL',tileId:target.id,actorPosition},{silent:true});return;
 }
 ui.selection=null;ui.panel=null;render();
}
function validFriendSession(){const session=ui.friendSession,garden=DEMO_GARDENS.find(g=>g.id===ui.visitId);return session?.ready&&garden&&session.gardenId===garden.id&&session.residentId===(garden.hostId??garden.authorId)&&giftRecipient(garden.id,session.residentId)?session:null;}
function beginResident(id){const garden=DEMO_GARDENS.find(g=>g.id===ui.visitId);if(!garden||id!==(garden.hostId??garden.authorId)||ui.mode)return;ownerActivity();ui.panel=null;ui.selection=null;const result=scene.approachResident?.(id);if(!result?.possible){toast('这里暂时走不过去，换个位置再找朋友吧。',true);render();return;}ui.friendSession={gardenId:garden.id,residentId:id,name:garden.hostName??garden.authorName,nonce:uid(),sceneNonce:result.nonce,ready:!!result.ready};ui.selection={kind:'resident',id};render();}
function openGift(){if(!validFriendSession())return;photoView?.close();ui.panel='gift';ui.giftTab='seeds';ui.giftSelection=null;render();}
function sendGift(){const session=validFriendSession(),selected=ui.giftSelection;if(!session||ui.panel!=='gift'||!selected||selected.nonce!==session.nonce)return;ui.giftSelection=null;const result=dispatch({type:'GIFT_ITEM',gardenId:session.gardenId,recipientId:session.residentId,kind:selected.kind,varietyId:selected.kind==='seed'?selected.id:undefined,plantId:selected.kind==='plant'?selected.id:undefined,requestId:selected.requestId},{silent:true});if(!result.ok){toast(result.message,true);render();return;}ui.panel=null;ui.giftThanks=`${session.name}（本地模拟）：谢谢，这份小心意收在本机记录里啦。`;render();}
function patchPhoto(){if(ui.panel!=='photo'||!validFriendSession()||ui.photoState?.gardenId!==ui.visitId)return;const view=$('photo-view');if(view)view.innerHTML=renderPhotoContent(ui);const save=$('photo-download'),retry=$('photo-retry'),status=$('photo-status');if(save)save.disabled=ui.photoState.status!=='ready';if(retry)retry.hidden=ui.photoState.status!=='error';if(status)status.textContent=photoStatus(ui);}
function openPhoto(){const session=validFriendSession();if(!session)return;const openedAt=Date.now();ui.panel='photo';ui.photoState={status:'loading',gardenId:session.gardenId,openedAt};render();if(!photoView)photoView=createPhotoSampleView({origin:window.location.origin,manifest:async({signal})=>{const response=await fetch('assets/photo-samples-manifest.json',{signal,cache:'no-cache'});if(!response.ok)throw Error('Photo manifest unavailable');return response.json();},onChange:value=>{if(ui.panel!=='photo'||!validFriendSession()||value.gardenId!==ui.visitId)return;ui.photoState=value;patchPhoto();}});photoView.open(session.gardenId,openedAt);}
function visitGarden(id){if(!DEMO_GARDENS.some(g=>g.id===id))return Promise.resolve({ok:false});return requestTravel(id);}
function beginBuild(kind){if(ui.visitId||cloudTravel.busy)return goHome({silent:true,after:()=>beginBuild(kind)});ownerActivity();ui.panel=null;ui.selection=null;ui.mode={kind,...(['fence','wall'].includes(kind)?{edgePreview:initialEdgePreview(state,kind,Math.max(Date.now(),state.lastSeenAt),scene.getActorPosition?.())}:{})};ui.editing=false;render();}
function beginEdit(){if(ui.visitId||cloudTravel.busy)return goHome({silent:true,after:beginEdit});ownerActivity();ui.panel=null;ui.mode={kind:'edit'};ui.editing=true;ui.selection=null;render();}
function submitCreation(){
 if(blocked||cloudTravel.busy)return;
 const c=ui.creation,resolved=resolveCreationIdea(state,c,c.idea);c.error=resolved.error;c.reuseId=resolved.reuseId;
 if(!resolved.sample||resolved.reuseId){render();return;}
 const result=dispatch({type:'CREATE_VARIETY',sampleId:resolved.sample.id,parentId:c.path==='remix'?c.parentId:null,requestId:uid()},{silent:true});
 if(!result.ok){c.error=result.message;render();return;}
 const varietyId=result.effect.varietyId,v=getVariety(state,varietyId),sprite=v&&assets.sprite(v.artKey);if(sprite)assets.loadImage(sprite.image);beginPlant(varietyId);toast('一颗灵感种子诞生啦。轻点空土地，等成熟时见面。',false,3300);
}
async function onAction(action,id,sourceElement=null){
 growthTap.cancelPending();growthPointers.clear();walletTap.cancelPending();
 if(cloudTravel.busy&&!['visit-garden','go-home','cancel-travel'].includes(action))return;
 // A real UI activation owns any earlier world contact, but browsing is not avatar activity.
 scene?.cancelUncommittedTouch?.();
 if(!['buy-seed','repeat-buy-seed'].includes(action))purchaseIntent.clear();
 // Resuming optional audio must never suspend ownership of a UI/economic activation.
 try{Promise.resolve(audio.unlock()).catch(()=>{});}catch{}
 if(action.startsWith('panel-')){const type=action.slice(6);if(type==='create'){openPanel('create');return;}if(ui.panel===type)closePanel();else openPanel(type);return;}
 switch(action){
  case 'invite-share':case 'invite-copy':{
   if(ui.panel!=='invite'||inviteBusy)return;
   inviteBusy=true;const session=inviteSession;
   try{const result=await shareGardenInvitation({copyOnly:action==='invite-copy'});if(ui.panel==='invite'&&inviteSession===session){if(result==='copied')toast('邀请链接已复制');else if(result==='unavailable')toast('暂时无法分享，请稍后再试。',true);}}
   finally{inviteBusy=false;}break;
  }
  case 'creation-photo-add':if(['create','blueprint-create'].includes(ui.panel)){creationPhotoPick=creationPhoto.pickToken();$('creation-photo-input')?.click();}break;
  case 'creation-photo-remove':creationPhoto.remove();break;
  case 'visit-period-today':case 'visit-period-week':ui.visitPeriod=action.endsWith('week')?'week':'today';render();break;
  case 'close-panel':closePanel();break;
  case 'clear-selection':clearFriendSession();ui.selection=null;render();break;
  case 'friend-photo':openPhoto();break;
  case 'friend-gift':openGift();break;
  case 'gift-tab-seeds':case 'gift-tab-plants':if(validFriendSession()){ui.giftTab=action.endsWith('plants')?'plants':'seeds';ui.giftSelection=null;render();}break;
  case 'gift-select-seed':case 'gift-select-plant':{const session=validFriendSession();if(session&&ui.panel==='gift'){ui.giftSelection={kind:action.endsWith('seed')?'seed':'plant',id,nonce:session.nonce,requestId:uid()};render();}break;}
  case 'confirm-gift':sendGift();break;
  case 'photo-retry':if(ui.panel==='photo'&&validFriendSession())photoView?.retry();break;
  case 'photo-download':if(ui.panel==='photo'&&validFriendSession()){const result=photoView?.download();if(result?.message)toast(result.message,!result.ok);}break;
  case 'profile':openPanel('profile');break;
  case 'coins':toast('金币可以买种子和建造；双击右上金币余额，可补充100演示金币。');break;
  case 'crystals':openPanel('crystals');break;
  case 'mute':dispatch({type:'SET_MUTED',value:!state.settings.muted});audio.setMuted(state.settings.muted);if(!state.settings.muted)await audio.unlock();break;
  case 'recenter':scene.recenter();break;
  case 'zoom-in':scene.zoomBy(1.16);break;
  case 'zoom-out':scene.zoomBy(1/1.16);break;
  case 'buy-seed':startSeedPurchase(id);break;
  case 'repeat-buy-seed':startSeedPurchase(id);break;
  case 'finish-purchase':ui.purchaseSession=null;render();break;
  case 'choose-seed':beginPlant(id);break;
  case 'plant-here':ui.plantingTileId=ui.selection?.kind==='tile'?ui.selection.id:null;ui.panel='bag';ui.bagTab='seeds';ui.detailId=null;ui.selection=null;render();break;
  case 'bag-tab-seeds':ui.bagTab='seeds';ui.detailId=null;render();break;
  case 'bag-tab-buildings':ui.bagTab='seeds';openPanel('build');break;
  case 'blueprint-create':openBlueprintCreator();break;
  case 'land-palette':dispatch({type:'SET_LAND_PALETTE',presetId:id});break;
  case 'idea-dice':ui.creation=rollPlantExample(state,ui.creation);render();$('idea-input')?.focus();break;
  case 'roll-building-idea':ui.blueprintCreation=rollBuildingExample(state,ui.blueprintCreation);render();$('building-idea-input')?.focus();break;
  case 'visit-seed-source':{const garden=DEMO_GARDENS.find(g=>g.plants.some(p=>p.varietyId===id));if(garden)visitGarden(garden.id);else toast('这个旧版收藏当前暂未展出，已有种子和植物仍会完整保留。');break;}
  case 'remix-building':openBlueprintCreator(id);break;
  case 'confirm-blueprint':submitBlueprint();break;
  case 'choose-blueprint':beginBuilding(id);break;
  case 'restore-building':{const b=(state.buildingBag??[]).find(b=>b.id===id);if(b)beginBuilding(b.blueprintId,b.id);break;}
  case 'relocate-building':beginRelocation(id);break;
  case 'demolish-building':{const b=(state.buildings??[]).find(b=>b.id===id);if(!ui.visitId&&b&&isBuilt(b,Math.max(Date.now(),state.lastSeenAt))){ownerActivity();ui.selection={kind:'exhibit',id};ui.panel=null;ui.demolishId=id;render();}break;}
  case 'legacy-recovery':if(legacyRecoveryEligible(state)&&state.buildings?.some(b=>b.id===id&&isBuilt(b,Math.max(Date.now(),state.lastSeenAt)))){return goHome({silent:true,after:()=>{if(!legacyRecoveryEligible(state))return;openPanel('build');ui.recoveryId=id;render();}});}break;
  case 'cancel-legacy-recovery':ui.recoveryId=null;render();break;
  case 'confirm-legacy-recovery':if(!ui.visitId&&ui.panel==='build'&&ui.recoveryId===id){const recovered=dispatch({type:'RECOVER_LEGACY_BUILDING',buildingId:id});if(recovered.ok){ui.recoveryId=null;render();}}break;
  case 'cancel-demolition':if(ui.demolishId)ownerActivity();ui.demolishId=null;render();break;
  case 'confirm-demolition':if(!ui.visitId&&ui.demolishId===id&&ui.selection?.kind==='exhibit'&&ui.selection.id===id){const result=dispatch({type:'DEMOLISH_BUILDING',buildingId:id});if(result.ok){ui.demolishId=null;ui.selection=null;render();}}break;
  case 'bag-tab-plants':ui.bagTab='plants';ui.detailId=null;render();break;
  case 'restore-plant':beginRestore(id);break;
  case 'bag-tab-collection':ui.bagTab='seeds';ui.detailId=null;render();break;
  case 'detail':ui.detailId=id;render();break;
  case 'back-bag':ui.detailId=null;render();break;
  case 'remix':openPanel('create');ui.creation=newCreation('remix',id);render();break;
  case 'reuse-seed':if(state.inventory[id]>0)beginPlant(id);else{const reused=dispatch({type:'BUY_SEED',varietyId:id});if(reused.ok)beginPlant(id);}break;
  case 'confirm-create':submitCreation();break;
  case 'choose-build':beginBuild(id);break;
  case 'edit-build':return beginEdit();
  case 'cancel-mode':if(ui.mode)ownerActivity();ui.mode=null;ui.editing=false;ui.selection=null;render();break;
  case 'move-selected':{
   const selected=ui.selection;if(!selected)return;ownerActivity();ui.mode={kind:selected.kind==='edge'?'move-edge':'move-tile',targetId:selected.id};ui.selection=null;render();break;
  }
  case 'reclaim-selected':{
   if(!ui.selection)return;const result=dispatch({type:'RECLAIM',targetId:ui.selection.id,actorPosition:scene.getActorPosition?.()});if(result.ok){ui.selection=null;render();}break;
  }
  case 'visit-garden':return visitGarden(id);
  case 'go-home':return goHome();
  case 'cancel-travel':cancelTravel();break;
  case 'pack-plant':if(!ui.visitId){const packed=dispatch({type:'PACK_PLANT',plantId:id});if(packed.ok){ui.selection=null;ui.panel='bag';ui.bagTab='plants';ui.detailId=null;render();}}break;
  case 'shake-seed':{const shaken=dispatch({type:'SHAKE_SEED',gardenId:ui.visitId,plantId:id});if(shaken.ok)scene.shakeSeed?.(id);break;}
  case 'sell-packed-plant':{const source=coinReward.capture(sourceElement),before=state.coins,result=dispatch({type:'SELL_PACKED_PLANT',plantId:id});if(result.ok)coinReward.sale({id,value:state.coins-before,source});break;}
  case 'sell-plant':{
   const plant=state.plants.find(p=>p.id===id),tileId=plant?.tileId,source=coinReward.capture(sourceElement),before=state.coins;const result=dispatch({type:'SELL',plantId:id});if(result.ok){ui.selection={kind:'tile',id:tileId};coinReward.sale({id,value:state.coins-before,source});render();}break;
  }
  case 'claim-seed':dispatch({type:'CLAIM_SEED',gardenId:ui.visitId,plantId:id});break;
  case 'choose-outfit':{if(ui.panel!=='profile'||!assets.wardrobe.outfits?.[id])break;const choiceRevision=++styleRevision;ui.outfitPending=id;paintThumbs();const loaded=await avatarLoader.select(()=>assets.loadOutfit(id,{retry:true}),()=>{const result=dispatch({type:'SET_OUTFIT',outfitKey:id});if(result.ok){assets.setOutfit(id);paintThumbs();syncWorld();}});if(choiceRevision===styleRevision){ui.outfitPending=null;paintThumbs();}if(!loaded.ok&&!loaded.stale)toast('这套衣服还没载入，先穿着现在这套，稍后再试。',true);break;}
  case 'choose-avatar':{
   if(ui.panel!=='profile')break;const a=assets.avatars.avatars?.[id];if(!a)break;const loaded=await avatarLoader.select(()=>assets.loadAvatar(id,{retry:true}),()=>dispatch({type:'SET_AVATAR',avatarKey:id}));if(!loaded.ok&&!loaded.stale)toast('这个角色还没加载好，先陪现在的朋友待一会儿，再试一次。',true);break;
  }
  case 'daily-claim':dispatch({type:'DAILY_CLAIM'});break;
  case 'demo-crystals':dispatch({type:'DEMO_CRYSTALS'});break;
  case 'reload-from-disk':allowNavigation=true;window.location.reload();break;
  case 'new-after-corrupt':{
   if(temporary){toast(temporaryMessage,true);return;}
   const archived=archiveDamaged(storage);if(!archived.ok){toast(archived.message,true,5000);return;}blocked=false;state=createState(Date.now(),uid());document.querySelector('.storage-block')?.remove();storageNote('已保留损坏副本，开始一座新的本地花园。');dirty=true;scheduleSave();render();break;
  }
  case 'temporary-start':temporary=true;blocked=false;document.querySelector('.storage-block')?.remove();storageNote('临时体验模式：当前进度不能可靠保存，请勿关闭页面。');render();break;
 }
}
// Keep the editing input focused until native click activates a tray button. Otherwise
// pointerdown blur changes the keyboard layout before pointerup and the first tap misses.
// Do not submit on pointerdown: drag-away/cancel and keyboard activation stay native.
shell.addEventListener('pointerdown',event=>{
 if(event.target?.id!=='world')scene?.cancelGrowthTap?.();
 const growing=growthTarget(event);if(growing){walletTap.cancelPending();walletPointers.clear();growthPointers.add(event.pointerId);growthTap.handlePointerDown(event,growing);return;}growthTap.cancelPending();growthPointers.clear();
 const wallet=event.target?.closest?.('[data-action="coins"]');if(wallet?.dataset?.action==='coins'){walletPointers.add(event.pointerId);walletTap.handlePointerDown(event);return;}walletTap.cancelPending();walletPointers.clear();
 const seedButton=event.target?.closest?.('[data-seed-control]');if(seedButton)purchaseIntent.down(event,seedButton);
 if(!['create','blueprint-create'].includes(ui.panel)||!['idea-input','building-idea-input'].includes(document.activeElement?.id)||event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;
 const button=event.target.closest('button[data-action]');if(button&&!button.disabled&&button.closest('#tray'))event.preventDefault();
},{capture:true});
shell.addEventListener('pointermove',event=>{if(growthPointers.has(event.pointerId))growthTap.handlePointerMove(event);if(walletPointers.has(event.pointerId))walletTap.handlePointerMove(event);});
shell.addEventListener('pointerup',event=>{if(!event)return;if(growthPointers.has(event.pointerId)){growthPointers.delete(event.pointerId);growthTap.handlePointerUp(event,growthTarget(event));return;}if(!walletPointers.has(event.pointerId))return;walletPointers.delete(event.pointerId);const wallet=event.target?.closest?.('[data-action="coins"]');if(wallet?.dataset?.action==='coins')walletTap.handlePointerUp(event);else walletTap.cancelPending();});
shell.addEventListener('pointercancel',event=>{growthPointers.delete(event.pointerId);growthTap.handlePointerCancel(event);walletPointers.delete(event.pointerId);walletTap.handlePointerCancel(event);purchaseIntent.cancel(event);});
window.addEventListener('pointerup',event=>{if(growthPointers.has(event.pointerId)){growthPointers.delete(event.pointerId);growthTap.cancelPending();}if(walletPointers.has(event.pointerId)){walletPointers.delete(event.pointerId);walletTap.cancelPending();}});
window.addEventListener('pointercancel',event=>{if(growthPointers.has(event.pointerId)){growthPointers.delete(event.pointerId);growthTap.cancelPending();}if(walletPointers.has(event.pointerId)){walletPointers.delete(event.pointerId);walletTap.cancelPending();}});
shell.addEventListener('dblclick',event=>{if(growthTarget(event)){growthTap.handleDoubleClick(event);return;}if(event.target?.closest?.('[data-action="coins"]')?.dataset?.action==='coins')walletTap.handleDoubleClick(event);});
shell.addEventListener('click',event=>{const growing=growthTarget(event);if(growing){growthTap.handleClick(event,growing);return;}const button=event.target.closest('[data-action]');if(!button||button.disabled)return;if(button.dataset.action==='coins'){walletTap.handleClick(event);return;}if(button.dataset.seedControl&&!purchaseIntent.accept(event,button,performance.now()))return;purchaseActivation=button.dataset.action==='buy-seed'&&event.detail!==0?event:null;onAction(button.dataset.action,button.dataset.id,button).catch(error=>{console.error('Garden action failed',error);toast('操作没有完成，请再试一次。你的已有进度仍保留。',true);}).finally(()=>{purchaseActivation=null;});});
shell.addEventListener('change',event=>{if(event.target.id!=='creation-photo-input')return;const file=event.target.files?.[0],ticket=creationPhotoPick;creationPhotoPick=null;event.target.value='';if(!ticket||blocked||cloudTravel.busy||!['create','blueprint-create'].includes(ui.panel))return;creationPhoto.select(file,ticket);});
shell.addEventListener('submit',event=>{const building=event.target.id==='building-idea-form';if(!building&&event.target.id!=='idea-form')return;event.preventDefault();if(blocked||cloudTravel.busy)return;const c=building?ui.blueprintCreation:ui.creation;c.idea=new FormData(event.target).get('idea').toString().trim();audio.unlock();if(building)submitBlueprint();else submitCreation();});
shell.addEventListener('input',event=>{if(blocked||cloudTravel.busy)return;const building=event.target.id==='building-idea-input';if(!building&&event.target.id!=='idea-input')return;const c=building?ui.blueprintCreation:ui.creation,hadResult=!!(c.error||c.reuseId);c.idea=event.target.value;c.error='';c.reuseId=null;if(hadResult){const caret=event.target.selectionStart,id=event.target.id;render();const input=$(id);input?.focus();input?.setSelectionRange?.(caret,caret);}});
function updateKeyboardClearance(){const inset=['idea-input','building-idea-input'].includes(document.activeElement?.id)?keyboardInset(window.innerHeight,window.visualViewport):0;shell.style.setProperty('--keyboard-inset',`${inset}px`);requestAnimationFrame(measureOverlay);}
window.visualViewport?.addEventListener('resize',updateKeyboardClearance);window.visualViewport?.addEventListener('scroll',updateKeyboardClearance);shell.addEventListener('focusin',()=>{scene?.cancelUncommittedTouch?.();updateKeyboardClearance();});shell.addEventListener('focusout',()=>setTimeout(updateKeyboardClearance,0));
window.addEventListener('keydown',event=>{growthTap.cancelPending();growthPointers.clear();scene?.cancelGrowthTap?.();walletTap.cancelPending();walletPointers.clear();purchaseIntent.clear();if(event.key==='Escape'){if(cloudTravel.busy){cancelTravel();return;}if(ui.panel)closePanel();else if(ui.mode){ownerActivity();ui.mode=null;ui.editing=false;ui.selection=null;render();}else{clearFriendSession();ui.selection=null;render();}}});
window.addEventListener('blur',()=>{cancelTravel();pageFocused=false;ownerActivity();scene?.setActivityAllowed?.(false);scene?.setSceneActive?.(false);});window.addEventListener('focus',()=>{pageFocused=true;ownerActivity();scene?.setActivityAllowed?.(activityAllowed());scene?.setSceneActive?.(ready&&!blocked&&!cloudTravel.busy&&pageFocused&&!document.hidden);});
window.addEventListener('beforeunload',event=>{if(!temporary&&!allowNavigation&&(dirty||saveBusy||saves.pending)){flushSave();event.preventDefault();event.returnValue='';}});
window.addEventListener('pageshow',()=>{cloudTravel.setHidden(!!document.hidden);coinReward.dispose();coinReward=makeCoinReward();render();});
window.addEventListener('pagehide',()=>{creationPhoto.reset();cancelTravel();cloudTravel.setHidden(true);photoView?.close();coinReward.dispose();ownerActivity();scene?.setActivityAllowed?.(false);scene?.setSceneActive?.(false);flushSave();audio.pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden)travelIntent++;cloudTravel.setHidden(!!document.hidden);audio.setHidden?.(document.hidden);ownerActivity();scene?.setActivityAllowed?.(activityAllowed());scene?.setSceneActive?.(ready&&!blocked&&!cloudTravel.busy&&pageFocused&&!document.hidden);if(document.hidden){flushSave();audio.pause();}else{render();syncWorld();}});
window.addEventListener('error',()=>storageNote('页面遇到了一点问题。先不要清除浏览器资料，刷新前请确认进度已经保存。'));
function refreshConstructionView(){
 const time=Math.max(Date.now(),state.lastSeenAt),works=[...state.tiles,...state.edges,...(state.buildings??[])].filter(item=>Object.hasOwn(item,'startedAt')),ids=new Set(works.map(item=>item.id));let readinessChanged=false,selectedChanged=false;
 for(const item of works){const built=isBuilt(item,time),previous=constructionReadiness.get(item.id);if(previous!==built)readinessChanged=true;if((ui.selection?.id===item.id&&(!built||previous===false))||(ui.selection?.kind==='tile'&&['fence','wall'].includes(item.kind)&&item.tileId===ui.selection.id&&previous===false&&built))selectedChanged=true;constructionReadiness.set(item.id,built);}
 for(const id of constructionReadiness.keys())if(!ids.has(id))constructionReadiness.delete(id);
 const selectedPlant=ui.selection?.kind==='plant'?currentWorld().plants.find(p=>p.id===ui.selection.id):null;if(selectedPlantReadiness?.id===selectedPlant?.id&&selectedPlant&&selectedPlantReadiness.ready!==isMature(selectedPlant,time))selectedChanged=true;
 if(readinessChanged&&!ui.visitId&&!ui.activePlantGesture)syncWorld();updateNavigationHint();
 if(selectedChanged&&!ui.visitId&&!ui.panel&&!ui.activePlantGesture){const html=renderContext(state,ui,currentWorld());$('context').innerHTML=html;$('context').hidden=!html;rememberContextMaturity();paintThumbs();requestAnimationFrame(measureOverlay);}
}
async function start(){
 scene=createScene($('world'),{assets,onTap:handleTarget,onGrowthSkip:handleGrowthSkip,onGesture:()=>audio.unlock(),onInteraction:handlePlantControl,onExhibitInteraction:handleExhibitControl,onApproach:handleApproach,onNavigationStatus:({blocked:stuck})=>{navigationStuck=stuck;updateNavigationHint();}});render();
 const requiredArtKeys=['radish',...state.plants.map(p=>getVariety(state,p.varietyId)?.artKey).filter(Boolean),...(state.buildings??[]).map(b=>getBlueprint(state,b.blueprintId)?.artKey).filter(Boolean)];
 const result=await assets.load({requiredArtKeys,avatarKey:PLAYER_AVATAR,outfitKey:playerOutfit(state)});reconcilePlayerStyle();while(true){const pending=stylePromise;await pending;if(pending===stylePromise)break;}ready=true;render();
 const warm=()=>assets.warmSecondary().catch(()=>{});if(window.requestIdleCallback)window.requestIdleCallback(warm,{timeout:1200});else setTimeout(warm,600);
 if(!result.plants)storageNote((result.partial?'有部分植物或建筑图片暂时没有载入':'花园图片暂时没有载入')+'，请保持网络并刷新。已保存的游戏进度不受影响。');
 else if(!result.avatar)storageNote('角色图片暂时没有载入，请保持网络并刷新。已保存的游戏进度不受影响。');
 $('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,460);
 if(blocked){const overlay=document.createElement('div');overlay.className='storage-block';overlay.innerHTML=`<div><h2>先照顾一下旧进度</h2><p>${esc(loaded.message)}</p><p>新建前会把损坏资料另存为恢复副本，不会悄悄丢弃。</p><div class="button-row"><button class="primary" data-action="new-after-corrupt" ${temporary?'disabled':''}>保留副本并新建</button></div><button class="link-button full" data-action="temporary-start">不覆盖旧存档，临时体验</button></div>`;shell.append(overlay);}
 else if(temporary)storageNote(temporaryMessage);
 else if(loaded.status==='recovered')storageNote(loaded.message);
 else if(state.plantedCount===0&&!(state.buildings??[]).length){ui.selection={kind:'tile',id:'tile-0-0'};render();}
 // Once per second, reveal elapsed crops without spending, polling services, or forcing travel.
 setInterval(()=>{const second=Math.floor(Date.now()/1000);if(second===lastProgressSecond)return;lastProgressSecond=second;refreshConstructionView();let changed=false;
  for(const p of state.plants)if(isMature(p,Date.now())&&!state.discovered.includes(p.varietyId)){const r=reduce(state,{type:'REVEAL',plantId:p.id});if(r.ok&&r.state!==state){state=r.state;changed=true;}}
  if(changed){dirty=true;scheduleSave();syncWorld();if(!ui.visitId){audio.play('crystal');toast('新居民长大啦，轻碰它，看看有什么小脾气。',false,3500);}}
  const selectedPlant=ui.selection?.kind==='plant'?currentWorld().plants.find(p=>p.id===ui.selection.id):null;
  if(ui.selection&&!ui.panel&&!ui.activePlantGesture&&(changed||(selectedPlant&&!isMature(selectedPlant,Date.now())))) {const html=renderContext(state,ui,currentWorld());$('context').innerHTML=html;$('context').hidden=!html;rememberContextMaturity();paintThumbs();requestAnimationFrame(measureOverlay);}
 },1000);
}
start().catch(error=>{console.error('Garden startup failed',error);$('loading').hidden=true;storageNote('花园还没有成功打开。你的旧进度不会被覆盖，可以刷新重试。');});
