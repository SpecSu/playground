import type {Profile} from './estate.ts';
import {isPlayerWalkable,regionAt,type GridPoint} from './layout.ts';
import {findPlayerPath} from './player-navigation.ts';

export type JourneyState={discovered:string[]};
export type JourneyAction=
 |{kind:'inspect';target:string}|{kind:'refill'}|{kind:'move';to:GridPoint}
 |{kind:'development'}|{kind:'guardian'}|{kind:'survey'}|{kind:'expand'}|{kind:'explore'};
export type JourneyGoal={id:string;title:string;detail:string;progress:string;label:string;step:number;total:number;action:JourneyAction};
export const LANDMARKS:readonly {id:string;name:string;position:GridPoint;benefit:string;reward:number}[]=[
 {id:'west-grove',name:'西边的风铃林',position:{x:-3,z:4},benefit:'发现散步目的地，获得8份建设材料',reward:8},
 {id:'east-lookout',name:'东边的远望石',position:{x:14,z:4},benefit:'发现可拓荒方向，获得8份建设材料',reward:8},
 {id:'south-garden',name:'南边的花谷',position:{x:7,z:14},benefit:'发现拍照目的地，获得8份建设材料',reward:8},
];
const distance=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const discoveryId=(id:string)=>`discovery-${id}`;
/** Read old saves without inventing visits; receipts survive the bounded event log. */
export function discoveredLandmarkIds(p:Profile):string[]{return LANDMARKS.filter(l=>p.journey?.discovered.includes(l.id)||p.milestones.includes(discoveryId(l.id))).map(l=>l.id);}
/** Call only from an effective online tick, never from GET/offline settlement. */
export function newlyReachedLandmarks(p:Profile):typeof LANDMARKS[number][]{
 if(p.tutorial!=='done'||p.threat||!isPlayerWalkable(p.layout,{x:Math.round(p.position.x),z:Math.round(p.position.z)}))return [];
 const known=new Set(discoveredLandmarkIds(p));return LANDMARKS.filter(l=>!known.has(l.id)&&distance(p.position,l.position)<=1.2);
}
export function hasUsefulDevelopment(p:Profile):boolean{return p.milestones.includes('journey-developed')||p.layout.buildings.some(b=>b.paidCost>0&&['shelter','tower','factory'].includes(b.kind));}
function goal(id:string,title:string,detail:string,progress:string,label:string,step:number,action:JourneyAction):JourneyGoal{return {id,title,detail,progress,label,step,total:7,action};}
function regionDestination(p:Profile,region:string,preferred:GridPoint):GridPoint|undefined{
 return p.layout.owned.filter(q=>regionAt(q)===region&&isPlayerWalkable(p.layout,q)).sort((a,b)=>distance(a,preferred)-distance(b,preferred)).find(q=>findPlayerPath(p.layout,p.position,q));
}
/** This is a suggestion, not a gate. All free movement/building remains available. */
export function currentJourneyGoal(p:Profile):JourneyGoal{
 if(p.tutorial!=='done')return goal('opening','先守住幼崽的小家','跟随开场提示；选择伙伴时危险暂停','初次回家','查看守护',1,{kind:'guardian'});
 if(p.threat){
  const lost=p.threat.actors.filter(a=>a.status==='lost').length;
  return goal('event',p.threat.phase==='complete'?(lost?'带走失的伙伴回家':'收好这次守护记录'):'陪大家回保护区',lost?'打开守护面板，选择免费找回。':p.threat.phase==='complete'?'看看真实路线与进门结果，再回到日常生活。':'打开守护面板，选择伙伴能力；结束后会继续建设与探索。',`${p.threat.actors.filter(a=>a.status==='safe').length}/${p.threat.actors.length} 已安全`,'查看守护',5,{kind:'guardian'});
 }
 const animals=p.animals.filter(a=>!a.memorial),unfed=animals.filter(a=>!p.milestones.includes(`fed-${a.id}`));
 const fed=animals.length-unfed.length,firstMeal=p.milestones.includes('first-meal')||!unfed.length;
 if(!firstMeal){
  const target=unfed.find(a=>a.life.hunger<80);
  if(target){
   if(p.job?.type==='feed')return goal('first-meal',`正在照顾${animals.find(a=>a.id===p.job!.target)?.name??target.name}`,'LX会先走近再喂食，走开可以取消。',`${fed}/${animals.length} 吃过第一顿`,'查看动物',1,{kind:'inspect',target:p.job.target??target.id});
   if(!p.inventory.hand)return goal('first-meal','背包空了，先补充食物',p.job?.type==='refill'?'LX正在工作台补充；基础食物免费。':'工作台免费补充，再分别照顾三只幼崽。',`${fed}/${animals.length} 吃过第一顿`,'去补充',1,{kind:'refill'});
   return goal('first-meal',`给${target.name}第一口${target.life.stage==='baby'?'奶':'饲料'}`,'点开卡片再喂食；三只都吃到第一顿可获得8材料。',`${fed}/${animals.length} 吃过第一顿`,'去照顾',1,{kind:'inspect',target:target.id});
  }
 }
 const pauseCare=!firstMeal?'它们已经吃饱，先去探索，饿了再照顾。':'';
 if(!p.milestones.includes('walk-home')){
  const regions=[{id:'home',name:'家园工作台',at:{x:4,z:8}},{id:'meadow',name:'散步草场',at:{x:8,z:4}},{id:'shore',name:'池岸',at:{x:8,z:8}}],next=regions.find(r=>!p.regions.includes(r.id));
  if(next){const to=regionDestination(p,next.id,next.at);return goal('walk-home',`去${next.name}看看`,`${pauseCare}走通家园、草场和池岸可获得8材料。羊会留在岸上。`,`${regions.filter(r=>p.regions.includes(r.id)).length}/3 生活区域`,to?'带我过去':'查看道路',2,to?{kind:'move',to}:{kind:'development'});}
 }
 const discovered=discoveredLandmarkIds(p),unknown=LANDMARKS.filter(l=>!discovered.includes(l.id));
 if(unknown.length){const next=[...unknown].sort((a,b)=>distance(a.position,p.position)-distance(b.position,p.position))[0];return goal('discover-valley',`探索${next.name}`,`${pauseCare}走近路标，发现记录会保存；每处只奖励一次。探索不会自动购买土地。`,`${discovered.length}/${LANDMARKS.length} 山谷发现`,'带我探索',3,{kind:'move',to:{...next.position}});}
 if(p.layout.construction){const build=p.layout.construction;return goal('construction','建设正在进行',`${pauseCare}可以继续散步；离线会暂停施工，不扣动物关系。`,`${Math.min(100,Math.floor(build.elapsedMs/build.durationMs*100))}% · 还需${Math.ceil((build.durationMs-build.elapsedMs)/1000)}秒在线`,'查看建设',4,{kind:'development'});}
 if(!hasUsefulDevelopment(p))return goal('develop','选一项发展方向',`${pauseCare}${p.materials<12?'材料不足，可回收闲置的付费设施；免费移动现有设施也能优化路线。':'观察台帮助猫发现威胁；保护区增加安全位；工厂生产可配送的饲料。'}`,`${p.materials} 材料 · 台12 / 区24 / 厂20`,'比较并建设',4,{kind:'development'});
 const rehearsed=p.milestones.includes('journey-rehearsed')||(p.lastThreat?.mode==='rehearsal'&&p.lastThreat.phase==='complete');
 if(!rehearsed)return goal('rehearse','试试现在的保护布局',`${pauseCare}主动开始无损演练，观察路线、入口排队和伙伴能力。日常成长不要求完成它。`,'布局已完成 · 安心演练','打开守护',5,{kind:'guardian'});
 if(!p.surveyed){const near=p.position.x>=10;return goal('survey','勘察东侧新土地',p.job?.type==='survey'?'正在观察边界，停留满5秒即可完成。':`${pauseCare}先走到东侧再观察5秒；勘察免费，拓荒另需30材料。`,'探索与拥有土地分开',near?'勘察边界':'去东侧',6,near?{kind:'survey'}:{kind:'move',to:{x:11,z:4}});}
 if(p.layout.owned.length<=144)return goal('expand','把发现变成自己的新土地',`${pauseCare}${p.materials>=30?'预览相邻36格，确认花费30材料。完工后才能在那里建造。':'还差'+(30-p.materials)+'材料；先回收闲置的付费设施，或领取成年动物的有限产物。'}`,`${p.materials}/30 材料 · 36格新土地`,'查看拓荒',7,{kind:'expand'});
 return goal('free-explore','小家安定了，接着自由经营',`${pauseCare}陪幼崽成长、调整路线、生产并配送饲料，或换伙伴比较守护结果。`,`${discovered.length}处发现 · ${p.layout.owned.length}格土地`,'查看发展',7,{kind:'development'});
}
