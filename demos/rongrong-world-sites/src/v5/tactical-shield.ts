import {isWalkable,type GridPoint,type Layout} from './layout.ts';
import {findActorPath} from './actor-navigation.ts';
export type ShieldTactic={kind:'folding-shield';anchor:GridPoint};
export interface FoldingShieldState extends ShieldTactic {status:'ready'|'moving'|'waiting'|'active'|'expired'|'rejected';startedAt:number|null;until:number|null;remaining:number;reason:string;waitingActorIds:string[]}
export const shieldLayout=(layout:Layout,anchor:GridPoint):Layout=>({...layout,owned:layout.owned.filter(p=>p.x!==anchor.x||p.z!==anchor.z)});
export function shieldSafety(layout:Layout,anchor:GridPoint,actors:{position:GridPoint;destination:GridPoint}[]){
 if(!Number.isInteger(anchor.x)||!Number.isInteger(anchor.z)||!isWalkable(layout,anchor))return {ok:false,reason:'没有可安全部署的锚点，请在事件前选择合法通路格'};
 const blocked=shieldLayout(layout,anchor);
 for(const a of actors)if(!findActorPath(blocked,a.position,a.destination))return {ok:false,reason:'此锚点会封死仍暴露动物的唯一撤离路，请在事件前另选锚点'};
 return {ok:true,reason:''};
}
/** Fixed pre-event choices; callers can show unavailable candidates with the safety reason. */
export const SHIELD_ANCHORS:readonly GridPoint[]=[{x:3,z:4},{x:5,z:4},{x:7,z:4},{x:9,z:4}];
