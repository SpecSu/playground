import{reservedCells}from'./construction.js';
const same=(a,b)=>a.x===b.x&&a.z===b.z;
export function availableFishingDocks(game){return game.docks.filter(c=>!reservedCells(game,'dock').some(p=>same(p,c))&&!game.jobs.some(j=>j.target.kind==='dock'&&same(j.target.cell,c))&&!(game.localTargets??[]).some(t=>t.kind==='dock'&&same(t.cell,c))&&!(game.pending?.target?.kind==='dock'&&same(game.pending.target.cell,c)));}
/** Position is the actual local avatar pose, not its intended destination or stale cloud position. */
export function fishingDockAtPosition(game,position){return position&&availableFishingDocks(game).find(c=>Math.abs(position.x-c.x)<.5&&Math.abs(position.z-c.z)<.5)||null;}
