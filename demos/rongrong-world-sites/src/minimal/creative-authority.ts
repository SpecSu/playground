import {projectCreativeObstacles,creativePlacementIssue} from './creative-obstacles.ts';
import {animalInteractionRadius,isSafeAnimalArrival} from './interaction-motion.ts';
import {createCreativeAnimal,bagCreativeAnimal,putCanonicalFarm,ownedCreativeAnimal} from './creative-lifecycle.ts';
import {canPlaceEgg,tileAt,nearShop,isWalkableTile,MINIMAL_RULES,type Point} from './model.ts';
import type {CanonicalFarm,MinimalErrorCode,MinimalResult,MinimalTransaction} from './cloud-contract.ts';
import {CREATIVE_CATALOG,approvedCreativeTemplate,creativeEggProgress,approvedCreativeAnimal,creativeModelReady,creativeTemplate,EMPTY_CREATIVE,type CreativeTemplate,type CreativeJob} from './creative-assets.ts';
import {offerRef,lockedAnimalId,type ExchangeRuntime} from './exchange-authority.ts';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(key=>allowed.includes(key));
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_:.-]{1,256}$/.test(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const point=(v:unknown):v is Point=>record(v)&&fields(v,['x','z'])&&Number.isInteger(v.x)&&Number.isInteger(v.z)&&(v.x as number)>=-3&&(v.x as number)<=6&&(v.z as number)>=-3&&(v.z as number)<=6;
export type CreativeCommand={type:'buy-egg'}|{type:'create';assetId:string;templateId:string;name:string;prompt:string}|{type:'claim';jobId:string}|{type:'hatch'|'pickup';assetId:string}|{type:'place';assetId:string;at:Point};
export type CreativeRequest={requestId:string;expectedRevision:number;command:CreativeCommand};
export function validCreativeRequest(input:unknown):input is CreativeRequest{
 if(!record(input)||!fields(input,['requestId','expectedRevision','command'])||!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision as number)<0||!record(input.command))return false;const c=input.command;
 if(c.type==='buy-egg')return fields(c,['type']);
 if(c.type==='create')return fields(c,['type','assetId','templateId','name','prompt'])&&id(c.assetId)&&id(c.templateId)&&text(c.name,24)&&text(c.prompt,280);
 if(c.type==='claim')return fields(c,['type','jobId'])&&id(c.jobId);
 if(c.type==='place')return fields(c,['type','assetId','at'])&&id(c.assetId)&&point(c.at);
 return ['hatch','pickup'].includes(c.type as string)&&fields(c,['type','assetId'])&&id(c.assetId);
}
/** Mock provider progression uses trusted clock/catalog only. No fake image/model
 * completion is inferred from elapsed time: unavailable model remains pending.
 * Future async provider callbacks must update a trusted catalog/job, not accept
 * a browser URL/status. A shipped sample is still a mock prompt-to-asset mapping. */
export function settleCreativeJobs(farm:CanonicalFarm,now:number,catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG):boolean{
 let changed=false;
 for(const job of farm.creative?.jobs??[]){
  if(job.status==='claimed'||job.status==='failed'||now<job.updatedAt)continue;
  const elapsed=now-job.createdAt,status:CreativeJob['status']=elapsed<700?'queued':elapsed<1800?'image-ready':creativeModelReady(creativeTemplate(catalog,job.templateId))?'ready':'model-pending';
  if(status!==job.status){job.status=status;job.updatedAt=now;changed=true;}
 }
 if(changed)farm.revision++;return changed;
}
export async function applyCreative(tx:MinimalTransaction,farm:CanonicalFarm,now:number,request:CreativeRequest,runtime:ExchangeRuntime):Promise<MinimalResult>{
 const c=request.command,catalog=runtime.catalog??CREATIVE_CATALOG,result=(code:MinimalErrorCode|'ok',extra?:Partial<MinimalResult>)=>runtime.result(farm,now,code,extra);
 if(farm.revision!==request.expectedRevision)return result('stale-farm');if(now<farm.state.updatedAt)return result('clock-regressed');
 if(farm.creative?.assets.some(a=>now<Math.max(a.createdAt,a.hatchedAt??0,a.egg?.incubation?.checkedAt??0))||farm.creative?.jobs.some(j=>now<j.updatedAt))return result('clock-regressed');
 const placementIssue=(state:typeof farm.state,at:Point,kind:'prop'|'custom-egg')=>creativePlacementIssue(state,at,kind,state.animals.filter(a=>a.id!==state.carriedAnimalId).map(a=>{const r=animalInteractionRadius(a,now,runtime.resources);return {position:a.position,radius:Number.isFinite(r)?r/2:0};}));
 farm.creative??=EMPTY_CREATIVE();let job:CreativeJob|undefined;
 const offer=farm.activeOfferId?await tx.get('offers',farm.activeOfferId):null;
 const locked=(assetId:string)=>!!offer&&offerRef(offer).id===assetId;
 if(c.type==='buy-egg'){
  const advanced=runtime.advance(farm,now,lockedAnimalId(offer));
  if(!nearShop(advanced)||advanced.carriedAnimalId)return result('model-rejected',{message:'先到蛋蛋小铺柜台前，放下手里的伙伴'});
  if(farm.state.coins<MINIMAL_RULES.eggCost)return result('model-rejected',{message:'金币不足，自定义蛋需要 30 金币'});
  // Keep receipts forever; only discard claimed display summaries with no live asset/escrow reference.
  const retainedJobs=farm.creative.jobs.filter(j=>j.status!=='claimed'||farm.creative!.assets.some(a=>a.jobId===j.id||a.id===j.assetId)||!!j.assetId&&locked(j.assetId));
  if(farm.creative.assets.length>=32||retainedJobs.length+farm.creative.assets.filter(a=>a.kind==='custom-egg'&&a.egg?.stage==='blank').length>=64)return result('capacity-full');
  farm.creative.jobs=retainedJobs;farm.state=advanced;farm.state.coins-=MINIMAL_RULES.eggCost;
  farm.creative.assets.push({id:runtime.freshId('ugc'),kind:'custom-egg',templateId:'',name:'自定义蛋',prompt:'',createdAt:now,jobId:'',origin:'mock',location:'bag',egg:{stage:'blank'}});
 }else if(c.type==='create'){
  const asset=farm.creative.assets.find(a=>a.id===c.assetId);if(!asset)return result('foreign-asset');if(locked(asset.id))return result('asset-locked');
  if(asset.kind!=='custom-egg'||asset.location!=='bag'||asset.egg?.stage!=='blank')return result('asset-unavailable');
  const template=creativeTemplate(catalog,c.templateId);if(!template)return result('invalid-request');if(!approvedCreativeTemplate(template))return result('model-not-ready');
  if(farm.creative.jobs.length>=64||farm.creative.jobs.filter(j=>!['claimed','failed'].includes(j.status)).length>=8)return result('capacity-full');
  job={id:runtime.freshId('job'),assetId:asset.id,kind:template.kind,templateId:template.id,name:c.name.trim(),prompt:c.prompt.trim(),status:'queued',createdAt:now,updatedAt:now};farm.creative.jobs.push(job);
  asset.templateId=job.templateId;asset.name=job.name;asset.prompt=job.prompt;asset.jobId=job.id;asset.egg={stage:'configured'};
 }else if(c.type==='claim'){
  job=farm.creative.jobs.find(j=>j.id===c.jobId);if(!job||job.status==='claimed'||job.status==='failed')return result('job-unavailable');
  if(job.status!=='ready'||!approvedCreativeTemplate(creativeTemplate(catalog,job.templateId)))return result('model-not-ready');
  if(job.assetId){
   const asset=farm.creative.assets.find(a=>a.id===job!.assetId);if(!asset)return result('foreign-asset');if(locked(asset.id))return result('asset-locked');
   if(asset.kind!=='custom-egg'||asset.location!=='bag'||asset.egg?.stage!=='configured'||asset.jobId!==job.id||asset.templateId!==job.templateId)return result('asset-unavailable');
   asset.egg={stage:'ready',incubation:{requiredMs:MINIMAL_RULES.hatchMs,elapsedMs:0,checkedAt:now}};
  }else{
   // Existing queued wishes were already accepted for free. Finish them without a retroactive charge,
   // but both categories now arrive as an egg, not an instantly granted prop.
   if(farm.creative.assets.length>=32)return result('capacity-full');
   const assetId=runtime.freshId('ugc');farm.creative.assets.push({id:assetId,kind:'custom-egg',templateId:job.templateId,name:job.name,prompt:job.prompt,createdAt:now,jobId:job.id,origin:'mock',location:'bag',egg:{stage:'ready',incubation:{requiredMs:MINIMAL_RULES.hatchMs,elapsedMs:0,checkedAt:now}}});job.assetId=assetId;
  }
  job.status='claimed';job.updatedAt=now;
 }else{
  const asset=farm.creative.assets.find(a=>a.id===c.assetId);if(!asset)return result('foreign-asset');if(locked(asset.id))return result('asset-locked');
  if(c.type==='hatch'){
   if(asset.kind!=='custom-egg')return result('asset-unavailable');const template=creativeTemplate(catalog,asset.templateId);if(!approvedCreativeTemplate(template))return result('model-not-ready');
   if(asset.egg){
    if(!creativeEggProgress(asset,now).ready)return result('asset-unavailable',{message:'把蛋放到空地孵化，时间到了再打开'});
    if(!asset.position||!tileAt(farm.state,asset.position)?.owned)return result('asset-unavailable');
    if(template!.kind==='creature'&&farm.state.animals.length+farm.state.eggs.length>=MINIMAL_RULES.maxAnimals)return result('capacity-full');
   }else if(asset.location!=='bag')return result('asset-unavailable'); // Legacy owned eggs keep their original bag hatch rule.
   const advanced=projectCreativeObstacles(runtime.advance(farm,now,lockedAnimalId(offer)),farm.creative.assets,asset.id);
   if(asset.location==='ground'&&asset.position&&!canPlaceEgg(advanced,asset.position))return result('model-rejected',{message:'蛋旁有伙伴或物品，腾出这块空地再打开'});
   if(asset.location==='ground'&&asset.position&&template!.kind==='prop'){const issue=placementIssue(advanced,asset.position,'prop');if(issue)return result('model-rejected',{message:issue});}
   if(asset.location==='ground'&&asset.position&&template!.kind==='creature'){const newborn=createCreativeAnimal({...asset,kind:'custom-creature',hatchedAt:now},catalog);if(!newborn||!isSafeAnimalArrival(advanced,newborn,now,asset.position,{free:p=>canPlaceEgg(advanced,p),ground:p=>isWalkableTile(advanced,p)&&tileAt(advanced,p)?.terrain!=='creek'},runtime.resources))return result('model-rejected',{message:'蛋旁的空间不够伙伴站稳，腾出位置再打开'});}
   farm.state=advanced;
   asset.kind=template!.kind==='creature'?'custom-creature':'prop';asset.hatchedAt=now;delete asset.egg;
   const animal=createCreativeAnimal(asset,catalog);if(animal){if(asset.location==='ground'){farm.state.animals.push(animal);farm.assetProvenance[animal.id]='server-created';}else asset.animal=animal;farm.state.hatchedCount++;}
  }else if(c.type==='pickup'){
   if(asset.location!=='ground')return result('asset-unavailable');if(asset.kind==='custom-creature'){const active=farm.state.animals.find(a=>a.id===asset.id);if(!active||!ownedCreativeAnimal(farm,active,catalog)||farm.state.carriedAnimalId===active.id)return result('asset-unavailable');}farm.state=runtime.advance(farm,now,lockedAnimalId(offer));if(asset.kind==='custom-egg'&&asset.egg?.incubation){asset.egg.incubation.elapsedMs=creativeEggProgress(asset,now).elapsedMs;asset.egg.incubation.checkedAt=now;}if(asset.kind==='custom-creature'){asset.animal=bagCreativeAnimal(farm.state.animals.find(a=>a.id===asset.id)!,now);farm.state.animals=farm.state.animals.filter(a=>a.id!==asset.id);delete farm.assetProvenance[asset.id];}asset.location='bag';delete asset.position;
  }else if(c.type==='place'){
   if(asset.location!=='bag'||asset.kind==='custom-egg'&&asset.egg?.stage!=='ready')return result('asset-unavailable');if(!creativeModelReady(creativeTemplate(catalog,asset.templateId)))return result('model-not-ready');
   farm.state=runtime.advance(farm,now,lockedAnimalId(offer));
   if(!tileAt(farm.state,c.at)?.owned||!canPlaceEgg(farm.state,c.at)||farm.creative.assets.some(a=>a.location==='ground'&&a.position&&a.position.x===c.at.x&&a.position.z===c.at.z))return result('model-rejected',{message:'选择一块已开辟的空地'});
   if(asset.kind==='prop'||asset.kind==='custom-egg'){const issue=placementIssue(farm.state,c.at,asset.kind);if(issue)return result('model-rejected',{message:issue});}
   if(asset.kind==='custom-creature'){if(farm.state.animals.length+farm.state.eggs.length>=MINIMAL_RULES.maxAnimals)return result('capacity-full');const animal=asset.animal??createCreativeAnimal(asset,catalog);if(!animal||!approvedCreativeAnimal(animal,catalog)||animal.id!==asset.id)return result('model-not-ready');if(!isSafeAnimalArrival(farm.state,animal,now,c.at,{free:p=>canPlaceEgg(farm.state,p),ground:p=>isWalkableTile(farm.state,p)&&tileAt(farm.state,p)?.terrain!=='creek'},runtime.resources))return result('model-rejected',{message:'这里放不下伙伴，换一块更宽的空地'});farm.state.animals.push({...bagCreativeAnimal(animal,now),position:{...c.at}});farm.assetProvenance[animal.id]='server-created';delete asset.animal;}if(asset.kind==='custom-egg'&&asset.egg?.incubation)asset.egg.incubation.checkedAt=now;asset.location='ground';asset.position={...c.at};
  }
 }
 farm.revision++;await putCanonicalFarm(tx,farm);return result('ok',{...(job?{job}:{}),message:c.type==='buy-egg'?'买好自定义蛋啦，打开蛋选择小伙伴或物件':c.type==='create'?'愿望已装进这颗蛋':c.type==='claim'?'内容已就绪，把蛋放到空地孵化':c.type==='hatch'?'自定义作品孵化啦':c.type==='place'?'已经摆放好':'已收回背包'});
}
