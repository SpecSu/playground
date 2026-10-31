import type {LunarShowcaseId} from './lunar-showcase-contract.ts';
type GroundPoint=Readonly<{x:number;z:number}>;
/** World metres, not grid cells. Maximum-growth footprints drive navigation.
 * The court is an adult-size building; only actor roots grow over active time. */
export const LUNAR_SHOWCASE_LAYOUT=Object.freeze({
 placements:Object.freeze({
  'yellow-long-ear':Object.freeze({x:-1.5,z:5.5}),
  'kunkun-chicken':Object.freeze({x:3,z:3.8}),
  'red-scarf-person':Object.freeze({x:-1.2,z:-.5}),
  'pink-sheep':Object.freeze({x:6,z:4.8}),
  'floral-vest-person':Object.freeze({x:5.5,z:-.5}),
 } satisfies Record<LunarShowcaseId,GroundPoint>),
 courtStand:Object.freeze({x:3,z:3.8}),courtHeading:Math.PI,courtScale:2,
 // Includes owned roaming land, scaled hoop/paint, adult skins and shot apex.
 bounds:Object.freeze({min:Object.freeze({x:-4,y:-.01,z:-9.7}),max:Object.freeze({x:8.1,y:5.65,z:8})}),
});
