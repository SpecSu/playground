import {Check,ChevronRight,BookOpen} from 'lucide-react';
import {journey} from './journey.ts';import type {Snapshot} from './model.ts';
export default function JourneySheet({farm,locked,onClaim,onGo}:{farm:Snapshot;locked:boolean;onClaim:(id:string)=>void;onGo:(id:string)=>void}){
 const items=journey(farm),complete=items.filter(q=>q.claimed).length;
 return <div className="farm-journey"><div className="farm-journey-intro"><BookOpen/><span>相处手账 <b>{complete}/8</b><small>做点小事，攒够8团羊毛搭舞台</small></span></div>{items.map(q=><div className={`farm-quest ${q.claimed?'claimed':''}`} key={q.id}><span className="farm-quest-mark">{q.claimed?<Check size={16}/>:q.ready?'✓':q.progress||'·'}</span><div><b>{q.title}</b><small>{q.claimed?'已经收好':q.hint}</small></div>{q.claimed?<span className="farm-quest-reward">已收下</span>:q.ready?<button data-command="questClaim" disabled={locked} onClick={()=>onClaim(q.id)}>收下 +{q.reward}</button>:<button className="farm-quest-go" onClick={()=>onGo(q.id)} aria-label={`去完成${q.title}`}><ChevronRight size={16}/></button>}</div>)}<p className="sheet-note">首次相处的有限目标，奖励不会重复发。自然羊毛也会慢慢积累，离开不会掉关系。</p></div>;
}
