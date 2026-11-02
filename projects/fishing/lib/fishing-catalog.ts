export type MarineRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type MarineSpecies = { id: string; name: string; english: string; rarity: MarineRarity; selectionWeight: number; minCm: number; maxCm: number; fixedCm: number; kgPerMeter: number; color: string; icon: string; description: string };
export const RARITIES: Record<MarineRarity,{label:string;color:string}> = { common:{label:'常见',color:'#acd7df'},uncommon:{label:'特别',color:'#7dd6ac'},rare:{label:'稀有',color:'#67bdff'},epic:{label:'史诗',color:'#c19cff'},legendary:{label:'传说',color:'#ffd26e'} };
/** fixedCm is the canonical gameplay/display size, including legacy catches.
 * minCm/maxCm remain descriptive compatibility metadata, never a random range. */
export const MARINE_SPECIES: readonly MarineSpecies[] = [
  {id:'clownfish',name:'小丑鱼',english:'CLOWNFISH',rarity:'common',selectionWeight:12,minCm:6,maxCm:15,fixedCm:12,kgPerMeter:2,color:'#ff944c',icon:'🐠',description:'把一小片落日，藏进橘色条纹里。'},
  {id:'blue-tang',name:'蓝吊鱼',english:'BLUE TANG',rarity:'common',selectionWeight:10,minCm:12,maxCm:30,fixedCm:24,kgPerMeter:3,color:'#428cfa',icon:'🐠',description:'像从海里跳出来的一滴蓝。'},
  {id:'pufferfish',name:'河豚',english:'PUFFERFISH',rarity:'uncommon',selectionWeight:7,minCm:12,maxCm:55,fixedCm:45,kgPerMeter:7,color:'#e4bb6c',icon:'🐡',description:'圆鼓鼓的脾气，软乎乎的惊喜。'},
  {id:'sardine',name:'沙丁鱼',english:'SARDINE',rarity:'common',selectionWeight:14,minCm:10,maxCm:28,fixedCm:20,kgPerMeter:2,color:'#a8dce1',icon:'🐟',description:'闪闪发亮的小小海洋居民。'},
  {id:'mackerel',name:'鲭鱼',english:'MACKEREL',rarity:'common',selectionWeight:11,minCm:20,maxCm:65,fixedCm:42,kgPerMeter:4,color:'#41b4bd',icon:'🐟',description:'银蓝色的流线型速度选手。'},
  {id:'squid',name:'鱿鱼',english:'SQUID',rarity:'uncommon',selectionWeight:8,minCm:18,maxCm:120,fixedCm:70,kgPerMeter:3,color:'#ed9abd',icon:'🦑',description:'触腕还在跳舞，今天的惊喜很有活力。'},
  {id:'cuttlefish',name:'乌贼',english:'CUTTLEFISH',rarity:'uncommon',selectionWeight:6,minCm:20,maxCm:65,fixedCm:55,kgPerMeter:5,color:'#bc8df4',icon:'🦑',description:'一位披着变幻披风的深海艺术家。'},
  {id:'octopus',name:'章鱼',english:'OCTOPUS',rarity:'rare',selectionWeight:4,minCm:30,maxCm:180,fixedCm:120,kgPerMeter:4,color:'#e67b8a',icon:'🐙',description:'八只手一起，和你打个招呼。'},
  {id:'lobster',name:'锦绣龙虾',english:'LOBSTER',rarity:'rare',selectionWeight:5,minCm:25,maxCm:90,fixedCm:85,kgPerMeter:6,color:'#f07855',icon:'🦞',description:'挥舞大钳子的甲板贵宾。'},
  {id:'king-crab',name:'帝王蟹',english:'KING CRAB',rarity:'epic',selectionWeight:2.5,minCm:60,maxCm:180,fixedCm:160,kgPerMeter:7,color:'#e85e4e',icon:'🦀',description:'横着走，也能有王者气场。'},
  {id:'snow-crab',name:'雪蟹',english:'SNOW CRAB',rarity:'uncommon',selectionWeight:6,minCm:25,maxCm:80,fixedCm:65,kgPerMeter:5,color:'#efa97e',icon:'🦀',description:'长长的蟹腿，接住海风的温柔。'},
  {id:'salmon',name:'三文鱼',english:'SALMON',rarity:'uncommon',selectionWeight:8,minCm:45,maxCm:130,fixedCm:95,kgPerMeter:8,color:'#cbbac4',icon:'🐟',description:'带着银色鳞光，游进你的收藏。'},
  {id:'mahi-mahi',name:'鲯鳅',english:'MAHI MAHI',rarity:'rare',selectionWeight:4,minCm:60,maxCm:200,fixedCm:150,kgPerMeter:8,color:'#e4d45e',icon:'🐠',description:'亮绿与金黄，是大海最招摇的配色。'},
  {id:'tuna',name:'蓝鳍金枪鱼',english:'BLUEFIN TUNA',rarity:'epic',selectionWeight:2.7,minCm:110,maxCm:350,fixedCm:220,kgPerMeter:16,color:'#619bd1',icon:'🐟',description:'沉甸甸的蓝色奇迹，值得双手抱紧。'},
  {id:'swordfish',name:'剑鱼',english:'SWORDFISH',rarity:'epic',selectionWeight:2,minCm:150,maxCm:450,fixedCm:280,kgPerMeter:10,color:'#759ebc',icon:'🐟',description:'举起长剑，向你的好运致意。'},
  {id:'sailfish',name:'旗鱼',english:'SAILFISH',rarity:'epic',selectionWeight:1.8,minCm:140,maxCm:340,fixedCm:240,kgPerMeter:9,color:'#5b90db',icon:'🐟',description:'一面来自深蓝的帆，在风里展开。'},
  {id:'manta-ray',name:'蝠鲼',english:'MANTA RAY',rarity:'legendary',selectionWeight:0.8,minCm:200,maxCm:650,fixedCm:450,kgPerMeter:14,color:'#86a2c1',icon:'🌊',description:'张开双翼，把整片海拥进怀里。'},
  {id:'hammerhead',name:'双髻鲨',english:'HAMMERHEAD',rarity:'legendary',selectionWeight:0.7,minCm:200,maxCm:550,fixedCm:380,kgPerMeter:12,color:'#91bbc2',icon:'🦈',description:'特别的脑袋，当然配得上特别的好运。'},
  {id:'oarfish',name:'皇带鱼',english:'OARFISH',rarity:'legendary',selectionWeight:0.3,minCm:350,maxCm:900,fixedCm:650,kgPerMeter:3,color:'#d9c1dd',icon:'✨',description:'传说中的海底长缎带，真的被你遇见了。'},
  {id:'sunfish',name:'翻车鱼',english:'OCEAN SUNFISH',rarity:'legendary',selectionWeight:0.7,minCm:120,maxCm:350,fixedCm:300,kgPerMeter:30,color:'#becdd4',icon:'🐟',description:'巨大又淡定，今天最可爱的重量级。'},
];
export function getSpecies(id: string): MarineSpecies { const species=MARINE_SPECIES.find(s=>s.id===id);if(!species)throw new Error('Unknown marine species');return species; }
export function formatLength(cm:number) { return cm>=100?`${(cm/100).toFixed(2)} m`:`${cm.toFixed(1)} cm`; }
