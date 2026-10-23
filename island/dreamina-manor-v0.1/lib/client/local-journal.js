import {RECOVERY_COUNT,RECOVERY_COMMITMENT,RECOVERY_OPERATION_ID,recoveryPayload,recoveryDigest} from '../game/journal-recovery.js';
import{constructionView,constructionSignature}from'../game/construction.js';
import {createActionQueue as createLegacyQueue} from './action-queue.js';
import {applyLocalOperation,planLocalOperation,operationResourceKeys,LOCAL_COMMANDS} from '../game/local-operations.js';
import {projectedPosition} from '../game/state.js';
const clone=x=>structuredClone(x),same=(a,b)=>a?.kind===b?.kind&&a?.cell?.x===b?.cell?.x&&a?.cell?.z===b?.cell?.z;
const wire=e=>{const {motion,...op}=e.op;return op;};
/** Durable own-action reducer. ACKs remove a prefix; they never replace later projection.
 * @param {any} options
 */
export function createLocalJournal({uid,sessionId,storage=globalThis.localStorage,now=()=>Date.now(),newId=()=>crypto.randomUUID(),onChange=()=>{},onLocalComplete=(..._args)=>{},onConfirmed=(..._args)=>{},onError=(..._args)=>{}}={}){
 const key=`manor-next:journal-v7:${uid}:${sessionId}`,saved=JSON.parse(storage?.getItem(key)??'null');let entries=Array.isArray(saved)?saved:(saved?.entries??[]),authority=saved?.authority??null,running=false,retryAfter=0,lastPosition=null,buildSignature='';
 const backupKey=`manor-next:journal-backup-v1:${uid}:${sessionId}`;let recovery=null,recoveryChecking=entries.length>=RECOVERY_COUNT;
 // Freeze the source before the first GET can reconcile a newer cloud snapshot.
 const originalRaw=storage?.getItem(key),originalSaved=saved;
 if(entries.length>=RECOVERY_COUNT&&originalRaw&&!storage?.getItem(backupKey))storage?.setItem(backupKey,originalRaw);
 const recoveryReady=(async()=>{
  const candidates=[];if(saved?.recovery)candidates.push(saved.recovery);
  for(const source of [originalSaved,(()=>{try{return JSON.parse(storage?.getItem(backupKey)??'null');}catch{return null;}})()])if(source?.authority?.game&&source.entries?.length>=RECOVERY_COUNT&&source.entries.slice(0,RECOVERY_COUNT).every(e=>e.localDone&&e.op))candidates.push(recoveryPayload(uid,source));
  for(const candidate of candidates)if(await recoveryDigest(candidate)===RECOVERY_COMMITMENT){recovery=candidate;save();break;}
  recoveryChecking=false;
 })();
 const legacy=createLegacyQueue({uid,sessionId,storage,now,onChange:()=>emit(),onLocalComplete,onConfirmed,onError});
 const save=()=>storage?.setItem(key,JSON.stringify({entries,authority,...(recovery?{recovery}:{})}));
 function base(){const old=legacy.view();return legacy.pending&&old?old:authority;}
 function view(){const source=base();if(!source)return null;const data=clone(source);let g=data.game;const dirty=new Set();if(recovery)g.position=clone(recovery.base.position);
  for(const e of entries){if(e.cancelled)continue;
   if(e.localDone&&e.op){try{const r=applyLocalOperation(g,e.op,{approvedLegacyHousing:!!recovery&&recovery.operations.some(op=>op.id===e.id)});g=r.state;if(r.receipt.itemId)dirty.add(r.receipt.itemId);if(r.receipt.jobId)dirty.add(`${e.id}-product`);}catch{/* Keep unresolved branch in the journal; authority decides its outcome. */}}
   else if(e.command.type==='begin-work'&&['plant','fish'].includes(e.command.action)){const stock=e.command.action==='plant'?'seeds':'baits';g[stock][e.command.tier-1]=Math.max(0,g[stock][e.command.tier-1]-1);}
  }
  if(recovery&&entries.every(e=>recovery.operations.some(op=>op.id===e.id)))g.position=clone(source.game.position);
  for(const item of g.items)if(dirty.has(item.id)||entries.some(e=>e.command.itemId===item.id))item.syncPending=true;
  g.localTargets=entries.filter(e=>!e.localDone&&!e.cancelled&&e.command.target).map(e=>e.command.target);g.canClaimEmergency=g.coins<8&&g.seeds.every(n=>n===0)&&g.jobs.length===0;
  g=constructionView(g,now());data.game=g;if(data.island?.ownerUid===uid)data.island=g;else if(data.island)data.island=constructionView(data.island,now());return data;
 }
 function emit(){save();onChange();}
 function dependencies(command){const keys=new Set(operationResourceKeys(command));const ids=[];for(const e of entries){if(e.cancelled)continue;if(operationResourceKeys(e.command).some(k=>keys.has(k))||command.itemId===`${e.id}-product`||e.product?.id===command.itemId)ids.push(e.id);}return ids.slice(-24);}
 function startNext(){if(legacy.pending||entries.some(e=>e.op?.motion&&!e.localDone))return;const e=entries.find(e=>!e.localDone&&!e.cancelled);if(!e||!authority)return;const g=view().game;if(['plant','fish'].includes(e.command.action))g[e.command.action==='plant'?'seeds':'baits'][e.command.tier-1]++;
  if(lastPosition)g.position=clone(lastPosition);
  try{e.op=planLocalOperation(g,e.command,{id:e.id,now:now(),dependsOn:e.dependencies});e.local=e.op.motion??null;if(!e.op.motion){e.localDone=true;onLocalComplete(e);}emit();}catch(error){reject(e.id,error.message);}
 }
 function enqueue(command,meta={}){if(recoveryChecking||recovery)throw new Error('正在恢复之前的记录，请稍等一下');if(command.type==='move'&&authority?.island?.ownerUid!==uid)return legacy.enqueue(command,meta);if(!authority)throw new Error('还没连上庄园');if(!LOCAL_COMMANDS.has(command.type))throw new Error('这次需要连上庄园');
  if((command.type==='construct'&&command.kind==='tank'||command.type==='build-tank')&&entries.some(e=>e.op?.motion&&!e.localDone))throw new Error('等走到位置再建鱼缸吧');
  const duplicate=entries.find(e=>!e.localDone&&e.command.type==='begin-work'&&e.command.action===command.action&&same(e.command.target,command.target));if(duplicate)return duplicate;
  const g=view().game;const planned=planLocalOperation({...g,pending:null},command,{id:'validate-operation',now:now()});if(!planned.motion)applyLocalOperation(g,planned);
  const job=command.action==='harvest'?g.jobs.find(j=>same(j.target,command.target)):null;
  const e={id:newId(),command:clone(command),meta:clone(meta),dependencies:dependencies(command),op:null,local:null,localDone:false,...(job?{jobId:job.id,product:clone(job.product)}:{})};
  if(!planned.motion){e.op=planLocalOperation(g,command,{id:e.id,now:now(),dependsOn:e.dependencies});e.localDone=true;e.localReceipt=applyLocalOperation(g,e.op).receipt;}
  entries.push(e);if(e.localDone&&(command.type==='construct'&&command.kind==='tank'||command.type==='build-tank'))lastPosition=clone(applyLocalOperation(g,e.op).state.position);try{emit();}catch{entries=entries.filter(x=>x!==e);throw new Error('本机空间不足，这次没有执行，请清理后再试');}if(e.localDone)onLocalComplete(e);startNext();return e;
 }
 function tick(){legacy.tick();const stamp=constructionSignature(authority?.game??{},now())+'|'+constructionSignature(authority?.island??{},now())+'|'+entries.filter(e=>['construct','expand-land','build-dock','build-tank'].includes(e.command.type)&&e.op?.at+12000<=now()).map(e=>e.id).join(',');if(stamp!==buildSignature){buildSignature=stamp;emit();}const e=entries.find(e=>e.op?.motion&&!e.localDone);if(e&&now()>=e.op.at){e.localDone=true;lastPosition=clone(e.op.motion.pending.path.at(-1));emit();onLocalComplete(e);startNext();}else startNext();}
 function reject(id,message){const blocked=new Set([id]);for(const e of entries)if(e.dependencies.some(x=>blocked.has(x)))blocked.add(e.id);const failed=entries.filter(e=>blocked.has(e.id));entries=entries.filter(e=>!blocked.has(e.id));lastPosition=null;emit();onError(message,failed[0]);startNext();}
 function observe(data){if(!data?.game)return;
  const results=data.receipt?.type==='sync-local'?data.receipt.results:(data.game.localSync?.applied??[]).filter(r=>entries.some(e=>e.id===r.id));const hasResults=results.length>0;
  // A polling snapshot may already contain a submitted prefix but has no receipts.
  // Keep the last acknowledged base until its immutable batch body is reconciled.
  if(!authority||!entries.length||hasResults||(data.game.fishHousingVersion??0)>(authority.game.fishHousingVersion??0)||(data.operationId&&data.receipt?.type!=='sync-local')||(authority.game.pending&&!data.game.pending))authority=!authority||data.game.revision>=authority.game.revision?data:{...data,game:authority.game,island:data.island?.ownerUid===uid?authority.game:data.island};else authority={...data,game:authority.game,island:data.island?.ownerUid===uid?authority.game:data.island};
  if(hasResults){for(const result of results){const e=entries.find(x=>x.id===result.id);if(!e)continue;if(result.status==='rejected'){reject(result.id,result.message);}else {entries=entries.filter(x=>x!==e);onConfirmed(e,{...data,receipt:result});}}}
  if(recovery&&!entries.some(e=>recovery.operations.some(op=>op.id===e.id)))recovery=null;
  legacy.observe(data);emit();startNext();
 }
 async function pump(client){await recoveryReady;if(running||client.busy||client.hasUnconfirmed||client.paused||now()<retryAfter)return;
  if(legacy.pending||authority?.game.pending){await legacy.pump(client);return;}
  if(recovery){running=true;try{const data=await client.command({type:'recover-local-journal',base:recovery.base,operations:recovery.operations},undefined,RECOVERY_OPERATION_ID);if(data)observe(data);}catch(error){retryAfter=now()+10000;onError(error.message);}finally{running=false;}return;}
  const batch=[];for(const e of entries){if(!e.localDone||!e.op)break;batch.push(wire(e));if(batch.length>=24)break;}if(!batch.length)return;
  running=true;try{const data=await client.command({type:'sync-local',operations:batch},undefined,`batch-${batch[0].id}`);if(data)observe(data);}catch(error){retryAfter=now()+2500;if(!client.hasUnconfirmed&&!['BUSY','WORK_IN_PROGRESS'].includes(error.code))onError(error.message);}finally{running=false;}
 }
 return {enqueue,tick,observe,pump,view,entries:()=>entries,serialize:()=>clone(entries),motion:()=>{if(authority?.island?.ownerUid!==uid){const moves=legacy.entries().filter(e=>e.command.type==='move'&&e.meta?.islandUid===authority?.island?.ownerUid&&e.local&&!e.cancelled);const active=moves.find(e=>!e.localDone),done=moves.at(-1);return active?.local??(done?{position:done.local.pending.path.at(-1),pending:null}:authority?.visit??null);}const e=entries.find(e=>e.op?.motion&&!e.localDone);return e?.op.motion??(lastPosition?{position:lastPosition,pending:null}:legacy.motion());},cancel(id){const e=entries.find(x=>x.id===id);if(!e||e.localDone||running)return false;entries=entries.filter(x=>x!==e);emit();startNext();return true;},get pending(){return entries.length>0||legacy.pending;},get running(){return running;},supports:type=>LOCAL_COMMANDS.has(type)};
}
