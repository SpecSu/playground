import {upgradeFarm,type Farm} from '../src/model.ts';
import {restoreWool,createHerdEconomy} from '../src/v5/herd-economy.ts';
import {createEstate,commandEstate,settleEstate,estateSnapshot,type Estate,type EstateCommand,type EstateSnapshot} from '../src/v5/estate.ts';
import {d1Transaction,D1Transaction,commandFingerprint} from './sites-d1-transaction.ts';
type Receipt={accepted:boolean;message:string;fingerprint:string};
export type EstateD1Reply={accepted:boolean;message:string;duplicate:boolean;snapshot:EstateSnapshot};
export async function loadEstate(tx:D1Transaction,device:string,now:number):Promise<Estate>{
 if(!Number.isFinite(now))throw new Error('无效时钟');
 const row=await tx.first<{state:string}>('SELECT state FROM estates WHERE device=?',device);
 if(row){const state=JSON.parse(row.state) as Estate;if(state.version!==5||state.playerId!==device)throw new Error('不支持的庄园版本，原存档保留');return state;}
 // The previous Site used farm_states, not the local SQLite adapter's farms.
 // Migration only reads the old record. Neither it nor its receipts are changed.
 const original=await tx.first<{state:string}>('SELECT state FROM farm_states WHERE device=?',device);
 const legacy:Farm|undefined=original?upgradeFarm(JSON.parse(original.state)):undefined;
 if(legacy&&legacy.playerId!==device)throw new Error('旧农场身份不匹配，原存档保留');
 const state=createEstate(device,now,legacy);
 if(legacy){
  if(!Number.isSafeInteger(legacy.wool)||legacy.wool<0)throw new Error('旧库存数量无效，原存档保留');
  if(legacy.wool)state.profiles.home.economy=restoreWool(state.profiles.home.economy??createHerdEconomy(),[{id:'legacy-site-stored-wool',tier:'white',amount:legacy.wool,animalId:null,version:'legacy',source:'legacy-site-inventory'}]);
 }
 return state;
}
export function saveEstate(tx:D1Transaction,state:Estate){tx.put('estates',{device:state.playerId},{state:JSON.stringify(state)});}
export function cloudEstateSnapshot(state:Estate,now:number):EstateSnapshot{return {...estateSnapshot(state,now),storage:'cloud-d1'};}
export class EstateD1Store{
 private db:D1Database;constructor(db:D1Database){this.db=db;}
 async get(device:string,now:number):Promise<EstateSnapshot>{return d1Transaction(this.db,async tx=>{const state=settleEstate(await loadEstate(tx,device,now),now);saveEstate(tx,state);return cloudEstateSnapshot(state,now);});}
 async command(device:string,command:EstateCommand,now:number):Promise<EstateD1Reply>{
  return d1Transaction(this.db,async tx=>{
   const state=await loadEstate(tx,device,now),fingerprint=commandFingerprint(command);
   const old=await tx.first<{receipt:string}>('SELECT receipt FROM estate_commands WHERE device=? AND id=?',device,command.id);
   if(old){const receipt=JSON.parse(old.receipt) as Receipt;return {accepted:receipt.fingerprint===fingerprint?receipt.accepted:false,message:receipt.fingerprint===fingerprint?receipt.message:'请求编号已用于另一条指令',duplicate:receipt.fingerprint===fingerprint,snapshot:cloudEstateSnapshot(state,now)};}
   let result;try{result=commandEstate(state,command,now);}catch(error){if(error instanceof TypeError||error instanceof RangeError)result={state,accepted:false,message:'指令参数无效，原状态已保留'};else throw error;}
   const receipt:Receipt={accepted:result.accepted,message:result.message,fingerprint};
   saveEstate(tx,result.state);tx.put('estate_commands',{device,id:command.id},{receipt:JSON.stringify(receipt)});
   return {accepted:receipt.accepted,message:receipt.message,duplicate:false,snapshot:cloudEstateSnapshot(result.state,now)};
  });
 }
}
