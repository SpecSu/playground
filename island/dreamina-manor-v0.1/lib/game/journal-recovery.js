/** One incident commitment. No player snapshot or credentials are shipped. Remove after recovery. */
export const RECOVERY_COUNT=194;
export const RECOVERY_COMMITMENT='c01569f0392a30ad77547db12b172a95d0f75d80df5fe024a7b42da5c8f56ecf';
export const RECOVERY_OPERATION_ID='journal-recovery-20261023-v1';
const copy=x=>structuredClone(x);
export function recoveryBase(game){
 const result={};for(const key of ['gameId','schemaVersion','ownerUid','revision','profile','coins','seeds','baits','land','docks','tank','jobs','items','discovered','discoveredVariants','position','pending','firstPlantStarted','theftAvailableAt','activity','constructions'])result[key]=copy(game[key]??(key==='constructions'?[]:null));
 result.jobs=result.jobs.map(({seed,...job})=>job);result.items=result.items.map(({syncPending,...item})=>item);
 const {seed,sequence,epoch,issuedAt}=game.localSync??{};result.localSync={seed,sequence,epoch,issuedAt};return result;
}
export function recoveryAssets(game){const {revision,position,profile,...assets}=recoveryBase(game);return assets;}
export function recoveryPayload(uid,saved){return {uid,base:recoveryBase(saved.authority.game),operations:saved.entries.slice(0,RECOVERY_COUNT).map(e=>{const {motion,...op}=e.op;return op;})};}
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function recoveryDigest(payload){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
