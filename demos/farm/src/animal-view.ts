import {ACTION_LABEL,type Animal,type FarmEvent,type Snapshot} from './model.ts';
import {responseAt} from './navigation.ts';
export function animalStatus(a:Animal,farm:Snapshot,event:FarmEvent|undefined,now:number){
 const r=responseAt(event,a.id,now);
 if(r){if(r.micro)return a.personality==='shy'?'耳朵动了动，先看看你':'认出你的动作，准备回应';if(event?.kind==='feed')return '正在回味青草';return r.reaction.text;}
 if(farm.company?.animalId===a.id&&now<=farm.company.expiresAt)return now<farm.company.readyAt?'正在安静陪着你':'想把这段陪伴记下来';
 const learned=Object.entries(a.habits).find(([,habit])=>habit?.stage==='invite');
 return learned?`记着你的${ACTION_LABEL[learned[0] as keyof typeof ACTION_LABEL]}，等你再来`:'正在草地上散步';
}
export function companyRemaining(farm:Snapshot,now:number){return farm.company?Math.max(0,Math.ceil((farm.company.readyAt-now)/1000)):0;}
