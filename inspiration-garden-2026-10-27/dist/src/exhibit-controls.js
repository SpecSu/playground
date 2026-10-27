import {nearestLandmark} from './interaction-landmarks.js';
import {PERSONAL_REACTION_MS} from './personal-exhibit-reactions.js';
import {ROADSTER_HOVER_MS} from './roadster-hover.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const portraitZone=(x,y,geometry)=>nearestLandmark(geometry?.rehearsalZones?.length===3?geometry.rehearsalZones:[[.31,.33],[.50,.37],[.39,.69]],x,y);
export const exhibitHint=kind=>({shutter:'轻碰镜头，留下一瞬轻亮的快门声','shell-glow':'轻碰扇屋，让柔光沿着贝壳纹路走过',canopy:'走到可达的天幕外沿，轻碰布面，让营灯暖暖亮一下',meow:'轻碰一次，抛一条小鱼，等它吃完开心一下',ink:'轻点笔尖，让一句没说完的话亮起来',stride:'轻碰白鞋，跟着小小脚步慢行',hover:'轻碰车身，贴地升起一点，再轻轻落回原处',chime:'轻碰吊坠，让纪念庭响起一阵清亮的风',game:'轻点手柄门牌，亮起收藏小屋的按键',stitch:'轻点线轴，让一针一线跳个小舞',scan:'轻点雷达，扫描一圈指挥工坊',lap:'轻点计时牌，跑道亮起一圈节拍',rehearsal:'划过两扇眼镜窗和下方小琴，合奏三种声音',purr:'按住小猫书屋，听它慢慢呼噜、翻页',camp:'轻点营灯开关，左右划过，给小屋一阵风'}[kind]??'轻碰建筑，看看里面的小日常');
export function createExhibitControl(kind,event,previous=null){
 const state={kind,geometry:event.geometry??previous?.geometry,active:true,startedAt:event.at,lastSoundAt:event.at,x:clamp(event.x),y:clamp(event.y),startX:clamp(event.x),note:null,warmth:0,pageTurned:false,lit:previous?.lit??false,breeze:0,feedingAt:previous?.feedingAt??-Infinity,hoverAt:previous?.hoverAt??-Infinity,reactionAt:previous?.reactionAt??-Infinity};
 const events=[];if(['ink','stride','chime','game','stitch','scan','lap'].includes(kind))events.push({type:kind});
 if(PERSONAL_REACTION_MS[kind]&&event.at-state.reactionAt>=PERSONAL_REACTION_MS[kind]){state.reactionAt=event.at;events.push({type:kind});}
 if(kind==='hover'&&event.at-state.hoverAt>=ROADSTER_HOVER_MS){state.hoverAt=event.at;events.push({type:'hover'});}
 if(kind==='meow'&&event.at-state.feedingAt>=3000){state.feedingAt=event.at;events.push({type:'feed'});}
 if(kind==='rehearsal'){state.note=portraitZone(event.x,event.y,state.geometry);events.push({type:'ensemble',note:state.note});}
 if(kind==='purr')events.push({type:'purr',strength:.25});
 if(kind==='camp'){state.lit=!state.lit;events.push({type:'camp',lit:state.lit});}
 return {state,events};
}
export function stepExhibitControl(previous,event){
 const state={...previous},events=[];if(!state.active)return {state,events};state.x=clamp(event.x);state.y=clamp(event.y);
 if(event.type==='cancel'||event.type==='end'){state.active=false;state.releasedAt=event.at;if(event.type==='cancel'){if(state.kind==='hover')state.hoverAt=-Infinity;if(PERSONAL_REACTION_MS[state.kind])state.reactionAt=-Infinity;}return {state,events};}
 if(state.kind==='rehearsal'){const note=portraitZone(state.x,state.y,state.geometry);if(note!==state.note){state.note=note;events.push({type:'ensemble',note});}}
 if(state.kind==='purr'){
  state.warmth=clamp((event.at-state.startedAt)/1000);
  if(event.at-state.lastSoundAt>=380){events.push({type:'purr',strength:state.warmth});state.lastSoundAt=event.at;}
  if(event.at-state.startedAt>=900&&!state.pageTurned){events.push({type:'page'});state.pageTurned=true;}
 }
 if(state.kind==='camp'){
  state.breeze=clamp((state.x-state.startX)*2,-1,1);
  if(Math.abs(state.breeze-(state.lastBreeze??0))>.25&&event.at-state.lastSoundAt>=140){events.push({type:'breeze',strength:Math.abs(state.breeze)});state.lastBreeze=state.breeze;state.lastSoundAt=event.at;}
 }
 return {state,events};
}
export function exhibitVisual(state,at){
 const decay=!state?0:state.active?1:clamp(1-(at-(state.releasedAt??at))/650);
 return {warmth:(state?.warmth??0)*decay,lit:!!state?.lit,note:decay>0?state?.note:null,breeze:(state?.breeze??0)*decay,page:!!state?.pageTurned&&decay>0,breath:state?.kind==='purr'?Math.sin(at/420)*.012*decay:0};
}
