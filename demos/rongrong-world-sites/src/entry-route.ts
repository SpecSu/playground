export type FarmRoute='minimal'|'animationLab'|'estate'|'convoy'|'harvest';
/** An explicit name must reach the fail-closed selector, never a legacy save. */
export function selectFarmRoute(search:string):FarmRoute{
 const params=new URLSearchParams(search);
 return params.has('name')?'minimal':params.has('animationLab')?'animationLab':params.has('harvest')?'harvest':params.has('convoy')?'convoy':params.has('legacy')?'estate':'minimal';
}
