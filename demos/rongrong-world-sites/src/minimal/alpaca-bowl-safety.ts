import type {AnimalMotionProfile} from './hunyuan-alpaca-contract.ts';
import type {Point} from './model.ts';
import {WATER_BOWL} from './farm-landmarks.ts';
import {BOWL_SOLID_GEOMETRY} from './bowl-water-geometry.ts';
export const BOWL_CENTER_GRID=Object.freeze({x:WATER_BOWL.x-.25,z:WATER_BOWL.z-.225});
/** All authored walking feet, including swing, swept through arbitrary yaw.
 * Five millimetres is an explicit design margin, not a measured body dimension. */
export function alpacaBowlTurnClearance(profile:AnimalMotionProfile,scale:number):number{
 const feet=profile.walkFeet;return BOWL_SOLID_GEOMETRY.radius+Math.hypot(feet.side,Math.max(feet.front,feet.back))*scale+.005;
}
/** Exact circle/segment clearance in the shared two-world-metres-per-cell plane. */
export function alpacaBowlSegmentSafe(profile:AnimalMotionProfile,scale:number,from:Point,to:Point):boolean{
 if(!Number.isFinite(scale)||scale<=0||![from.x,from.z,to.x,to.z].every(Number.isFinite))return false;
 const dx=to.x-from.x,dz=to.z-from.z,square=dx*dx+dz*dz,u=square?Math.max(0,Math.min(1,((BOWL_CENTER_GRID.x-from.x)*dx+(BOWL_CENTER_GRID.z-from.z)*dz)/square)):0;
 return Math.hypot(from.x+dx*u-BOWL_CENTER_GRID.x,from.z+dz*u-BOWL_CENTER_GRID.z)*2>=alpacaBowlTurnClearance(profile,scale)-1e-8;
}
