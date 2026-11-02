import {ECONOMY,validTier} from './economy.js';
/** Separate salt; adding wait variability must not consume product RNG draws. */
export function fishingWaitRange(tier,config=ECONOMY){if(!validTier(tier))throw new Error('Invalid bait tier');const base=config.growSeconds[tier-1];return[Math.round(base*7/10),Math.round(base*13/10)];}
export function fishingWaitSeconds(tier,seed,config=ECONOMY){let n=(seed^0x64bfe129)>>>0;n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);n=(n^(n>>>16))>>>0;const [low,high]=fishingWaitRange(tier,config);return low+Math.floor(n/4294967296*(high-low+1));}
