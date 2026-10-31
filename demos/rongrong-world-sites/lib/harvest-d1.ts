import {settleEstate,type Profile} from '../src/v5/estate.ts';
import {HARVEST_RULES,harvestRun,harvestLocked,harvestPlan,transferHarvest,type HarvestCommand,type HarvestLedger,type HarvestReply,type HarvestShare} from '../src/v7/harvest.ts';
import {d1Transaction,D1Transaction,commandFingerprint} from './sites-d1-transaction.ts';
import {loadEstate,saveEstate} from './estate-d1.ts';
type ShareRow={owner:string;profile:'home'|'lab';run_id:string;token:string;opened:number;ledger:string};
type Receipt={fingerprint:string;result:HarvestReply};
const reject=(message:string):HarvestReply=>({accepted:false,message});
function view(row:ShareRow,p:Profile,device:string):HarvestShare{const open=row.opened===1&&harvestRun(p)===row.run_id;return {token:row.token,profile:row.profile,runId:row.run_id,open,available:open?harvestPlan(p,JSON.parse(row.ledger)).available:0,locked:harvestLocked(p),own:row.owner===device};}
function saveShare(tx:D1Transaction,row:ShareRow){tx.put('harvest_shares',{owner:row.owner,profile:row.profile,run_id:row.run_id},{token:row.token,opened:row.opened,ledger:row.ledger});}
async function used(tx:D1Transaction,device:string,role:string,day:string){return (await tx.first<{used:number}>('SELECT used FROM harvest_limits WHERE device=? AND role=? AND day=?',device,role,day))?.used??0;}
function token(){return Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');}
export class HarvestD1Store{
 private db:D1Database;constructor(db:D1Database){this.db=db;}
 async get(device:string,shareToken:string|undefined,now:number):Promise<HarvestReply>{
  if(!Number.isFinite(now))return reject('无效时钟');
  return d1Transaction(this.db,async tx=>{
   if(shareToken){
    if(!/^[a-f0-9]{48}$/.test(shareToken))return reject('采收分享凭据无效');
    const row=await tx.first<ShareRow>('SELECT * FROM harvest_shares WHERE token=?',shareToken);if(!row||!row.opened)return reject('分享已关闭或不存在');
    const owner=settleEstate(await loadEstate(tx,row.owner,now),now),profile=owner.profiles[row.profile];if(!profile||harvestRun(profile)!==row.run_id)return reject('这份分享已随庄园重置失效');
    saveEstate(tx,owner);return {accepted:true,message:'仅分享成熟普通产物；累计采收池最多10%，不足1份不取',share:view(row,profile,device)};
   }
   const self=settleEstate(await loadEstate(tx,device,now),now),profile=self.profiles[self.activeProfile]!;
   const row=await tx.first<ShareRow>('SELECT * FROM harvest_shares WHERE owner=? AND profile=? AND run_id=?',device,self.activeProfile,harvestRun(profile));saveEstate(tx,self);
   return {accepted:true,message:'需要主人明确开放，另一独立浏览器设备会话才可采收',...(row?{share:view(row,profile,device)}:{})};
  });
 }
 async command(device:string,command:HarvestCommand,now:number):Promise<HarvestReply>{
  if(!Number.isFinite(now))return reject('无效时钟');
  return d1Transaction(this.db,async tx=>{
   const fingerprint=commandFingerprint(command),old=await tx.first<{receipt:string}>('SELECT receipt FROM harvest_receipts WHERE device=? AND id=?',device,command.id);
   if(old){const receipt=JSON.parse(old.receipt) as Receipt;return receipt.fingerprint===fingerprint?{...receipt.result,duplicate:true}:reject('请求编号已用于另一条指令');}
   const result=['open','close','take'].includes(command.type)?await this.apply(tx,device,command,now):reject('采收指令无效');tx.put('harvest_receipts',{device,id:command.id},{receipt:JSON.stringify({fingerprint,result} satisfies Receipt)});return {...result,duplicate:false};
  });
 }
 private async apply(tx:D1Transaction,device:string,command:HarvestCommand,now:number):Promise<HarvestReply>{
  let self=await loadEstate(tx,device,now);if(command.type!=='take')self=settleEstate(self,now);
  const profile=command.profile??self.activeProfile;if(profile!=='home'&&profile!=='lab')return reject('档案无效');if(command.type==='take'&&profile!==self.activeProfile)return reject('只能向当前活动档案采收');const p=self.profiles[profile];if(!p)return reject('档案不存在');
  if(command.type==='open'||command.type==='close'){
   const run=harvestRun(p),existing=await tx.first<ShareRow>('SELECT * FROM harvest_shares WHERE owner=? AND profile=? AND run_id=?',device,profile,run);
   if(command.type==='close'){if(existing)saveShare(tx,{...existing,opened:0});saveEstate(tx,self);return {accepted:true,message:'已关闭分享，旧链接不可继续采收'};}
   if(harvestLocked(p))return reject('事件期间不能开放成熟产物');const ledger:HarvestLedger=existing?JSON.parse(existing.ledger):{};
   const row:ShareRow={owner:device,profile,run_id:run,token:existing?.opened?existing.token:token(),opened:1,ledger:JSON.stringify(ledger)};
   saveShare(tx,row);saveEstate(tx,self);return {accepted:true,message:'已开放普通成熟产物采收；仅同服务另一设备会话可用，可随时关闭',share:view(row,p,device)};
  }
  if(typeof command.token!=='string'||!/^[a-f0-9]{48}$/.test(command.token))return reject('采收分享凭据无效');
  const row=await tx.first<ShareRow>('SELECT * FROM harvest_shares WHERE token=?',command.token);if(!row||!row.opened)return reject('分享已关闭或不存在');if(row.owner===device)return reject('需要另一独立浏览器设备会话，不能采收自己的产物');
  const owner=settleEstate(await loadEstate(tx,row.owner,now),now),target=owner.profiles[row.profile];if(!target||harvestRun(target)!==row.run_id)return reject('这份分享已随庄园重置失效');if(row.profile!==self.activeProfile)return reject('自然档与演示档隔离，请切换到相同档案');
  const frozenIntro=p.tutorial==='choose'&&!p.guardian&&(!p.threat||p.threat.mode==='tutorial'&&p.threat.phase==='choosing');if(harvestLocked(target)||harvestLocked(p)&&!frozenIntro)return reject('任一方正在事件中，成熟产物暂时锁定');
  const day=new Date(now).toISOString().slice(0,10),visitorUsed=await used(tx,device,'visitor',day),ownerUsed=await used(tx,row.owner,'owner',day);
  if(visitorUsed>=HARVEST_RULES.visitorPerUtcDay)return reject('今日已采收1次，明天再来');if(ownerUsed>=HARVEST_RULES.ownerPerUtcDay)return reject('主人今日已被采收3次');
  const transfer=transferHarvest(target,p,JSON.parse(row.ledger),command.id);if(!transfer.accepted)return reject(transfer.message);
  owner.revision++;self.revision++;saveEstate(tx,owner);saveEstate(tx,self);row.ledger=JSON.stringify(transfer.ledger);saveShare(tx,row);
  tx.put('harvest_limits',{device,role:'visitor',day},{used:visitorUsed+1});tx.put('harvest_limits',{device:row.owner,role:'owner',day},{used:ownerUsed+1});
  return {accepted:true,message:transfer.message,received:transfer.received,share:view(row,target,device),visitorUsed:visitorUsed+1,ownerUsed:ownerUsed+1};
 }
}
