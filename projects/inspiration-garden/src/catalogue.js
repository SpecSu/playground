import {ESTATE_PLANTS} from './estate-content.js';
import {OFFICIAL_TARIFFS,creativeTariff,withTariff} from './plant-pricing.js';
import {ADVANCED_VARIETIES} from './advanced-catalogue.js';
export {ADVANCED_VARIETIES};
import {DEMO_BLUEPRINTS} from './blueprints.js';
import {footprintOf} from './footprints.js';
import {COMPOSITIONS} from './gardens-data.js';
/** Authored offline content. No remote generation, trading, or payment service. */
const base = (id,name,seedPrice,salePrice,growMs,unlockSales,description) => ({
  id,name,seedPrice:OFFICIAL_TARIFFS[id][0],salePrice:OFFICIAL_TARIFFS[id][1],growMs:OFFICIAL_TARIFFS[id][2],unlockSales,description,artKey:id,
  authorId:'garden-originals',authorName:'花园原生种',parentId:null,rootId:id,interaction:'sway',kind:'basic',
});
export const BASIC_VARIETIES = [
  base('radish','白萝卜',8,14,45000,0,'叶子轻轻晃，先种一颗熟悉花园。'),
  base('tomato','小番茄',12,20,60000,0,'圆滚滚的红番茄，喜欢被轻轻碰一下。'),
  base('mushroom','奶油蘑菇',10,17,50000,1,'一朵矮矮的奶油色小伞。'),
  base('pumpkin','小南瓜',16,25,75000,2,'藏在藤叶里的暖橙色小圆屋。'),
  base('eggplant','紫茄子',14,23,70000,4,'亮紫色的小家伙，叶帽很神气。'),
  base('corn','甜玉米',18,29,90000,6,'金黄颗粒，叶子像伸展开的手臂。'),
  base('cabbage','卷心菜',20,32,100000,8,'层层叶片组成的绿色漩涡。'),
  base('sunflower','向日葵',24,38,120000,10,'一小束朝着你的阳光。'),
];
export const OFFICIAL_VARIETIES=Object.freeze([...BASIC_VARIETIES,...ADVANCED_VARIETIES]);
const sample=(id,name,interaction,keywords,description,gesture,invention=false) => ({
  id,name,artKey:id,interaction,keywords,description,gesture,invention,
  seedPrice:creativeTariff(id)[0],salePrice:creativeTariff(id)[1],growMs:creativeTariff(id)[2],kind:'creative',
});
export const CREATIVE_SAMPLES = [
  ...ESTATE_PLANTS.map(p=>sample(p.id,p.name,p.interaction,p.keywords,p.description,p.gesture,true)),
  sample('plush_button_sprout','纽扣绒芽','hug',['纽扣绒芽','纽扣','绒芽'],'奶油绒叶托着一颗珊瑚色纽扣，像从玩偶的口袋里长出来。','轻点纽扣，听绒叶软软回应',true),
  sample('yarn_ball_flower','毛线团花','sway',['毛线团花','毛线','线团花'],'一团温柔的毛线，顺着细细的茎绕成小花。','轻碰线团，让它慢慢晃一晃',true),
  sample('controller_sprout','手柄嫩芽','game',['手柄嫩芽','游戏嫩芽','手柄'],'小叶片抱着一只手柄，轻碰就亮起彩色按键。','轻点按键，和嫩芽玩一回合',true),
  sample('plush_cotton_tree','棉花玩偶树','hug',['棉花玩偶树','玩偶树','棉花'],'绵软树冠藏着小玩偶，四块土地托住一场柔软的梦。','轻按树冠，送它一个柔软拥抱',true),
  sample('circuit_bonsai','电路盆景','pulse',['电路盆景','电路树','电流'],'枝叶像一块小电路，光点沿着枝条慢慢旅行。','轻点枝叶，看一束电流经过',true),
  sample('radar_succulent','雷达多肉','scan',['雷达多肉','雷达植物','探测'],'小小叶盘像雷达，轻碰就扫过一圈微光。','轻点叶盘，扫描一圈小花园',true),
  sample('pace_meter_bamboo','节拍计步竹','tempo',['节拍计步竹','计步竹','运动竹'],'竹节挂着计步小表，跟着你的轻点慢慢打拍。','轻点竹节，踏一小段节奏',true),

  sample('giant_piano_sunflower','花盘钢琴向日葵','keyboard',['花盘琴','向日葵琴','钢琴向日葵','大向日葵'],'一圈宽阔的花瓣琴键，四块土地一起托住它。','横向划过花盘琴键，弹出阳光',true),
  sample('giant_moon_mushroom','月亮剧场蘑菇','moon',['月亮剧场','月亮蘑菇','大蘑菇','巨型月光'],'大伞里藏着一场温柔的月亮剧，轻按就有星星醒来。','点亮月光，轻按一会儿请出星星',true),
  sample('giant_bubble_lotus','泡泡莲花','bubble',['莲','莲花','荷花','泡泡莲'],'宽宽的荷叶抱着一朵会吹泡泡的莲，住满四块土地。','轻碰花瓣，让泡泡从莲心飘出来',true),
  sample('drum_pumpkin','咚咚鼓南瓜','drum',['鼓','打击','节奏','南瓜'],'敲一敲鼓面，胖南瓜会跟着弹跳。','轻点：咚咚打鼓'),
  sample('piano_pumpkin','琴键南瓜','keyboard',['琴','弹琴','钢琴','南瓜琴','琴键南瓜','会弹琴的南瓜'],'南瓜还是南瓜，只是鼓面长出了一排琴键。','横向划过琴键，弹一小段旋律'),
  sample('singing_eggplant','铃铃茄子','bell',['唱','铃','音乐','茄子'],'叶帽下藏了一串清亮的小铃声。','轻点：听一声清铃'),
  sample('puffer_tomato','气鼓鼓番茄','puff',['膨胀','气鼓','河豚','番茄'],'碰一下就鼓起脸，再慢慢呼出一口气。','轻点：鼓起圆脸'),
  sample('whisper_radish','悄悄话萝卜','whisper',['悄悄','耳语','说话','萝卜'],'叶子凑过来，说一句写好的花园悄悄话。','轻点：读一句悄悄话'),
  sample('keyboard_corn','琴键玉米','keyboard',['琴','键盘','玉米'],'玉米粒像琴键，落下一小段明亮旋律。','轻点：弹奏小旋律'),
  sample('wave_cabbage','海浪卷心菜','wave',['海','浪','卷心菜','海风'],'层层叶子像浪花，送来一圈海风。','轻点：掀起叶片小浪'),
  sample('sleepy_sunflower','瞌睡向日葵','sleep',['睡','梦','向日葵'],'一朵贪睡的太阳，碰一下才揉揉眼睛。','轻点：叫醒它一下'),
  sample('glow_mushroom','月光蘑菇','glow',['发光','月','蘑菇','星'],'小伞蓄着温柔的光，点亮一圈星尘。','轻点：点亮月光'),
  sample('cloud_lantern','云朵提灯','float',['云','灯','漂浮','天空'],'从零发明：云团长出小提灯，晃出一场轻雨。','轻点：让云灯漂浮',true),
  sample('bubble_teapot','泡泡茶壶花','bubble',['泡泡','茶','壶','吹'],'从零发明：花瓣围成茶壶，吹出彩色泡泡。','轻点：吹一串泡泡',true),
  sample('painter_tomato','调色盘番茄','paint',['画','颜料','调色'],'把一抹彩色洒进花园，不留下脏乱。','轻点：撒开彩色纸屑'),
  sample('gramophone_flower','留声机花','gramophone',['留声','喇叭','爵士'],'花瓣是一只小喇叭，回放一段老唱片。','轻点：播放复古和弦',true),
];
// Trusted authored botanical lineage. Ignore any family field supplied on a received variety.
export const ART_FAMILIES=Object.freeze({
 ...Object.fromEntries(ESTATE_PLANTS.map(p=>[p.id,p.id])),
 plush_button_sprout:'plush_button_sprout',yarn_ball_flower:'yarn_ball_flower',controller_sprout:'controller_sprout',plush_cotton_tree:'plush_cotton_tree',circuit_bonsai:'circuit_bonsai',radar_succulent:'radar_succulent',pace_meter_bamboo:'pace_meter_bamboo',
 radish:'radish',whisper_radish:'radish',tomato:'tomato',puffer_tomato:'tomato',painter_tomato:'tomato',
 mushroom:'mushroom',glow_mushroom:'mushroom',pumpkin:'pumpkin',drum_pumpkin:'pumpkin',piano_pumpkin:'pumpkin',
 eggplant:'eggplant',singing_eggplant:'eggplant',corn:'corn',keyboard_corn:'corn',cabbage:'cabbage',wave_cabbage:'cabbage',
 giant_piano_sunflower:'sunflower',giant_moon_mushroom:'mushroom',giant_bubble_lotus:'lotus',
 sunflower:'sunflower',sleepy_sunflower:'sunflower',cloud_lantern:'cloud_lantern',bubble_teapot:'bubble_teapot',gramophone_flower:'gramophone_flower',
});
export const matchIdeas = text => {
  const value=String(text??'').trim().toLowerCase();
  if(!value) return [];
  return CREATIVE_SAMPLES.map(s=>({s,score:(value.includes(s.name)?100:0)+(s.id==='painter_tomato'&&value.includes('番茄')&&s.keywords.some(k=>value.includes(k))?1:0)+s.keywords.reduce((n,k)=>n+(value.includes(k)?1:0),0)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.s);
};
export const BUILDINGS = {
  land:{id:'land',name:'种植土地',price:25,refund:12,description:'可以种植；与小岛相连。'},
  platform:{id:'platform',name:'木平台',price:18,refund:9,description:'木质走台，不可种植。'},
  fence:{id:'fence',name:'木栅栏',price:8,refund:4,description:'沿边摆放，可跨过的低矮装饰。'},
  wall:{id:'wall',name:'矮石墙',price:12,refund:6,description:'沿边摆放，可跨过的低矮装饰。'},
};
// Immutable authorship is independent of mutable scene composition. Published v6 IDs never change owners.
const AUTHORS=Object.freeze({kelly:{id:'demo-kelly',name:'Kelly'},bear:{id:'demo-bear',name:'Bear熊'},frog:{id:'demo-frog',name:'奶蛙'},jiji:{id:'demo-jiji',name:'吉吉'},lx:{id:'demo-lx',name:'LX'}});
const SAMPLE_AUTHORS=Object.freeze({ ...Object.fromEntries(ESTATE_PLANTS.map(p=>[p.id,p.author])),plush_button_sprout:'bear',yarn_ball_flower:'bear',controller_sprout:'jiji',plush_cotton_tree:'bear',circuit_bonsai:'lx',radar_succulent:'lx',pace_meter_bamboo:'lx',drum_pumpkin:'kelly',piano_pumpkin:'kelly',singing_eggplant:'kelly',puffer_tomato:'frog',whisper_radish:'kelly',keyboard_corn:'kelly',wave_cabbage:'frog',sleepy_sunflower:'bear',glow_mushroom:'bear',cloud_lantern:'bear',bubble_teapot:'frog',painter_tomato:'frog',gramophone_flower:'kelly',giant_piano_sunflower:'kelly',giant_moon_mushroom:'bear',giant_bubble_lotus:'frog'});
export const DEMO_VARIETIES = Object.fromEntries(CREATIVE_SAMPLES.map(s=>{
  const owner=AUTHORS[SAMPLE_AUTHORS[s.id]],id=`demo-${s.id}`;
  return [id,{...s,id,authorId:owner.id,authorName:owner.name,parentId:null,rootId:id}];
}));
const sides={N:'north',E:'east',S:'south',W:'west'};
export const DEMO_GARDENS = COMPOSITIONS.map(g=>{
  const tileId=(x,y)=>`${g.id}-tile-${x}-${y}`;
  return {id:g.id,name:g.title,title:g.title,authorId:g.owner.id,authorName:g.owner.name,
    subtitle:g.tagline,intro:g.intro,theme:g.theme,palette:g.palette,avatarKey:g.displayHost?.avatar??g.owner.avatar,hostId:g.displayHost?.id??g.owner.id,hostName:g.displayHost?.name??g.owner.name,
    spawnTileId:tileId(...g.spawn),ownerPosition:{x:g.ownerPosition[0],y:g.ownerPosition[1]},
    animalVisitorSpawns:(g.animalVisitorSpawns??[]).map(([x,y])=>({x,y})),focalPlant:g.focalPlant,interactionTour:g.interactionTour,progression:g.progression?{...g.progression}:undefined,
    tiles:g.cells.map(c=>({id:tileId(c.x,c.z),x:c.x,y:c.z,kind:c.kind})),
    edges:g.edges.map((e,i)=>({id:`${g.id}-edge-${i}`,tileId:tileId(e.x,e.z),edge:sides[e.side],kind:e.kind})),
    exhibits:(g.buildings??[]).map((b,i)=>({...b,id:b.id??`${g.id}-exhibit-${i}`,artKey:b.artKey??b.art,blueprintId:Object.values(DEMO_BLUEPRINTS).find(p=>p.sampleId===(b.artKey??b.art))?.id,x:b.x,y:b.z,footprint:b.footprint??[2,2]})),
    props:(g.scenery??[]).map((p,i)=>({id:`${g.id}-prop-${i}`,artKey:p.art,x:p.x+(p.offsetX??0),y:p.z+(p.offsetZ??0),scale:p.scale??1,layer:p.layer??'object'})),plants:g.plants.map(p=>({id:p.id,varietyId:OFFICIAL_VARIETIES.some(v=>v.id===p.art)?p.art:`demo-${p.art}`,tileId:tileId(p.x,p.z),scale:p.scale,footprint:footprintOf({artKey:p.art}),plantedAt:0,readyAt:0})),
  };
});
export const allCatalogueVarieties = () => Object.fromEntries([...OFFICIAL_VARIETIES,...Object.values(DEMO_VARIETIES)].map(v=>[v.id,{...v}]));
