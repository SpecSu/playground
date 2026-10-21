import {useCallback,type RefObject} from 'react';
import {PersonStanding,Users,ScanEye,Maximize,Sprout,Backpack,Sparkles,Clock3,ChevronRight,Check,Cloud,Heart,ArrowUpRight} from 'lucide-react';
import {ACTIONS,ACTION_LABEL,PERSONALITY_LABEL,bondStage,type Snapshot,type Action,type Command} from './model.ts';
import type {ClubCameraMode} from './avatars/club-camera.ts';
import type {StickVector} from './feed/club-joystick.ts';
import PhoneViewport from './feed/PhoneViewport.tsx';
import ClubJoystick from './feed/ClubJoystick.tsx';
import FeedActionIcon from './feed/FeedActionIcon.tsx';
import FeedHeart from './feed/FeedHeart.tsx';
import FeedSheet from './feed/FeedSheet.tsx';

export type FarmSheet='actions'|'residents'|'wool'|'avatar'|'view'|'settings'|null;
export type FarmViewProps={
 farm:Snapshot;target:string;camera:ClubCameraMode;reduced:boolean;sheet:FarmSheet;busy:boolean;pending:boolean;
 error:string;message:string;assetStatus:string;now:number;guide:string;nextLearn:number;
 worldRef:RefObject<HTMLDivElement|null>;onTarget:(id:string)=>void;onSheet:(sheet:FarmSheet)=>void;
 onCommand:(type:string,extra?:Omit<Partial<Command>,'type'|'id'>)=>void;onAction:(action:Action)=>void;
 onCamera:(mode:ClubCameraMode)=>void;onReduced:()=>void;onMove:(vector:StickVector,active:boolean)=>void;onStop:()=>void;
};
const avatarNames={miaocuijiao:'喵脆角','banana-cat':'香蕉猫'};
const preferences={dance:'喜欢跳舞',bounce:'喜欢蹦跳',love:'喜欢你的心意'};

export default function FarmView(p:FarmViewProps){
 const {farm,target,camera,reduced,sheet,busy,pending,error,message,assetStatus,now}=p;
 const close=useCallback(()=>p.onSheet(null),[p.onSheet]);
 const animal=farm.animals.find(a=>a.id===target)||farm.animals[0];
 const cooldown=Math.max(0,Math.ceil((farm.actionReadyAt-now)/1000));
 const blocked=busy||pending||!!cooldown;
 const action=(value:Action)=>{p.onAction(value);close();};
 const command=(type:string,extra:Omit<Partial<Command>,'type'|'id'>={})=>{p.onCommand(type,extra);};
 const clock=new Date(now).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
 const status=error?'保存待重试':busy?'保存中':'已保存';
 return <main className="app-shell app-shell-v020">
  <PhoneViewport>
   <section className="feed-window feed-v020 farm-feed joined" aria-label="绒绒农场互动空间">
    <section className="app-page feed-page" aria-label="首页" inert={!!sheet}>
     <div className="club-stage"><div className="farm-world" ref={p.worldRef}/></div>
     <div className="stage-top-shade"/><div className="stage-bottom-shade"/>
     <header className="feed-header">
      <div className="feed-tabs" role="tablist" aria-label="农场分类"><button role="tab" aria-selected={true} onClick={close}>农场</button><button role="tab" aria-selected={false} onClick={()=>p.onSheet('residents')}>住民</button></div>
      <button className="header-icon bell" onClick={()=>p.onSheet('residents')} aria-label="查看住民记忆"><img src="/feed-ui/icons/bell.svg" alt=""/></button>
      <button className="header-icon settings" onClick={()=>p.onSheet('settings')} aria-label="农场设置与玩法"><img src="/feed-ui/icons/settings.svg" alt=""/></button>
     </header>
     <div className="farm-top-strip"><span><Sprout size={17}/>绒绒农场</span><button className="farm-target-pill" onClick={()=>p.onSheet('residents')}><Users size={13}/>{target==='all'?'对大家':`对${animal.name}`}<ChevronRight size={12}/></button></div>
     {/失败|无法|中断/.test(assetStatus)&&<div className="farm-scene-warning" role="alert">{assetStatus}</div>}
     {farm.demoMode&&<button className="farm-demo-mode" onClick={()=>command('natural')} disabled={busy}><Clock3 size={12}/>演示快进模式 · 返回自然</button>}
     <div className="creator-caption"><div className="creator-copy"><div className="creator-line"><button className="creator-name" onClick={()=>p.onSheet('avatar')}>@我的农场</button><span className={`live-tag ${error?'is-connecting':''}`} role="status"><i/><span>{status}</span><span className="status-separator">·</span><span>3 位住民</span></span></div><p>{p.guide}</p><span className="farm-learning-hint">{p.nextLearn>0?`再过 ${p.nextLearn} 秒，多记住一次`:'点击小羊选择对象 · 拖动摇杆走动'}</span></div><button className="feed-like" onClick={()=>action('love')} disabled={blocked} aria-label={`向${target==='all'?'大家':animal.name}表达喜欢`}><FeedHeart/><span className="feed-like-count">喜欢</span></button></div>
     {(error||busy||now-farm.lastActionAt<6000)&&<div className="farm-toast" role="status" aria-live="polite">{error||message}{error&&<button onClick={()=>command('visit')}>重试保存</button>}</div>}
     <section className="lower-controls" aria-label="农场互动控制">
      <div className="interaction-dock farm-dock">
       <ClubJoystick enabled={!sheet} resetKey={sheet?1:0} onInput={p.onMove} onStop={p.onStop}/>
       <button className="join-control" onClick={()=>p.onSheet('avatar')} aria-label="管理我的分身"><img className="joined-avatar" src={`/avatars/portraits/${farm.avatar}.webp`} alt=""/><span className="join-label">我的分身</span></button>
       <button className="dock-control action-menu-button" onClick={()=>p.onSheet('actions')} aria-label="打开互动菜单" aria-haspopup="dialog" aria-expanded={sheet==='actions'}><PersonStanding/><span>{cooldown?`回应 ${cooldown}s`:'互动'}</span></button>
       <button className="dock-control" onClick={()=>p.onSheet('residents')} aria-label="住民关系与记忆"><Users/><span>住民</span></button>
       <button className="dock-control camera-control" onClick={()=>p.onSheet('view')} aria-label="切换农场视角">{camera==='overview'?<ScanEye/>:<Maximize/>}<span>{camera==='overview'?'视角':'全景'}</span></button>
      </div>
     </section>
    </section>
    <div className="status-bar" aria-hidden="true"><span className="status-time">{clock}</span><div className="status-symbols"><img className="signal" src="/feed-ui/icons/signal.svg" alt=""/><img className="wifi" src="/feed-ui/icons/wifi.svg" alt=""/><img className="battery" src="/feed-ui/icons/battery.svg" alt=""/></div></div>
    <nav className="bottom-nav" aria-label="主导航"><button className={!sheet?'selected':''} onClick={close}>首页</button><button className="create-button" onClick={()=>p.onSheet('wool')} aria-label="打开羊毛与设施"><img src="/feed-ui/icons/plus.svg" alt=""/></button><button className={sheet==='avatar'?'selected':''} onClick={()=>p.onSheet('avatar')}>我的</button></nav>

    {sheet==='actions'&&<FeedSheet title="一起互动" subtitle={target==='all'?'同一个动作，看三种不同回应':`和${animal.name}慢慢相处`} onClose={close}>
     <div className="farm-targets" aria-label="选择互动对象"><button className={target==='all'?'selected':''} onClick={()=>p.onTarget('all')}>大家</button>{farm.animals.map(a=><button className={target===a.id?'selected':''} key={a.id} onClick={()=>p.onTarget(a.id)}>{a.name}</button>)}</div>
     <div className="option-grid farm-action-grid">{ACTIONS.map(a=><button className="option-card" key={a} disabled={blocked} onClick={()=>action(a)}>{a==='love'?<Heart/>:<FeedActionIcon kind={a}/>}<span>{ACTION_LABEL[a]}</span></button>)}</div>
     <h3>守护伙伴<span>奶蛙领节奏</span></h3><button className="actions-join farm-guardian" disabled={blocked||now-farm.lastRhythmAt<30000} onClick={()=>{command('rhythm');close();}}><img src="/avatars/portraits/milk-frog.webp" alt="奶蛙"/><span><b>奶蛙合拍</b><small>一起跳一段，留下共同经历</small></span><ArrowUpRight size={18}/></button>
     <p className="sheet-note">{cooldown?`它们正在回应，再等 ${cooldown} 秒。`:'同动作间隔 12 秒才多记住一次。性格不会被好感抹平。'}</p>
    </FeedSheet>}
    {sheet==='residents'&&<FeedSheet title="住在这里的朋友" subtitle="每只羊，都记着自己的那一份" onClose={close}>
     <div className="farm-resident-picker">{farm.animals.map(a=><button key={a.id} className={animal.id===a.id?'selected':''} onClick={()=>p.onTarget(a.id)} style={{'--resident-color':a.color} as React.CSSProperties}><span className="farm-sheep-mark"><Cloud/></span><b>{a.name}{a.appearance==='starlit'?' ✦':''}</b><small>{PERSONALITY_LABEL[a.personality]}</small></button>)}</div>
     <div className="farm-memory-heading"><h3>{animal.name}的记忆</h3><span>{bondStage(animal.bond)} · {preferences[animal.preference]}</span></div><div className="farm-bond"><i style={{width:`${animal.bond/12*100}%`,background:animal.color}}/></div>
     <div className="farm-habit-chain">{['看着你','跟着做','邀请你'].map((label,i)=><span className={(animal.habits.dance?.count??0)>i?'complete':''} key={label}>{(animal.habits.dance?.count??0)>i?<Check size={16}/>:<span className="farm-habit-dot"/>}<small>{label}</small></span>)}</div>
     <p className="farm-personality">{animal.personality==='eager'?'一听见节奏就靠近你，喜欢跟着拍子跳。':animal.personality==='shy'?'先动动耳朵，再小幅度回应。熟悉后也保留一点距离。':'等自己的时机，改编成侧步舞。亲近也不会变成复制品。'}</p>
     <div className="farm-memory-list">{animal.experiences.length?animal.experiences.slice(-3).reverse().map((e,i)=><p key={`${e.at}-${i}`}><span>·</span>{e.text}</p>):<p>还没有一起发生的事，等你来创造。</p>}</div>
     {animal.growthEligible?<div className="farm-growth"><Sparkles size={18}/><span>节奏与合拍，让卷毛有了小星点</span><button className="actions-join" disabled={busy} onClick={()=>command('appearance',{target:animal.id,appearance:animal.appearance==='plain'?'starlit':'plain'})}>{animal.appearance==='plain'?'留下星点卷毛':'恢复普通卷毛'}</button><small>规则驱动外观原型 · 名字、性格和关系保留</small></div>:<p className="sheet-note">学会舞步，再参加一次奶蛙合拍，卷毛可能有一点新变化。</p>}
     <button className="actions-join" onClick={()=>{p.onTarget(animal.id);p.onSheet('actions');}}>和{animal.name}互动</button><button className="farm-text-link" onClick={()=>{p.onTarget('all');close();}}>回到大家</button>
    </FeedSheet>}
    {sheet==='wool'&&<FeedSheet title="羊毛与小设施" subtitle="慢慢攒，把这里变成喜欢的样子" onClose={close}>
     <div className="farm-wool-balance"><Backpack/><span><b>{farm.wool}</b> 团羊毛</span><button disabled={busy||!farm.woolReady} onClick={()=>command('claim')}>领取 {farm.woolReady||''}</button></div><p className="sheet-note">自然每 30 分钟积累 1 团，最多 12 团。缺席不会掉关系。</p>
     <div className="farm-facility"><div><Sparkles/><b>软垫舞台</b><small>{farm.stage?'已搭好 · 解锁软软蹦跳':'8 团羊毛 · 一块一起玩的小地方'}</small></div><button className="actions-join" disabled={busy||(farm.stage?!!cooldown:farm.wool<8)} onClick={()=>{command(farm.stage?'stagePlay':'buy');if(farm.stage)close();}}>{farm.stage?'去舞台一起蹦':'搭建软垫舞台'}</button></div><p className="sheet-note" role="status">{message}</p>
    </FeedSheet>}
    {sheet==='avatar'&&<FeedSheet title="我的分身" subtitle="换个样子，它们仍然认得你" onClose={close}>
     <div className="option-grid farm-avatar-grid">{(['miaocuijiao','banana-cat'] as const).map(id=><button key={id} className={`option-card ${farm.avatar===id?'selected':''}`} aria-pressed={farm.avatar===id} disabled={busy} onClick={()=>command('avatar',{avatar:id})}><img src={`/avatars/portraits/${id}.webp`} alt=""/><span>{avatarNames[id]}</span></button>)}</div>
     <button className="actions-join farm-revisit" disabled={blocked} onClick={()=>{command('nextVisit');close();}}><Clock3 size={18}/><span>体验下次来访<small>演示快进 6 小时</small></span><ChevronRight size={16}/></button><p className="sheet-note">迎接动作来自已保存的习惯。快进用于体验，不代表真实留存效果。</p>{farm.demoMode&&<button className="actions-join" onClick={()=>command('natural')} disabled={busy}>返回自然模式</button>}
    </FeedSheet>}
    {sheet==='view'&&<FeedSheet title="看见你的农场" onClose={close}><div className="option-grid view-grid">{([{id:'overview',label:'全景',hint:'和大家待在同一个空间',icon:<Maximize/>},{id:'third-person',label:'跟随',hint:'从分身身边看看它们',icon:<ScanEye/>}] as const).map(v=><button key={v.id} className={`option-card view-option ${camera===v.id?'selected':''}`} onClick={()=>{p.onCamera(v.id);close();}}>{v.icon}<span>{v.label}</span><small>{v.hint}</small></button>)}</div></FeedSheet>}
    {sheet==='settings'&&<FeedSheet title="慢慢相处就好" subtitle="绒绒农场" onClose={close}><div className="farm-how"><p>先对大家跳舞，看看三种回应。</p><p>同动作隔 12 秒做三次，从观察、模仿到主动邀请。</p><p>和奶蛙合拍，再体验下次来访，看看它们记住了什么。</p></div><button className="actions-join" onClick={p.onReduced}>{reduced?'简化动效已开启':'简化动效'}<Check size={14} style={{opacity:reduced?1:0}}/></button><p className="sheet-note">记录保存在这台 Mac。清除 Cookie 会失去当前设备入口。换分身不换关系；住民与奶蛙均为 NPC。</p><p className="sheet-note">{assetStatus}</p></FeedSheet>}
   </section>
  </PhoneViewport>
 </main>;
}
