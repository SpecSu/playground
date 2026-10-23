import {DIRECTIONS,cellKey,nearestDryPosition,allLandReachable} from './grid.js';
const same=(a,b)=>a.x===b.x&&a.z===b.z;
export function emptyLand(game){return game.land.filter(c=>!game.tank.some(t=>same(t,c))&&!game.jobs.some(j=>j.target.kind==='land'&&same(j.target.cell,c))&&!(game.localSows??[]).some(j=>j.target.kind==='land'&&same(j.target.cell,c))&&!game.items.some(i=>i.location.kind==='land'&&same(i.location.cell,c)));}
export function tankAnchors(game,axis='x'){
 const free=emptyLand(game);return free.filter(c=>game.tank.length?DIRECTIONS.some(d=>game.tank.some(t=>t.x===c.x+d.x&&t.z===c.z+d.z)):free.some(n=>n.x===c.x+(axis==='x'?1:0)&&n.z===c.z+(axis==='z'?1:0))).filter(c=>{const next=[...game.tank,...tankPlacement(game,c,axis)],position=nearestDryPosition(game.land,game.docks,next,game.position);return next.length<game.land.length&&position&&allLandReachable(game.land,game.docks,next,position);});
}
export function tankPlacement(game,anchor,axis='x'){return !anchor?[]:game.tank.length?[anchor]:[anchor,{x:anchor.x+(axis==='x'?1:0),z:anchor.z+(axis==='z'?1:0)}];}
/** Rotation keeps a valid anchor; it cannot enter an orientation with no legal footprint. */
export function rotateTankSelection(game,mode){const axis=mode.axis==='z'?'x':'z',anchors=tankAnchors(game,axis);if(!anchors.length)return mode;return {...mode,axis,cell:mode.cell&&anchors.find(c=>same(c,mode.cell))||null};}
