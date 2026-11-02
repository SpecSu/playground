import {nearestLandmark} from './interaction-landmarks.js';
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const keyAt=(x,count)=>Math.min(count-1,Math.floor(clamp(x)*count));
const keyboardKey=(geometry,x,y)=>geometry?.keyboardKeys?.length===5?nearestLandmark(geometry.keyboardKeys,x,y,{horizontal:true}):keyAt(x,5);
export const controlHint=kind=>({
 game:'轻点手柄叶，亮起彩色按键',hug:'轻轻按住，抱一抱软软的花叶',pulse:'轻点叶脉，追一束流动的微光',scan:'轻点叶盘，扫过一圈雷达光',tempo:'轻点竹节，敲一小段运动节拍',
 drum:'点左边 / 右边，敲两种鼓声',bell:'点三颗铃，听高低不同的声音',keyboard:'横向划过琴键，弹一小段旋律',
 puff:'按住慢慢鼓起，松手噗一下',wave:'左右轻划，把叶子推成小浪',sleep:'按住轻轻哄它，别着急戳醒',glow:'点一下开关灯，连点三下有小惊喜',
 moon:'轻点月亮开关，按住一会儿请出星星',float:'轻点云灯，让它托起一小片晚霞',bubble:'轻点壶嘴，吹一串慢慢飘的泡泡',paint:'轻点画笔，洒出一抹好天气',gramophone:'轻点喇叭，听一段小唱片',whisper:'轻碰叶子，读一句花园悄悄话',sway:'轻轻碰一下，和叶子打个招呼',
}[kind]??'轻轻碰一下，认识它的小脾气');
export function createPlantControl(kind,event,previous=null){
 const s={kind,geometry:event.geometry??previous?.geometry,active:true,startedAt:event.at,lastAt:event.at,x:clamp(event.x),y:clamp(event.y),startX:clamp(event.x),pressure:0,displacement:0,key:null,dreamed:false,
  lit:previous?.lit??false,taps:previous&&event.at-previous.startedAt<900?(previous.taps??0)+1:1,secretFound:previous?.secretFound??false,lastSoundAt:0};
 const events=[];
 if(['game','hug','pulse','scan','tempo'].includes(kind))events.push({type:kind});
 else if(kind==='drum')events.push({type:'drum',zone:s.geometry?.drumZones?.length===2?nearestLandmark(s.geometry.drumZones,event.x,event.y):event.x<.5?0:1});
 else if(kind==='bell')events.push({type:'bell',note:keyAt(event.x,3)});
 else if(kind==='keyboard'){s.key=keyboardKey(s.geometry,event.x,event.y);events.push({type:'key',note:s.key});}
 else if(kind==='moon'){s.lit=!s.lit;events.push({type:'light',lit:s.lit});}
 else if(kind==='glow'){s.lit=!s.lit;events.push({type:'light',lit:s.lit});if(s.taps===3&&!s.secretFound){events.push({type:'fireflies'});s.secretFound=true;}}
 else if(kind==='sleep')events.push({type:previous&&event.at-previous.startedAt<650?'poke':'yawn'});
 else if(!['puff','wave'].includes(kind))events.push({type:'tap'});
 return {state:s,events};
}
export function stepPlantControl(state,event){
 const s={...state},events=[];if(!s.active)return {state:s,events};
 s.lastAt=event.at;s.x=clamp(event.x);s.y=clamp(event.y);
 if(event.type==='cancel'){s.active=false;s.releasedAt=event.at;s.pressure=0;s.displacement=0;return {state:s,events};}
 if(s.kind==='puff')s.pressure=clamp((event.at-s.startedAt)/850);
 if(s.kind==='keyboard'&&['move','hold'].includes(event.type)){const key=keyboardKey(s.geometry,event.x,event.y);if(key!==s.key){s.key=key;events.push({type:'key',note:key});}}
 if(s.kind==='wave'&&['move','hold'].includes(event.type)){
  s.displacement=clamp((event.x-s.startX)*2,-1,1);
  if(Math.abs(s.displacement-(s.lastSoundDisplacement??0))>.2&&event.at-s.lastSoundAt>100){events.push({type:'wave',strength:Math.abs(s.displacement)});s.lastSoundAt=event.at;s.lastSoundDisplacement=s.displacement;}
 }
 if(['sleep','moon'].includes(s.kind)&&event.at-s.startedAt>=700&&!s.dreamed){s.dreamed=true;events.push({type:'dream'});}
 if(event.type==='end'){
  s.active=false;s.releasedAt=event.at;
  if(s.kind==='puff')events.push({type:'pop',strength:Math.max(.18,s.pressure)});
 }
 return {state:s,events};
}
export function controlVisual(state,at){
 const v={sx:1,sy:1,dy:0,rotation:0,glow:['glow','moon'].includes(state?.kind)&&state.lit ? .55 : 0};if(!state)return v;
 const elapsed=Math.max(0,at-(state.releasedAt??at)),decay=state.active?1:Math.max(0,1-elapsed/700);
 if(state.kind==='puff'){
  const pressure=state.active?clamp((at-state.startedAt)/850):state.pressure*decay*Math.cos(elapsed/65);
  v.sx=1+pressure*.3;v.sy=1+pressure*.18;v.dy=-Math.max(0,pressure)*4;
 }
 if(state.kind==='wave'){v.rotation=state.displacement*.2*decay;v.sx=1+Math.abs(state.displacement)*.08*decay;}
 if(state.kind==='sleep'&&state.active&&at-state.startedAt>500){v.dy=3;v.sy=.95;v.rotation=Math.sin((at-state.startedAt)/600)*.035;}
 return v;
}
