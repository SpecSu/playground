import{landCandidates,docksHaveWater}from'./grid.js';import{reservedCells}from'./construction.js';
const same=(a,b)=>a.x===b.x&&a.z===b.z;
export function connectedLandSelection(game,cells){const reached=[...game.land],left=[...cells];while(left.length){const i=left.findIndex(c=>reached.some(p=>Math.abs(c.x-p.x)+Math.abs(c.z-p.z)===1));if(i<0)return false;reached.push(left.splice(i,1)[0]);}return cells.length>0&&docksHaveWater(reached,[...game.docks,...reservedCells(game,'dock')]);}
export function selectableLand(game,selected=[]){const reserved=reservedCells(game);return [...new Map([...selected,...landCandidates([...game.land,...selected],game.docks)].filter(c=>!reserved.some(p=>same(p,c))).map(c=>[`${c.x},${c.z}`,c])).values()];}
