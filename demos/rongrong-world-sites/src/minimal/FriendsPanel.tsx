import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Mountain,Snowflake,Waves,MoonStar,School} from 'lucide-react';
import {PanelHelp} from './PanelHelp.tsx';
import {SAMPLE_FRIENDS} from './sample-farms.ts';
import {SCHOOL_PLAYGROUND_FRIEND} from './playground-friend.ts';
import type {BoardingTarget} from './boarding-target.ts';
import './friends.css';
const themeIcons={desert:Mountain,glacier:Snowflake,wetland:Waves,lunar:MoonStar,school:School};
export function FriendsPanel({onVisit,onClose,onOpenBoarding}:{onVisit:(target:BoardingTarget)=>void;onClose:()=>void;onOpenBoarding?:()=>void}){
 const [period,setPeriod]=useState<'today'|'week'>('today'),title=useId(),dialog=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null);
 const closeRef=useRef(onClose);closeRef.current=onClose;
 const cards=[...SAMPLE_FRIENDS,SCHOOL_PLAYGROUND_FRIEND].sort((a,b)=>b[period]-a[period]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus({preventScroll:true});const key=(e:KeyboardEvent)=>{if(document.querySelector('[data-panel-help]'))return;if(e.key==='Escape'){e.preventDefault();closeRef.current();}if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')??[]),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
 return <div className="friends-shade" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className="friends-panel" role="dialog" aria-modal="true" aria-labelledby={title}>
  <header className="friends-heading"><h2 id={title}>好友牧场</h2><div><PanelHelp title="好友与示例说明"><p>这些都是主题示例农场，不是真人好友账号，也不是从你的通讯录读取的。展示姓名与头像暂按你提供的顺序对应，可随时更正；未关联真人账号，不代表真实账号在线，也不表示已绑定3D形象。</p><p>今日、本周显示示例热度，不是可领取的金币。普通示例牧场可以走动、举起和打招呼；校园操场是八人跑队观察场景，只支持观察和全队暂停。动物不会变成你的资产，离开就会放回原来的牧场。</p><p>示例寄养里的蛋和收益仅供测试，不能出售、兑换或转入正式牧场。真人好友与邀请会另外明确显示。</p></PanelHelp><button ref={close} type="button" className="friends-close" aria-label="收起好友列表" onClick={onClose}><ChevronDown aria-hidden="true" size={24}/></button></div></header>
  <div className="friends-tabs" role="tablist" aria-label="示例热度排行"><button type="button" role="tab" aria-selected={period==='today'} onClick={()=>setPeriod('today')}>今日</button><button type="button" role="tab" aria-selected={period==='week'} onClick={()=>setPeriod('week')}>本周</button><span>示例热度</span></div>
  <ol className="friends-list" aria-label={`${period==='today'?'今日':'本周'}示例好友`}>
   {cards.map((card,i)=>{const Icon=themeIcons[card.themeId];return <li key={card.target.sampleId} data-friend-row><span className="friend-rank">{i+1}</span>{card.avatar?<img className="friend-avatar" src={card.avatar} alt={`${card.name}的展示头像`} style={{objectFit:'cover',objectPosition:'center top'}}/>:<span className="friend-avatar friend-theme-avatar" data-theme-avatar={card.themeId} role="img" aria-label="主题图标，未关联真人账号" style={{color:card.accent,backgroundColor:`${card.accent}22`}}><Icon size={29} aria-hidden="true"/></span>}<div className="friend-info"><div><strong>{card.name}</strong><span className="friend-sample-badge">示例</span></div><span>{card.farmName}</span><small>{card.theme}</small></div><span className="friend-score" aria-label={`示例热度 ${card[period]}`}>{card[period]}</span><button type="button" className="friend-visit" aria-label={`串门：${card.name}的${card.farmName}（示例）`} onClick={()=>onVisit(card.target)}>串门</button></li>;})}
  </ol>{onOpenBoarding&&<button type="button" className="friends-real-boarding" onClick={onOpenBoarding}>真人好友寄养</button>}
 </section></div>;
}
