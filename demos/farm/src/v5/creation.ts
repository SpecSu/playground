/**
 * Local creation/social candidates only. No network, database, inventory or animal mutation.
 * Call reduceCreation, validate every effect in the authoritative estate transaction, then
 * commit its state + effects + command receipt together. Discard successful candidate state
 * if any spatial/financial effect fails. A rejected help can return a waiting/refunded state;
 * persist that harmless ledger transition even when ok=false (effects will be empty).
 */
import type {GridPoint, LayoutEdit, Region} from './layout.ts';

export const CREATION_RULES = {helpExpiryMs:48*60*60*1000, ownerHelpPerUtcDay:2, visitorHelpPerUtcDay:1, helpHunger:30, helpMaxHunger:70, maxComponents:24} as const;
export type Theme = 'pasture'|'lotus'|'starlit';
export const THEME_TEMPLATES = [
  {id:'pasture' as const,title:'晴日牧场',description:'官方预制主题 · 草地与暖木色',cost:0},
  {id:'lotus' as const,title:'荷叶村',description:'官方预制主题 · 池岸荷叶配色',cost:0},
  {id:'starlit' as const,title:'星空小窝',description:'官方预制主题 · 星点与夜蓝色',cost:0},
];
export const LOCAL_VISITORS = [
  {id:'local-visitor-a',name:'本地访客 A',label:'本地访客演示' as const},
  {id:'local-visitor-b',name:'本地访客 B',label:'本地访客演示' as const},
  {id:'local-visitor-c',name:'本地访客 C',label:'本地访客演示' as const},
];
const REGIONS:Region[]=['pen','meadow','shore','home'];
const EDIT_TYPES:LayoutEdit['type'][]=['place','move','remove','road','door','door-state'];
const BUILDING_KINDS=['shelter','trough','workbench','tower','factory','ramp','decor'];
const EXAMPLE_ROUTE:GridPoint[]=[{x:4,z:4},{x:7,z:2},{x:8,z:7},{x:2,z:7}];

export type SourceAttribution = {
  kind:'official-template'|'local-draft'|'local-remix';ownerId:string;assetId:string;
  version:number;license:'official-template'|'private'|'local-remix';tool:'preset'|'manual';
  parent?:SourceAttribution;
};
export type BlueprintComponent = {id:string;region:Region;estimatedCost:number;edit:LayoutEdit};
export type ThemeVersion = {id:string;version:number;theme:Theme;previous:Theme;createdAt:number;undoOf?:string};
export type ThemeDraft = {id:string;kind:'theme';theme:Theme;baseThemeVersion:number;createdAt:number;status:'draft'|'applied';source:SourceAttribution};
export type BlueprintDraft = {
  id:string;kind:'blueprint';authorId:string;scope:Region[];baseVersion:number;budget:number;
  components:BlueprintComponent[];createdAt:number;status:'draft'|'applied';source:SourceAttribution;
};
export type SourceEvent = {id:string;title:string;at:number;layoutVersion:number};
export type CameraCapture = {position:{x:number;y:number;z:number};target:{x:number;y:number;z:number}};
export type WorkCapture = {region?:Region;camera?:CameraCapture;thumbnail?:string};
export type PrivateWork = {
  id:string;ownerId:string;title:string;createdAt:number;visibility:'private';allowRemix:boolean;
  events:SourceEvent[];source:SourceAttribution;
  capture:WorkCapture & {layoutVersion:number;theme:Theme;profileId:string;animalIds:string[]};
};
export type LocalGrant = {
  projectId?:string;
  id:string;visitorId:string;label:'本地访客演示';regions:Region[];budget:number;editTypes:LayoutEdit['type'][];
  allowView:boolean;allowHelp:boolean;allowRemix:boolean;createdAt:number;expiresAt:number;revokedAt?:number;
};
export type LocalVisit = {
  id:string;visitorId:string;label:'本地访客演示'|'示例庄园';mode:'example'|'local-visitor';
  grantId?:string;snapshotVersion:number;snapshotAt:number;projection:true;readOnly:true;
  route:GridPoint[];routeIndex:number;status:'active'|'left'|'revoked';
  interactions:{kind:'wave'|'photo'|'look';at:number;routeIndex:number}[];
};
export type LocalHelp = {
  id:string;visitorId:string;label:'本地访客演示';grantId:string;visitId:string;ownerId:string;
  targetId:string;food:string;createdAt:number;expiresAt:number;submittedDay:string;
  status:'pending'|'waiting'|'accepted'|'rejected'|'expired'|'revoked';
  reservation:'reserved'|'consumed'|'refunded';acceptedAt?:number;acceptedDay?:string;refundAt?:number;
};
export type LocalProposal = {
  id:string;visitorId:string;label:'本地访客演示';grantId:string;visitId:string;scope:Region[];
  baseVersion:number;budget:number;components:BlueprintComponent[];createdAt:number;expiresAt:number;
  status:'pending'|'accepted'|'rejected'|'revoked'|'expired';source:SourceAttribution;allowRemix:boolean;
  acceptedComponentIds?:string[];acceptedAt?:number;
};
export type ProposalReceipt = {proposalId:string;transactionId:string;baseVersion:number;componentIds:string[];undoState:'available'|'undone';undoTransactionId?:string};
export type ProjectBudget = {id:string;budget:number;spent:number;reserved:number;receipts:{transactionId:string;proposalId:string;cost:number}[]};
export type CreationState = {
  projects:Record<string,ProjectBudget>;
  version:1;ownerId:string;profileId:string;theme:Theme;themeVersions:ThemeVersion[];
  drafts:(ThemeDraft|BlueprintDraft)[];works:PrivateWork[];visits:LocalVisit[];help:LocalHelp[];
  grants:LocalGrant[];proposals:LocalProposal[];proposalReceipts:ProposalReceipt[];
  localVisitors:Record<string,{name:string;label:'本地访客演示';food:number}>;
  receipts:{id:string;type:string;at:number}[];
};
export type CreationContext = {
  now:number;ownerId:string;actorId?:string;profileId:string;layoutVersion:number;materials:number;
  animalIds:string[];hungerById:Record<string,number>;foodByAnimalId?:Record<string,string>;
  componentRegions?:Record<string,Region>;sourceEvents?:SourceEvent[];capture?:WorkCapture;
};
type BlueprintInput = {scope:Region[];baseVersion:number;budget:number;components:BlueprintComponent[]};
export type CreationCommand = {id:string} & (
  | {type:'themePreview';theme:Theme} | {type:'themeApply';draftId:string} | {type:'themeUndo'}
  | {type:'saveWork';title:string;eventIds?:string[]}
  | ({type:'blueprintDraft'} & BlueprintInput) | {type:'blueprintApply';draftId:string}
  | {type:'grant';projectId?:string;visitorId:string;regions:Region[];budget:number;editTypes:LayoutEdit['type'][];expiresAt:number;allowView?:boolean;allowHelp?:boolean;allowRemix?:boolean}
  | {type:'revokeGrant';grantId:string}
  | {type:'enterVisit';mode:'example'|'local-visitor';grantId?:string}
  | {type:'visitMove';visitId:string} | {type:'visitInteract';visitId:string;interaction:'wave'|'photo'|'look'}
  | {type:'leaveVisit';visitId:string}
  | {type:'submitHelp';visitId:string;targetId:string;food:string}
  | {type:'acceptHelp'|'rejectHelp';helpId:string}
  | ({type:'submitProposal';visitId:string} & BlueprintInput)
  | {type:'acceptProposal';proposalId:string;componentIds?:string[]}
  | {type:'rejectProposal'|'undoProposal'|'remixProposal';proposalId:string}
  | {type:'setProposalRemix';proposalId:string;allowRemix:boolean}
  | {type:'sweep'}
);
export type CreationEffect =
  | {type:'theme';transactionId:string;theme:Theme;previous:Theme;version:number}
  | {type:'acceptedBlueprint';transactionId:string;sourceId:string;sourceKind:'draft'|'proposal';baseVersion:number;
      scope:Region[];budget:number;estimatedCost:number;components:BlueprintComponent[];source:SourceAttribution;requiresSpatialValidation:true}
  | {type:'acceptedHelp';transactionId:string;helpId:string;targetId:string;hungerDelta:30;bondDelta:0;manualCareMilestone:false}
  | {type:'undoProposal';transactionId:string;proposalId:string;originalTransactionId:string;requiresSpatialValidation:true;restoreGrowth:false};
export type CreationResult = {ok:boolean;state:CreationState;message:string;effects:CreationEffect[]};

export function createCreation(ownerId='local-owner',profileId='natural'):CreationState {
  return {
    version:1,ownerId,profileId,theme:'pasture',themeVersions:[{id:'theme-initial',version:0,theme:'pasture',previous:'pasture',createdAt:0}],
    projects:{},drafts:[],works:[],visits:[],help:[],grants:[],proposals:[],proposalReceipts:[],receipts:[],
    localVisitors:Object.fromEntries(LOCAL_VISITORS.map(v=>[v.id,{name:v.name,label:v.label,food:1}])),
  };
}

/** Legacy grants each form their own project. No pending proposal reserves owner materials. */
export function migrateProjectBudgets(state:CreationState):void {
  state.projects??={};
  for(const grant of state.grants){
    grant.projectId??=grant.id;
    state.projects[grant.projectId]??={id:grant.projectId,budget:grant.budget,spent:0,reserved:0,receipts:[]};
  }
}

/** Call only after authoritative spatial validation, in the same candidate transaction. */
export function chargeProjectBudget(state:CreationState,proposalId:string,transactionId:string,cost:number):void {
  migrateProjectBudgets(state);
  const proposal=state.proposals.find(p=>p.id===proposalId);
  const grant=state.grants.find(g=>g.id===proposal?.grantId);
  requireRule(grant?.projectId,'提案项目授权不存在');const project=state.projects[grant.projectId];
  requireRule(project&&integer(cost)&&integer(project.budget)&&integer(project.spent)&&integer(project.reserved),'项目预算账本无效');
  requireRule(!project.receipts.some(r=>r.transactionId===transactionId||r.proposalId===proposalId),'项目事务已记账');
  requireRule(project.spent+project.reserved+cost<=project.budget,'项目累计材料费用超出主人已确认预算');
  project.spent+=cost;project.receipts.push({transactionId,proposalId,cost});
}

function requireRule(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
function text(value:unknown,max=100):value is string {return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
function integer(value:unknown,max=10000):value is number {return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;}
function point(value:unknown):value is GridPoint {const p=value as GridPoint;return !!p&&integer(p.x,100)&&integer(p.z,100);}
function regionAt(p:GridPoint):Region {return p.z<6?(p.x<6?'pen':'meadow'):(p.x<6?'home':'shore');}
function source(ownerId:string,assetId:string,version:number):SourceAttribution {return {kind:'local-draft',ownerId,assetId,version,license:'private',tool:'manual'};}
function utcDay(now:number):string {return new Date(now).toISOString().slice(0,10);}
function ownerOnly(type:string):boolean {
  return !['enterVisit','visitMove','visitInteract','leaveVisit','submitHelp','submitProposal'].includes(type);
}
function pendingHelp(h:LocalHelp):boolean {return h.status==='pending'||h.status==='waiting';}
function refund(state:CreationState,h:LocalHelp,now:number):void {
  if(h.reservation!=='reserved')return;
  state.localVisitors[h.visitorId].food+=1;h.reservation='refunded';h.refundAt=now;
}
function activeGrant(state:CreationState,id:unknown,visitorId:string,ctx:CreationContext):LocalGrant {
  const grant=state.grants.find(g=>g.id===id&&g.visitorId===visitorId);
  requireRule(grant&&grant.revokedAt===undefined&&ctx.now<grant.expiresAt,'本地演示授权已撤回或到期');
  requireRule(grant.allowView,'尚未开放本地演示观看');return grant;
}
function activeVisit(state:CreationState,id:unknown,actor:string,ctx:CreationContext):LocalVisit {
  const visit=state.visits.find(v=>v.id===id&&v.visitorId===actor);
  requireRule(visit&&visit.status==='active','本地演示访问已结束');
  if(visit.mode==='local-visitor')activeGrant(state,visit.grantId,actor,ctx);
  return visit;
}
/** Minimal projection for a future visitor adapter; never return the owner's CreationState. */
export function localVisitView(state:CreationState,visitId:string,ctx:CreationContext):{ok:true;visit:LocalVisit}|{ok:false;message:string} {
  try {
    requireRule(state.ownerId===ctx.ownerId&&state.profileId===ctx.profileId,'存档身份不匹配');
    const visit=activeVisit(state,visitId,ctx.actorId??ctx.ownerId,ctx);
    return {ok:true,visit:structuredClone(visit)};
  } catch(error) {return {ok:false,message:error instanceof Error?error.message:'访问无效'};}
}
function regions(value:unknown):Region[] {
  requireRule(Array.isArray(value)&&value.length>0&&value.length<=4&&value.every(v=>REGIONS.includes(v))&&new Set(value).size===value.length,'请选择明确的有效区域');
  return [...value] as Region[];
}
/** Allowlist and reconstruct every component. Arbitrary fields/scripts never survive. */
function components(input:unknown,scope:Region[],ctx:CreationContext,visitor:boolean):BlueprintComponent[] {
  requireRule(Array.isArray(input)&&input.length>0&&input.length<=CREATION_RULES.maxComponents,'蓝图组件数量无效');
  const ids=new Set<string>();
  return input.map(raw=>{
    const c=raw as BlueprintComponent;
    requireRule(c&&text(c.id)&&!ids.has(c.id)&&scope.includes(c.region)&&integer(c.estimatedCost),'蓝图含重复、越区或无效组件');ids.add(c.id);
    const e=c.edit;requireRule(e&&EDIT_TYPES.includes(e.type),'只接受合法预制组件，不执行脚本或拓荒');
    let edit:LayoutEdit;
    const ensurePoint=(p:unknown):GridPoint=>{requireRule(point(p)&&regionAt(p)===c.region,'组件坐标超出授权区域');return {x:p.x,z:p.z};};
    const existing=(id:unknown)=>{
      requireRule(text(id),'组件 ID 无效');const actual=ctx.componentRegions?.[id];
      requireRule(!visitor||actual!==undefined,'需用当前布局核验原组件所在区域');
      requireRule(actual===undefined||scope.includes(actual),'原组件不在授权区域内');
    };
    if(e.type==='place'||e.type==='move') {
      requireRule(text(e.id),'组件 ID 无效');const p=ensurePoint(e);
      requireRule(e.rotation===undefined||[0,90,180,270].includes(e.rotation),'旋转角度无效');
      if(e.type==='place'){requireRule(BUILDING_KINDS.includes(e.kind),'预制组件类型无效');edit={type:'place',id:e.id,kind:e.kind,...p};}
      else {existing(e.id);edit={type:'move',id:e.id,...p};}
      if(e.rotation!==undefined)edit.rotation=e.rotation;
    } else if(e.type==='road') {
      requireRule(Array.isArray(e.cells)&&e.cells.length>0&&e.cells.length<=144,'道路范围无效');
      requireRule(e.remove===undefined||typeof e.remove==='boolean','道路操作无效');
      edit={type:'road',cells:e.cells.map(ensurePoint),...(e.remove!==undefined?{remove:e.remove}:{})};
    } else if(e.type==='door') {existing(e.id);edit={type:'door',id:e.id,at:ensurePoint(e.at)};}
    else if(e.type==='door-state') {existing(e.id);requireRule(text(e.doorId)&&typeof e.open==='boolean','入口参数无效');edit={type:'door-state',id:e.id,doorId:e.doorId,open:e.open};}
    else {requireRule(e.type==='remove','蓝图编辑类型无效');existing(e.id);edit={type:'remove',id:e.id};}
    return {id:c.id,region:c.region,estimatedCost:c.estimatedCost,edit};
  });
}
function blueprint(input:BlueprintInput,ctx:CreationContext,visitor=false):BlueprintInput {
  const scope=regions(input.scope);requireRule(input.baseVersion===ctx.layoutVersion,'庄园版本已变化，请基于新版本重新预览');
  requireRule(integer(input.budget),'蓝图预算无效');const list=components(input.components,scope,ctx,visitor);
  requireRule(list.reduce((n,c)=>n+c.estimatedCost,0)<=input.budget,'蓝图超出已确认预算');
  return {scope,baseVersion:input.baseVersion,budget:input.budget,components:list};
}
function effectFor(c:BlueprintInput & {source:SourceAttribution},id:string,sourceId:string,sourceKind:'draft'|'proposal'):CreationEffect {
  return {type:'acceptedBlueprint',transactionId:id,sourceId,sourceKind,baseVersion:c.baseVersion,scope:[...c.scope],budget:c.budget,
    estimatedCost:c.components.reduce((n,e)=>n+e.estimatedCost,0),components:structuredClone(c.components),source:structuredClone(c.source),requiresSpatialValidation:true};
}

export function reduceCreation(original:CreationState,command:CreationCommand,ctx:CreationContext):CreationResult {
  let state=original;
  const fail=(message:string):CreationResult=>({ok:false,state,message,effects:[]});
  try {
    requireRule(ctx&&Number.isSafeInteger(ctx.now)&&ctx.now>=0&&ctx.now<=8.64e15&&integer(ctx.layoutVersion,Number.MAX_SAFE_INTEGER)&&integer(ctx.materials,Number.MAX_SAFE_INTEGER),'世界上下文无效');
    requireRule(original.ownerId===ctx.ownerId&&original.profileId===ctx.profileId,'存档身份或自然 / 演示档不匹配');
    requireRule(command&&text(command.id)&&text(command.type),'创作指令缺少唯一 ID 或类型');
    const actor=ctx.actorId??ctx.ownerId;
    requireRule(actor===ctx.ownerId||LOCAL_VISITORS.some(v=>v.id===actor),'仅支持明确标注的本地演示访客');
    requireRule(!ownerOnly(command.type)||actor===ctx.ownerId,'访客只能操作自己的本地演示会话，不能写主人存档');
    requireRule(!original.receipts.some(r=>r.id===command.id),'该创作指令已处理，不会重复结算');
    state=structuredClone(original);migrateProjectBudgets(state);const effects:CreationEffect[]=[];let message='已保存到本地私有草稿';
    switch(command.type) {
      case 'themePreview': {
        requireRule(THEME_TEMPLATES.some(t=>t.id===command.theme),'请选择现成主题：晴日牧场、荷叶村或星空小窝');
        state.drafts.push({id:command.id,kind:'theme',theme:command.theme,baseThemeVersion:state.themeVersions.at(-1)!.version,
          createdAt:ctx.now,status:'draft',source:{kind:'official-template',ownerId:'official',assetId:command.theme,version:1,license:'official-template',tool:'preset'}});
        message='现成主题预览；确认后才应用';break;
      }
      case 'themeApply': {
        const d=state.drafts.find(d=>d.id===command.draftId);requireRule(d?.kind==='theme'&&d.status==='draft','主题预览不存在或已应用');
        requireRule(d.baseThemeVersion===state.themeVersions.at(-1)!.version,'主题已变化，请重新预览');
        const previous=state.theme;const version=state.themeVersions.at(-1)!.version+1;
        state.theme=d.theme;d.status='applied';state.themeVersions.push({id:command.id,version,theme:d.theme,previous,createdAt:ctx.now});
        effects.push({type:'theme',transactionId:command.id,theme:d.theme,previous,version});message='已应用官方预制主题，可撤销';break;
      }
      case 'themeUndo': {
        const last=state.themeVersions.at(-1)!;requireRule(last.version>0&&!last.undoOf,'没有可撤销的主题应用');
        const version=last.version+1;state.theme=last.previous;
        state.themeVersions.push({id:command.id,version,theme:last.previous,previous:last.theme,createdAt:ctx.now,undoOf:last.id});
        effects.push({type:'theme',transactionId:command.id,theme:state.theme,previous:last.theme,version});message='已恢复上一主题';break;
      }
      case 'saveWork': {
        requireRule(text(command.title),'请为私有作品填写 100 字以内的标题');
        const eventIds=command.eventIds??[];requireRule(Array.isArray(eventIds)&&eventIds.length<=20&&new Set(eventIds).size===eventIds.length,'作品来源事件无效');
        const events=eventIds.map(id=>{const event=ctx.sourceEvents?.find(e=>e.id===id);requireRule(event,'不能把未发生的事情写成来访或成长事实');return {id:event.id,title:event.title,at:event.at,layoutVersion:event.layoutVersion};});
        const capture:PrivateWork['capture']={layoutVersion:ctx.layoutVersion,theme:state.theme,profileId:state.profileId,animalIds:[...ctx.animalIds]};
        if(ctx.capture?.region&&REGIONS.includes(ctx.capture.region))capture.region=ctx.capture.region;
        if(ctx.capture?.camera){const {position,target}=ctx.capture.camera;requireRule([position.x,position.y,position.z,target.x,target.y,target.z].every(Number.isFinite),'相机记录无效');capture.camera={position:{x:position.x,y:position.y,z:position.z},target:{x:target.x,y:target.y,z:target.z}};}
        if(ctx.capture?.thumbnail){requireRule(typeof ctx.capture.thumbnail==='string'&&ctx.capture.thumbnail.length<=512000&&/^data:image\/(?:png|jpeg|webp);base64,/.test(ctx.capture.thumbnail),'只保存当前场景提供的私有缩略图');capture.thumbnail=ctx.capture.thumbnail;}
        state.works.push({id:command.id,ownerId:ctx.ownerId,title:command.title.trim(),createdAt:ctx.now,visibility:'private',allowRemix:false,events,capture,source:source(ctx.ownerId,command.id,ctx.layoutVersion)});
        message='作品已私有保存，未公开发布';break;
      }
      case 'blueprintDraft': {
        const data=blueprint(command,ctx);state.drafts.push({id:command.id,kind:'blueprint',authorId:actor,...data,createdAt:ctx.now,status:'draft',source:source(actor,command.id,ctx.layoutVersion)});break;
      }
      case 'blueprintApply': {
        const d=state.drafts.find(d=>d.id===command.draftId);requireRule(d?.kind==='blueprint'&&d.status==='draft','蓝图草稿不存在或已经应用');
        const data=blueprint(d,ctx);requireRule(data.components.reduce((n,c)=>n+c.estimatedCost,0)<=ctx.materials,'现有材料不足，请重新确认方案');
        effects.push(effectFor({...data,source:d.source},command.id,d.id,'draft'));d.status='applied';message='蓝图待规则引擎重新校验并原子应用';break;
      }
      case 'grant': {
        requireRule(LOCAL_VISITORS.some(v=>v.id===command.visitorId),'请选择标注的本地演示访客');const scope=regions(command.regions);
        requireRule(integer(command.budget)&&Number.isSafeInteger(command.expiresAt)&&command.expiresAt>ctx.now,'授权预算或到期时间无效');
        requireRule(Array.isArray(command.editTypes)&&command.editTypes.every(t=>EDIT_TYPES.includes(t))&&new Set(command.editTypes).size===command.editTypes.length,'授权编辑类型无效');
        for(const flag of [command.allowView,command.allowHelp,command.allowRemix])requireRule(flag===undefined||typeof flag==='boolean','授权开关无效');
        requireRule(command.projectId===undefined||text(command.projectId),'项目 ID 无效');
        const projectId=command.projectId??command.id;const project=state.projects[projectId];
        requireRule(!project||project.budget===command.budget,'已有项目总预算不能通过重新授权重置或扩大');
        state.projects[projectId]??={id:projectId,budget:command.budget,spent:0,reserved:0,receipts:[]};
        state.grants.push({id:command.id,projectId,visitorId:command.visitorId,label:'本地访客演示',regions:scope,budget:command.budget,editTypes:[...command.editTypes],allowView:command.allowView??true,allowHelp:command.allowHelp??false,allowRemix:command.allowRemix??false,createdAt:ctx.now,expiresAt:command.expiresAt});
        message='已开放指定区域的本地访客演示；没有远程账号权限';break;
      }
      case 'revokeGrant': {
        const g=state.grants.find(g=>g.id===command.grantId);requireRule(g&&g.revokedAt===undefined,'授权不存在或已经撤回');g.revokedAt=ctx.now;
        for(const h of state.help)if(h.grantId===g.id&&pendingHelp(h)){h.status='revoked';refund(state,h,ctx.now);}
        for(const p of state.proposals)if(p.grantId===g.id&&p.status==='pending')p.status='revoked';
        for(const v of state.visits)if(v.grantId===g.id&&v.status==='active')v.status='revoked';
        message='已撤回授权，未接受提案失效，预留食物退回一次';break;
      }
      case 'enterVisit': {
        requireRule(command.mode==='example'||command.mode==='local-visitor','仅提供示例庄园 / 本地访客演示');
        let route=structuredClone(EXAMPLE_ROUTE);let grantId:string|undefined;
        if(command.mode==='local-visitor'){const g=activeGrant(state,command.grantId,actor,ctx);grantId=g.id;route=route.filter(p=>g.regions.includes(regionAt(p)));requireRule(route.length,'没有已授权的演示路线');}
        else requireRule(actor===ctx.ownerId,'示例庄园是主人独立的只读体验');
        state.visits.push({id:command.id,visitorId:actor,label:command.mode==='example'?'示例庄园':'本地访客演示',mode:command.mode,...(grantId?{grantId}:{}),snapshotVersion:ctx.layoutVersion,snapshotAt:ctx.now,projection:true,readOnly:true,route,routeIndex:0,status:'active',interactions:[]});
        message=command.mode==='example'?'进入示例庄园，所有角色均为只读投影':'进入本地访客演示，真实动物留在原存档';break;
      }
      case 'visitMove': {
        const v=activeVisit(state,command.visitId,actor,ctx);requireRule(v.routeIndex<v.route.length-1,'已走完示例路线');v.routeIndex+=1;message='投影沿示例路线前进一步';break;
      }
      case 'visitInteract': {
        const v=activeVisit(state,command.visitId,actor,ctx);requireRule(['wave','photo','look'].includes(command.interaction),'只开放预制本地演示互动');
        v.interactions.push({kind:command.interaction,at:ctx.now,routeIndex:v.routeIndex});message='已记入本地访问会话，未改主人动物';break;
      }
      case 'leaveVisit': {const v=activeVisit(state,command.visitId,actor,ctx);v.status='left';message='已离开本地访问，回到自己的庄园';break;}
      case 'submitHelp': {
        const v=activeVisit(state,command.visitId,actor,ctx);requireRule(v.mode==='local-visitor','示例庄园不能向真实存档投递食物');
        const g=activeGrant(state,v.grantId,actor,ctx);requireRule(g.allowHelp,'主人尚未开放本地帮助演示');
        requireRule(ctx.animalIds.includes(command.targetId)&&ctx.foodByAnimalId?.[command.targetId]===command.food,'目标不存在或食物不适配');
        const day=utcDay(ctx.now);requireRule(state.help.filter(h=>h.visitorId===actor&&h.ownerId===ctx.ownerId&&h.submittedDay===day).length<CREATION_RULES.visitorHelpPerUtcDay,'该访客今天已经投递过一份帮助');
        const donor=state.localVisitors[actor];requireRule(donor&&donor.food>=1,'本地演示访客没有可预留的食物');
        donor.food-=1;state.help.push({id:command.id,visitorId:actor,label:'本地访客演示',grantId:g.id,visitId:v.id,ownerId:ctx.ownerId,targetId:command.targetId,food:command.food,createdAt:ctx.now,expiresAt:ctx.now+CREATION_RULES.helpExpiryMs,submittedDay:day,status:'pending',reservation:'reserved'});
        message='已从本地演示访客预留 1 份食物，主人接受后才使用；48 小时到期可退回';break;
      }
      case 'acceptHelp': {
        const h=state.help.find(h=>h.id===command.helpId);requireRule(h&&pendingHelp(h)&&h.reservation==='reserved','帮助已处理，不会重复使用或退款');
        if(ctx.now>=h.expiresAt){h.status='expired';refund(state,h,ctx.now);return fail('帮助已过期，预留食物已退回一次');}
        activeGrant(state,h.grantId,h.visitorId,ctx);requireRule(ctx.animalIds.includes(h.targetId),'目标动物已不存在，可拒绝并退回食物');
        requireRule(ctx.foodByAnimalId?.[h.targetId]===h.food,'当前阶段食物不适配，可拒绝并退回食物');
        const hunger=ctx.hungerById[h.targetId];requireRule(Number.isFinite(hunger)&&hunger>=0&&hunger<=100,'目标需求记录无效');
        const day=utcDay(ctx.now);
        if(hunger>CREATION_RULES.helpMaxHunger){h.status='waiting';return fail('它已经吃饱，食物留在礼物篮等待；也可拒绝退回');}
        if(state.help.filter(h=>h.status==='accepted'&&h.acceptedDay===day).length>=CREATION_RULES.ownerHelpPerUtcDay){h.status='waiting';return fail('主人今天已接受 2 份帮助，礼物篮等待下一日或退回');}
        h.status='accepted';h.reservation='consumed';h.acceptedAt=ctx.now;h.acceptedDay=day;
        effects.push({type:'acceptedHelp',transactionId:command.id,helpId:h.id,targetId:h.targetId,hungerDelta:30,bondDelta:0,manualCareMilestone:false});message='本地帮助已接受：饱食 +30，不增加主人亲密或手动照料里程碑';break;
      }
      case 'rejectHelp': {
        const h=state.help.find(h=>h.id===command.helpId);requireRule(h&&pendingHelp(h),'帮助已处理');h.status='rejected';refund(state,h,ctx.now);message='已拒绝，原预留食物退回一次';break;
      }
      case 'submitProposal': {
        const v=activeVisit(state,command.visitId,actor,ctx);requireRule(v.mode==='local-visitor','示例庄园只读，不提交主人蓝图');
        const g=activeGrant(state,v.grantId,actor,ctx);const data=blueprint(command,ctx,true);
        requireRule(data.scope.every(r=>g.regions.includes(r))&&data.budget<=g.budget&&data.components.every(c=>g.editTypes.includes(c.edit.type)),'蓝图超出区域、预算或组件编辑授权');
        state.proposals.push({id:command.id,visitorId:actor,label:'本地访客演示',grantId:g.id,visitId:v.id,...data,createdAt:ctx.now,expiresAt:g.expiresAt,status:'pending',source:source(actor,command.id,ctx.layoutVersion),allowRemix:g.allowRemix});
        message='本地访客蓝图已进入比较列表，等待主人确认';break;
      }
      case 'acceptProposal': {
        const p=state.proposals.find(p=>p.id===command.proposalId);requireRule(p&&p.status==='pending','提案不存在或已处理');
        requireRule(ctx.now<p.expiresAt,'提案已过期');const g=activeGrant(state,p.grantId,p.visitorId,ctx);
        const selected=command.componentIds??p.components.map(c=>c.id);
        requireRule(Array.isArray(selected)&&selected.length>0&&new Set(selected).size===selected.length&&selected.every(id=>p.components.some(c=>c.id===id)),'请选择有效且不重复的蓝图组件');
        const data=blueprint({...p,components:p.components.filter(c=>selected.includes(c.id))},ctx,true);
        requireRule(data.scope.every(r=>g.regions.includes(r))&&data.budget<=g.budget&&data.components.every(c=>g.editTypes.includes(c.edit.type)),'授权范围或预算已变化');
        requireRule(data.components.reduce((n,c)=>n+c.estimatedCost,0)<=ctx.materials,'现有材料不足，请重新确认方案');
        p.status='accepted';p.acceptedAt=ctx.now;p.acceptedComponentIds=[...selected];
        state.proposalReceipts.push({proposalId:p.id,transactionId:command.id,baseVersion:p.baseVersion,componentIds:[...selected],undoState:'available'});
        effects.push(effectFor({...data,source:p.source},command.id,p.id,'proposal'));message='主人已选择组件，待规则引擎重新检查导航、成本和容量后原子应用';break;
      }
      case 'rejectProposal': {const p=state.proposals.find(p=>p.id===command.proposalId);requireRule(p&&p.status==='pending','提案已处理');p.status='rejected';message='已拒绝本地提案';break;}
      case 'undoProposal': {
        const receipt=state.proposalReceipts.find(r=>r.proposalId===command.proposalId);requireRule(receipt&&receipt.undoState==='available','提案尚未应用或已经撤销');
        receipt.undoState='undone';receipt.undoTransactionId=command.id;
        effects.push({type:'undoProposal',transactionId:command.id,proposalId:receipt.proposalId,originalTransactionId:receipt.transactionId,requiresSpatialValidation:true,restoreGrowth:false});message='待规则引擎核对原事务与后续布局；只恢复改造，不倒退成长、不重复退料';break;
      }
      case 'setProposalRemix': {
        const p=state.proposals.find(p=>p.id===command.proposalId);requireRule(p&&p.status==='accepted'&&typeof command.allowRemix==='boolean','只能单独调整已接受的本地演示作品二创许可');
        p.allowRemix=command.allowRemix;message='已单独更新本地演示二创许可；不包含公开发布许可';break;
      }
      case 'remixProposal': {
        const p=state.proposals.find(p=>p.id===command.proposalId);requireRule(p?.status==='accepted'&&p.allowRemix,'观看或编辑不等于二创，需单独许可');
        activeGrant(state,p.grantId,p.visitorId,ctx);
        const selected=p.components.filter(c=>p.acceptedComponentIds?.includes(c.id));
        const data=blueprint({...p,baseVersion:ctx.layoutVersion,components:selected},ctx);
        const parent={...structuredClone(p.source),assetId:p.id,version:p.baseVersion};
        const remixSource:SourceAttribution={...source(actor,command.id,ctx.layoutVersion),kind:'local-remix',license:'local-remix',parent};
        state.drafts.push({id:command.id,kind:'blueprint',authorId:actor,...data,createdAt:ctx.now,status:'draft',source:remixSource});message='仅把获准组件复制到私有草稿，保留原作版本署名；需重新校验自己的布局';break;
      }
      case 'sweep': {
        for(const h of state.help)if(pendingHelp(h)){
          const g=state.grants.find(g=>g.id===h.grantId);
          if(!g||g.revokedAt!==undefined){h.status='revoked';refund(state,h,ctx.now);}
          else if(ctx.now>=h.expiresAt||ctx.now>=g.expiresAt){h.status='expired';refund(state,h,ctx.now);}
        }
        for(const p of state.proposals)if(p.status==='pending'){
          const g=state.grants.find(g=>g.id===p.grantId);
          if(!g||g.revokedAt!==undefined)p.status='revoked';else if(ctx.now>=p.expiresAt)p.status='expired';
        }
        for(const v of state.visits)if(v.status==='active'&&v.grantId){const g=state.grants.find(g=>g.id===v.grantId);if(!g||g.revokedAt!==undefined||ctx.now>=g.expiresAt)v.status='revoked';}
        message='已整理本地演示到期提案，预留食物最多退回一次';break;
      }
      default: return fail('没有该创作操作；未接入外部生成、公开发布或远程好友服务');
    }
    state.receipts.push({id:command.id,type:command.type,at:ctx.now});
    return {ok:true,state,message,effects};
  } catch(error) {return fail(error instanceof Error?error.message:'创作数据无效');}
}
