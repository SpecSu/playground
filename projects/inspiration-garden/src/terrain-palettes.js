/** Free canonical whole-island tones; old IDs remain aliases, water/art never tint. */
export const LAND_PALETTES=Object.freeze([
 {id:'meadow',name:'嫩绿',land:'#b9d1a0',side:'#b7a17d',sideDark:'#957f60'},
 {id:'mist',name:'雾蓝',land:'#b9ccd3',side:'#a69b95',sideDark:'#877d79'},
 {id:'rose',name:'浅玫',land:'#ddc4bf',side:'#bba28f',sideDark:'#9b8373'},
 {id:'sand',name:'沙白',land:'#e2dcc8',side:'#c3b297',sideDark:'#a28e73'},
 {id:'brown',name:'浅棕',land:'#c7bda7',side:'#ad987e',sideDark:'#8d7962'},
]);
const aliases=Object.freeze({sage:'meadow',cream:'sand'});
export const landPalette=id=>LAND_PALETTES.find(p=>p.id===(typeof id==='string'?(Object.hasOwn(aliases,id)?aliases[id]:id):null))??LAND_PALETTES[0];
/** Rendering-only tones. Keep the fill's hue instead of fixed old grass/black borders. */
export function terrainEdgeColors(palette,kind='land'){const fallback=kind==='platform'?'#d5b07a':'#b6d77e',candidate=kind==='platform'?palette?.wood:palette?.land,base=typeof candidate==='string'&&/^#[0-9a-f]{6}$/i.test(candidate)?candidate:fallback,shade=amount=>'#'+[1,3,5].map(i=>Math.round(parseInt(base.slice(i,i+2),16)*amount).toString(16).padStart(2,'0')).join('');return {grid:shade(.76),outer:shade(.60)};}
