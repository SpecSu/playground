/** Optional construction timing: absence is a completed legacy asset. No completion mutation/reward. */
export const BASIC_WORK_MS=3000,PERSONAL_WORK_MS=15000;
const hasTiming=item=>Object.hasOwn(item,'startedAt')||Object.hasOwn(item,'readyAt');
export function validConstructionTime(item,duration){if(!hasTiming(item))return true;return typeof item.startedAt==='number'&&Number.isFinite(item.startedAt)&&typeof item.readyAt==='number'&&Number.isFinite(item.readyAt)&&item.readyAt-item.startedAt===duration;}
export const isBuilt=(item,now)=>!hasTiming(item)||(Number.isFinite(item.startedAt)&&Number.isFinite(item.readyAt)&&now>=item.readyAt);
export function constructionProgress(item,now){if(!hasTiming(item))return 1;if(!Number.isFinite(item.startedAt)||!Number.isFinite(item.readyAt)||item.readyAt<=item.startedAt)return 0;return Math.max(0,Math.min(1,(now-item.startedAt)/(item.readyAt-item.startedAt)));}
export const completedTerrain=(tiles,now)=>tiles.filter(tile=>isBuilt(tile,now));
export const workRemaining=(item,now)=>Math.max(0,Math.ceil(((item.readyAt??now)-now)/1000));

export const constructionTiming=(time,duration)=>Number.isFinite(time+duration)&&time+duration-time===duration?{startedAt:time,readyAt:time+duration}:null;
