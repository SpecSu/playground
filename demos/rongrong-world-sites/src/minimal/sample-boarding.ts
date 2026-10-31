import {BOARDING_TERMS,type BoardingParent} from './boarding-contract.ts';
import type {SampleBoardingAdapter,SampleBoardingSnapshot} from './boarding-target.ts';
import {sampleFarm} from './sample-farms.ts';
export type DemoBoardingParent=BoardingParent&{nonTransferable:true};
export type DemoBoardingAdapter=SampleBoardingAdapter&{fastForwardDemo:(sampleId:string)=>Promise<SampleBoardingSnapshot>};
const clone=<T>(value:T):T=>structuredClone(value);
const parent=(a:BoardingParent):DemoBoardingParent=>({id:a.id,name:a.name,species:a.species,sex:a.sex,rarity:a.rarity??'white',nonTransferable:true});
export function sampleBoardingCandidates(sampleId:string,realmId:string):{visitor:DemoBoardingParent;hosts:DemoBoardingParent[]}{
 const animals=sampleFarm(sampleId,0).state.animals,first=animals[0];
 if(!first)throw new Error('DIY伙伴仅供互动展示，暂不支持寄养配对');
 const visitor:DemoBoardingParent={...parent(first),id:`demo:${encodeURIComponent(realmId)}:guest:${sampleId}`,name:`演示${first.name}`,sex:first.sex==='female'?'male':'female'};
 return {visitor,hosts:animals.filter(a=>a.species===visitor.species&&a.sex!==visitor.sex).map(parent)};
}
type Row={snapshot:SampleBoardingSnapshot;expiresAt?:number;virtualNow:number;success:boolean};
const rolledSuccess=(seed:string)=>{let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%100<35;};
/** One caller-owned realm, no global registry, browser storage, transport or production
 * service references. Every parent/result is display-only and non-transferable. */
export function createSampleBoardingAdapter({realmId,now=Date.now,outcome}:{realmId:string;now?:()=>number;outcome?:(seed:string)=>boolean}):DemoBoardingAdapter{
 if(!realmId||realmId.length>256)throw new Error('演示空间标识无效');
 const rows=new Map<string,Row>(),receipts=new Map<string,string>();
 const row=(sampleId:string)=>{sampleFarm(sampleId,0);let current=rows.get(sampleId);if(!current){current={snapshot:{mode:'sample',sampleId,nonTransferable:true,status:'idle',parents:[],demoEggs:0,demoCoins:0,message:'只用演示伙伴，不移动你真正的动物。'},virtualNow:0,success:false};rows.set(sampleId,current);}return current;};
 const clock=(r:Row)=>Math.max(now(),r.virtualNow);
 const settle=(r:Row)=>{const s=r.snapshot,t=clock(r);if(s.status==='pending'&&t>=r.expiresAt!){s.status='expired';s.message='演示邀请已到期，没有转移动物或奖励。';}else if(s.status==='active'&&t>=s.readyAt!){s.status=r.success?'completed':'failed';if(r.success){s.demoEggs++;s.demoCoins+=BOARDING_TERMS.helperCoins;s.message='演示完成：发起方得到演示蛋，帮手得到演示金币。';}else s.message='演示结束：这次没有产蛋，也没有奖励。';}return clone(s);};
 const request=(input:{sampleId:string;requestId:string},kind:string,payload:string)=>{if(!/^[\w:.-]{1,160}$/.test(input.requestId))throw new Error('演示请求标识无效');const key=input.requestId,fingerprint=`${input.sampleId}:${kind}:${payload}`,prior=receipts.get(key);if(prior&&prior!==fingerprint)throw new Error('同一演示请求不能改变内容');if(prior)return false;return ()=>receipts.set(key,fingerprint);};
 return {kind:'sample',
  async read(sampleId){return settle(row(sampleId));},
  async invite(input){const r=row(input.sampleId),c=sampleBoardingCandidates(input.sampleId,realmId),record=request(input,'invite',input.parentId);settle(r);if(!record)return clone(r.snapshot);if(input.parentId!==c.visitor.id)throw new Error('只能使用这个空间的演示伙伴');if(['pending','active'].includes(r.snapshot.status))throw new Error('先结束当前演示寄养');
   r.snapshot={...r.snapshot,status:'pending',parents:[clone(c.visitor)],readyAt:undefined,message:'演示邀请待确认，请模拟好友选择配对伙伴。'};r.expiresAt=clock(r)+BOARDING_TERMS.inviteMs;r.success=(outcome??rolledSuccess)(`${realmId}:${input.sampleId}:${input.requestId}`);record();return clone(r.snapshot);},
  async confirm(input){const r=row(input.sampleId),c=sampleBoardingCandidates(input.sampleId,realmId),record=request(input,'confirm',input.partnerId);settle(r);if(!record)return clone(r.snapshot);const host=c.hosts.find(a=>a.id===input.partnerId);if(!host)throw new Error('请选择同物种、异性的示例伙伴');if(r.snapshot.status!=='pending')throw new Error('演示邀请不在待确认状态');r.snapshot={...r.snapshot,status:'active',parents:[clone(c.visitor),clone(host)],readyAt:clock(r)+BOARDING_TERMS.stayMs,message:'演示寄养中 · 不会锁住或转移正式动物。'};record();return clone(r.snapshot);},
  async cancel(input){const r=row(input.sampleId),record=request(input,'cancel','');settle(r);if(!record)return clone(r.snapshot);if(!['pending','active'].includes(r.snapshot.status))throw new Error('这次演示已结束');r.snapshot.status='canceled';r.snapshot.message='演示已取消，没有转移动物、蛋或奖励。';record();return clone(r.snapshot);},
  async fastForwardDemo(sampleId){const r=row(sampleId);settle(r);if(r.snapshot.status==='pending')r.virtualNow=r.expiresAt!;else if(r.snapshot.status==='active')r.virtualNow=r.snapshot.readyAt!;return settle(r);},
 };
}
