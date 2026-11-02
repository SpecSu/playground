import {selectableLand} from './land-selection.js';
import {dockCandidates} from './grid.js';
import {tankAnchors} from './build-options.js';
import {reservedCells} from './construction.js';
const same=(a,b)=>a?.x===b?.x&&a?.z===b?.z;
export function buildCandidates(game,kind){
 if(!game)return [];
 if(kind==='land')return selectableLand(game);
 if(kind==='dock')return dockCandidates(game.land,game.docks).filter(c=>!reservedCells(game).some(p=>same(c,p)));
 if(kind==='tank')return tankAnchors(game);
 return [];
}
/** Called with the current journal projection, not the preceding React frame. */
export function buildClickCommand(game,kind,cell){
 if(!cell||!buildCandidates(game,kind).some(c=>same(c,cell)))return null;
 return {type:'construct',kind,cells:[{x:cell.x,z:cell.z}]};
}
