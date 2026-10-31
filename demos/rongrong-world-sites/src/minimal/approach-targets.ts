import {nearShop,playerWalkRoute,SHOP_APPROACH,WATER_BOWL,REST_MAT,type MinimalState,type Point} from './model.ts';
const same=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
/** Reuses the economic near-shop boundary, including old saves whose original approach became water. */
export function reachableShopApproach(state:MinimalState):Point|null{
 const reachable=(point:Point)=>nearShop({...state,player:point})?playerWalkRoute(state,state.player,point):null;
 if(reachable(SHOP_APPROACH)!==null)return {...SHOP_APPROACH};
 const candidates=state.tiles.flatMap(tile=>{const point={x:tile.x,z:tile.z},route=reachable(point);if(!route)return [];
  let from=state.player,length=0;for(const step of route){length+=Math.hypot(step.x-from.x,step.z-from.z);from=step;}
  return [{point,length,prop:same(point,WATER_BOWL)||same(point,REST_MAT)?1:0}];
 }).sort((a,b)=>a.prop-b.prop||a.length-b.length||a.point.x-b.point.x||a.point.z-b.point.z);
 return candidates[0]?.point??null;
}
