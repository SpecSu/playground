import {Cloud,Heart,Leaf,Clock3,Sparkles,Check,Music2} from 'lucide-react';
import {ACTIONS,ACTION_LABEL,PERSONALITY_LABEL,bondStage,FEED_COOLDOWN,COMPANY_COOLDOWN,type Snapshot,type Animal,type FarmEvent,type Command} from './model.ts';
import {animalStatus,companyRemaining} from './animal-view.ts';
type Extra=Omit<Partial<Command>,'type'|'id'>;
type Props={farm:Snapshot;animal:Animal;event?:FarmEvent;now:number;locked:boolean;onCommand:(type:string,extra?:Extra)=>void;onInteract:(type:string,extra?:Extra)=>void};
export default function ResidentCard({farm,animal:a,event,now,locked,onCommand,onInteract}:Props){
 const cooldown=Math.max(0,Math.ceil((farm.actionReadyAt-now)/1000)),feedWait=a.care.lastFeedAt?Math.max(0,Math.ceil((a.care.lastFeedAt+FEED_COOLDOWN-now)/1000)):0,companyWait=a.care.lastCompanyAt?Math.max(0,Math.ceil((a.care.lastCompanyAt+COMPANY_COOLDOWN-now)/1000)):0;
 const session=farm.company,ownSession=session?.animalId===a.id,expired=!!session&&now>session.expiresAt;
 const preferences={dance:'喜欢跳舞',bounce:'喜欢蹦跳',love:'喜欢你的心意'};
 return <article className="farm-resident-card" data-resident-id={a.id}>
  <div className="farm-card-identity"><span className="farm-sheep-mark" style={{'--resident-color':a.color} as React.CSSProperties}><Cloud/></span><div><b>{a.name}{a.appearance==='starlit'?' ✦':''}</b><span>{PERSONALITY_LABEL[a.personality]} · {preferences[a.preference]}</span></div><span className="farm-appearance-badge">{a.appearance==='starlit'?'星点卷毛':a.growthEligible&&!a.growthChoiceMade?'星点预兆':'普通卷毛'}</span></div>
  <p className="farm-current-state" role="status">{animalStatus(a,farm,event,now)}</p>
  <div className="farm-memory-heading"><h3>{a.name}的记忆</h3><span><Heart size={11}/>{bondStage(a.bond)}</span></div><div className="farm-bond"><i style={{width:`${a.bond/12*100}%`,background:a.color}}/></div>
  <div className="farm-habits" aria-label={`${a.name}学会的习惯`}>{ACTIONS.map(action=>{const h=a.habits[action];return <div key={action}><span>{action==='love'?<Heart size={13}/>:<Music2 size={13}/>} {ACTION_LABEL[action]}</span><span className="farm-habit-dots" aria-label={`${h?.count??0}/3`}>{[1,2,3].map(n=><i key={n} className={(h?.count??0)>=n?'complete':''}/>)}</span><small>{h?.stage==='invite'?'会邀请你':h?.stage==='imitate'?'学着做了':h?'正在观察':'还没见过'}</small></div>;})}</div>
  <div className="farm-card-actions">{ACTIONS.map(action=><button key={action} disabled={locked||!!cooldown} onClick={()=>onInteract('act',{target:a.id,action})}>{ACTION_LABEL[action]}</button>)}</div>
  <div className="farm-care-actions"><button data-command="feed" disabled={locked||!!cooldown||!!feedWait} onClick={()=>onInteract('feed',{target:a.id})}><Leaf size={17}/><span>喂青草<small>{feedWait?`${feedWait}秒后再喂`:'牧场青草 · 不消耗羊毛'}</small></span></button><button data-command="company" disabled={locked||!!cooldown||!!session||!!companyWait} onClick={()=>onInteract('company',{target:a.id})}><Clock3 size={17}/><span>一起待会儿<small>{companyWait?'记着刚才的陪伴':session?'已有朋友陪着你':'20秒，慢慢熟悉'}</small></span></button></div>
  {ownSession&&<div className="farm-company-panel" role="status"><span>{expired?'这次陪伴已经结束':companyRemaining(farm,now)?`还要 ${companyRemaining(farm,now)} 秒`:'20秒到了，记下这段陪伴吧'}</span><button className="actions-join" disabled={locked||(!expired&&!!companyRemaining(farm,now))} onClick={()=>onInteract('finishCompany',{session:session.id})}>{expired?'结束这次陪伴':'记下这段陪伴'}</button><button className="farm-text-link" disabled={locked} onClick={()=>onCommand('cancelCompany',{session:session.id})}>结束陪伴</button></div>}
  <p className="farm-personality">{a.personality==='eager'?'一听见节奏就靠近，喜欢跟着拍子跳。':a.personality==='shy'?'先动动耳朵，再小幅回应。熟悉后也保留一点距离。':'等自己的时机，改编成侧步。亲近也不会变成复制品。'}</p>
  <div className="farm-memory-list">{a.experiences.length?a.experiences.slice(-3).reverse().map((e,i)=><p key={`${e.at}-${i}`}><span>·</span>{e.text}</p>):<p>还没有共同经历，先来打个招呼吧。</p>}</div>
  {a.growthEligible?<div className="farm-growth"><Sparkles size={18}/><span>节奏与合拍，让卷毛有了小星点</span><button data-command="appearance" className="actions-join" disabled={locked} onClick={()=>onCommand('appearance',{target:a.id,appearance:a.appearance==='plain'?'starlit':'plain'})}>{a.appearance==='plain'?'留下星点卷毛':'恢复普通卷毛'}</button><small>规则驱动外观 · 名字、性格和关系保留</small></div>:<p className="sheet-note">学会舞步，再和奶蛙合拍，看看卷毛的变化。</p>}
  <p className="sheet-note"><Check size={10}/> 关系和习惯已记录在这台Mac；喂草与陪伴各有三次成长机会。</p>
 </article>;
}
