import {isShopTile,WATER_BOWL,REST_MAT,type MinimalState,type Point} from './model.ts';
/** Conservative full horizontal support, not a root-cell-only test. Ordinary
 * tile ecology and canonical obstacle ownership are not modified. */
export function lunarGroundClear(state:MinimalState,p:Point,radius:number,obstacles:readonly Point[]=state.staticObstacles??[]):boolean{
 if(![p.x,p.z,radius].every(Number.isFinite)||radius<=0||radius>4)return false;const r=radius+.045;
 if(p.x-r< -4||p.x+r>8||p.z-r< -4||p.z+r>8)return false;
 for(const t of state.tiles){const blocked=!t.owned||t.terrain==='pond'||t.terrain==='creek'||isShopTile(t)||[WATER_BOWL,REST_MAT,...obstacles].some(o=>o.x===t.x&&o.z===t.z);if(!blocked)continue;const x=(t.x-1.5)*2,z=(t.z-1.5)*2,dx=Math.max(0,Math.abs(p.x-x)-1),dz=Math.max(0,Math.abs(p.z-z)-1);if(dx*dx+dz*dz<r*r)return false;}return true;
}
