import {Vector3,type Camera} from 'three';
import {isWalkable,buildingFootprint,type Building,type Layout,type GridPoint} from './layout.ts';
import type {EstateAnimal,Profile} from './estate.ts';
import type {Animal,Action} from '../model.ts';
import type {SheepAction} from '../sheep.ts';
import {findActorPath} from './actor-navigation.ts';
export const gridToWorld=(p:GridPoint):GridPoint=>({x:p.x-5.5,z:p.z-5.5});
export const worldToGrid=(p:GridPoint):GridPoint=>({x:Math.round(p.x+5.5),z:Math.round(p.z+5.5)});
/** Interpolation only renders already-authorized progress, following legal graph edges. */
export function interpolationRoute(layout:Layout,from:GridPoint,to:GridPoint):GridPoint[]{
 return findActorPath(layout,from,to)?.slice(1)??[];
}
/** Diagonal input resolves to one cardinal edge; rejected cells stay rejected. */
export function movementCell(layout:Layout,position:GridPoint,direction:GridPoint):GridPoint|null{
 if(!direction.x&&!direction.z)return null;
 const p={x:Math.round(position.x),z:Math.round(position.z)};
 const next=Math.abs(direction.x)>=Math.abs(direction.z)?{x:p.x+Math.sign(direction.x),z:p.z}:{x:p.x,z:p.z+Math.sign(direction.z)};
 return isWalkable(layout,next)?next:null;
}
export function sceneBuilding(b:Building){
 const cells=buildingFootprint(b),xs=cells.map(p=>p.x),zs=cells.map(p=>p.z),left=Math.min(...xs),right=Math.max(...xs),near=Math.min(...zs),far=Math.max(...zs);
 return {cells,center:gridToWorld({x:(left+right)/2,z:(near+far)/2}),width:right-left+1,depth:far-near+1,doors:b.doors.map(d=>({...gridToWorld(d),open:d.open,id:d.id}))};
}
export function legacyAnimal(a:EstateAnimal):Animal{
 return {id:a.id,name:a.name,personality:a.personality,preference:a.preference,color:a.color,bond:a.life.bond/100*12,habits:a.life.habits,experiences:a.life.memory.map(m=>({text:m.text,at:m.at})),appearance:a.appearance,growthEligible:false,growthChoiceMade:true,care:{feedCount:0,companyCount:0,lastFeedAt:0,lastCompanyAt:0}};
}
export type SceneResponse={action:SheepAction|undefined;micro:boolean;style:'copy'|'tiny'|'remix';elapsed:number;weight:number;text:string;greeting:boolean};
export function sceneResponse(a:EstateAnimal,visual:Profile['lastVisual'],now:number,enteredAt=0,onlineMs?:number):SceneResponse{
 const style=a.personality==='shy'?'tiny':a.personality==='independent'?'remix':'copy';
 const delay=a.personality==='shy'?1600:a.personality==='independent'?650:120;
 const action=visual&&(visual.target===a.id||visual.target==='all')&&now-visual.at>=0&&now-visual.at<7000?visual.action:undefined;
 const learned=(['dance','bounce','love'] as const).find(k=>a.life.habits[k]?.stage==='invite');
 const remembered=enteredAt>0&&now-enteredAt>=0&&now-enteredAt<10000?learned:undefined;
 const inviting=!action&&!remembered&&onlineMs!==undefined&&onlineMs>=30000&&onlineMs%30000<5000?learned:undefined;
 const greeting=!action&&!!remembered;const chosen=action??remembered??inviting;const elapsed=chosen?(inviting?onlineMs!%30000:now-(action?visual!.at:enteredAt)):0;
 const micro=!!chosen&&elapsed<delay;
 const actual=elapsed>=delay?chosen:undefined;
 const text=chosen?(inviting?`${a.name}主动邀请你再来一段`:greeting?`${a.name}记得与你的${chosen==='dance'?'舞步':chosen==='bounce'?'蹦跳':'喜欢'}，想再来一次`:chosen==='eat'?a.personality==='shy'?'先闻一闻…慢慢吃':a.personality==='independent'?'我选这口，慢慢吃':'我来啦，开饭！':a.personality==='shy'?'耳朵动了动…也想试试':a.personality==='independent'?'看我的改编版':'好耶，一起玩！'):'';
 return {action:actual,micro,style,elapsed:Math.max(0,elapsed-delay)/1000,weight:actual?Math.min(1,(elapsed-delay)/400)*Math.max(0,Math.min(1,(7000-elapsed)/700)):0,text,greeting};
}
export const scenePalette={pasture:{sky:'#e4edda',grass:'#9fb675',meadow:'#b7ca84',home:'#d2c29b',shore:'#a8c4a3',road:'#ead9ab',accent:'#e5af75'},lotus:{sky:'#e8f2e6',grass:'#8cbb93',meadow:'#a6caa1',home:'#c9d7b2',shore:'#99cabb',road:'#e0d6b7',accent:'#dfacc0'},starlit:{sky:'#283a5b',grass:'#6884a2',meadow:'#7c95aa',home:'#8791a5',shore:'#729eb7',road:'#c5c0b4',accent:'#ffe19b'}} as const;
export type SceneAction=Action;

/** Values come from the current camera matrix, used for private work provenance. */
export function cameraCapture(camera:Camera,distance:number){
 const position=camera.getWorldPosition(new Vector3()),target=camera.getWorldDirection(new Vector3()).multiplyScalar(Math.max(.1,distance)).add(position);
 return {position:{x:position.x,y:position.y,z:position.z},target:{x:target.x,y:target.y,z:target.z}};
}
