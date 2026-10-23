import {ECONOMY} from './economy.js';
import {FISH_STANDARD_SIZES_CM} from '../art/fish-sizing.js';
const plantRows=[['radish','萝卜'],['daisy','雏菊'],['tomato','番茄'],['tulip','郁金香'],['pumpkin','南瓜'],['sunflower','向日葵'],['dragonfruit','火龙果'],['iris','鸢尾'],['grape','葡萄'],['phalaenopsis','蝴蝶兰']];
// Original twenty identities with the approved new overall-size contract.
// The artist validates the physical renderer separately; island scaling is forbidden.
const fishRows=[
 ['clownfish','小丑鱼',18],['sardine','银光沙丁鱼',22],['mackerel','青花鲭',32.5],['pufferfish','圆滚河豚',25.5],
 ['blue-tang','蓝倒吊',28],['salmon','珊瑚鲑',51],['cuttlefish','花纹乌贼',30],['octopus','桃桃章鱼',45],
 ['lobster','珊瑚龙虾',42.5],['snow-crab','雪绒蟹',60],['squid','星灯鱿鱼',41],['mahi-mahi','金翡翠鲯鳅',105],
 ['manta-ray','月光鳐',112.5],['king-crab','金冠帝王蟹',105],['tuna','蓝鳍金枪鱼',150],['swordfish','银剑鱼',170],
 ['oarfish','绯冠皇带鱼',180],['sailfish','蓝帆旗鱼',190],['hammerhead','月湾双髻鲨',200],['sunfish','月轮翻车鱼',155],
];
export function makeCatalogue(config=ECONOMY){
 const make=(rows,kind)=>{const n=kind==='plant'?2:4;return rows.map(([id,name,size],i)=>Object.freeze({id,name,kind,tier:1+Math.floor(i/n),standardSize:kind==='fish'?FISH_STANDARD_SIZES_CM[id]:1,sizeUnit:kind==='fish'?'cm':'relative',baseValue:Math.round(config.baseValues[Math.floor(i/n)]*(1+(i%n)*(kind==='plant'?.08:.04)))}));};
 return [...make(plantRows,'plant'),...make(fishRows,'fish')];
}
export const CATALOGUE=Object.freeze(makeCatalogue());
export const SPECIES_BY_ID=Object.freeze(Object.fromEntries(CATALOGUE.map(s=>[s.id,s])));
