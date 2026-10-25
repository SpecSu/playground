import {applyLocalOperation,LOCAL_COMMANDS} from './local-operations.js';
import {assertGame} from './state.js';
import {constructionView} from './construction.js';
const MAX_ENTRIES=1024;
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const encode=x=>JSON.stringify(canonical(x));
export const requestHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
export function wireOperation(entry){if(!entry?.op||entry.id!==entry.op.id)throw new Error('Missing original operation');const {motion,...op}=entry.op;return op;}
const gameKeys=new Set('gameId schemaVersion fishHousingVersion ownerUid revision createdAt updatedAt profile coins seeds baits land docks tank jobs items discovered discoveredVariants position pending firstPlantStarted theftAvailableAt activity constructions localSync serverNow demo canClaimEmergency localTargets syncPending'.split(' '));
/** Only known schema, full rights; intentionally no compare-by-count shortcut. */
export function economicFingerprint(original,now){
 if(!original||original.schemaVersion!==1||original.demo||Object.keys(original).some(k=>!gameKeys.has(k))||!Number.isSafeInteger(now)||original.pending!==null)throw new Error('Unproven state');
 for(const key of ['items','jobs','land','docks','tank','seeds','baits','constructions'])if(!Array.isArray(original[key]))throw new Error('Incomplete state');
 for(const key of ['firstPlantStarted','theftAvailableAt','discovered','discoveredVariants'])if(original[key]===undefined)throw new Error('Incomplete rights');
 const s=constructionView(original,now);assertGame(s);const sync=s.localSync;
 if(typeof s.firstPlantStarted!=='boolean'||!Number.isSafeInteger(s.theftAvailableAt)||!s.discovered||!s.discoveredVariants)throw new Error('Incomplete rights');
 const product=p=>{if(!p||typeof p.id!=='string'||!Number.isInteger(p.tier)||p.tier<1||p.tier>5||!['normal','giant','gold'].includes(p.mutation)||!Number.isFinite(p.standardSize)||p.standardSize<=0||!Number.isSafeInteger(p.createdAt))throw new Error('Incomplete product');};
 for(const item of s.items)product(item);for(const job of s.jobs){if(typeof job.id!=='string'||!Number.isSafeInteger(job.startedAt)||!Number.isSafeInteger(job.readyAt)||!Number.isInteger(job.inputTier))throw new Error('Incomplete production');product(job.product);}
 if(!sync||Object.keys(sync).some(k=>!['seed','sequence','epoch','issuedAt','applied'].includes(k))||!Number.isSafeInteger(sync.seed)||!Number.isSafeInteger(sync.sequence)||typeof sync.epoch!=='string'||!Number.isSafeInteger(sync.issuedAt))throw new Error('Missing random rights');
 const sorted=(a,key)=>a.map(x=>structuredClone(x)).sort((x,y)=>String(key(x)).localeCompare(String(key(y))));
 const cells=a=>sorted(a,c=>`${c.x},${c.z}`);
 // Private job seed is omitted by publicGame; exact product and RNG epoch/sequence are preserved.
 const jobs=sorted(s.jobs.map(({seed,...j})=>j),j=>j.id);
 return encode({gameId:s.gameId,schemaVersion:s.schemaVersion,ownerUid:s.ownerUid,coins:s.coins,seeds:s.seeds,baits:s.baits,land:cells(s.land),docks:cells(s.docks),tank:cells(s.tank),items:sorted(s.items.map(({syncPending,...i})=>i),i=>i.id),jobs,constructions:sorted(s.constructions.map(c=>({...c,cells:cells(c.cells)})),c=>c.id),firstPlantStarted:s.firstPlantStarted,theftAvailableAt:s.theftAvailableAt,discovered:s.discovered,discoveredVariants:Object.fromEntries(Object.entries(s.discoveredVariants).map(([id,variants])=>{if(!Array.isArray(variants))throw new Error('Invalid discoveries');return[id,[...variants].sort()];})),localSync:{seed:sync.seed,sequence:sync.sequence,epoch:sync.epoch,issuedAt:sync.issuedAt}});
}
const commandFields={'harvest-batch':['targets'],construct:['kind','cells'],'buy-input':['kind','tier'],'emergency-seed':[],'begin-work':['action','target','tier','itemId','destination','catalogueVersion'],hold:['itemId'],'store-hand':[],sell:['itemId'],'expand-land':['cell'],'build-dock':['cell'],'build-tank':['cells'],profile:['name','avatar'],move:['point']};
/** Never use journal.view here: its presentation path may retain and skip failed operations. */
export function strictOrphanProjection(saved,{uid,serverNow,proofs=new Map()}={}){
 try{
  if(saved?.recovery||!saved?.authority?.game||saved.authority.game.ownerUid!==uid||!Array.isArray(saved.entries)||!saved.entries.length||saved.entries.length>MAX_ENTRIES)throw new Error('Incomplete journal');
  let game=structuredClone(saved.authority.game);economicFingerprint(game,serverNow);
  const applied=new Set((game.localSync.applied??[]).filter(r=>r.status==='confirmed').map(r=>r.id)),seen=new Set(),baseIds=new Set(applied);
  for(const entry of saved.entries){
   if(!entry.localDone||entry.cancelled||seen.has(entry.id)||baseIds.has(entry.id))throw new Error('Ambiguous prefix');
   const op=wireOperation(entry);if(typeof op.id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(op.id)||!LOCAL_COMMANDS.has(op.command?.type)||Object.keys(op.command).some(k=>k!=='type'&&!commandFields[op.command.type]?.includes(k))||Object.keys(op).some(k=>!['id','command','startedAt','at','dependsOn','sequence','epoch'].includes(k))||!Array.isArray(op.dependsOn)||op.dependsOn.length>24||op.dependsOn.some(id=>typeof id!=='string'||!applied.has(id))||!Number.isSafeInteger(op.startedAt)||op.startedAt<game.localSync.issuedAt||!Number.isSafeInteger(op.at)||op.at>serverNow)throw new Error('Unknown operation');
   if(op.command.type==='sell'&&proofs.get(entry.id)?.status!=='confirmed')throw new Error('Missing income proof');
   if(proofs.get(entry.id)?.status==='rejected')throw new Error('Rejected operation');
   const result=applyLocalOperation(game,op);game=result.state;applied.add(entry.id);seen.add(entry.id);
  }
  economicFingerprint(game,serverNow);return{status:'projected',game};
 }catch{return{status:'unknown'};}
}
