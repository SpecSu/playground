/** Authoritative local adapter: creation candidates + geometry + treasury commit together. */
import type {Profile} from './estate.ts';
import {
  reduceCreation,LOCAL_VISITORS,type CreationCommand,type CreationEffect,type WorkCapture,
  type BlueprintComponent,type LocalVisit,
} from './creation.ts';
import {
  buildingFootprint,commitEdit,findPath,isWalkable,previewEdit,regionAt,tickConstruction,validateLayout,
  type GridPoint,type Layout,type LayoutGeometry,type LayoutHistory,type Region,
} from './layout.ts';

export type CreationLayoutReceipt={
  transactionId:string;proposalId?:string;baseVersion:number;afterVersion:number;before:Layout;
  paid:number;refunded:number;completionRefund:number;undoTransactionId?:string;
};
export type CreationProfile=Profile&{creationLayouts?:CreationLayoutReceipt[]};
export type EstateCreationInput={command:CreationCommand;actor?:string;capture?:WorkCapture};
export type EstateCreationResult={ok:boolean;profile:CreationProfile;message:string};
type BlueprintEffect=Extract<CreationEffect,{type:'acceptedBlueprint'}>;

function ensure(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
const cell=(p:GridPoint):GridPoint=>({x:Math.round(p.x),z:Math.round(p.z)});
const key=(p:GridPoint)=>`${p.x},${p.z}`;
function geometry(layout:Layout):LayoutGeometry {
  return structuredClone({owned:layout.owned,roads:layout.roads,buildings:layout.buildings,roadPaidCost:layout.roadPaidCost});
}
function actors(p:CreationProfile):GridPoint[] {return [p.position,p.guardianAt,...p.animals.filter(a=>!a.memorial).map(a=>a.position)].map(cell);}
function locked(p:CreationProfile):boolean {return !!p.threat;}
function validateSafe(layout:Layout,p:CreationProfile):void {
  const result=validateLayout(layout,actors(p));ensure(result.ok,result.reasons.join('；'));
  ensure(result.metrics.reachableCapacity>=p.animals.filter(a=>!a.memorial).length,'当前可达保护棚容量不足，不能应用这份蓝图');
}
function scopePoints(c:BlueprintComponent,before:Layout,after:Layout):GridPoint[] {
  const e=c.edit;const result:GridPoint[]=[];
  if(e.type==='road')return e.cells;
  ensure(e.type!=='expand','创作提案不能直接拓荒');
  if('id' in e){
    for(const layout of [before,after]){
      const b=layout.buildings.find(b=>b.id===e.id);
      if(b)result.push(...buildingFootprint(b),...b.doors.map(d=>({x:d.x,z:d.z})));
    }
  }
  if(e.type==='door')result.push(e.at);
  return result;
}
function validateScope(c:BlueprintComponent,before:Layout,after:Layout,scope:Region[]):void {
  const points=scopePoints(c,before,after);
  ensure(points.length>0&&points.every(p=>scope.includes(regionAt(p))),'设施原位置、目标占地或入口超出授权区域');
}
function blueprint(p:CreationProfile,e:BlueprintEffect):void {
  ensure(!locked(p),'事件进行中，布局已锁定');ensure(!p.layout.construction,'已有一项工程正在施工');
  ensure(p.layout.version===e.baseVersion,'庄园版本已经变化，请重新预览');
  ensure(!p.layout.receipts.includes(e.transactionId),'这笔布局事务已经处理');
  const before=structuredClone(p.layout);let simulated=structuredClone(before);let cost=0,refund=0,durationMs=0;
  for(let i=0;i<e.components.length;i++){
    const c=e.components[i];const context={materials:p.materials-cost,baseVersion:simulated.version,actors:actors(p),surveyed:p.surveyed,locked:false};
    const preview=previewEdit(simulated,c.edit,context);ensure(preview.ok,preview.reasons.join('；'));
    validateScope(c,simulated,preview.after,e.scope);
    cost+=preview.cost;refund+=preview.refund;durationMs+=preview.durationMs;
    ensure(cost<=e.budget&&cost<=p.materials,'实际材料费用超出已确认预算或当前库存，请重新确认');
    ensure(cost<=e.components.slice(0,i+1).reduce((sum,c)=>sum+c.estimatedCost,0),'实际费用高于预览清单，请更新费用后重新确认');
    const applied=commitEdit(simulated,c.edit,{...context,eventId:`${e.transactionId}-validate-${i}`});ensure(applied.ok&&!applied.duplicate,applied.reasons.join('；')||'重复组件事务');
    simulated=applied.layout;
    if(simulated.construction){const completed=tickConstruction(simulated,simulated.construction.durationMs);ensure(completed.ok&&completed.completed,completed.reasons.join('；'));simulated=completed.layout;}
    validateSafe(simulated,p);
  }
  ensure(e.components.length>0,'没有可应用的蓝图组件');validateSafe(simulated,p);
  const previousSolid=new Set(before.buildings.filter(b=>b.kind!=='ramp').flatMap(buildingFootprint).map(key));
  const futureSolid=simulated.buildings.filter(b=>b.kind!=='ramp').flatMap(buildingFootprint);
  const footprint=[...new Map(futureSolid.filter(q=>!previousSolid.has(key(q))).map(q=>[key(q),q])).values()];
  const staged=structuredClone(before);
  staged.receipts.push(e.transactionId);
  staged.construction={eventId:e.transactionId,baseVersion:before.version,edit:structuredClone(e.components[0].edit),reservedCost:cost,refund,durationMs,elapsedMs:0,target:geometry(simulated),footprint};
  // In the aggregate job all original geometry remains until the final install.
  // Its combined reservations must be safe, even if each sequential preview was safe.
  validateSafe(staged,p);
  p.layout=staged;p.materials-=cost;
  const receipt:CreationLayoutReceipt={transactionId:e.transactionId,...(e.sourceKind==='proposal'?{proposalId:e.sourceId}:{}),baseVersion:before.version,afterVersion:before.version+1,before,paid:cost,refunded:0,completionRefund:refund};
  p.creationLayouts=[...(p.creationLayouts??[]),receipt];
  if(durationMs===0){const completed=tickConstruction(p.layout,0);ensure(completed.ok&&completed.completed,completed.reasons.join('；'));p.layout=completed.layout;p.materials+=completed.materialDelta;}
}
function undo(p:CreationProfile,e:Extract<CreationEffect,{type:'undoProposal'}>):void {
  ensure(!locked(p),'事件进行中不能撤销布局');ensure(!p.layout.construction,'先完成或取消当前施工');
  const receipt=p.creationLayouts?.find(r=>r.transactionId===e.originalTransactionId&&r.proposalId===e.proposalId);
  ensure(receipt&&!receipt.undoTransactionId,'没有可撤销的已付布局事务');
  ensure(p.layout.version===receipt.afterVersion,'后续布局已有独立变更，需要重新生成安全修复方案');
  const installed=p.layout.history.at(-1);
  ensure(installed?.eventId===receipt.transactionId&&installed.version===receipt.baseVersion&&installed.nextVersion===receipt.afterVersion,'原工程已取消或当前布局不是该提案结果');
  ensure(installed.cost===receipt.paid&&installed.refund===receipt.completionRefund,'原事务材料账本不一致');
  ensure(!p.layout.receipts.includes(e.transactionId),'撤销事务已处理');
  const recoverable=Math.max(0,receipt.paid-receipt.refunded);
  // Restoring a previously dismantled paid asset must reclaim its earlier refund.
  // Otherwise repeated remove → undo cycles could mint its paid-cost ledger.
  const reclaim=receipt.completionRefund;
  ensure(p.materials+recoverable>=reclaim,'撤销需要收回先前拆除退款，当前材料不足');
  const next=structuredClone(p.layout);
  const history:LayoutHistory={...geometry(p.layout),version:p.layout.version,eventId:e.transactionId,nextVersion:p.layout.version+1,cost:reclaim,refund:recoverable};
  Object.assign(next,geometry(receipt.before));next.version=p.layout.version+1;next.history.push(history);next.receipts.push(e.transactionId);
  validateSafe(next,p);
  p.layout=next;p.materials+=recoverable-reclaim;receipt.refunded+=recoverable;receipt.undoTransactionId=e.transactionId;
}
function validateVisit(p:CreationProfile,visit:LocalVisit,ownerId:string):void {
  ensure(visit.snapshotVersion===p.layout.version,'庄园布局已更新，请结束旧访问后重新进入');
  const grant=visit.grantId?p.creation.grants.find(g=>g.id===visit.grantId):undefined;
  const scope=grant?.regions;
  const readLayout=scope?{...p.layout,owned:p.layout.owned.filter(q=>scope.includes(regionAt(q)))}:p.layout;
  ensure(visit.visitorId===ownerId||LOCAL_VISITORS.some(v=>v.id===visit.visitorId),'访问投影身份无效');
  ensure(visit.route.every(q=>isWalkable(readLayout,q)),'示例路线已有设施或施工阻挡，请重新布置或换一区域');
  for(let i=1;i<visit.route.length;i++)ensure(findPath(readLayout,visit.route[i-1],visit.route[i]),'示例路线在授权区域内不可达');
}

export function applyEstateCreation(original:CreationProfile,ownerId:string,outer:EstateCreationInput,now:number):EstateCreationResult {
  try {
    ensure(outer&&outer.command,'缺少创作指令');const actor=outer.actor??ownerId;
    ensure(actor===ownerId||LOCAL_VISITORS.some(v=>v.id===actor),'未接入远程好友身份，仅支持明确标注的本地访客演示');
    const animals=original.animals.filter(a=>!a.memorial);
    const context={now,ownerId,actorId:actor,profileId:original.id,layoutVersion:original.layout.version,materials:original.materials,
      animalIds:animals.map(a=>a.id),hungerById:Object.fromEntries(animals.map(a=>[a.id,a.life.hunger])),
      foodByAnimalId:Object.fromEntries(animals.map(a=>[a.id,a.life.stage==='baby'?'milk':'feed'])),
      componentRegions:Object.fromEntries(original.layout.buildings.map(b=>[b.id,regionAt(b)])),
      sourceEvents:original.events.map(e=>({id:e.id,title:e.text,at:e.at,layoutVersion:'layoutVersion' in e&&typeof e.layoutVersion==='number'?e.layoutVersion:original.layout.version})),
      ...(outer.capture?{capture:outer.capture}:{}),
    };
    const reduced=reduceCreation(original.creation,outer.command,context);
    const p=structuredClone(original);p.creation=reduced.state;
    // Waiting/expiry transitions are useful ledger changes even when acceptance fails.
    if(!reduced.ok)return {ok:false,profile:p,message:reduced.message};
    ensure(!reduced.effects.length||actor===ownerId,'访客不能执行主人世界写入');
    for(const effect of reduced.effects){
      if(effect.type==='acceptedBlueprint')blueprint(p,effect);
      else if(effect.type==='undoProposal')undo(p,effect);
      else if(effect.type==='acceptedHelp'){
        const a=p.animals.find(a=>a.id===effect.targetId&&!a.memorial);ensure(a&&a.life.hunger<=70,'目标已不存在或已经吃饱');
        a.life.hunger=Math.min(100,a.life.hunger+effect.hungerDelta);
        delete a.offlineNeeds;a.life.lastSettledAt=now;
      }
    }
    if(['enterVisit','visitMove','visitInteract'].includes(outer.command.type)){
      const visitId='visitId' in outer.command?outer.command.visitId:outer.command.id;
      const visit=p.creation.visits.find(v=>v.id===visitId);
      ensure(visit,'访问会话不存在');validateVisit(p,visit,ownerId);
    }
    if(reduced.effects.length){
      const text=reduced.effects.some(e=>e.type==='acceptedHelp')?`本地访客演示：接受了 1 份适配食物帮助 · ${reduced.message}`:reduced.message;
      p.events=[...p.events,{id:outer.command.id,text,at:now}].slice(-60);
    }
    p.notice=reduced.message;return {ok:true,profile:p,message:reduced.message};
  } catch(error) {return {ok:false,profile:original,message:error instanceof Error?error.message:'创作应用失败，原存档和材料保留'};}
}
