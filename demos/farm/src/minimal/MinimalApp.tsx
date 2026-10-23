'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowUp,Bell,Cloud,CloudLightning,CloudRain,CloudSnow,Coins,Droplets,Egg,Hand,Heart,Home,Leaf,Mountain,Moon,Plus,Settings2,Sun,ShoppingBag,Sparkles,TreePine,Wheat,X,ZoomIn,ZoomOut} from 'lucide-react';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import {MinimalWorld} from './World.ts';
import {advanceMinimalState,createMinimalState,loadMinimalState,minimalCommand,saveMinimalState,tileAt,playerWalkRoute,nearShop,isShopTile,sellValue,isAdult,canPlaceEgg,eligiblePairs,SHOP_APPROACH,type MinimalState,type MinimalCommand,type Terrain,type Point} from './model.ts';
import {deriveWeather,WEATHER_KINDS,WEATHER_LABELS,type WeatherOverride} from './weather.ts';
import './minimal.css';

type Target={kind:'tile';x:number;z:number;worldPoint?:Point}|{kind:'animal';id:string}|{kind:'egg';id:string}|{kind:'shop'};
type Pending={target:Target;destination:Point;placeEggId?:string;at?:Point};
const speciesName={sheep:'绵羊',pig:'小猪',cow:'奶牛',bunny:'兔子'};
const weatherIcons={sunny:Sun,cloudy:Cloud,rain:CloudRain,snow:CloudSnow,storm:CloudLightning};
const WEATHER_STORAGE='dreamina-farm-weather-v1';
function loadWeatherPreference():WeatherOverride{try{const value=JSON.parse(window.localStorage.getItem(WEATHER_STORAGE)??'{}');return {weather:WEATHER_KINDS.includes(value.weather)?value.weather:'auto',time:['day','night'].includes(value.time)?value.time:'auto'};}catch{return {weather:'auto',time:'auto'};}}
const terrainInfo={meadow:{name:'草地',text:'慢慢吃草，晒晒太阳。',Icon:Wheat},creek:{name:'小溪',text:'动物会自己来喝水。',Icon:Droplets},hill:{name:'丘陵',text:'爬上小山，看看远方。',Icon:Mountain},grove:{name:'林地',text:'在树荫下歇一会儿。',Icon:TreePine}};
export function terrainCanOpen(state:MinimalState,p:Point){return !tileAt(state,p)?.owned&&[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}].some(q=>tileAt(state,q)?.owned);}
export function animalApproach(state:MinimalState,position:Point):Point{const p={x:Math.round(position.x),z:Math.round(position.z)};return [{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}].filter(q=>tileAt(state,q)?.owned&&!isShopTile(q)&&playerWalkRoute(state,state.player,q)!==null).sort((a,b)=>Math.hypot(a.x-state.player.x,a.z-state.player.z)-Math.hypot(b.x-state.player.x,b.z-state.player.z))[0]??p;}

export default function MinimalApp(){
 const [data,setData]=useState<MinimalState|null>(null),[target,setTarget]=useState<Target|null>(null),[sheet,setSheet]=useState<'bag'|'settings'|null>(null),[placing,setPlacing]=useState<string|null>(null),[converting,setConverting]=useState(false),[notice,setNotice]=useState(''),[saveOk,setSaveOk]=useState(true),[worldError,setWorldError]=useState(''),[walking,setWalking]=useState(false),[anchor,setAnchor]=useState<Point|null>(null),[coinBurst,setCoinBurst]=useState(false),[dismissedHatch,setDismissedHatch]=useState<string|null>(null);
 const [weatherPreference,setWeatherPreference]=useState<WeatherOverride|null>(null);
 const host=useRef<HTMLDivElement>(null),world=useRef<MinimalWorld|null>(null),live=useRef<MinimalState|null>(null),pending=useRef<Pending|null>(null),buyLocked=useRef(false),placingRef=useRef<string|null>(null),sendRef=useRef<(c:MinimalCommand)=>boolean>(()=>false),selectRef=useRef<(t:Target)=>void>(()=>{});
 placingRef.current=placing;
 const accept=(state:MinimalState)=>{live.current=state;setData(state);world.current?.update(state);try{setSaveOk(saveMinimalState(window.localStorage,state));}catch{setSaveOk(false);}};
 const send=(command:MinimalCommand)=>{if(!live.current)return false;const reply=minimalCommand(live.current,command,Date.now());accept(reply.state);if(!reply.accepted)setNotice(reply.message);else if(!['move','welcome'].includes(command.type))setNotice(reply.message);return reply.accepted;};sendRef.current=send;
 const stop=()=>{pending.current=null;setWalking(false);world.current?.cancelWalk();if(live.current?.playerPath.length)accept({...live.current,playerPath:[]});};
 const close=()=>{stop();setSheet(null);setTarget(null);setConverting(false);};
 const approach=(selection:Target,to:Point,placeEggId?:string,at?:Point)=>{pending.current={target:selection,destination:to,placeEggId,at};setWalking(true);setTarget(null);if(!sendRef.current({type:'move',to})||!world.current?.walkTo(to)){pending.current=null;setWalking(false);setNotice('这里暂时走不过去，试试旁边。');}};
 selectRef.current=(selection:Target)=>{
  const current=live.current;if(!current?.welcomeClaimed||worldError)return;setSheet(null);setConverting(false);setNotice('');
  if(placingRef.current&&selection.kind!=='tile'){setNotice('选一块空着的已开辟土地。');return;}
  if(current.carriedAnimalId&&selection.kind==='animal'){setTarget(null);return;}
  if(selection.kind==='shop'){setPlacing(null);approach(selection,SHOP_APPROACH);return;}
  if(selection.kind==='animal'){const a=current.animals.find(a=>a.id===selection.id);if(a&&a.id!==current.carriedAnimalId)approach(selection,animalApproach(current,a.position));return;}
  if(selection.kind==='egg'){const egg=current.eggs.find(e=>e.id===selection.id);if(egg?.position)approach(selection,animalApproach(current,egg.position));return;}
  const p={x:selection.x,z:selection.z};
  if(isShopTile(p)){if(placingRef.current){setNotice('商店不能放蛋，选一块空地吧。');return;}setPlacing(null);approach({kind:'shop'},SHOP_APPROACH);return;}
  if(placingRef.current){if(!canPlaceEgg(current,p)){setNotice('选一块空着的已开辟土地。');return;}approach(selection,animalApproach(current,p),placingRef.current,p);return;}
  if(!tileAt(current,p)?.owned){stop();setTarget(selection);return;}
  approach(selection,selection.worldPoint??p);
 };
 useEffect(()=>{
  setWeatherPreference(loadWeatherPreference());
  let state:MinimalState;try{state=loadMinimalState(window.localStorage,Date.now());}catch{state=createMinimalState(Date.now());setSaveOk(false);}live.current=state;setData(state);
  if(host.current){try{world.current=new MinimalWorld(host.current,state,{select:(t:Target)=>selectRef.current(t),arrive:(point:Point)=>{const job=pending.current;if(!job||Math.hypot(point.x-job.destination.x,point.z-job.destination.z)>.05)return;setWalking(false);pending.current=null;if(job.placeEggId&&job.at){if(sendRef.current({type:'placeEgg',eggId:job.placeEggId,at:job.at})){buyLocked.current=false;setPlacing(null);setTarget({kind:'egg',id:job.placeEggId});}}else setTarget(job.target);},status:(message:string)=>setNotice(message)});world.current.setPlacementMode(!!placingRef.current);}catch(error){setWorldError(error instanceof Error?error.message:'3D 场景暂时没有打开');}}
  const timer=window.setInterval(()=>{if(!live.current)return;const next=advanceMinimalState(live.current,Date.now());live.current=next;setData(next);world.current?.update(next);try{setSaveOk(saveMinimalState(window.localStorage,next));}catch{setSaveOk(false);}},250);
  return()=>{window.clearInterval(timer);world.current?.dispose();world.current=null;};
 },[]);
 useEffect(()=>{world.current?.setPlacementMode(!!placing);},[placing]);
 useEffect(()=>{if(!target||sheet){setAnchor(null);return;}const update=()=>{const s=live.current;if(!s||!world.current)return;const p=target.kind==='shop'?SHOP_APPROACH:target.kind==='tile'?target:target.kind==='animal'?s.animals.find(a=>a.id===target.id)?.position:s.eggs.find(e=>e.id===target.id)?.position;if(!p)return;const screen=world.current.screenPoint(p);setAnchor(screen.x>20&&screen.x<370&&screen.y>100&&screen.y<600?{x:screen.x,z:screen.y}:null);};update();const timer=window.setInterval(update,100);return()=>window.clearInterval(timer);},[target,sheet]);
 useEffect(()=>{if(!coinBurst)return;const timer=window.setTimeout(()=>setCoinBurst(false),1300);return()=>window.clearTimeout(timer);},[coinBurst]);
 useEffect(()=>{if(!weatherPreference)return;world.current?.setWeatherPreferences(weatherPreference);try{window.localStorage.setItem(WEATHER_STORAGE,JSON.stringify(weatherPreference));}catch{/* Weather previews work without persistence. */}},[weatherPreference]);
 const climate=deriveWeather(Date.now(),weatherPreference??{}),ClimateIcon=weatherIcons[climate.kind];
 const animal=target?.kind==='animal'?data?.animals.find(a=>a.id===target.id):undefined;
 const egg=target?.kind==='egg'?data?.eggs.find(e=>e.id===target.id):undefined;
 const tile=target?.kind==='tile'&&data?tileAt(data,target):undefined;
 const held=data?.animals.find(a=>a.id===data.carriedAnimalId),bag=data?.eggs.filter(e=>e.location==='bag')??[];
 const hatchAnimal=data?.lastHatch?data.animals.find(a=>a.id===data.lastHatch!.animalId):undefined;
 const hatchAge=data?.lastHatch?Date.now()-data.lastHatch.at:Infinity;
 const showReveal=!!hatchAnimal&&hatchAge>650&&hatchAge<5500&&dismissedHatch!==hatchAnimal.id;
 const pair=animal&&data?eligiblePairs(data,Date.now()).find(p=>p.includes(animal.id)):undefined;
 const openBag=()=>{close();setSheet('bag');};
 const beginPlace=(id:string)=>{close();setPlacing(id);setNotice('');};
 const buy=()=>{if(buyLocked.current||placingRef.current)return;buyLocked.current=true;if(send({type:'buyEgg'})){const e=live.current?.eggs.at(-1);if(e)beginPlace(e.id);}else buyLocked.current=false;};
 const care=()=>{if(!animal||!live.current)return;if(Math.hypot(animal.position.x-live.current.player.x,animal.position.z-live.current.player.z)>1.6){approach({kind:'animal',id:animal.id},animalApproach(live.current,animal.position));return;}if(send({type:'care',animalId:animal.id}))world.current?.perform('pet');};
 const pickup=()=>{if(!animal||!live.current)return;const current=live.current.animals.find(a=>a.id===animal.id);if(!current)return;if(Math.hypot(current.position.x-live.current.player.x,current.position.z-live.current.player.z)>1.6){approach({kind:'animal',id:current.id},animalApproach(live.current,current.position));setNotice('走近一点，再轻轻举起来。');return;}if(send({type:'pickup',animalId:current.id})){setTarget(null);world.current?.perform('hold');}};
 const ready=!!egg&&egg.readyAt!==undefined&&Date.now()>=egg.readyAt;
 const onboarding=data?.welcomeClaimed&&!data.animals.length&&!data.eggs.length;
 return <main className="app-shell minimal-shell"><PhoneViewport><section className="minimal-farm egg-farm" aria-label="萌蛋牧场"><div className="minimal-world" ref={host}/>
  <header className="egg-top"><div className="egg-avatar"><img src="/avatars/portraits/human-lx.webp" alt="LX"/><span>LX 的牧场</span></div><div className={`egg-coins ${coinBurst?'egg-coins-pop':''}`}><Coins size={18}/><b>{data?.coins??0}</b></div><button className="egg-round" aria-label="设置与说明" onClick={()=>{close();setSheet('settings');}}><Settings2 size={18}/></button></header>
  <button className="egg-weather-badge" aria-label="牧场天气设置" onClick={()=>{close();setSheet('settings');}}><ClimateIcon size={15}/>{climate.label} · {climate.daylight<.5?'夜晚':'白天'}</button>
  {coinBurst&&<div className="egg-coin-burst" aria-hidden="true">{Array.from({length:7},(_,i)=><i key={i} style={{'--coin-index':i} as CSSProperties}><Coins size={27}/></i>)}</div>}
  {worldError?<div className="egg-error"><b>画面暂时没有打开</b><p>{worldError}</p><button onClick={()=>window.location.reload()}>重新打开</button></div>:<>
   {data&&!data.welcomeClaimed&&<div className="egg-welcome"><div className="egg-welcome-card"><span className="egg-welcome-art"><Egg size={58}/><Sparkles size={24}/></span><small>一颗蛋，会带来谁？</small><h1>你的小牧场<br/>今天开张啦</h1><button className="egg-primary" onClick={()=>{if(send({type:'welcome'})){setCoinBurst(true);setNotice('');}}}><Coins size={20}/>领取 120 金币</button></div></div>}
   {data?.welcomeClaimed&&<>
    <div className="egg-side"><button className="egg-round" aria-label="回到牧场" onClick={()=>world.current?.focus()}><Home size={17}/></button>{bag.length>0&&<button className="egg-round egg-bag" aria-label={`蛋袋，${bag.length}颗蛋`} onClick={openBag}><Egg size={21}/><i>{bag.length}</i></button>}</div>
    {!!data.wolfEvent&&<button className="egg-wolf" disabled={data.wolfEvent.helped} onClick={()=>{if(send({type:'help'}))world.current?.perform('help');}}><Bell size={17}/>{data.wolfEvent.helped?'刀盾狗正在赶走它们':'小狼来了，帮伙伴一下'}</button>}
    {anchor&&target&&!sheet&&!placing&&<span className="egg-target-label" style={{left:anchor.x,top:anchor.z}}>{target.kind==='shop'?'蛋与动物商店':animal?speciesName[animal.species]:egg?'孵化中':tile?terrainInfo[tile.terrain].name:''}</span>}
    {!sheet&&!showReveal&&target&&!placing&&<section className="egg-context" aria-label="场景动作"><button className="egg-close" aria-label="关闭场景动作" onClick={()=>setTarget(null)}><X size={17}/></button>
     {target.kind==='shop'&&<>{held?<><small>举得稳稳的，送它去新的家</small><h2>{speciesName[held.species]} {held.sex==='female'?'♀':'♂'}</h2><p>出售后会离开牧场</p><button className="egg-primary" disabled={!nearShop(data)} onClick={()=>{if(send({type:'sellAnimal'})){world.current?.perform('sell');setTarget(null);}}}><Coins size={19}/>出售 · {sellValue(held)} 金币</button></>:<><div className="egg-shop-heading"><span className="egg-painted"><Egg size={37}/><i>?</i></span><div><h2>神秘动物蛋</h2><p>会蹦出谁？孵开才知道。</p></div></div><button className="egg-primary" disabled={data.coins<30||!nearShop(data)} onClick={buy}><Coins size={18}/>买一颗 · 30</button>{data.coins<30&&!data.animals.length&&!data.eggs.length&&<button className="egg-pair" onClick={()=>{if(send({type:'emergencyEgg'})){const e=live.current?.eggs.at(-1);if(e)beginPlace(e.id);}}}><Egg size={17}/>店长送你一颗起步蛋</button>}</>}</>}
     {egg&&<><div className="egg-shop-heading"><span className="egg-painted"><Egg size={35}/></span><div><h2>{ready?'它要出来了！':egg.source==='bred'?`${speciesName[egg.species]}蛋`:'神秘动物蛋'}</h2><p>{ready?'轻轻点一下，迎接新伙伴。':`再等 ${Math.max(1,Math.ceil(((egg.readyAt??Date.now())-Date.now())/1000))} 秒`}</p></div></div>{ready&&<button className="egg-primary" onClick={()=>{if(send({type:'hatch',eggId:egg.id})){setTarget(null);setNotice('');}}}><Sparkles size={19}/>孵开看看</button>}</>}
     {animal&&!held&&<><div className="egg-animal-heading"><h2>{speciesName[animal.species]} <em>{animal.sex==='female'?'♀':'♂'}</em></h2><span className="egg-size">{isAdult(animal,Date.now())?'已经长大':'正在长大'}</span></div><div className="egg-actions"><button className="egg-primary" onClick={pickup}><ArrowUp size={18}/>举起来</button><button onClick={care}><Hand size={18}/>摸摸</button></div>{pair&&<button className="egg-pair" onClick={()=>{if(send({type:'breed',animalIds:pair})){setTarget(null);}}}><Heart size={15}/>和同种伙伴碰碰鼻尖</button>}{!isAdult(animal,Date.now())&&<small>还是幼崽，会慢慢长大一圈。</small>}</>}
     {tile&&(()=>{const info=terrainInfo[tile.terrain],Icon=info.Icon;return <><h2><Icon size={19}/>{tile.owned?info.name:`未开辟的${info.name}`}</h2><p>{info.text}</p>{!tile.owned&&!data.hatchedCount?<button className="egg-primary" onClick={()=>selectRef.current({kind:'shop'})}><Egg size={17}/>先去孵第一颗蛋</button>:!tile.owned?<button className="egg-primary" disabled={!terrainCanOpen(data,tile)||data.coins<40} onClick={()=>send({type:'expand',at:tile})}><Plus size={17}/>{terrainCanOpen(data,tile)?'开辟 · 40 金币':'先开辟旁边的地块'}</button>:data.expansions>0&&<><button onClick={()=>setConverting(!converting)}><Leaf size={16}/>换种风景 · 20</button>{converting&&<div className="egg-terrains">{(Object.keys(terrainInfo) as Terrain[]).map(t=>{const T=terrainInfo[t].Icon;return <button key={t} disabled={tile.terrain===t||data.coins<20} onClick={()=>{if(send({type:'convert',at:tile,terrain:t}))setConverting(false);}}><T size={20}/>{terrainInfo[t].name}</button>;})}</div>}</>}</>;})()}
    </section>}
    {!sheet&&!showReveal&&<div className="egg-bottom">
     {placing?<div className="egg-place-bar"><Egg size={24}/><span>{notice|| (walking?'LX 正在走过去':'点一块亮起的空地，把蛋放下来')}</span><button aria-label="取消放蛋" onClick={()=>{stop();buyLocked.current=false;setPlacing(null);}}><X size={18}/></button></div>:held?<div className="egg-carry-bar"><button className="egg-primary" onClick={()=>selectRef.current({kind:'shop'})}><ShoppingBag size={18}/>带去商店出售</button><button onClick={()=>{if(send({type:'putdown'}))setNotice('');}}><ArrowUp size={17} className="egg-down"/>放下</button></div>:onboarding&&!target?<button className="egg-primary egg-first-shop" onClick={()=>selectRef.current({kind:'shop'})}><Egg size={22}/>{walking?'去商店的路上…':data.hatchedCount?'去商店，再挑一颗蛋':'去商店，买第一颗蛋'}</button>:walking?<span className="egg-toast">LX 正在走过去…</span>:notice?<span className="egg-toast" role="status">{notice}</span>:null}
    </div>}
   </>}
   {showReveal&&hatchAnimal&&<div className={`egg-reveal ${hatchAnimal.size==='giant'?'giant':''}`} onClick={()=>setDismissedHatch(hatchAnimal.id)}><div><small>{hatchAnimal.size==='giant'?'居然是巨型！':'啪嗒！新伙伴来啦'}</small><h2>{speciesName[hatchAnimal.species]}</h2><span>{hatchAnimal.sex==='female'?'♀ 女生':'♂ 男生'}</span></div></div>}
  </>}
  {sheet&&<div className="egg-sheet-shade" onClick={()=>setSheet(null)}><section className="egg-sheet" role="dialog" aria-label={sheet==='bag'?'我的蛋袋':'设置与说明'} onClick={e=>e.stopPropagation()}><header><h2>{sheet==='bag'?'我的蛋袋':'慢慢玩就好'}</h2><button className="egg-round" aria-label="关闭面板" onClick={()=>setSheet(null)}><X size={20}/></button></header>{sheet==='bag'?<>{bag.map(e=><button className="egg-bag-item" key={e.id} onClick={()=>beginPlace(e.id)}><span className="egg-painted"><Egg size={32}/>{e.source==='shop'&&<i>?</i>}</span><span><b>{e.source==='shop'?'神秘动物蛋':`${speciesName[e.species]}蛋`}</b><small>拿出来，放在地上孵</small></span><ArrowUp size={19}/></button>)}{!bag.length&&<p>蛋袋空空的，去商店挑一颗吧。</p>}</>:<><p>点商店买蛋 → 放地上孵 → 留下来养，或举去商店卖。</p><div className="egg-settings-row"><button onClick={()=>world.current?.zoom(.12)}><ZoomIn size={18}/>放大</button><button onClick={()=>world.current?.zoom(-.12)}><ZoomOut size={18}/>缩小</button></div><fieldset className="egg-weather-settings"><legend>牧场天气 · 模拟</legend><div className="egg-weather-options"><button aria-pressed={!weatherPreference?.weather||weatherPreference.weather==='auto'} onClick={()=>setWeatherPreference(p=>({...p,weather:'auto'}))}>自动变化</button>{WEATHER_KINDS.map(kind=>{const Icon=weatherIcons[kind];return <button key={kind} aria-label={`预览天气：${WEATHER_LABELS[kind]}`} aria-pressed={weatherPreference?.weather===kind} onClick={()=>setWeatherPreference(p=>({...p,weather:kind}))}><Icon size={17}/>{WEATHER_LABELS[kind]}</button>;})}</div><div className="egg-weather-times">{([{value:'auto',label:'随时间'},{value:'day',label:'白天'},{value:'night',label:'夜晚'}] as const).map(option=><button key={option.value} aria-label={`昼夜：${option.label}`} aria-pressed={(weatherPreference?.time??'auto')===option.value} onClick={()=>setWeatherPreference(p=>({...p,time:option.value}))}>{option.value==='night'?<Moon size={15}/>:<Sun size={15}/>} {option.label}</button>)}</div><small>模拟天气，不是真实天气预报。昼夜默认按 UTC+8；不改变动物收益，也没有灾害惩罚。</small></fieldset><p>同种成年异性伙伴有机会产下对应物种蛋。每天整座牧场最多 1 枚，每只动物每天尝试一次。</p><small>演示孵化 10–15 秒，成年约 1 分钟。繁育日按 UTC+8 自然日计算，不加速。</small><small>{saveOk?'当前浏览器本机保存，旧版存档保留。':'暂时无法保存，请先不要关闭页面。'}</small><small>拖拽旋转视角，单击地面走动；双指捏合或滚轮缩放。</small></>}</section></div>}
  {!saveOk&&!sheet&&<div className="egg-save-warning">暂时无法保存，请不要关闭页面。</div>}
 </section></PhoneViewport></main>;
}
