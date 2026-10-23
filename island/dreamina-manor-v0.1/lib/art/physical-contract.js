/** World grid uses metres. Fish use one approved exhibition ruler in every context. */
export const WORLD_UNIT_METRES=1;
export const FISH_DISPLAY_RULER=Object.freeze({referenceCm:16,referenceWorldLength:.45,standardExponent:.5,enlargement:3,standardCap:1.43});
export function fishWorldLength(finalSizeCm,standardSizeCm){
 if(!Number.isFinite(finalSizeCm)||finalSizeCm<=0)throw new Error('Invalid final fish size');
 if(!Number.isFinite(standardSizeCm)||standardSizeCm<=0)throw new Error('Fish exhibition scale requires its species standard size');
 return Math.min(FISH_DISPLAY_RULER.standardCap,FISH_DISPLAY_RULER.referenceWorldLength*Math.sqrt(standardSizeCm/FISH_DISPLAY_RULER.referenceCm)*FISH_DISPLAY_RULER.enlargement)*(finalSizeCm/standardSizeCm);
}
// finalSize already includes random size and giant. Never multiply giant twice.
export const SHARED_CELL_SIZE=3.2;
export const GROUND_TOP_Y=.45;
export const TANK_BASE_BOTTOM_Y=.45;
export const TANK_BASE_HEIGHT=.12;
export const TANK_FLOOR_Y=.59;
export const TANK_OUTER_EDGE_INSET=.20;
export const TANK_GLASS_THICKNESS=.06;
export const REQUIRED_SWIM_MARGIN=.20;
// Overall longest-axis shape; model proportions and within-species random/giant ratios stay exact.
// The shared exhibition ruler is not a centimetre-to-real-world promise or a per-tank shrink.

export const SEA_SURFACE_Y=-.18;
