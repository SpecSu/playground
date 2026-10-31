import type {Tile} from './model.ts';
/** Saved cosmetic choice only: terrain/naturalTerrain remain the gameplay ecology. */
export const TERRAIN_APPEARANCES=['natural','lunar','slate','rose'] as const;
export type TerrainAppearance=typeof TERRAIN_APPEARANCES[number];
export const TERRAIN_APPEARANCE_LABELS:Record<TerrainAppearance,string>={natural:'原生',lunar:'月尘银灰',slate:'玄岩深灰',rose:'玫瑰砂'};
export function isTerrainAppearance(value:unknown):value is TerrainAppearance{return typeof value==='string'&&TERRAIN_APPEARANCES.some(style=>style===value);}
export function terrainAppearanceIssue(tile:Tile|undefined):string|null{
 if(!tile?.owned)return '先开辟这块土地';
 if(tile.z===0&&(tile.x===0||tile.x===1))return '小店占地保持原样';
 if(tile.terrain==='pond'||tile.terrain==='creek')return '水面保留原样，不覆盖通行提示';
 return null;
}
export function validTileAppearance(tile:Tile):boolean{return tile.appearance===undefined||isTerrainAppearance(tile.appearance)&&(tile.appearance==='natural'||terrainAppearanceIssue(tile)===null);}
export function tileAppearance(tile:Readonly<Tile>):TerrainAppearance{return tile.appearance??'natural';}
export const TERRAIN_APPEARANCE_COLORS:Record<Exclude<TerrainAppearance,'natural'>,string>={lunar:'#A9ADB5',slate:'#59616C',rose:'#CB9B8B'};
