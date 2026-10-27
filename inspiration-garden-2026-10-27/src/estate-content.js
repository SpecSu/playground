/** New immutable authored examples. Previously collected art and creator identities remain untouched. */
export const ESTATE_PLANTS=Object.freeze([
 {id:'jiji_crimson_rose_bush',name:'绯夜玫瑰丛',interaction:'sway',keywords:['绯夜玫瑰','暗红玫瑰','玫瑰花丛'],description:'几朵暗红玫瑰藏在墨绿叶间，沿着夜庭小径慢慢开成一片安静的花圃。',gesture:'轻碰玫瑰枝，让深红花瓣轻轻摇动',author:'jiji'},
 {id:'bear_plush_bloom',name:'绒瓣小花',interaction:'hug',keywords:['绒瓣小花','绒瓣','软绒花'],description:'低低的短绒花瓣围着一颗软芯，把潮玩庭院的转角变成柔软的小花床。',gesture:'轻按花芯，让绒瓣软软呼吸',author:'bear'},
 {id:'lx_silver_biofern',name:'银序芦荟',interaction:'pulse',keywords:['银序芦荟','芦荟','厚叶芦荟','银序生物蕨','银叶蕨','生物蕨'],description:'厚实的鼠尾草绿叶片向上收拢，一点微光沿浅色叶脉安静流动。',gesture:'轻碰厚叶，看微光沿着叶脉旅行',author:'lx'},
 {id:'lx_orbital_bloom',name:'环轨珍珠花',interaction:'glow',keywords:['环轨珍珠花','珍珠花','环轨花'],description:'珍珠般的小花沿低矮的环轨舒展，为研究庭的步道留下一圈柔和生命光。',gesture:'轻碰花心，点亮一圈低低的微光',author:'lx'},
 {id:'silver_veil_willow',name:'银幕垂柳',interaction:'sway',keywords:['银幕垂柳','银幕','冷色垂柳'],description:'银灰枝条垂成一幕安静的帘，把没说出口的情绪收在叶隙里。',gesture:'轻碰柳枝，让一幕银影轻轻摇动',author:'jiji'},
 {id:'oxblood_bellflower',name:'绛暮垂铃',interaction:'bell',keywords:['绛暮垂铃','绛暮','哥特铃花'],description:'深红小铃垂在冷色叶间，像夜庭里一段还没写完的悬疑。',gesture:'轻点花铃，听一声低低的回响',author:'jiji'},
 {id:'bear_foldbud',name:'偏心绒芽',interaction:'sway',keywords:['偏心绒芽','偏心','折耳绒芽'],description:'折起一侧小耳朵，把短绒的柔软和潮玩雕塑的利落留在同一株芽上。',gesture:'轻碰绒芽，看它偏过头来',author:'bear'},
 {id:'bear_bubble_leaf',name:'泡叶绒果',interaction:'hug',keywords:['泡叶绒果','泡叶','绒果'],description:'雾面叶片围住一颗软绒小果，轻巧得像一场没有负担的拥抱。',gesture:'轻按绒果，让泡叶软软呼吸',author:'bear'},
 {id:'lx_bio_vault',name:'微光生物舱',interaction:'glow',keywords:['微光生物舱','生物舱','培育罐'],description:'透明培育舱里，一点新生命沿着精密的环轨缓缓舒展。',gesture:'轻碰舱壁，点亮一圈安静的生命微光',author:'lx'},
]);
const gestures={jiji_nocturne_manor:'轻碰暗红玻璃，听夜庭回一声轻响',black_silk_spider:'轻碰银丝，看织影慢慢回应',bear_fold_gallery:'轻碰折环，让一道轻软的光经过展馆',bear_loop_rest:'轻碰绒座，让回环散开一圈柔光',lx_titanium_courtyard:'轻碰钛金属曲面，扫描一圈精密轮廓',lx_silent_wing:'轻碰翼尖，点亮下一段穿梭的航线',lx_nanofabricator:'轻碰构筑台，看微小结构一层层亮起'};
const building=(id,name,interaction,footprint,authorId,authorName,keywords,sourceStory)=>({id,name,artKey:id,interaction,gesture:gestures[id],footprint,authorId,authorName,keywords,sourceStory,sourceType:'hobby',sourceFrameId:null,sourceDisclosure:'兴趣灵感 · 离线创作样例'});
export const ESTATE_BUILDINGS=Object.freeze([
 building('jiji_nocturne_manor','绯窗夜邸','chime',[2,2],'demo-jiji','吉吉',['绯窗夜邸','哥特宅','暗红玻璃','绯窗'],'把尖拱、暗红玻璃与冷黑铁艺，叠成一座安静而锋利的夜邸。窗后的一点光，像故事刚刚开场。'),
 building('black_silk_spider','黑丝织影雕塑','stitch',[2,1],'demo-jiji','吉吉',['黑丝织影','黑蜘蛛','蜘蛛雕塑'],'八条细长弧线托起一颗黑色宝石，银丝留出轻盈的负空间；它不追逐谁，只把夜庭的个性织在这里。'),
 building('bear_fold_gallery','折环潮玩馆','stitch',[2,2],'demo-bear','Bear熊',['折环潮玩馆','潮玩馆','折环展馆'],'折环建筑收起一片绒面屋顶，半面罩角色与可替换的表情片在这里慢慢成形。'),
 building('bear_loop_rest','回环绒座','chime',[2,1],'demo-bear','Bear熊',['回环绒座','软胶座景','绒座'],'把哑光软胶的轮廓、短绒的触感与透光亚克力合在一起，让雕塑也能成为会客的座位。'),
 building('lx_titanium_courtyard','钛庭未来研究宅','scan',[2,2],'demo-lx','LX',['钛庭','钛金属宅','未来研究宅'],'钛金属曲面包围一座开阔研究庭，精密结构藏在从容的留白里，先进不必喧哗。'),
 building('lx_silent_wing','静翼穿梭艇','lap',[2,1],'demo-lx','LX',['静翼','穿梭艇','私人翼艇'],'纤薄银翼收拢在停机坪，一道轻轻经过的光，留下下一段旅程的方向。'),
 building('lx_nanofabricator','纳米构筑台','scan',[1,1],'demo-lx','LX',['纳米构筑','精密实验台','纳米设备'],'在一方克制的工作台上，微小构件沿轨道排列，像看不见的工匠在写一首结构诗。'),
]);
