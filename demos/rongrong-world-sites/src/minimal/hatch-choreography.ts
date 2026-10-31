/** Small, nest-sized anticipation → opening → one low hop → settle.
 * Pure sampling keeps the shell, fallback and skinned actors on one clock. */
export const HATCH_DURATION_MS=1800;
const clamp=(n:number)=>Math.max(0,Math.min(1,Number.isFinite(n)?n:1));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
export function hatchPoseAt(progress:number,reducedMotion=false){
 const p=clamp(progress),hop=clamp((p-.30)/.48),open=smooth((p-.16)/.40);
 return {
  visible:reducedMotion||p>=.30,
  lift:reducedMotion||hop<=0||hop>=1?0:Math.sin(hop*Math.PI)**2*.14,
  open:reducedMotion?1:open,
  shellAlpha:1-smooth((p-.70)/.26),
  glint:reducedMotion?0:Math.sin(clamp((p-.42)/.40)*Math.PI)**2,
  travel:smooth((p-.38)/.50),
 };
}
