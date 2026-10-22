import {useEffect,useRef} from 'react';import {Cloud,Milk,Heart,Footprints,ChevronRight} from 'lucide-react';
import type {EstateAnimal,Profile} from './estate.ts';import {PERSONALITY_LABEL} from '../model.ts';import {bondStage} from './life.ts';
type Send=(type:string,extra?:Record<string,unknown>)=>void;
export default function CompactAnimalCard({animal:a,profile:p,busy,send,onInspect,onDetails}:{animal:EstateAnimal;profile:Profile;busy:boolean;send:Send;onInspect:(id:string)=>void;onDetails:()=>void}){
 const submitted=useRef(false);useEffect(()=>{if(!busy)submitted.current=false;},[busy,a.id]);
 const act:Send=(type,extra)=>{if(busy||submitted.current)return;submitted.current=true;send(type,extra);};
 const full=a.life.hunger>=80,feeding=p.job?.type==='feed'&&p.job.target===a.id;
 const need=a.memorial?'留在我们的记忆里':feeding?'正在照顾它':full?'吃饱啦，想一起玩':a.life.energy<30?'有点困了，想休息':'肚子饿了';
 return <article className="compact-animal" data-resident-id={a.id}>
  <nav className="compact-residents" aria-label="选择小羊">{p.animals.map(item=><button key={item.id} className={item.id===a.id?'selected':''} aria-label={`查看${item.name}的卡片`} aria-pressed={item.id===a.id} onClick={()=>onInspect(item.id)}><Cloud size={14} style={{color:item.color}}/>{item.name}</button>)}</nav>
  <div className="compact-animal-state"><strong>{need}</strong><small>{PERSONALITY_LABEL[a.personality]} · {bondStage(a.life.bond)}</small></div>
  {!a.memorial&&<><div className="compact-needs"><span>饱食<progress max={100} value={a.life.hunger} aria-label="饱食"/></span><span>精力<progress max={100} value={a.life.energy} aria-label="精力"/></span></div>
  <div className="compact-animal-actions"><button className="compact-primary" data-command={p.inventory.hand?'feed':'refill'} disabled={busy||!!p.job||full} onClick={()=>act(p.inventory.hand?'feed':'refill',p.inventory.hand?{target:a.id,food:a.life.stage==='baby'?'milk':'feed'}:{})}><Milk size={19}/>{feeding?'照顾中':full?'吃饱了':!p.inventory.hand?'去拿食物':a.life.stage==='baby'?'喂奶':'喂食'}</button><button disabled={busy||!!p.job} onClick={()=>act('play',{target:a.id,action:a.preference})}><Heart size={18}/>一起玩</button><button disabled={busy} onClick={()=>act('follow',{target:a.id})}><Footprints size={18}/>{a.following?'自由活动':'一起走'}</button></div></>}
  <button className="compact-more" onClick={onDetails}>查看成长与回忆<ChevronRight size={13}/></button>
 </article>;
}
