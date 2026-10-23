import {emptyLand} from './build-options.js';
const same=(a,b)=>a?.x===b?.x&&a?.z===b?.z;
/** Reads the journal projection, whose inventory already excludes queued reservations. */
export function plantableLand(game){return emptyLand(game).filter(c=>!(game.localTargets??[]).some(t=>t.kind==='land'&&same(t.cell,c)));}
export function seedPaintDecision(game,mode,target){if(mode?.kind!=='seed')return null;if(!game?.seeds?.[mode.tier-1]||target?.kind!=='land'||!plantableLand(game).some(c=>same(c,target.cell)))return{kind:'exit'};return{kind:'plant',tier:mode.tier,target:{kind:'land',cell:{...target.cell}}};}
