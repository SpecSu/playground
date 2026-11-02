import {ECONOMY} from './economy.js';
import {FISH_STANDARD_SIZES_CM} from '../art/fish-sizing.js';
export const PLANT_CATALOGUE_VERSION=2;
// Explicit tier/value slots retain every legacy species identity and price.
/** @type {Array<[string,string,number,number]>} */
const legacyPlantRows=[['radish','萝卜',1,0],['daisy','雏菊',1,1],['tomato','番茄',2,0],['tulip','郁金香',2,1],['pumpkin','南瓜',3,0],['sunflower','向日葵',3,1],['dragonfruit','火龙果',4,0],['iris','鸢尾',4,1],['grape','葡萄',5,0],['phalaenopsis','蝴蝶兰',5,1]];
/** @type {Array<[string,string,number,number]>} */
// Stable lithops/rafflesia identities present as strawberry/dragon tree; draw order and economics stay unchanged.
const exoticPlantRows=[['lithops','草莓',1,0],['corkscrew-grass','弹簧草',1,1],['mimosa','含羞草',2,0],['string-of-pearls','佛珠藤',2,1],['pitcher-plant','猪笼草',3,0],['spiral-aloe','螺旋芦荟',3,1],['fantasy-chomper','食人花',4,0],['travellers-palm','旅人蕉',4,1],['rafflesia','龙血树',5,0],['titan-arum','巨魔芋',5,1]];
export const LEGACY_PLANT_IDS=Object.freeze(legacyPlantRows.map(r=>r[0]));
// Original twenty identities with the approved new overall-size contract.
// The artist validates the physical renderer separately; island scaling is forbidden.
/** @type {Array<[string,string,number]>} */
const fishRows=[
 ['clownfish','小丑鱼',18],['sardine','银光沙丁鱼',22],['mackerel','青花鲭',32.5],['pufferfish','圆滚河豚',25.5],
 ['blue-tang','蓝倒吊',28],['salmon','珊瑚鲑',51],['cuttlefish','花纹乌贼',30],['octopus','桃桃章鱼',45],
 ['lobster','珊瑚龙虾',42.5],['snow-crab','雪绒蟹',60],['squid','星灯鱿鱼',41],['mahi-mahi','金翡翠鲯鳅',105],
 ['manta-ray','月光鳐',112.5],['king-crab','金冠帝王蟹',105],['tuna','蓝鳍金枪鱼',150],['swordfish','银剑鱼',170],
 ['oarfish','绯冠皇带鱼',180],['sailfish','蓝帆旗鱼',190],['hammerhead','月湾双髻鲨',200],['sunfish','月轮翻车鱼',155],
];
export function makeCatalogue(config=ECONOMY,plantVersion=PLANT_CATALOGUE_VERSION){
 const plants=(plantVersion===1?legacyPlantRows:[...legacyPlantRows,...exoticPlantRows]).map(([id,name,tier,valueSlot])=>Object.freeze({id,name,kind:'plant',tier,standardSize:1,sizeUnit:'relative',baseValue:Math.round(config.baseValues[tier-1]*(1+valueSlot*.08))})).sort((a,b)=>a.tier-b.tier);
 const fish=fishRows.map(([id,name],i)=>Object.freeze({id,name,kind:'fish',tier:1+Math.floor(i/4),standardSize:FISH_STANDARD_SIZES_CM[id],sizeUnit:'cm',baseValue:Math.round(config.baseValues[Math.floor(i/4)]*(1+(i%4)*.04))}));
 return [...plants,...fish];
}
export const CATALOGUE=Object.freeze(makeCatalogue());
export const SPECIES_BY_ID=Object.freeze(Object.fromEntries(CATALOGUE.map(s=>[s.id,s])));
