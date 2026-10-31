import type {Farm} from './model.ts';
export type JourneyItem={id:string;title:string;hint:string;reward:number;ready:boolean;claimed:boolean;progress:string};
/** Finite first-farm milestones. All unlocks are derived from authoritative saved state. */
export function journey(s:Farm):JourneyItem[]{
 const met=s.animals.filter(a=>s.book.met.includes(a.id)).length;
 const dancers=s.animals.filter(a=>(a.habits.dance?.count??0)>=1).length;
 const definitions=[
  {id:'meet',title:'认识三位住民',hint:'点开每只小羊的卡片',reward:1,ready:met===3,progress:`${met}/3`},
  {id:'feed',title:'一口青草',hint:'在动物卡里喂一次青草',reward:1,ready:s.animals.some(a=>a.care.feedCount>0),progress:''},
  {id:'dance',title:'同一支舞，三种回应',hint:'在互动里对大家跳舞',reward:1,ready:dancers===3,progress:`${dancers}/3`},
  {id:'company',title:'安静陪你一会儿',hint:'在动物卡里完成20秒陪伴',reward:1,ready:s.animals.some(a=>a.care.companyCount>0),progress:''},
  {id:'learn',title:'它学会了你的舞步',hint:'同动作间隔12秒做三次',reward:2,ready:s.animals.some(a=>a.habits.dance?.stage==='invite'),progress:''},
  {id:'rhythm',title:'奶蛙带一次合拍',hint:'在互动或守护者卡发起',reward:1,ready:s.sharedEvents>0,progress:''},
  {id:'memory',title:'下次它还认得你',hint:'形成习惯后刷新或体验下次来访',reward:1,ready:s.book.rememberedVisits>0,progress:''},
  {id:'stage',title:'搭好软垫舞台',hint:'攒8团羊毛，在「+」里兑换',reward:1,ready:s.stage,progress:''},
 ];
 return definitions.map(q=>({...q,claimed:s.book.claimed.includes(q.id)}));
}
