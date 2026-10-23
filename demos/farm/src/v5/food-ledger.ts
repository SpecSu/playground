import type {FoodQuality} from './food-resources.ts';
export type FoodBatch={quality:FoodQuality;count:number};
export type FoodLedger={factory:FoodBatch[];hand:FoodBatch[];pantry:FoodBatch[];carried:FoodBatch[];troughs:Record<string,FoodBatch[]>};
export const foodCount=(b:FoodBatch[])=>b.reduce((n,v)=>n+v.count,0);
export function addFood(b:FoodBatch[],count:number,quality:FoodQuality='plain'){if(count<=0)return;const last=b.at(-1);if(last?.quality===quality)last.count+=count;else b.push({quality,count});}
export function takeFood(b:FoodBatch[],count:number):FoodBatch[]{const result:FoodBatch[]=[];let left=Math.max(0,count);while(left>0&&b.length){const n=Math.min(left,b[0].count);addFood(result,n,b[0].quality);b[0].count-=n;left-=n;if(b[0].count<=0)b.shift();}return result;}
export function transferFood(from:FoodBatch[],to:FoodBatch[],count:number){for(const b of takeFood(from,count))addFood(to,b.count,b.quality);}
/** Legacy scalar additions are plain; existing batches never change with site rating. */
export function reconcileFood(b:FoodBatch[],count:number){const delta=Math.max(0,count)-foodCount(b);if(delta>0)addFood(b,delta);else if(delta<0)takeFood(b,-delta);}
export function foodQuality(b:FoodBatch[]|undefined):FoodQuality{return b?.[0]?.quality??'plain';}

/** Repair partial/corrupt save records without upgrading unknown legacy food. */
export function normalizeFoodBatches(value:unknown):FoodBatch[]{
 if(!Array.isArray(value))return [];
 const result:FoodBatch[]=[];
 for(const entry of value){
  if(!entry||typeof entry!=='object')continue;
  const count=entry.count;
  if(!Number.isSafeInteger(count)||count<=0)continue;
  const quality:FoodQuality=entry.quality==='fresh'||entry.quality==='rich'?entry.quality:'plain';
  result.push({quality,count});
 }
 return result;
}
