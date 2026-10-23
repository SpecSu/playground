import {applyCommand,projectedPosition} from '../game/state.js';
import {planFreeWalk} from '../game/movement.js';
import {pathDistance} from '../game/grid.js';
import {ECONOMY} from '../game/economy.js';
const same=(a,b)=>a?.kind===b?.kind&&a?.cell?.x===b?.cell?.x&&a?.cell?.z===b?.cell?.z;
/** A local presentation journal. Only server receipts create spendable assets.
 * @param {any} options
 */
export function createActionQueue({uid,sessionId,storage=globalThis.localStorage,initial,now=()=>Date.now(),newId=()=>crypto.randomUUID(),onChange=()=>{},onLocalComplete=(..._args)=>{},onConfirmed=(..._args)=>{},onError=(..._args)=>{}}={}){
 const key=`manor-next:actions:${uid}:${sessionId}`;let entries=initial?structuredClone(initial):JSON.parse(storage?.getItem(key)??'[]'),authority=null,running=false,lastPosition=null,retryAfter=0;
 const save=()=>{storage?.setItem(key,JSON.stringify(entries));onChange();};
 function view(){if(!authority)return null;const data=structuredClone(authority),g=data.game;g.localSows=[];g.localTargets=entries.filter(e=>!e.cancelled&&e.command.target).map(e=>e.command.target);
  for(const e of entries){if(e.cancelled)continue;const c=e.command;
   if((c.action==='plant'||c.action==='fish')&&!g.jobs.some(j=>e.server?.id&&j.product.sourceIntentId===e.server.id)&&!g.items.some(i=>e.server?.id&&i.sourceIntentId===e.server.id)){g[c.action==='plant'?'seeds':'baits'][c.tier-1]=Math.max(0,g[c.action==='plant'?'seeds':'baits'][c.tier-1]-1);if(e.localDone)g.localSows.push({id:e.id,target:c.target,action:c.action});}
   if(e.localDone&&c.action==='harvest'&&e.product){g.jobs=g.jobs.filter(j=>j.id!==e.jobId);if(!g.items.some(i=>i.id===e.product.id))g.items.push({...e.product,location:{kind:'bag'},syncPending:true});}
   if(e.localDone&&c.action==='display'){const item=g.items.find(i=>i.id===c.itemId);if(item){item.location=item.kind==='fish'?{kind:'tank'}:{kind:'land',cell:c.target.cell};item.syncPending=true;}}
   if(e.localDone&&c.action==='retrieve'){const item=g.items.find(i=>i.id===c.itemId);if(item){item.location={kind:'bag'};item.syncPending=true;}}
  }
  if(data.island?.ownerUid===uid)data.island=g;return data;
 }
 function startNext(){if(entries.some(e=>e.local&&!e.localDone&&!e.cancelled))return;
  const e=entries.find(e=>!e.localDone&&!e.cancelled);if(!e||!authority)return;const g=view().game,island=authority.island??g,from=lastPosition??projectedPosition(g,now());
  try{let p;if(e.command.type==='move'){const path=planFreeWalk(island,from,e.command.point);if(!path)throw new Error('那里暂时走不到');const arriveAt=now()+Math.ceil(pathDistance(path)*ECONOMY.walkSecondsPerCell*1000);p={id:e.id,action:'move',path,startedAt:now(),arriveAt,finishAt:arriveAt};}
   else {const working={...g,seeds:[...g.seeds],baits:[...g.baits],pending:null,position:from};if(e.command.action==='plant')working.seeds[e.command.tier-1]++;if(e.command.action==='fish')working.baits[e.command.tier-1]++;p=applyCommand(working,e.command,{now:Math.round(now()),newId:()=>e.id}).state.pending;}
   e.local={position:from,pending:p};save();
  }catch(error){fail(e.id,error.message);}
 }
 function enqueue(command,meta={}){if(!authority)throw new Error('还没连上庄园');
  const duplicate=entries.find(e=>!e.cancelled&&command.type==='begin-work'&&e.command.action===command.action&&same(e.command.target,command.target));if(duplicate)return duplicate;
  if(command.type==='begin-work'){
   const g=view().game;if(['plant','fish'].includes(command.action)&&g[command.action==='plant'?'seeds':'baits'][command.tier-1]<1)throw new Error(command.action==='plant'?'种子用完了':'鱼饵用完了');
   if(entries.some(e=>!e.cancelled&&same(e.command.target,command.target)))throw new Error('这块地已经选好了');
   applyCommand({...g,pending:null},command,{now:Math.round(now()),newId:()=> 'validate-local'});
  }
  // A new free walk replaces only another unfinished free walk, never work.
  if(command.type==='move')for(const e of [...entries])if(e.command.type==='move'&&!e.localDone)cancel(e.id);
  const g=view().game,job=command.action==='harvest'?g.jobs.find(j=>same(j.target,command.target)):null;
  const e={id:newId(),command:structuredClone(command),meta,local:null,localDone:false,server:null,cancelled:false,...(job?{jobId:job.id,product:structuredClone(job.product)}:{})};entries.push(e);save();startNext();return e;
 }
 function tick(){const e=entries.find(e=>e.local&&!e.localDone&&!e.cancelled);if(e&&now()>=e.local.pending.finishAt){e.localDone=true;lastPosition={...e.local.pending.path.at(-1)};save();onLocalComplete(e);startNext();}else startNext();}
 function cancel(id){const e=entries.find(e=>e.id===id);if(!e||e.localDone)return false;if(e.local)lastPosition=projectedPosition(e.local,now());if(e.server||e.sent)e.cancelled=true;else entries=entries.filter(x=>x!==e);save();startNext();return true;}
 function fail(id,message){const e=entries.find(e=>e.id===id);if(!e)return;entries=entries.filter(x=>x!==e);save();onError(message,e);startNext();}
 function observe(data){if(!data?.game)return;if(!authority||data.game.revision>=authority.game.revision)authority=data;
  const op=data.operationId;if(op){for(const e of [...entries]){if(op===`begin-${e.id}`){const intentId=data.receipt?.intentId,p=data.operationPending?.id===intentId?data.operationPending:data.visit?.pending?.id===intentId?data.visit.pending:data.game.pending?.id===intentId?data.game.pending:null;e.server=p??{id:intentId,finishAt:0};}
   else if(op===`complete-${e.server?.id}`||op===`cancel-${e.id}`){entries=entries.filter(x=>x!==e);if(data.receipt?.action==='interrupted')onError(data.receipt.message,e);else if(!e.cancelled)onConfirmed(e,data);}
  }}
  // Adopt an unfinished v5/server intent rather than replacing it with a new action.
  const p=authority.game.pending;const linked=p&&entries.find(e=>p.operationId===`begin-${e.id}`);if(linked)linked.server=p;
  // A polling snapshot can precede its begin ACK. Correlate the same operation,
  // and never adopt an unidentified legacy pending while an own begin is in flight.
  if(p&&(!p.sessionId||p.sessionId===sessionId)&&!entries.some(e=>e.server?.id===p.id)&&!entries.some(e=>e.sent&&!e.server)&&authority.island?.ownerUid===uid){
   const command={type:'begin-work',action:p.action,target:p.target,...(p.tier?{tier:p.tier}:{}),...(p.itemId?{itemId:p.itemId}:{}),...(p.destination?{destination:p.destination}:{})};const job=p.action==='harvest'?data.game.jobs.find(j=>j.id===p.jobId):null;
   entries.unshift({id:`adopt-${p.id}`,command,meta:{},local:{position:data.game.position,pending:p},localDone:now()>=p.finishAt,server:p,sent:true,cancelled:false,...(job?{jobId:job.id,product:structuredClone(job.product)}:{})});
  }
  if(!entries.length)lastPosition=null;save();startNext();
 }
 async function pump(client){if(running||!authority||client.busy||client.hasUnconfirmed||client.paused||now()<retryAfter)return;const e=entries[0];if(!e||!e.local)return;const other=authority.game.pending;const external=!e.server&&other&&other.operationId!==`begin-${e.id}`;if(external&&client.clock()<other.finishAt)return;running=true;
  try{if(external){const d=await client.command({type:'finish-work',intentId:other.id});if(d)observe(d);return;}if(!e.server){e.sent=true;save();const d=await client.command(e.command,undefined,`begin-${e.id}`);if(d)observe(d);}
   else if(e.cancelled){const d=await client.command({type:e.command.type==='move'?'cancel-social':'cancel-work',...(e.command.type==='move'?{}:{intentId:e.server.id})},undefined,`cancel-${e.id}`);if(d)observe(d);}
   else if(e.localDone&&client.clock()>=e.server.finishAt){const d=await client.command({type:e.command.type==='move'?'finish-move':'finish-work',intentId:e.server.id});if(d)observe(d);}
  }catch(error){if(['STILL_APPROACHING','BUSY','WORK_IN_PROGRESS','WORK_PENDING'].includes(error.code))retryAfter=now()+2500;else if(external&&error.code==='STALE_ACTION')retryAfter=now()+2500;else if(!client.hasUnconfirmed)fail(e.id,error.message);}finally{running=false;}
 }
 return {enqueue,tick,cancel,fail,observe,pump,view,entries:()=>entries,serialize:()=>structuredClone(entries),uncertain:()=>{},motion:()=>{const e=entries.find(e=>e.local&&!e.localDone&&!e.cancelled);return e?.local??(lastPosition?{position:lastPosition,pending:null}:null);},get pending(){return entries.length>0;},get running(){return running;}};
}
