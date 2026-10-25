import {economicFingerprint,strictOrphanProjection,wireOperation,requestHash} from '../game/orphan-state.js';
export {economicFingerprint,strictOrphanProjection,wireOperation,requestHash} from '../game/orphan-state.js';
import {LOCAL_COMMANDS} from '../game/local-operations.js';
const VERSION=1,MAX_ENTRIES=1024;
const journalPrefix=uid=>`manor-next:journal-v7:${uid}:`;
const sidecarKey=(uid,session)=>`manor-next:orphan-proof-v1:${uid}:${session}`;
async function defaultQuery(body){const response=await fetch('/api/game/receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Receipt check unavailable');return response.json();}
/** Owns only sidecars. Does not command, delete, replay or mutate any source journal/pending. */
export function createOrphanReconciler({uid,sessionId,storage,getSnapshot,getEntries,query=defaultQuery,now=()=>Date.now(),onChange=()=>{}}){
 let running=null,stopped=false;const quiet=new Map(),attempts=new Map(),proofCache=new Map();
 function sources(){const result=[];for(let i=0;i<(storage?.length??0);i++){const key=storage.key(i);if(key?.startsWith(journalPrefix(uid))&&key!==journalPrefix(uid)+sessionId){const raw=storage.getItem(key);if(raw&&raw.length<=2000000)result.push({key,raw,sourceSession:key.slice(journalPrefix(uid).length)});}}return result.slice(0,32);}
 function guard(){const snapshot=getSnapshot(),game=snapshot?.game,entries=getEntries()??[],pending=storage.getItem(`manor-next:pending:${uid}`);if(!game||game.ownerUid!==uid||!Number.isSafeInteger(game.revision)||!Number.isSafeInteger(snapshot.serverNow??game.serverNow))throw new Error('No authority');const legacy=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(`manor-next:actions:${uid}:`)){const raw=storage.getItem(key);if(JSON.parse(raw??'[]').length)legacy.push([key,raw]);}}
  const serverNow=snapshot.serverNow??game.serverNow;return{game,serverNow,revision:game.revision,asset:economicFingerprint(game,serverNow),queue:JSON.stringify(entries),pending,legacy:JSON.stringify(legacy),idle:!entries.length&&!pending&&!legacy.length};}
 const sameGuard=(a,b)=>a.revision===b.revision&&a.asset===b.asset&&a.queue===b.queue&&a.pending===b.pending&&a.legacy===b.legacy;
 function quietSource(key,raw){const p=quiet.get(key);return !!p&&p.raw===raw;}
 async function reconcile(){
  for(const source of sources()){
   if(stopped)return;if(quietSource(source.key,source.raw))continue;let saved;try{saved=JSON.parse(source.raw);}catch{continue;}
   if(!Array.isArray(saved?.entries)||!saved.entries.length)continue;
   const digest=await requestHash(source.raw);if(stopped||storage.getItem(source.key)!==source.raw)continue;
   try{const remembered=JSON.parse(storage.getItem(sidecarKey(uid,source.sourceSession))??'null');if(remembered?.version===VERSION&&remembered.uid===uid&&remembered.sourceSession===source.sourceSession&&remembered.sourceHash===digest&&['equivalent','confirmed'].includes(remembered.status)){quiet.set(source.key,{raw:source.raw,status:remembered.status});onChange();continue;}}catch{}
   let before;try{before=guard();}catch{continue;}if(!before.idle||saved.authority?.game?.ownerUid!==uid||saved.authority.game.schemaVersion!==1||saved.authority.game.gameId!=='manor-next'||saved.recovery||saved.entries.length>MAX_ENTRIES)continue;
   const attemptKey=digest+'|'+before.asset,previous=attempts.get(source.key);if(previous?.key===attemptKey&&now()<previous.until)continue;
   attempts.set(source.key,{key:attemptKey,until:now()+60000});
   try{
    const operations=[];for(const e of saved.entries){if(!e.localDone||e.cancelled)throw new Error('Unfinished entry');const op=wireOperation(e);if(!LOCAL_COMMANDS.has(op.command?.type))throw new Error('Not a local operation');operations.push({id:e.id,hash:await requestHash(op)});}if(new Set(operations.map(o=>o.id)).size!==operations.length)throw new Error('Duplicate entries');
    let proofs=proofCache.get(digest);if(!proofs){proofs=new Map();proofCache.set(digest,proofs);}let checkedSnapshot=null;let missing=operations.filter(o=>!proofs.has(o.id)||(proofs.get(o.id).status==='unknown'&&now()-proofs.get(o.id).checkedAt>=60000)).slice(0,24);if(!missing.length&&!operations.every(o=>proofs.get(o.id)?.status==='confirmed'))missing=operations.slice(0,24);
    if(missing.length){const response=await query({uid,operations:missing});checkedSnapshot=response?.snapshotProof;if(response?.uid!==uid||!Array.isArray(response.results)||response.results.length!==missing.length)throw new Error('Incomplete proof');for(const o of missing){const results=response.results.filter(r=>r.id===o.id&&r.hash===o.hash);if(results.length!==1||!['confirmed','unknown','rejected'].includes(results[0].status))throw new Error('Wrong proof');proofs.set(o.id,{...results[0],checkedAt:now()});}}
    if(stopped||storage.getItem(source.key)!==source.raw||!sameGuard(before,guard()))continue;
    const allConfirmed=operations.every(o=>proofs.get(o.id)?.hash===o.hash&&proofs.get(o.id)?.status==='confirmed');let status=allConfirmed?'confirmed':null;
    if(!status&&checkedSnapshot?.revision===before.revision&&Number.isSafeInteger(checkedSnapshot.serverNow)&&checkedSnapshot.serverNow>=before.serverNow){const fingerprint=economicFingerprint(before.game,checkedSnapshot.serverNow);if(await requestHash(fingerprint)===checkedSnapshot.assetHash){const projection=strictOrphanProjection(saved,{uid,serverNow:checkedSnapshot.serverNow,proofs});if(projection.status==='projected'&&economicFingerprint(projection.game,checkedSnapshot.serverNow)===fingerprint)status='equivalent';}}
    if(status){const record={version:VERSION,uid,sourceSession:source.sourceSession,sourceHash:digest,status,operations,baseRevision:saved.authority.game.revision,authorityRevision:before.revision,authorityFingerprint:await requestHash(before.asset),checkedAt:now()};if(stopped||storage.getItem(source.key)!==source.raw||!sameGuard(before,guard()))continue;storage.setItem(sidecarKey(uid,source.sourceSession),JSON.stringify(record));quiet.set(source.key,{raw:source.raw,status});onChange();}
    else if(operations.some(o=>!proofs.has(o.id)))attempts.delete(source.key);
   }catch{/* Unknown is retained, never turned into a gameplay success. */}
  }
 }
 return{quietSource,check(){if(stopped)return Promise.resolve();if(!running)running=reconcile().catch(()=>{}).finally(()=>{running=null;});return running;},retry(){attempts.clear();proofCache.clear();return this.check();},stop(){stopped=true;quiet.clear();}};
}
