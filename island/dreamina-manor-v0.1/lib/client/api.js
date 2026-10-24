import {recoverableLocalBatch,confirmsEntireLocalBatch,recoverableSocialRequest,confirmsSocialRequest} from './pending-recovery.js';
import {createMonotonicClock} from './monotonic-clock.js';
export const completionOperationId=command=>['finish-work','finish-move','finish-social'].includes(command?.type)&&typeof command.intentId==='string'?`complete-${command.intentId}`:null;
import {connectionError} from './errors.js';
import {createSnapshotReconciler} from './snapshot-order.js';
export function createGameClient(uid,onState,onMessage){
 uid=String(uid).trim().toLowerCase();
 const sessionKey=`manor-next:session:${uid}`;let sessionId=sessionStorage.getItem(sessionKey);if(!sessionId){sessionId=crypto.randomUUID();sessionStorage.setItem(sessionKey,sessionId);}
 const pendingKey=`manor-next:pending:${uid}`;let stopped=false,busy=false,islandUid=uid;const timeline=createMonotonicClock();
 let navigationEpoch=0;let latest=0,currentView=null;const reconcile=createSnapshotReconciler();const receive=data=>{let merged=reconcile.accept(data);if(merged.island?.ownerUid!==islandUid&&currentView)merged={...merged,island:currentView.island,visit:currentView.visit,presence:currentView.presence,messages:currentView.messages};else currentView=merged;if(data.operationId)merged.operationPending=data.visit?.pending??data.game?.pending;latest=Math.max(latest,data.serverNow);timeline.observe(data.serverNow);onState(merged);return merged;};
 async function fetchIsland(target){const response=await fetch(`/api/game?uid=${encodeURIComponent(uid)}&island=${encodeURIComponent(target)}&session=${encodeURIComponent(sessionId)}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error?.message??'暂时没连上'),data.error);return data;}
 let failedSince=0;let activeRefresh=null,navigating=false,timer=null,failures=0,visibilityEpoch=0,resuming=null,needsPresence=false;
 const doc=globalThis.document,hidden=()=>!!doc?.hidden;
 const clearTimer=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const schedule=()=>{clearTimer();if(stopped||hidden()||navigating)return;timer=setTimeout(()=>{timer=null;refresh().catch(e=>onMessage(e.message));},Math.min(30000,2500*2**Math.min(failures,4)));};
 function refresh(){
  if(stopped||navigating||hidden())return Promise.resolve(null);
  if(activeRefresh)return activeRefresh;
  clearTimer();const epoch=navigationEpoch,visibleEpoch=visibilityEpoch,target=islandUid;
  activeRefresh=(async()=>{try{
   // Renew the current presence before reconciling an uncertain operation.
   // A failed GET never changes or retries the persisted transaction body.
   const data=await fetchIsland(target);
   if(stopped||hidden()||visibleEpoch!==visibilityEpoch||epoch!==navigationEpoch||target!==islandUid)return null;
   needsPresence=false;receive(data);
   const pending=localStorage.getItem(pendingKey);
   if(pending&&!busy){const original=JSON.parse(pending);if(original.sessionId===sessionId||recoverableLocalBatch(original,uid)||recoverableSocialRequest(original,uid))await command(null,original);}
   failures=0;failedSince=0;return data;
  }catch(e){failures++;failedSince||=Date.now();throw connectionError(e,!!localStorage.getItem(pendingKey));}})().finally(()=>{activeRefresh=null;schedule();});
  return activeRefresh;
 }
 function visibilityChanged(){
  visibilityEpoch++;needsPresence=true;clearTimer();if(hidden()||stopped)return;
  // An in-flight pre-hide GET renewed presence at its request time, not now.
  // Let it settle, discard its stale result, then issue a fresh foreground GET.
  if(!resuming)resuming=(async()=>{if(activeRefresh)await activeRefresh.catch(()=>{});if(!stopped&&!hidden())await refresh();})().catch(e=>onMessage(e.message)).finally(()=>{resuming=null;});
 }
 doc?.addEventListener('visibilitychange',visibilityChanged);

 async function command(command,existing,operationId){if(!existing&&command?.type==='chat')command={...command,islandUid:command.islandUid??islandUid};if(!existing&&needsPresence){if(resuming)await resuming;else await refresh();if(needsPresence)throw connectionError(new Error('presence unavailable'));}const timingStart=performance.now();if(busy)return null;busy=true;const saved=localStorage.getItem(pendingKey);let body=existing;if(body&&saved!==JSON.stringify(body)){busy=false;return null;}if(!body){if(saved){busy=false;throw new Error('上次操作正在确认，请先重试连接');}body={schemaVersion:1,uid,sessionId,opId:operationId??completionOperationId(command)??crypto.randomUUID(),command};}const recoveredBatch=!!existing&&body.sessionId!==sessionId&&recoverableLocalBatch(body,uid),boundedRecovery=body.command?.type==='recover-local-journal',recoveredSocial=!!existing&&body.sessionId!==sessionId&&recoverableSocialRequest(body,uid);const serialized=JSON.stringify(body);if(recoveredBatch&&!localStorage.getItem(`${pendingKey}:recovery-backup`))localStorage.setItem(`${pendingKey}:recovery-backup`,serialized);localStorage.setItem(pendingKey,serialized);const clearOwnPending=()=>{if(localStorage.getItem(pendingKey)===serialized)localStorage.removeItem(pendingKey);};try{const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok){if(response.status<500&&!recoveredBatch&&!boundedRecovery&&(!recoveredSocial||!['BUSY','STILL_APPROACHING','WORK_PENDING','OPERATION_CONFLICT'].includes(data.error?.code))){clearOwnPending();if(recoveredSocial)onMessage(data.error?.message??'这次没有收取，请重新选择',data.error);}throw Object.assign(new Error(data.error?.message??'暂时没连上'),data.error);}if((recoveredBatch||boundedRecovery)&&!confirmsEntireLocalBatch(body,data))throw Object.assign(new Error('之前的进度还没确认，请先保留此页面'),{code:'RECOVERY_UNCONFIRMED'});if(recoveredSocial&&!confirmsSocialRequest(body,data))throw Object.assign(new Error('刚才的收取还没确认，正在重试'),{code:'RECOVERY_UNCONFIRMED'});clearOwnPending();data.operationId=body.opId;const responseView=recoveredSocial&&currentView?{...data,island:islandUid===uid?data.game:currentView.island,visit:currentView.visit,presence:currentView.presence,messages:currentView.messages}:data;const accepted=receive(responseView);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('manor-timing',{detail:{phase:'server-ack',at:performance.now(),roundTripMs:performance.now()-timingStart}}));return accepted;}catch(e){if(localStorage.getItem(pendingKey))onMessage('正在确认刚才的操作…');throw connectionError(e,!!localStorage.getItem(pendingKey));}finally{busy=false;}}
 async function recover(){if(resuming)await resuming;return refresh();}
 schedule();
 return {uid,sessionId,clock:()=>timeline.now(),get failedSince(){return failedSince;},get busy(){return busy;},get navigating(){return navigating;},get paused(){return hidden();},get hasUnconfirmed(){return !!localStorage.getItem(pendingKey);},get islandUid(){return islandUid;},refresh,command,recover,async visit(next){
  if(navigating)throw new Error('正在前往，稍等一下');
  const target=String(next).trim().toLowerCase(),epoch=++navigationEpoch;
  navigating=true;
  try{
   // A heartbeat also updates presence. Finish the previous visit request before
   // starting navigation so an older response cannot move presence back home.
   if(activeRefresh)await activeRefresh.catch(()=>{});
   const data=await fetchIsland(target);
   if(epoch!==navigationEpoch)return null;
   islandUid=data.island?.ownerUid??target;receive(data);return data;
  }catch(e){throw connectionError(e);}finally{navigating=false;schedule();}
 },stop(){stopped=true;clearTimer();doc?.removeEventListener('visibilitychange',visibilityChanged);}};
}
