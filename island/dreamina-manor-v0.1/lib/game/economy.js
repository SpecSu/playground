/** One shared, versioned configuration for UI, server and simulations.
 * Values marked candidate require the PM's economic review before release. */
export const ECONOMY=Object.freeze({
 version:'manor-economy-20261022-1', status:'approved',
 startingCoins:24,startingSeeds:1,
 inputCosts:[8,28,90,250,700],growSeconds:[15,45,120,300,540],
 firstPlantSeconds:10,baseValues:[12,42,135,380,1050],
 upgradeChance:[.05,.06,.07,.08,0],
 ordinarySize:[.8,1.2],giantSize:[1.3,1.3],
 mutationChance:{giant:.06,gold:.02},goldValueMultiplier:2.5,
 landPrice:60,dockPrice:60,tankModulePrice:80,tankCapacityPerCell:10,
 walkSecondsPerCell:.62,plantActionMs:1100,harvestActionMs:650,
 theftCooldownMs:6*60*60*1000,
});
export const TIER_LABELS=['普通','特别','稀有','史诗','传说'];
export const validTier=t=>Number.isInteger(t)&&t>=1&&t<=5;
export function priceItem(species,finalSize,mutation,config=ECONOMY){
 if(!Number.isFinite(finalSize)||finalSize<=0||!Number.isFinite(species.standardSize)||species.standardSize<=0)throw new Error('Invalid physical size');
 if(!['normal','giant','gold'].includes(mutation))throw new Error('Unknown mutation');
 return Math.max(1,Math.floor(species.baseValue*finalSize/species.standardSize*(mutation==='gold'?config.goldValueMultiplier:1)));
}
