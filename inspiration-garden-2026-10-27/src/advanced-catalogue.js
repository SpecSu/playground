/** Optional official tiers. Never reinterpret any published plant identity or arbitrary received metadata. */
const tree=(id,name,artKey,seedPrice,salePrice,growMs,unlockSales,interaction,description,gesture)=>({id,name,artKey,seedPrice,salePrice,growMs,unlockSales,interaction,description,gesture,kind:'basic',tier:'advanced',authorId:'garden-originals',authorName:'花园原生种',parentId:null,rootId:id});
export const ADVANCED_VARIETIES=Object.freeze([
 tree('weeping_willow_tree','柳树','weeping_willow_tree',500,760,5400000,12,'sway','细长柳枝垂成一顶绿色小帐篷，四块土地托住一整片温柔树荫。','轻碰树冠，让长长的柳枝轻轻摇起来'),
 tree('golden_ginkgo_tree','鎏金银杏树','golden_ginkgo_tree',800,1200,10800000,24,'sway','金色扇叶攒成宽阔树冠，像把一整个秋天搬上小岛。','轻碰树冠，让金色扇叶轻轻摇起来'),
 tree('evergreen_fir_tree','杉树','evergreen_fir_tree',1200,1800,21600000,40,'sway','层层深绿枝叶撑起高高的小山，像给小岛留下一座常青的森林。','轻碰枝叶，让整座绿色小山轻轻晃动'),
 tree('ancient_star_tree','星辉古树','ancient_star_tree',1800,2700,43200000,60,'glow','弯弯老枝撑起一座星光树屋，叶隙藏着安静的小宇宙。','轻碰点亮星光，三下问候请来萤火虫'),
]);
export const ADVANCED_ART_KEYS=Object.freeze(ADVANCED_VARIETIES.map(v=>v.artKey));

// Published v19 records remain valid; current quotes intentionally reappraise this local demo.
export const LEGACY_ADVANCED_VARIETIES=Object.freeze(ADVANCED_VARIETIES.map((v,i)=>({...v,seedPrice:[45,80,140,240][i],salePrice:[68,120,210,360][i],growMs:[180000,240000,300000,360000][i],unlockSales:[12,16,21,27][i]})));
export const PREVIOUS_ADVANCED_VARIETIES=Object.freeze(ADVANCED_VARIETIES.map((v,i)=>({...v,seedPrice:[180,600,1800,6500][i],salePrice:[270,900,2700,9750][i],growMs:[2700000,10800000,28800000,86400000][i]})));
const fields=['id','name','artKey','interaction','kind','authorId','authorName','parentId','rootId','seedPrice','salePrice','growMs'];
export const trustedTreeRecord=v=>v?.kind==='basic'&&[...ADVANCED_VARIETIES,...PREVIOUS_ADVANCED_VARIETIES,...LEGACY_ADVANCED_VARIETIES].some(c=>fields.every(k=>(c[k]??null)===(v[k]??null)));

export const trustedLegacyTreeRecord=v=>v?.kind==='basic'&&LEGACY_ADVANCED_VARIETIES.some(c=>fields.every(k=>(c[k]??null)===(v[k]??null)));
export const legacyTreeUnlock=id=>LEGACY_ADVANCED_VARIETIES.find(v=>v.id===id)?.unlockSales;
