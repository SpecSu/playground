import {useEffect,useRef,useState} from 'react';
import type {Avatar} from '../model.ts';
import {encounterCard,MAX_FANTASY_LENGTH,type EncounterProfile} from './encounter.ts';
import './encounter.css';
export type EncounterPanelProps={profile:EncounterProfile;avatar:Avatar;busy:boolean;onCommand:(type:string,extra?:Record<string,unknown>)=>void;onClose:()=>void};
export default function EncounterPanel({profile,avatar,busy,onCommand,onClose}:EncounterPanelProps){
 const card=encounterCard(profile,avatar),[line,setLine]=useState(card.fantasyLine),dirty=line!==card.fantasyLine,submitted=useRef(false);
 useEffect(()=>{if(!busy)submitted.current=false;},[busy,profile]);
 const act=(type:string,extra:Record<string,unknown>={})=>{if(busy||submitted.current)return;submitted.current=true;onCommand(type,extra);};
 return <section className="encounter-card" data-encounter aria-label="庄园偶遇卡">
  <div className="encounter-card-top"><span>偶遇 · 你的庄园故事</span><button onClick={onClose} aria-label="关闭偶遇卡">×</button></div>
  <div className="encounter-cast"><figure><img src={card.playerPortrait} alt={`当前分身：${card.playerName}`}/><figcaption>{card.playerName} · 当前分身</figcaption></figure><span>与</span><figure>{card.guardianPortrait?<img src={card.guardianPortrait} alt={`当前守护者：${card.guardianName}`}/>:<div className="encounter-no-guardian">选择一位伙伴</div>}<figcaption>{card.guardianName}</figcaption></figure></div>
  <h3>这一次，换我来守护你</h3>
  <div className="encounter-fact"><strong>真实经历</strong>{card.fact?<p data-encounter-fact>{card.fact.text}</p>:<p>还没有已记录的关键事件。可以先写一段幻想。</p>}</div>
  <label className="encounter-fantasy">幻想演绎台词 · 不改变战绩<textarea aria-label="幻想演绎台词" value={line} onChange={e=>{const value=Array.from(e.target.value).slice(0,MAX_FANTASY_LENGTH).join('');setLine(value);}}/><small>{Array.from(line).length}/{MAX_FANTASY_LENGTH}字 · 视频为故事演绎，非游戏实录</small></label>
  <p className="encounter-budget">约12秒视频提案 · 生成服务未连接<br/>生成预算未知，与游戏金币、物料独立。当前尝试与重试均不扣费；接通后需另行展示真实费用。</p>
  {card.lastJob&&<p className="encounter-job" role="status">{card.lastJob.reason}<br/>草稿已保留，可稍后重试。</p>}
  <div className="encounter-buttons">{dirty?<button disabled={busy} onClick={()=>act('encounter-edit',{fantasyLine:line})}>保存幻想台词</button>:<button disabled={busy} onClick={()=>act('encounter-submit',card.lastJob?{retryOf:card.lastJob.id}:{})}>{card.lastJob?'重试约12秒视频 · 当前不扣费':'尝试发起约12秒视频'}</button>}<button onClick={onClose}>跳过，回庄园</button></div>
  <small className="encounter-private">当前仅原型任务记录，无视频产物。以后生成默认私有，公开发布及肖像、音乐授权需分别确认。</small>
 </section>;
}
