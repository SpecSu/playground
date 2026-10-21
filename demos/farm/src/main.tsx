import {useEffect,useRef,useState,useReducer} from 'react';
import {createRoot} from 'react-dom/client';
import {ACTIONS,ACTION_LABEL,PERSONALITY_LABEL,bondStage,type Action,type Snapshot,type FarmEvent,type Command} from './model.ts';
import type {FarmWorld} from './world.ts';
import {persistenceReducer,initialPersistence} from './persistence.ts';
import type {Reply} from '../server/store.ts';
import './style.css';
import {FarmBoundary} from './FarmBoundary.tsx';

const icons:Record<Action,string>={dance:'♫',bounce:'↟',love:'♡'};
const avatarNames={miaocuijiao:'喵脆角','banana-cat':'香蕉猫'};
function App(){
 const [farm,setFarm]=useState<Snapshot|null>(null),[event,setEvent]=useState<FarmEvent>(),[target,setTarget]=useState('all');
 const [message,setMessage]=useState('正在打开你的农场…'),[assetStatus,setAssetStatus]=useState('正在准备草地…');
 const [io,dispatchIO]=useReducer(persistenceReducer,initialPersistence);const busy=io.busy,error=io.commandError||io.readError;
 const [details,setDetails]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[help,setHelp]=useState(false);
 const [tick,setTick]=useState(()=>Date.now());const [clockOffset,setClockOffset]=useState(0);const pending=useRef<Command|null>(null),seen=useRef(new Set<string>());
 const host=useRef<HTMLDivElement>(null),world=useRef<FarmWorld|null>(null),current=useRef({farm,event,target,reduced});useEffect(()=>{current.current={farm,event,target,reduced};},[farm,event,target,reduced]);
 function accept(s:Snapshot){setClockOffset(s.now-Date.now());setFarm(old=>old&&old.revision>s.revision?old:s);}
 async function load(){try{const r=await fetch('/api/farm');if(!r.ok)throw new Error('农场暂时连接不上');accept(await r.json());dispatchIO({type:'readOK'});}catch(e){dispatchIO({type:'readFailed',message:e instanceof Error?e.message:'连接失败'});}}
 async function send(type:string,extra:Omit<Partial<Command>,'type'|'id'>={}){
   if(busy)return;
   const c=pending.current||{id:crypto.randomUUID(),type,...extra};pending.current=c;dispatchIO({type:'submit',command:c});setMessage('正在回应并保存…');
   try{const r=await fetch('/api/farm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});const data=await r.json();if(!r.ok)throw new Error(data.error||'本地保存失败');const reply=data as Reply;
     accept(reply.snapshot);setMessage(reply.message);pending.current=null;dispatchIO({type:'saved'});
     if(reply.event&&!seen.current.has(reply.event.id)){seen.current.add(reply.event.id);setEvent(reply.event);}
   }catch(e){dispatchIO({type:'failed',message:(e instanceof Error?e.message:'保存失败')+' · 点击重试会沿用同一个指令，不会重复结算'});}
 }
 useEffect(()=>{void(async()=>{await load();await send('visit');})();const poll=setInterval(()=>{if(!pending.current)void load();},15000);const timer=setInterval(()=>setTick(Date.now()),250);return()=>{clearInterval(poll);clearInterval(timer);};},[]);
 const ready=!!farm;
 useEffect(()=>{if(!ready||!host.current||!current.current.farm)return;let cancelled=false;const element=host.current;
   void import('./world.ts').then(({FarmWorld})=>{if(cancelled)return;try{const w=new FarmWorld(element,current.current.farm!,{select:id=>setTarget(id),status:setAssetStatus});world.current=w;w.set(current.current.farm!,current.current.event,current.current.target,current.current.reduced);}catch(e){setAssetStatus('3D 无法启动，请确认 Chrome 支持 WebGL 后刷新。');console.error(e instanceof Error?e.message:'WebGL 不可用');}}).catch(()=>{if(!cancelled)setAssetStatus('3D 模块加载失败，请刷新重试；关系记录已保留');});
   return()=>{cancelled=true;world.current?.dispose();world.current=null;};
 },[ready]);
 useEffect(()=>{if(farm)world.current?.set(farm,event,target,reduced);},[farm,event,target,reduced]);
 const now=tick+clockOffset,cooldown=farm?Math.max(0,Math.ceil((farm.actionReadyAt-now)/1000)):0;
 const animal=farm?.animals.find(a=>a.id===target)||farm?.animals[0];
 const learned=farm?.animals.some(a=>(a.habits.dance?.count??0)>=3),imitated=farm?.animals.some(a=>(a.habits.dance?.count??0)>=2);
 const guide=!imitated?'对大家跳舞，看看三种回应':!learned?'隔一会再跳舞，让它们慢慢学会':!farm?.sharedEvents?'让奶蛙带一次合拍':!farm.demoMode?'体验下次来访，看看它们还记不记得':!farm.stage?'领取羊毛，给大家搭个软垫舞台':'去舞台一起蹦！也可以留下星点卷毛';
 const nextLearn=animal?.habits.dance?Math.max(0,Math.ceil((animal.habits.dance.lastAt+12000-now)/1000)):0;
 if(!farm)return <main className="loading"><div className="loading-sheep">♧</div><h1>绒绒农场</h1><p>{error||message}</p>{error&&<button onClick={()=>void load()}>重新连接</button>}</main>;
 return <main className="app">
  <header className="topbar"><div className="brand"><span className="brand-icon">♧</span><div><p className="eyebrow">A LITTLE PLACE TO BELONG</p><h1>绒绒农场<span>会记得你的朋友</span></h1></div></div>
   <div className="top-tools"><button className="wool-shortcut" onClick={()=>{setDetails(true);setTimeout(()=>document.querySelector('.wool-card')?.scrollIntoView({block:'nearest'}),0);}}>◌ {farm.wool}{farm.woolReady?` · 可领 ${farm.woolReady}`:' 羊毛'}</button><span className="saved"><i/>{io.pending?(busy?'保存中':'保存待重试'):'本机已保存'}</span><button className="round" onClick={()=>setHelp(!help)} aria-label="操作说明">?</button></div>
  </header>
  <section className="guide" aria-label="体验引导"><span className="step-number">{!imitated?'01':!learned?'02':!farm.sharedEvents?'03':'04'}</span><div><strong>{guide}</strong><small>{!learned?nextLearn>0?`再过 ${nextLearn} 秒，可多记住一次 · 陪伴不必连点`:'观察 → 模仿 → 主动邀请':'习惯来自真实保存 · 刷新也会保留'}</small></div><div className="guide-dots">{[true,!!imitated,!!learned,!!farm.stage].map((on,i)=><i key={i} className={on?'on':''}/>)}</div></section>
  <section className="world-shell" aria-label="3D 农场"><div className="world" ref={host}/><div className="place-caption"><span>☀</span> 微风草地 <small>3 位住民 · 1 位守护伙伴</small></div><div className="move-hint">点击草地行走 · 点羊选中</div><div className="asset-status">{assetStatus}</div>
    <div className="dpad" aria-label="触屏方向控制">{[{label:'↑',x:0,z:-1,key:'up'},{label:'←',x:-1,z:0,key:'left'},{label:'↓',x:0,z:1,key:'down'},{label:'→',x:1,z:0,key:'right'}].map(d=><button key={d.key} className={d.key} aria-label={`向${d.label}移动`} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);world.current?.move(d);}} onPointerUp={()=>world.current?.move({x:0,z:0})} onPointerCancel={()=>world.current?.move({x:0,z:0})}>{d.label}</button>)}</div>
  </section>
  <aside className={`residents ${details?'expanded':''}`}><div className="section-label"><span>住在这里的朋友</span><button className="text-button" onClick={()=>setDetails(!details)}>{details?'收起':'记忆手帐 ↗'}</button></div>
   <div className="resident-list">{farm.animals.map(a=><button key={a.id} className={`resident ${target===a.id?'chosen':''}`} onClick={()=>setTarget(a.id)} style={{'--accent':a.color} as React.CSSProperties}><span className="sheep-icon">{a.appearance==='starlit'?'✦':'☁'}<i/></span><span className="resident-body"><strong>{a.name}<em>{PERSONALITY_LABEL[a.personality]}</em></strong><small>{bondStage(a.bond)} · 喜欢{ACTION_LABEL[a.preference]}</small><span className="bond-track"><i style={{width:`${Math.max(6,a.bond/12*100)}%`}}/></span></span><span className="habit-pips" aria-label={`舞蹈记忆 ${a.habits.dance?.count||0}/3`}>{[1,2,3].map(n=><i key={n} className={(a.habits.dance?.count??0)>=n?'on':''}/>)}</span></button>)}</div>
   {animal&&<section className="memory"><div className="memory-title"><strong>{animal.name}的记忆</strong><small>{target==='all'?'点住民切换手帐':'只属于你们'}</small></div><div className="learning-chain">{['看着你','跟着做','邀请你'].map((label,i)=><span key={label} className={(animal.habits.dance?.count??0)>i?'complete':''}>{['◉','♫','♡'][i]}<small>{label}</small></span>)}</div>
    <p className="personality-note">{animal.personality==='eager'?'一听见节奏就靠近你，喜欢跟着拍子跳。':animal.personality==='shy'?'先动动耳朵，再小幅度回应。熟悉后也保留一点距离。':'会等自己的时机，改编成侧步舞。亲近也不会变成复制品。'}</p>
    <ul className="memories">{animal.experiences.length?animal.experiences.slice(-3).reverse().map((e,i)=><li key={`${e.at}-${i}`}>{e.text}</li>):<li>还没有一起发生的事，等你来创造</li>}</ul>
    {animal.growthEligible?<div className="growth"><span>✦ 节奏与合拍唤醒了小星点</span><button onClick={()=>void send('appearance',{target:animal.id,appearance:animal.appearance==='plain'?'starlit':'plain'})} disabled={busy}>{animal.appearance==='plain'?'留下星点卷毛':'恢复普通卷毛'}</button><small>规则驱动外观原型 · 关系与性格保留</small></div>:<small className="growth-hint">✧ 学会舞步 + 奶蛙合拍，会有小变化</small>}
   </section>}
   <section className="wool-card"><div><span>◌ 羊毛篮</span><strong>{farm.wool}<small>团</small></strong><small>自然每 30 分钟 1 团 · 最多积累 12 团</small></div><button disabled={!farm.woolReady||busy} onClick={()=>void send('claim')}>领取 {farm.woolReady||''}</button><div className="facility"><span>{farm.stage?'✓ 软垫舞台已搭好':'软垫舞台 · 8 团羊毛'}</span><button disabled={busy||(!farm.stage&&farm.wool<8)||!!cooldown&&farm.stage} onClick={()=>void send(farm.stage?'stagePlay':'buy')}>{farm.stage?'一起蹦 ↗':'搭建'}</button></div></section>
  </aside>
  <section className="controls"><div className="feedback" role="status" aria-live="polite"><i className={busy?'pulse':''}/>{error||message}{error&&<button onClick={()=>void send(pending.current?.type||'visit')}>重试保存</button>}</div>
   <div className="action-line"><button className={`target-all ${target==='all'?'active':''}`} onClick={()=>setTarget('all')}><span>☁ ☁</span><strong>{target==='all'?'对大家':`对${animal?.name}`}</strong><small>{target==='all'?'一起看看不同回应':'点此切回大家'}</small></button><div className="action-buttons">{ACTIONS.map(a=><button key={a} className={`action action-${a}`} disabled={busy||!!cooldown||!!io.pending} onClick={()=>void send('act',{action:a,target})}><span>{icons[a]}</span><strong>{ACTION_LABEL[a]}</strong></button>)}</div><button className="guardian-button" disabled={busy||!!cooldown||now-farm.lastRhythmAt<30000} onClick={()=>void send('rhythm')}><img src="/avatars/portraits/milk-frog.webp" alt="奶蛙"/><strong>奶蛙合拍</strong><small>守护伙伴领节奏</small></button></div>
   <div className="bottom-line"><div className="avatar-switch"><small>我的分身</small>{(['miaocuijiao','banana-cat'] as const).map(id=><button key={id} className={farm.avatar===id?'selected':''} disabled={busy} onClick={()=>void send('avatar',{avatar:id})} aria-label={`换成${avatarNames[id]}`} title={avatarNames[id]}><img src={`/avatars/portraits/${id}.webp`} alt={avatarNames[id]}/></button>)}</div><span className="cooldown">{cooldown?`回应中 ${cooldown}s`:'慢慢相处，不用赶进度'}</span><button className="visit-button" disabled={busy||!!cooldown} onClick={()=>void send('nextVisit')}>体验下次来访 <span>↷</span><small>演示快进 6h</small></button></div>
  </section>
  <footer><span>本机设备身份 · 本地 SQLite · NPC 住民</span><button onClick={()=>setReduced(!reduced)}>{reduced?'简化动效 ✓':'简化动效'}</button>{farm.demoMode&&<button className="demo-tag" disabled={busy} onClick={()=>void send('natural')}>演示快进模式 · 返回自然模式</button>}</footer>
  {help&&<div className="help-popover"><button className="close" onClick={()=>setHelp(false)} aria-label="关闭说明">×</button><h2>做动作，慢慢成为习惯。</h2><p>先对大家跳舞，看皮皮、茉茉和豆豆的不同回应。间隔 12 秒的三次同动作，会从观察走到主动邀请。</p><p>学会舞步后，让奶蛙带一次合拍，再点「体验下次来访」。迎接动作来自已保存的习惯。</p><p>快进会让羊毛篮积累到 12 团，领取后兑换软垫舞台。星点外观可以随时恢复。</p><p>点击草地 / 方向键 / 触屏方向盘移动。换分身不换关系。缺席不会掉亲密度。</p><small>演示快进不证明留存效果；不是跨设备账户或实时生成。清除 Cookie 会失去当前设备入口，数据保存在本机服务的 .local/farm.sqlite。</small></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<FarmBoundary><App/></FarmBoundary>);
