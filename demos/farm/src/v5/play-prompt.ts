import type {Profile} from './estate.ts';
import {currentJourneyGoal,type JourneyAction} from './journey.ts';

export type PlayPrompt={title:string;progress:string;label:string;action:JourneyAction|null;feedback:string|null};
const seconds=(elapsed:number,total:number)=>`${Math.min(total,Math.max(0,Math.floor(elapsed/1000)))}/${total}秒`;
function careFeedback(p:Profile,now:number):string|null{
 const visual=p.lastVisual;
 if(!visual||visual.action!=='eat'||now<visual.at||now-visual.at>=5000)return null;
 const animal=p.animals.find(a=>a.id===visual.target&&!a.memorial);
 return animal?`${animal.name}${animal.life.hunger>=80?'吃饱啦':animal.life.stage==='baby'?'喝到奶啦':'吃到食物啦'}`:null;
}

/** Present one real next action. This view never changes goals, rewards or jobs. */
export function playPrompt(p:Profile,now:number):PlayPrompt{
 const feedback=careFeedback(p,now),job=p.job;
 if(job){
  let title='正在完成手上的行动',progress='';
  if(job.type==='feed'){
   const animal=p.animals.find(a=>a.id===job.target&&!a.memorial),name=animal?.name??'小伙伴';
   title=job.phase==='walk'?`正在走向${name}`:`${name}正在${job.food==='milk'?'喝奶':'吃饭'}`;
   progress=seconds(job.progress,3);
  }else if(job.type==='refill'){
   const source=job.target?'食槽':'工作台';title=p.path.length?`正在走向${source}`:'正在补充食物';progress=seconds(job.progress,2);
  }else if(job.type==='survey'){
   title='正在勘察新土地';progress=seconds(job.progress,5);
  }else if(job.type==='delivery'){
   title=job.phase==='back'?'配送完成，正在返回':job.phase==='unload'?'正在把饲料装进食槽':'正在配送饲料';
   progress=job.phase==='unload'?seconds(job.progress,2):job.carried?`带着${job.carried}份饲料`:'';
  }
  return {title,progress,label:'',action:null,feedback};
 }
 const goal=currentJourneyGoal(p);
 let title=goal.title,progress=goal.progress,label=goal.label;
 if(goal.id==='first-meal'){
  progress=goal.progress.split(' ')[0];
  if(goal.action.kind==='inspect'){
   const target=goal.action.target,animal=p.animals.find(a=>a.id===target&&!a.memorial);
   if(animal){const action=animal.life.stage==='baby'?'喂奶':'喂食';title=`给${animal.name}${action}`;label=`去${action}`;}
  }else if(goal.action.kind==='refill'){title='先补充食物';label='去工作台';}
 }else if(goal.id==='develop'){title='给小家添点东西';progress='';label='建东西';}
 else if(goal.id==='walk-home'){progress=goal.progress.split(' ')[0];label=goal.action.kind==='move'?'带我过去':'看看道路';}
 else if(goal.id==='discover-valley'){progress=goal.progress.split(' ')[0];label='带我过去';}
 else if(goal.id==='construction'){title='新设施正在搭建';progress=goal.progress.split(' · ')[0];label='看看进度';}
 else if(goal.id==='rehearse'){title='带大家练习回保护区';progress='安心演练';label='去看看';}
 else if(goal.id==='survey'){title='去东边看看新土地';progress='';label=goal.action.kind==='move'?'带我过去':'开始勘察';}
 else if(goal.id==='expand'){title='扩大自己的小家';progress=`${p.materials}/30 材料`;label='看看新土地';}
 else if(goal.id==='free-explore'){title='收羊毛，升级小家的保护';progress='收获 → 材料 → 守护';label='羊毛·守护';}
 return {title,progress,label,action:goal.action,feedback};
}
