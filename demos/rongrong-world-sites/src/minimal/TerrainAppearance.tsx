import type {CSSProperties} from 'react';
import type {Tile} from './model.ts';
import {TERRAIN_APPEARANCES,TERRAIN_APPEARANCE_LABELS,TERRAIN_APPEARANCE_COLORS,terrainAppearanceIssue,tileAppearance,type TerrainAppearance} from './terrain-appearance.ts';
import './terrain-appearance.css';
export function TerrainAppearancePicker({tile,ecologyLabel,disabled=false,onPaint}:{tile:Tile;ecologyLabel:string;disabled?:boolean;onPaint:(style:TerrainAppearance)=>void}){
 const selected=tileAppearance(tile),issue=terrainAppearanceIssue(tile);
 return <section className="terrain-appearance" aria-label="地表外观 DIY"><h3>地表外观 DIY <small>免费</small></h3><p>外观：{TERRAIN_APPEARANCE_LABELS[selected]} · 底层生态：{ecologyLabel}</p><div className="terrain-appearance-options">{TERRAIN_APPEARANCES.map(style=><button type="button" key={style} aria-label={`地表外观：${TERRAIN_APPEARANCE_LABELS[style]}`} aria-pressed={selected===style} disabled={disabled||!!issue||selected===style} onClick={()=>onPaint(style)}><i aria-hidden="true" className={`terrain-swatch terrain-swatch-${style}`} style={{'--surface-color':style==='natural'?'#9FB77E':TERRAIN_APPEARANCE_COLORS[style]} as CSSProperties}/><span>{TERRAIN_APPEARANCE_LABELS[style]}</span></button>)}</div><small>{issue??'只改外观，不消耗蛋或金币；生态、孵化和供给不变。'}</small></section>;
}
