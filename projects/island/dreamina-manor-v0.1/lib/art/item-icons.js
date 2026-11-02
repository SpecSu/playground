/** Same packet silhouette; distinct botanical seals make rarity readable without confusing it with quantity. */
export const ART_ITEM_GRADE_COLOURS=Object.freeze(['#69836B','#628A9F','#C08A60','#9276A5','#B69B54']);
export function artItemIcon(kind,tier=1){
  if(!['seed','bait'].includes(kind))throw new Error('Art packet kind must be seed or bait');
  const grade=Math.max(1,Math.min(5,Math.round(Number(tier)||1)));
  return `/assets/world/icons/${kind}-${grade}-botanical-v10b.svg`;
}
