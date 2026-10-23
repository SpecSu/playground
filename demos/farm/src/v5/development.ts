import {layoutActors,type Profile} from './estate.ts';
import {lookoutReservationSafe} from './lookout.ts';
import {BUILDING_RULES,previewEdit,type GridPoint,type LayoutEdit,type LayoutPreview} from './layout.ts';
export type DevelopmentKind='tower'|'shelter'|'factory';
export type DevelopmentChoice={kind:DevelopmentKind;title:string;description:string;tradeoff:string;anchor:GridPoint};
export const DEVELOPMENT_CHOICES:DevelopmentChoice[]=[
 {kind:'tower',title:'看得更远',description:'伙伴沿阶梯登台并站稳眺望，猫增加4格视距，狗和奶蛙增加2格。',tradeoff:'离台即失去加成，仍受设施遮挡；眺望期间不在羊群身边。',anchor:{x:8,z:1}},
 {kind:'shelter',title:'多一处安全家',description:'新增6个保护位，按实际路程分流到可达入口。',tradeoff:'需要24金币；位置比数量重要，远端仍可能排队。',anchor:{x:7,z:4}},
 {kind:'factory',title:'照料更从容',description:'每60秒准备3份饲料，最多储存12份，LX可搬去食槽。',tradeoff:'工厂到食槽越远，配送越慢；仍保留免费基础食物。',anchor:{x:3,z:7}},
];
export type DevelopmentPlan={edit:Extract<LayoutEdit,{type:'place'}>|null;preview:LayoutPreview|null;reason?:string};
export function developmentActors(p:Profile):GridPoint[]{return layoutActors(p);}
export function developmentPreview(p:Profile,edit:LayoutEdit,baseVersion=p.layout.version,materials=p.materials):LayoutPreview{
 const result=previewEdit(p.layout,edit,{materials,baseVersion,actors:developmentActors(p),surveyed:p.surveyed,locked:!!p.threat});
 if(!lookoutReservationSafe(result.after,p.threat?.guardian?.lookout??p.guardianLookout)){result.ok=false;result.reasons.push('请保留守望伙伴的高台和下台入口');}
 return result;
}
/** Online clocks and remote snapshot object identities do not alter legality. */
export function developmentPreviewKey(p:Profile):string{
 return JSON.stringify([p.id,p.runId??'',p.layout.version,p.layout.construction?.eventId??'',p.materials,p.surveyed,!!p.threat,p.guardianLookout?.phase!=='done'?p.guardianLookout?.buildingId:null,developmentActors(p)]);
}
/** Suggest a location, not an automatic purchase. Confirmation uses the existing
 * versioned construction transaction; every position is checked against its graph. */
export function suggestDevelopment(p:Profile,kind:DevelopmentKind):DevelopmentPlan{
 if(p.threat)return {edit:null,preview:null,reason:'请先完成守护事件并收好记录，再决定建设。'};
 if(p.layout.construction)return {edit:null,preview:null,reason:'已有工程正在施工，回到场景等待完成或在布置中取消。'};
 if(kind==='factory'&&p.layout.buildings.some(b=>b.kind==='factory'))return {edit:null,preview:null,reason:'已经有一座饲料厂，可以在布置中搬近食槽。'};
 const choice=DEVELOPMENT_CHOICES.find(c=>c.kind===kind)!;
 const points=[...p.layout.owned].sort((a,b)=>(Math.abs(a.x-choice.anchor.x)+Math.abs(a.z-choice.anchor.z))-(Math.abs(b.x-choice.anchor.x)+Math.abs(b.z-choice.anchor.z))||a.z-b.z||a.x-b.x);
 const context={materials:Math.max(p.materials,BUILDING_RULES[kind].cost),baseVersion:p.layout.version,actors:developmentActors(p),surveyed:p.surveyed,locked:false};
 for(const point of points){
  const edit:Extract<LayoutEdit,{type:'place'}>={type:'place',id:`development-${p.layout.version}-${kind}-${point.x}-${point.z}`,kind,...point,rotation:0};
  const candidate=developmentPreview(p,edit,context.baseVersion,context.materials);
  if(!candidate.ok)continue;
  return {edit,preview:context.materials===p.materials?candidate:developmentPreview(p,edit,context.baseVersion,p.materials)};
 }
 return {edit:null,preview:null,reason:'已有土地里没有找到不挡路的位置。可以先搬动设施，或勘察东边再拓荒。'};
}
