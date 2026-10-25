/** artdesign reference depth profile, re-centred on the real expandable shoreline.
 * Original r=2 at the coast gives 1.45m depth (1.17 + 2*.14).
 * The +2 radius offset keeps that depth without assuming a fixed 2x2 island.
 * Shared by sand vertices and decorative rocks so neither floats after a sea-level change.
 */
export function seabedHeight(x,z,shoreDistance,seaHeight){
 const r=Math.max(0,shoreDistance)+2;
 return seaHeight-1.17-Math.min(9,r*.14+Math.max(0,r-4)*.5)+Math.sin(x*.7)*Math.cos(z*.8)*.09;
}
