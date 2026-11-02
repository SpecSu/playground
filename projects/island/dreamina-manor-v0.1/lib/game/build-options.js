import{reservedCells}from'./construction.js';
import {DIRECTIONS,cellKey,nearestDryPosition,allLandReachable} from './grid.js';
const same=(a,b)=>a.x===b.x&&a.z===b.z;
export function emptyLand(game){return game.land.filter(c=>!reservedCells(game).some(t=>same(t,c))&&!game.tank.some(t=>same(t,c))&&!game.jobs.some(j=>j.target.kind==='land'&&same(j.target.cell,c))&&!(game.localSows??[]).some(j=>j.target.kind==='land'&&same(j.target.cell,c))&&!game.items.some(i=>i.location.kind==='land'&&same(i.location.cell,c)));}
export function tankAnchors(game){
 const pending=reservedCells(game,'tank');game={...game,tank:[...game.tank,...pending]};const free=emptyLand(game);return free.filter(c=>!game.tank.length||DIRECTIONS.some(d=>game.tank.some(t=>t.x===c.x+d.x&&t.z===c.z+d.z))).filter(c=>{const next=[...game.tank,c],position=nearestDryPosition(game.land,game.docks,next,game.position);return next.length<game.land.length&&position&&allLandReachable(game.land,game.docks,next,position);});
}
export function tankPlacement(game,anchor){return anchor?[anchor]:[];}
