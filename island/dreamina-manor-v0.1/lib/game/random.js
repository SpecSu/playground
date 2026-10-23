import {ECONOMY,validTier,priceItem} from './economy.js';
import {makeCatalogue} from './catalogue.js';
export function seededRandom(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function secureSeed(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0];}
export function rollProduct(kind,inputTier,seed,id,now,config=ECONOMY){
 if(!['plant','fish'].includes(kind)||!validTier(inputTier)||!Number.isSafeInteger(seed)||typeof id!=='string'||!id)throw new Error('Invalid draw');
 const random=seededRandom(seed),tier=inputTier+(random()<config.upgradeChance[inputTier-1]?1:0);
 const pool=makeCatalogue(config).filter(s=>s.kind===kind&&s.tier===tier);if(pool.length!==(kind==='plant'?2:4))throw new Error('Incomplete catalogue');
 const species=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))],r=random();
 const mutation=r<config.mutationChance.giant?'giant':r<config.mutationChance.giant+config.mutationChance.gold?'gold':'normal';
 const ordinary=config.ordinarySize[0]+random()*(config.ordinarySize[1]-config.ordinarySize[0]);
 const giant=mutation==='giant'?config.giantSize[0]+random()*(config.giantSize[1]-config.giantSize[0]):1;
 const finalSize=Math.round(species.standardSize*ordinary*giant*10000)/10000;
 return {id,speciesId:species.id,kind,tier,mutation,standardSize:species.standardSize,finalSize,value:priceItem(species,finalSize,mutation,config),createdAt:now};
}
