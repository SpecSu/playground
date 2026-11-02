/** Final ordinary display references already include the v17 1.5 enlargement. */
export const PLANT_TIER_HEIGHTS=Object.freeze([1.75,2.85,4.4,4.95,5.5]);
export const PLANT_TIER_WIDTHS=Object.freeze([1.9,2.1,2.4,2.75,3.0]);
// Measured mature authored bounds, not item record sizes. Never shrink an existing plant.
const OLD_FACTORS=Object.freeze({radish:1,daisy:1.75/.976,tomato:1,tulip:2.85/1.760,pumpkin:2.4/1.808,sunflower:4.4/4.384,dragonfruit:4.95/3.375,iris:4.95/2.453,grape:5.5/3.15,phalaenopsis:5.5/2.025});
export function plantVisualMultiplier(speciesId){return OLD_FACTORS[speciesId]??1;}
