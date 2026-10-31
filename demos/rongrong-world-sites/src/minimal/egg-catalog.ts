import type {AnimalResourceContext} from './animal-resource-context.ts';
import {MINIMAL_RULES,nearShop,type MinimalState,type Species,type Terrain} from './model.ts';
import {isAnimalProviderReady} from './species.ts';
export const EGG_THEMES=['grassland','forest','wetland','desert','glacier'] as const;
export type EggTheme=typeof EGG_THEMES[number];
export const EGG_THEME_LABELS:Record<EggTheme,string>={grassland:'草原',forest:'森林',wetland:'湿地',desert:'沙漠',glacier:'冰川'};
/** Released production species only. Empty means unavailable, never a substitute draw. */
const pools:Record<EggTheme,readonly Species[]>={grassland:['sheep','pig','cow'],forest:['bunny'],wetland:['duck'],desert:[],glacier:[]};
export function isEggTheme(value:unknown):value is EggTheme{return typeof value==='string'&&EGG_THEMES.some(t=>t===value);}
export function themeForNaturalTerrain(terrain:Terrain):EggTheme|null{return terrain==='meadow'?'grassland':terrain==='grove'?'forest':terrain==='creek'||terrain==='pond'?'wetland':terrain==='desert'?'desert':terrain==='glacier'?'glacier':null;}
export function eggOffer(state:{exploredBiomes:readonly string[]},theme:EggTheme,resources?:AnimalResourceContext|null){const species:readonly Species[]=theme==='desert'&&isAnimalProviderReady('alpaca',resources)?['alpaca']:theme==='glacier'&&isAnimalProviderReady('penguin',resources)?['penguin']:pools[theme];return {explored:state.exploredBiomes.includes(theme),contentReady:species.length>0,species,price:MINIMAL_RULES.eggCost};}

/** Purchase rules only: a missing current hatch habitat never revokes an explored offer.
 * UI-only request/movement locks may tighten this result, never grant admission. */
export function eggPurchaseAvailability(state:MinimalState,theme:EggTheme,resources?:AnimalResourceContext|null,transientReason=''){
 const offer=eggOffer(state,theme,resources);
 const result=(code:string,reason:string,message=reason)=>({offer,available:code==='ready',code,reason,message});
 if(!state.welcomeClaimed)return result('welcome','先领取开园金币','先收下开园金币吧');
 if(!offer.explored)return result('unexplored',`先探索${EGG_THEME_LABELS[theme]}`,'先开垦对应自然地形，解锁这类动物蛋');
 if(!offer.contentReady)return result('resources','伙伴暂未就绪','这类新动物还在制作中，暂不可购买');
 if(transientReason)return result('transient',transientReason);
 if(!nearShop(state))return result('distance','走近商店后购买','先走到小店柜台前');
 if(state.coins<offer.price)return result('funds',`还差 ${offer.price-state.coins} 金币`,`惊喜蛋需要 ${offer.price} 金币`);
 if(state.animals.length+state.eggs.length>=MINIMAL_RULES.maxAnimals)return result('capacity','牧场位置已满',`小家暂时最多容纳 ${MINIMAL_RULES.maxAnimals} 位伙伴和待孵的蛋`);
 return result('ready','');
}
