import {createHash} from 'node:crypto';
import {MinimalAuthority} from '../../src/minimal/authority.ts';
import type {CanonicalFarm,MinimalRepository,MinimalTransaction,MinimalTable,MinimalRows} from '../../src/minimal/cloud-contract.ts';
export const NOW=1793000000000;
export const ALICE=`uid_${'a'.repeat(64)}`,BOB=`uid_${'b'.repeat(64)}`,EVE=`uid_${'e'.repeat(64)}`;
export class BoardingMemoryRepository implements MinimalRepository{
 rows=new Map<string,unknown>();private tail=Promise.resolve();failWrites=false;
 transaction<T>(work:(tx:MinimalTransaction)=>Promise<T>):Promise<T>{const run=this.tail.then(async()=>{const next=structuredClone(this.rows);const tx:MinimalTransaction={get:async<K extends MinimalTable>(table:K,key:string)=>(structuredClone(next.get(`${table}:${key}`))??null) as MinimalRows[K]|null,put:async(table,key,value)=>{if(this.failWrites)throw new Error('Injected failure');next.set(`${table}:${key}`,structuredClone(value));},listOpenOffers:async(now,after,limit)=>[...next].filter(([key])=>key.startsWith('offers:')).map(([,value])=>value as MinimalRows['offers']).filter(o=>o.status==='open'&&o.expiresAt>now&&(!after||o.offerId>after)).slice(0,limit)};const result=await work(tx);this.rows=next;return result;});this.tail=run.then(()=>{},()=>{});return run;}
 async change(actor:string,change:(f:CanonicalFarm)=>void){await this.transaction(async tx=>{const f=(await tx.get('farms',actor))!;change(f);await tx.put('farms',actor,f);});}
}
export async function boardingFixture(){const repo=new BoardingMemoryRepository();let now=NOW,id=0,req=0;const options={clock:()=>now,newId:()=>`boarding_${++id}`,fingerprint:async(value:string)=>createHash('sha256').update(value).digest('hex')};const authority=new MinimalAuthority(repo,options);
 for(const actor of [ALICE,BOB,EVE]){await authority.bootstrap(actor,{requestId:'new',mode:'new'});await repo.transaction(async tx=>{await tx.put('profiles',actor,{uid:actor,handle:actor===ALICE?'Alice':actor===BOB?'Bob':'Eve',createdAt:NOW,ownerBound:false});});await repo.change(actor,f=>{f.state.welcomeClaimed=true;f.state.coins=100;f.state.animals=[{id:`${f.farmId}:parent`,name:actor===ALICE?'妈妈':'爸爸',species:'cow',sex:actor===ALICE?'female':'male',size:'normal',rarity:'gold',position:{x:2,z:2},activity:'idle',energy:80,bond:30,bornAt:NOW-500_000,activityUntil:NOW+1_000_000}];f.assetProvenance[f.state.animals[0].id]='server-created';});}
 const farm=async(actor=ALICE)=>(await authority.get(actor)).farm!;
 const send=async(command:unknown,actor=ALICE)=>authority.boarding(actor,{requestId:`request_${++req}`,expectedRevision:(await farm(actor)).revision,command});
 const invite=async()=>send({type:'invite',targetUid:BOB,animalId:(await farm()).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'});
 const accept=async(invitationId:string,revision:number)=>send({type:'accept',invitationId,invitationRevision:revision,animalId:(await farm(BOB)).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'},BOB);
 return {repo,authority,options,farm,send,invite,accept,setNow:(v:number)=>{now=v;}};
}
