export type AssetStatus='loading'|'ready'|'error';
/** Separate resources keep an earlier failure visible when another load completes. */
export function assetStatusText(player:AssetStatus,guardian:AssetStatus):string{
 if(player==='error')return '分身模型加载失败，请刷新重试；关系记录已保留';
 if(guardian==='error')return '奶蛙模型加载失败，请刷新重试；农场互动仍可使用';
 if(player==='loading'||guardian==='loading')return '正在载入分身和奶蛙…';
 return '伙伴已就位 · 点击草地走动';
}
