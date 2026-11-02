import {PERSONAL_EXHIBIT_SAMPLE_IDS} from './personal-exhibit-starters.js';
import {CAT_BLUEPRINT_SAMPLE_ID} from './cat-blueprint-starter.js';
import {ESTATE_BUILDINGS} from './estate-content.js';
/** Finite offline architecture samples; immutable identity is not derived from scene layout. */
export const CONSTRUCTION_PRICE=60,RELOCATION_PRICE=20,DEMOLITION_PRICE=50;
export const BUILDING_SAMPLES=Object.freeze([
 ...ESTATE_BUILDINGS,
 {id:'portrait_rehearsal_pavilion',name:'朋友肖像排练亭',artKey:'portrait_rehearsal_pavilion',interaction:'rehearsal',sourceFrameId:'kelly-friend-photo',sourceStory:'圆框眼镜变成一对窗，栗色卷发铺成屋顶，珊瑚围巾成了会招手的门帘。',keywords:['朋友','肖像','眼镜','排练','钢琴','人像'],authorId:'demo-kelly',authorName:'Kelly'},
 {id:'calico_reading_den',name:'团团猫书屋',artKey:'calico_reading_den',interaction:'purr',sourceFrameId:'bear-cat-photo',sourceStory:'三花猫睡成一团的样子，变成一座安静书屋；花纹、卷尾巴和紫色小毯子都留下来了。',keywords:['猫','书','阅读','呼噜','三花'],authorId:'demo-bear',authorName:'Bear熊'},
 {id:'camping_dog_workshop',name:'露营狗狗工坊',artKey:'camping_dog_workshop',interaction:'camp',sourceFrameId:'frog-camp-photo',sourceStory:'狗狗的长耳朵变成屋檐，红方巾变成门篷；帐篷、毛毯和营灯，一起住进了小工坊。',keywords:['狗','露营','帐篷','工坊','营灯'],authorId:'demo-frog',authorName:'奶蛙'},
 {id:'fluffy_cat_cottage',name:'绒云曲廊',artKey:'fluffy_cat_cottage',interaction:'meow',sourceType:'user-provided-photo',sourceFrameId:'fluffy-cat-real-photo',sourceDate:'2026-10-26',sourceDateLabel:'提供于',sourceDisclosure:'我的猫咪',sourceStory:'熟悉的暖白长毛、灰卡其耳朵和蓬松尾巴，化成一座舒展的曲面小馆。轻碰一次，抛一条小鱼，等它吃完开心一下。',keywords:['毛茸茸','长毛','暖白','卡其','猫咪小屋','绒云','曲廊'],authorId:'garden-originals',authorName:'花园灵感工坊'},
 {id:'anime_collectors_cottage',name:'漫画收藏小屋',artKey:'anime_collectors_cottage',interaction:'game',sourceType:'hobby',sourceFrameId:null,sourceDisclosure:'离线兴趣创作示例 · 非用户上传照片',sourceStory:'漫画书页、收藏徽章和游戏手柄，搭成吉吉的小小收藏角。',keywords:['漫画','二次元','收藏','游戏小屋'],authorId:'demo-jiji',authorName:'吉吉'},
 {id:'plush_designer_workshop',name:'玩偶设计工坊',artKey:'plush_designer_workshop',interaction:'stitch',sourceType:'hobby',sourceFrameId:null,sourceDisclosure:'离线兴趣创作示例 · 非用户上传照片',sourceStory:'软软的布料、线轴和玩偶耳朵，变成一间设计小工坊。',keywords:['玩偶','布料','缝纫','设计工坊'],authorId:'demo-bear',authorName:'Bear熊'},
 {id:'lx_command_workshop',name:'电路指挥工坊',artKey:'lx_command_workshop',interaction:'scan',sourceType:'hobby',sourceFrameId:null,sourceDisclosure:'离线兴趣创作示例 · 非用户上传照片',sourceStory:'雷达、机械面板和橄榄绿指挥台，把电子兴趣拼成一座工坊。',keywords:['指挥','雷达工坊','电子','电路工坊'],authorId:'demo-lx',authorName:'LX'},
 {id:'lx_circuit_gym',name:'环形训练馆',artKey:'lx_circuit_gym',interaction:'lap',sourceType:'hobby',sourceFrameId:null,sourceDisclosure:'离线兴趣创作示例 · 非用户上传照片',sourceStory:'跑道绕着电路板转一圈，小小计时牌等着新的个人纪录。',keywords:['运动','训练','跑道','健身'],authorId:'demo-lx',authorName:'LX'},
 {id:'lamy_memory_column',name:'字里灯塔',artKey:'lamy_memory_column',interaction:'ink',footprint:[1,1],sourceType:'memory',sourceFrameId:'lamy-pen-memory-photo',sourceTitle:'女友送的 LAMY 钢笔',sourceStory:'收到的那支钢笔，把没说完的温柔写成了一盏灯。细长的笔身立在小岛一角，像一座只为一句话亮着的灯塔。',keywords:['LAMY','lamy','钢笔','笔尖','灯塔'],authorId:'garden-memories',authorName:'苏贝壳'},
 {id:'airforce_memory_house',name:'离地一瞬',artKey:'airforce_memory_house',interaction:'hover',footprint:[2,1],sourceType:'memory',sourceFrameId:'roadster-rocket-memory-photo',sourceTitle:'Roadster Rocket 的贴地飞行想象',sourceDisclosure:'概念灵感示意 · 非用户实拍',sourceStory:'把未来跑车的想象停在小岛上。轻碰车身，短促气流把它托离地面一点，再轻轻落回原处。',keywords:['Tesla','Roadster','Rocket','特斯拉','飞行汽车','跑车','贴地','离地一瞬'],authorId:'garden-memories',authorName:'苏贝壳'},
 {id:'necklace_memory_monument',name:'银弧纪念庭',artKey:'necklace_memory_monument',interaction:'chime',footprint:[2,2],sourceType:'memory',sourceFrameId:'necklace-memory-photo',sourceTitle:'一条简洁的银色纪念项链',sourceStory:'细银链与一枚不对称的银色吊坠，化成留着光与风的纪念庭。轻碰吊坠，让安静的曲面响起一声清亮回音。',keywords:['项链','吊坠','银弧','细银链','银色','纪念庭'],authorId:'garden-memories',authorName:'苏贝壳'},
 {id:'xt50_memory_camera',name:'瞬间镜馆',artKey:'xt50_memory_camera',interaction:'shutter',footprint:[1,1],sourceType:'memory',sourceFrameId:'xt50-memory-photo',sourceTitle:'Fujifilm X-T50 的镜头灵感',sourceDisclosure:'物件灵感示意 · 非用户实拍',sourceStory:'银黑机身、细密转盘和圆形镜头，折成一座收藏光线的小馆。轻碰镜头，一声轻快的快门，让此刻亮一下。',keywords:['Fujifilm','X-T50','XT50','富士','相机','镜头','瞬间镜馆'],authorId:'garden-memories',authorName:'苏贝壳'},
 {id:'scallop_shell_house',name:'潮汐扇屋',artKey:'scallop_shell_house',interaction:'shell-glow',footprint:[2,2],sourceType:'memory',sourceFrameId:'scallop-shell-memory-photo',sourceTitle:'一枚扇贝的海边想象',sourceDisclosure:'自然灵感示意 · 非用户实拍',sourceStory:'扇贝的放射纹舒展成轻薄壳片，暖白外缘包着一点浅珊瑚色。轻碰小屋，一缕柔光沿着纹路走过，像海面慢慢亮起来。',keywords:['扇贝','贝壳','潮汐','扇屋'],authorId:'garden-memories',authorName:'苏贝壳'},
 {id:'camping_tarp_pavilion',name:'风停营地',artKey:'camping_tarp_pavilion',interaction:'canopy',footprint:[2,2],preferredApproachCellOffset:[1,2],sourceType:'memory',sourceFrameId:'camping-tarp-memory-photo',sourceTitle:'露营天幕下的一小片阴凉',sourceDisclosure:'露营灵感示意 · 非用户实拍',sourceStory:'轻薄天幕撑起一角阴凉，小椅子和营灯留在风里。走到可达的外沿，轻碰一次，布面微微回应，营灯暖暖亮一下。',keywords:['天幕','营地','露营天幕','遮阳篷','风停'],authorId:'garden-memories',authorName:'苏贝壳'},
]);
// Current discovery is distinct from the trusted save/author-chain registry.
export const RETIRED_BUILDING_SAMPLE_IDS=Object.freeze(['necklace_memory_monument']);
export const ACTIVE_BUILDING_SAMPLES=Object.freeze(BUILDING_SAMPLES.filter(s=>!RETIRED_BUILDING_SAMPLE_IDS.includes(s.id)));
export const isActiveBuildingSample=id=>typeof id==='string'&&ACTIVE_BUILDING_SAMPLES.some(s=>s.id===id);
export const PUBLISHED_DEMO_BLUEPRINT_IDS=Object.freeze(['portrait_rehearsal_pavilion','calico_reading_den','camping_dog_workshop'].map(id=>'demo-blueprint-'+id));
const samples=Object.fromEntries(BUILDING_SAMPLES.map(s=>[s.id,s]));
export const DEMO_BLUEPRINTS=Object.freeze(Object.fromEntries(BUILDING_SAMPLES.map(s=>{const id=`demo-blueprint-${s.id}`;return [id,{id,sampleId:s.id,authorId:s.authorId,authorName:s.authorName,parentId:null,rootId:id,parentAuthorName:null}];})));
export const getBlueprintRecord=(s,id)=>Object.hasOwn(s.blueprints??{},id)?s.blueprints[id]:Object.hasOwn(DEMO_BLUEPRINTS,id)?DEMO_BLUEPRINTS[id]:null;
export function getBlueprint(s,id){const b=getBlueprintRecord(s,id),sample=b&&Object.hasOwn(samples,b.sampleId)?samples[b.sampleId]:null;return sample?{...sample,...b,name:sample.name,artKey:sample.artKey,interaction:sample.interaction,sourceFrameId:sample.sourceFrameId,sourceStory:sample.sourceStory,sourceType:sample.sourceType,sourceDisclosure:sample.sourceDisclosure,sourceTitle:sample.sourceTitle,sourceDate:sample.sourceDate,sourceDateLabel:sample.sourceDateLabel,footprint:[...(sample.footprint??[2,2])]}:null;}
export const ownedBlueprintForSample=(s,id)=>Object.values(s.blueprints??{}).find(b=>b.authorId===s.uid&&b.sampleId===id)??null;
export const matchBuildingIdeas=idea=>{const text=String(idea??'').trim().toLowerCase();return ACTIVE_BUILDING_SAMPLES.map(sample=>({sample,score:sample.keywords.filter(k=>text.includes(k.toLowerCase())).reduce((n,k)=>n+(sample.id==='fluffy_cat_cottage'&&['毛茸茸','长毛','暖白','卡其'].includes(k)?10:1),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).map(x=>x.sample);};
const text=v=>typeof v==='string'&&v.length>0&&v.length<=180;
export function isValidBlueprint(b){return !!b&&typeof b==='object'&&!Array.isArray(b)&&text(b.id)&&text(b.sampleId)&&Object.hasOwn(samples,b.sampleId)&&text(b.authorId)&&text(b.authorName)&&text(b.rootId)&&(b.parentId===null?b.parentAuthorName===null:text(b.parentId)&&text(b.parentAuthorName));}
export function validBlueprintCollection(map,uid){
 if(!map||typeof map!=='object'||Array.isArray(map))return false;
 const reserved=new Set(Object.values(map).filter(b=>b?.authorId===uid&&(PERSONAL_EXHIBIT_SAMPLE_IDS.includes(b?.sampleId)||b?.sampleId===CAT_BLUEPRINT_SAMPLE_ID)).map(b=>b.sampleId)).size;
 if(Object.keys(map).length>100+reserved)return false;
 if(!Object.entries(map).every(([id,b])=>id===b.id&&isValidBlueprint(b)&&b.authorId===uid&&!PUBLISHED_DEMO_BLUEPRINT_IDS.includes(id)))return false;
 const state={blueprints:map};for(const b of Object.values(map)){let current=b;const seen=new Set();while(current.parentId!==null){if(seen.has(current.id))return false;seen.add(current.id);const parent=getBlueprintRecord(state,current.parentId);if(!parent||current.rootId!==parent.rootId||current.parentAuthorName!==parent.authorName)return false;current=parent;}if(current.id!==b.rootId)return false;}
 return true;
}

export const buildingSample=id=>Object.hasOwn(samples,id)?samples[id]:null;
