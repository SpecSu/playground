import {buildingSample} from './blueprints.js';
import {ADVANCED_ART_KEYS} from './advanced-catalogue.js';
import {isBuilt} from './construction.js';
/** Immutable authored footprints; older art keys always retain their original single cell. */
export const GIANT_ART_KEYS=Object.freeze(['circuit_bonsai','plush_cotton_tree','giant_piano_sunflower','giant_moon_mushroom','giant_bubble_lotus',...ADVANCED_ART_KEYS]);
export const footprintOf=variety=>GIANT_ART_KEYS.includes(variety?.artKey)?[2,2]:[1,1];
export function footprintCells(tile,variety){if(!tile)return [];const [w,h]=footprintOf(variety),cells=[];for(let x=0;x<w;x++)for(let y=0;y<h;y++)cells.push({x:tile.x+x,y:tile.y+y});return cells;}
export function occupiedTileIds(world,plant,variety){const anchor=world.tiles.find(t=>t.id===plant.tileId);return footprintCells(anchor,variety).map(c=>world.tiles.find(t=>t.x===c.x&&t.y===c.y)?.id).filter(Boolean);}
export function plantAtTile(world,tileId,varieties){return world.plants.find(p=>occupiedTileIds(world,p,varieties[p.varietyId]).includes(tileId));}
export function canPlacePlant(world,variety,tileId,varieties=world.varieties??{},exceptId=null,now=world.lastSeenAt??Date.now()){
 const anchor=world.tiles.find(t=>t.id===tileId),cells=footprintCells(anchor,variety);if(!cells.length)return false;
 const wanted=new Set(cells.map(c=>`${c.x}:${c.y}`));
 if(!cells.every(c=>world.tiles.some(t=>t.x===c.x&&t.y===c.y&&t.kind==='land'&&isBuilt(t,now))))return false;
 if(world.plants.some(p=>p.id!==exceptId&&footprintCells(world.tiles.find(t=>t.id===p.tileId),varieties[p.varietyId]).some(c=>wanted.has(`${c.x}:${c.y}`))))return false;
 return !allBuildings(world).some(b=>buildingCells(world,b).some(c=>wanted.has(`${c.x}:${c.y}`)));
}
export function plantCenter(world,plant,variety){const tile=world.tiles.find(t=>t.id===plant.tileId);if(!tile)return null;const [w,h]=footprintOf(variety);return {x:tile.x+(w-1)/2,y:tile.y+(h-1)/2};}
export function placementPreview(world,variety,cell,varieties=world.varieties??{},now=world.lastSeenAt??Date.now()){
 const anchor=world.tiles.find(t=>t.x===cell.x&&t.y===cell.y),cells=footprintCells(cell,variety).map(c=>{const tile=world.tiles.find(t=>t.x===c.x&&t.y===c.y);return {...c,available:!!tile&&tile.kind==='land'&&isBuilt(tile,now)&&!plantAtTile(world,tile.id,varieties)&&!buildingAtTile(world,tile.id),tileId:tile?.id};});
 return {tileId:anchor?.id,valid:!!anchor&&canPlacePlant(world,variety,anchor.id,varieties,null,now),cells,footprint:footprintOf(variety)};
}

const allBuildings=world=>[...(world.buildings??[]),...(world.exhibits??[])];
export function buildingFootprint(world,building={}){const owned=building.blueprintId&&world.blueprints?.[building.blueprintId],sample=buildingSample(owned?.sampleId??building.sampleId??(building.tileId&&building.blueprintId?null:building.artKey));return [...(sample?.footprint??[2,2])];}
export function buildingCells(world,building){const anchor=building.tileId?world.tiles.find(t=>t.id===building.tileId):building;if(!anchor)return [];const [w,h]=buildingFootprint(world,building),out=[];for(let x=0;x<w;x++)for(let y=0;y<h;y++)out.push({x:anchor.x+x,y:anchor.y+y});return out;}
export function buildingCenter(world,building){const anchor=building.tileId?world.tiles.find(t=>t.id===building.tileId):building;if(!anchor)return null;const [w,h]=buildingFootprint(world,building);return {x:anchor.x+(w-1)/2,y:anchor.y+(h-1)/2};}
export function buildingAtTile(world,tileId,exceptId=null){const tile=world.tiles.find(t=>t.id===tileId);return tile?allBuildings(world).find(b=>b.id!==exceptId&&buildingCells(world,b).some(c=>c.x===tile.x&&c.y===tile.y)):undefined;}
export function canPlaceBuilding(world,tileId,varieties=world.varieties??{},exceptId=null,now=world.lastSeenAt??Date.now(),candidate=null){const anchor=world.tiles.find(t=>t.id===tileId);if(!anchor)return false;candidate??=allBuildings(world).find(b=>b.id===exceptId)??{};return buildingCells(world,{...candidate,tileId}).every(c=>{const tile=world.tiles.find(t=>t.x===c.x&&t.y===c.y);return !!tile&&['land','platform'].includes(tile.kind)&&isBuilt(tile,now)&&!plantAtTile(world,tile.id,varieties)&&!buildingAtTile(world,tile.id,exceptId);});}
export function buildingPlacementPreview(world,cell,varieties=world.varieties??{},now=world.lastSeenAt??Date.now(),exceptId=null,candidate=null){
 candidate??=allBuildings(world).find(b=>b.id===exceptId)??{};const tile=world.tiles.find(t=>t.x===cell.x&&t.y===cell.y),moving=exceptId&&allBuildings(world).find(b=>b.id===exceptId),unchanged=!!moving&&moving.tileId===tile?.id;
 return {tileId:tile?.id,footprint:buildingFootprint(world,candidate),unchanged,valid:!!tile&&!unchanged&&canPlaceBuilding(world,tile.id,varieties,exceptId,now,candidate),cells:buildingCells(world,{...candidate,...cell,tileId:undefined}).map(c=>{const t=world.tiles.find(t=>t.x===c.x&&t.y===c.y);return {...c,tileId:t?.id,available:!!t&&isBuilt(t,now)&&!plantAtTile(world,t.id,varieties)&&!buildingAtTile(world,t.id,exceptId)};})};
}
