import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type RefObject,type ReactNode} from 'react';
import {Backpack,Check,ChevronRight,Cloud,Hammer,Heart,Leaf,Maximize,PersonStanding,ScanEye,Shield,Users,Volume2,VolumeX,Compass} from 'lucide-react';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import FeedSheet from '../feed/FeedSheet.tsx';
import ClubJoystick from '../feed/ClubJoystick.tsx';
import FeedHeart from '../feed/FeedHeart.tsx';
import FeedActionIcon from '../feed/FeedActionIcon.tsx';
import type {ClubCameraMode} from '../avatars/club-camera.ts';
import type {StickVector} from '../feed/club-joystick.ts';
import {ACTIONS,ACTION_LABEL,AVATAR_LABEL,PERSONALITY_LABEL} from '../model.ts';
import {GUARDIAN_LABEL,layoutActors,layoutPreview,type EstateSnapshot,type EstateAnimal,type Profile} from './estate.ts';
import {growthSummary,bondStage} from './life.ts';
import {BUILDING_RULES,buildingFootprint,regionAt,terrainAt,validateLayout,type BuildingKind,type GridPoint,type LayoutEdit,type Rotation} from './layout.ts';
import {currentJourneyGoal} from './journey.ts';
import JourneyPanel from './JourneyPanel.tsx';
import SceneCard from './SceneCard.tsx';
import EncounterPanel from '../v7/EncounterPanel.tsx';
import HarvestPanel from '../v7/HarvestPanel.tsx';
import InventoryPanel from '../v7/InventoryPanel.tsx';
import CompactAnimalCard from './CompactAnimalCard.tsx';
import QuickBuildPanel from './QuickBuildPanel.tsx';
import {playPrompt} from './play-prompt.ts';
import WorkshopPanel from './WorkshopPanel.tsx';
import type {WorkshopDraft} from './workshop.ts';
import FarmCyclePanel,{AnimalProduction} from './FarmCyclePanel.tsx';
import {stackTotal} from './herd-economy.ts';
import type {FarmAudioStatus} from './estate-audio.ts';
import {threatSummary,guardianUpgradeRules,type GuardianKind} from './threat.ts';
import {LOCAL_VISITORS,THEME_TEMPLATES,type CreationCommand,type Theme} from './creation.ts';

export type EstateSheet = null|'animal'|'actions'|'guardian'|'build'|'creation'|'visits'|'works'|'settings'|'reset'|'view'|'avatar'|'journal'|'journey'|'animalDetails'|'planner'|'cycle'|'workshop'|'encounter'|'harvest';
export const isSceneCardSheet=(sheet:EstateSheet)=>sheet==='animal'||sheet==='build'||sheet==='workshop'||sheet==='cycle'||sheet==='encounter'||sheet==='harvest';
type Ghost={x:number;z:number;kind:BuildingKind;valid:boolean;interactive?:boolean};
type Send=(type:string,extra?:Record<string,unknown>)=>void;
export type EstateViewProps={
  openingOverlay?:ReactNode;interactionLocked?:boolean;data:EstateSnapshot;target:string;sheet:EstateSheet;camera:ClubCameraMode;reduced:boolean;busy:boolean;
  message:string;commandFeedback?:string;error:string;assetStatus:string;worldRef:RefObject<HTMLDivElement|null>;
  onRefresh?:()=>void;onCommand:Send;onSheet:(sheet:EstateSheet)=>void;onInspect:(id:string)=>void;onTarget?:(id:string)=>void;
  onCamera:(mode:ClubCameraMode)=>void;onMove:(vector:StickVector,active:boolean)=>void;onStop:()=>void;
  placementPoint?:GridPoint;onReduced:()=>void;onGhost:(ghost?:Ghost)=>void;onThemePreview?:(theme?:Theme)=>void;
  onWorkshopPreview?:(draft:WorkshopDraft|null,position?:GridPoint)=>void;
  soundEnabled?:boolean;soundStatus?:FarmAudioStatus;onSound?:()=>void;
};
const BUILDING_LABEL:Record<BuildingKind,string>={shelter:'保护区',trough:'食槽',workbench:'工作台',tower:'观察台',factory:'饲料厂',ramp:'池岸坡道',decor:'装饰'};
const REGION_LABEL={pen:'圈养区',meadow:'草场',shore:'池岸',home:'家园'};
const STAGE_LABEL={baby:'幼崽',juvenile:'少年',adult:'成年'};
const GUARDIANS:{kind:GuardianKind;asset:string}[]=[
  {kind:'dog',asset:'sword-shield-dog'},
  {kind:'cat',asset:'miaocuijiao'},
  {kind:'frog',asset:'milk-frog'},
];
function guardianCopy(kind:GuardianKind,level:number){
 const rules=guardianUpgradeRules(kind,level);
 return kind==='dog'?{description:`走近一只狼，守住${rules.duration}秒`,limit:`视距${rules.sight}格 · 一次只能守一线`}:kind==='cat'?{description:`归拢${rules.range}格内小羊，持续${rules.duration}秒`,limit:`视距${rules.sight}格 · 有效观察台再加4格`}:{description:`安抚${rules.range}格内惊慌，持续${rules.duration}秒`,limit:`视距${rules.sight}格 · 泡泡与安抚不叠加`};
}
const round=(p:GridPoint):GridPoint=>({x:Math.round(p.x),z:Math.round(p.z)});
const timestamp=(at:number)=>new Date(at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});
const bondLabel=bondStage;
const sec=(value:number|null)=>value===null?'尚未':`${Math.round(value*10)/10}秒`;
const living=(p:Profile)=>p.animals.filter(a=>!a.memorial&&!p.threat?.actors.some(t=>t.id===a.id&&t.status==='memorial'));
function inspectComponents(p:Profile,components:{edit:LayoutEdit}[]){
  let layout=p.layout,cost=0,refund=0;const reasons:string[]=[];
  const actors=layoutActors(p);
  const before=validateLayout(layout,actors).metrics;
  for(const component of components){
    const candidate=layoutPreview({...p,layout,materials:p.materials-cost},component.edit);
    cost+=candidate.cost;refund+=candidate.refund;reasons.push(...candidate.reasons);layout=candidate.after;
  }
  return {cost,refund,reasons:[...new Set(reasons)],before,after:validateLayout(layout,actors).metrics};
}

function AnimalCard({animal:a,profile:p,now,busy,send}:{animal:EstateAnimal;profile:Profile;now:number;busy:boolean;send:Send}){
  const growth=growthSummary(a.life,now),[name,setName]=useState(a.name);
  const feeding=p.job?.type==='feed'&&p.job.target===a.id;
  if(a.memorial)return <article className="farm-resident-card"><div className="farm-card-identity"><span className="farm-sheep-mark" style={{'--resident-color':a.color} as CSSProperties}><Cloud/></span><div><b>{a.name} · 留在记忆里</b><span>{PERSONALITY_LABEL[a.personality]} · 原来的名字和经历</span></div></div><p className="sheet-note">{timestamp(a.memorial.at)} UTC · 主动演示挑战留下的纪念。</p><div className="farm-memory-list">{a.life.memory.slice(-6).map((m,i)=><p key={`${m.at}-${i}`}>{m.text}</p>)}</div><p className="sheet-note">这份记录保留原ID，新的领养会是另一位朋友。</p></article>;
  return <article className="farm-resident-card" data-resident-id={a.id}>
    <div className="farm-card-identity"><span className="farm-sheep-mark" style={{'--resident-color':a.color} as CSSProperties}><Cloud/></span><div><b>{a.name}{a.appearance==='starlit'?' ✦':''}</b><span>{STAGE_LABEL[a.life.stage]} · {PERSONALITY_LABEL[a.personality]} · {ACTION_LABEL[a.preference]}会让它开心</span></div><span className="farm-appearance-badge">{bondLabel(a.life.bond)}</span></div>
    <div className="estate-needs"><label>饱食 <b>{Math.round(a.life.hunger)}/100</b><progress max={100} value={a.life.hunger}/></label><label>精力 <b>{Math.round(a.life.energy)}/100</b><progress max={100} value={a.life.energy}/></label></div>
    <p className="farm-current-state">{a.life.hunger<70?`${a.name}有点饿了，${a.life.stage==='baby'?'奶瓶':'适配饲料'}已经准备好。`:a.life.energy<30?'想找个安稳的地方休息。':a.following?'正在附近陪你散步。':'现在很安心，可以一起走走。'}</p>
    <button className="estate-primary" data-command={p.inventory.hand?'feed':'refill'} disabled={busy||!!p.job} onClick={()=>send(p.inventory.hand?'feed':'refill',p.inventory.hand?{target:a.id,food:a.life.stage==='baby'?'milk':'feed'}:{})}><Leaf size={18}/>{feeding?'正在走近并喂养…':!p.inventory.hand?'去工作台免费补充':a.life.stage==='baby'?'喂奶':'喂食'}<small>{feeding?`${Math.min(3,Math.floor((p.job?.progress??0)/1000))}/3秒`:'LX走近后照料 · 食物1份'}</small></button>
    <div className="estate-secondary"><button disabled={busy||!!p.job} onClick={()=>send('play',{target:a.id,action:a.preference})}>一起{ACTION_LABEL[a.preference]}</button><button disabled={busy} aria-pressed={a.following} onClick={()=>send('follow',{target:a.id})}>{a.following?'让它自在活动':'陪我散步'}</button></div>
    {p.job&&<button className="farm-text-link" disabled={busy} onClick={()=>send('cancel')}>取消手上行动 · 未完成不扣食物</button>}
    <AnimalProduction animal={a} profile={p} now={now} busy={busy} send={send} economy={p.economy} production={p.production} blockedReason={p.threat?'等这次守护结束后再安排生产':undefined}/>
    <div className="estate-growth"><h3>下一成长 <span>{growth.nextStage?STAGE_LABEL[growth.nextStage]:'继续留下新经历'}</span></h3><progress max={1} value={growth.ageProgress}/><ul>{growth.missing.map(item=><li key={item.kind}>{item.text}</li>)}</ul>{!growth.missing.length&&<p>{growth.message}</p>}</div>
    <div className="farm-memory-heading"><h3>最近的真实记忆</h3><span><Heart size={12}/>{Math.round(a.life.bond)}/100 · {bondLabel(a.life.bond)}</span></div>
    <div className="farm-bond"><i style={{width:`${a.life.bond}%`,background:a.color}}/></div>
    <div className="farm-memory-list">{a.life.memory.length?a.life.memory.slice(-3).reverse().map((m,i)=><p key={`${m.at}-${i}`}><span>·</span>{m.text}</p>):<p>还没有共同经历，第一口照料会留在这里。</p>}</div>
    <details className="estate-details"><summary>看更多 · 习惯与照料</summary><div className="farm-habits">{ACTIONS.map(action=>{const h=a.life.habits[action];return <div key={action}><span>{ACTION_LABEL[action]}</span><span className="farm-habit-dots">{[1,2,3].map(n=><i key={n} className={(h?.count??0)>=n?'complete':''}/>)}</span><small>{h?.stage==='invite'?'会邀请你':h?.stage==='imitate'?'学着做了':h?'正在观察':'还没见过'}</small></div>;})}</div><p className="sheet-note">不同来访、不同日子里的相处，会慢慢成为习惯。</p><button className="actions-join" disabled={busy} onClick={()=>send('rest',{target:a.id})}>一起回棚休息 · 连续60在线秒</button><form className="estate-inline-form" onSubmit={event=>{event.preventDefault();send('rename',{target:a.id,name});}}><label htmlFor="estate-animal-name">名字</label><input id="estate-animal-name" value={name} onChange={event=>setName(event.target.value)} maxLength={12}/><button disabled={busy||!name.trim()}>保存</button></form><button className="actions-join" disabled={busy||(!p.sharedRhythm&&a.appearance!=='starlit')} onClick={()=>send('appearance',{target:a.id,appearance:a.appearance==='starlit'?'plain':'starlit'})}>{a.appearance==='starlit'?'恢复普通卷毛':'留下星点卷毛'}</button><p className="sheet-note">与奶蛙合拍后可体验规则驱动外观。名字、关系和成长都会保留。</p></details>
  </article>;
}

function Inventory({profile:p,busy,send,onCraft}:{profile:Profile;busy:boolean;send:Send;onCraft?:()=>void}){
  const stored=(p.production?.pending.reduce((n,b)=>n+b.amount,0)??0)+living(p).reduce((n,a)=>n+(a.husbandry?stackTotal(a.husbandry.pending):0),0);
  return <details className="estate-details"><summary><Backpack size={14}/> 物资背包 · 随身食物 {p.inventory.hand}/3</summary><InventoryPanel profile={p} busy={busy} send={send} onCraft={onCraft}/><button className="actions-join" data-inventory-claim disabled={busy||!stored||!!p.threat&&p.threat.phase!=='complete'} onClick={()=>send('claimWool')}>收好羊毛 · {stored}份</button></details>;
}

function BuildPanel({profile:p,busy,send,onGhost,initialMode='place'}:{profile:Profile;busy:boolean;send:Send;onGhost:(g?:Ghost)=>void;initialMode?:LayoutEdit['type']}){
  const [mode,setMode]=useState<LayoutEdit['type']>(initialMode),[kind,setKind]=useState<BuildingKind>('trough');
  const [point,setPoint]=useState<GridPoint>({x:8,z:3}),[rotation,setRotation]=useState<Rotation>(0);
  const [selectedId,setSelectedId]=useState(p.layout.buildings.find(b=>b.kind==='trough')?.id??p.layout.buildings[0]?.id??'');
  const [roadCells,setRoadCells]=useState<GridPoint[]>([]),[removeRoad,setRemoveRoad]=useState(false),[doorId,setDoorId]=useState(''),[doorOpen,setDoorOpen]=useState(false),[recommendation,setRecommendation]=useState('');
  const requested=p.layout.buildings.find(b=>b.id===selectedId)??p.layout.buildings[0];
  const selected=(mode==='door'||mode==='door-state')&&requested?.kind!=='shelter'?p.layout.buildings.find(b=>b.kind==='shelter'):requested;
  const edit=useMemo<LayoutEdit>(()=>{
    if(mode==='place')return {type:'place',id:`local-${p.layout.version}-${kind}-${point.x}-${point.z}`,kind,...point,rotation};
    if(mode==='move')return {type:'move',id:selected?.id??'',...point,rotation};
    if(mode==='remove')return {type:'remove',id:selected?.id??''};
    if(mode==='road')return {type:'road',cells:roadCells.length?roadCells:[point],remove:removeRoad};
    if(mode==='door')return {type:'door',id:selected?.id??'',at:point};
    if(mode==='door-state')return {type:'door-state',id:selected?.id??'',doorId:doorId||selected?.doors[0]?.id||'',open:doorOpen};
    return {type:'expand'};
  },[mode,p.layout.version,kind,point,rotation,selected,roadCells,removeRoad,doorId,doorOpen]);
  const actors=useMemo(()=>layoutActors(p),[p]);
  const preview=useMemo(()=>layoutPreview(p,edit),[p,edit]);
  useEffect(()=>{
    if(mode==='place'||mode==='move')onGhost({...point,kind:mode==='place'?kind:selected?.kind??kind,valid:preview.ok});
    else onGhost();
    return ()=>onGhost();
  },[mode,point,kind,selected?.kind,preview.ok,onGhost]);
  const columns=p.layout.owned.length>144||mode==='expand'?18:12;
  const ghostCells=mode==='place'||mode==='move'?buildingFootprint({id:'ghost',kind:mode==='place'?kind:selected?.kind??kind,...point,rotation,paidCost:0,doors:[],capacity:0}):mode==='road'?(roadCells.length?roadCells:[point]):[point];
  const recommend=()=>{
    const before=validateLayout(p.layout,actors).metrics.maxReachablePath;
    const shelter=p.layout.buildings.find(b=>b.kind==='shelter');
    let best:{at:GridPoint;length:number}|undefined;
    if(shelter) for(const at of p.layout.owned){
      if(at.x>15||at.z>9)continue;
      const candidate=layoutPreview(p,{type:'move',id:shelter.id,...at,rotation:shelter.rotation});
      if(candidate.ok&&candidate.metrics.maxReachablePath<before&&(!best||candidate.metrics.maxReachablePath<best.length))best={at,length:candidate.metrics.maxReachablePath};
    }
    if(best&&shelter){setMode('move');setSelectedId(shelter.id);setPoint(best.at);setRotation(shelter.rotation);setRecommendation(`可预览免费搬棚：最远回棚路线 ${before} → ${best.length}格，施工10秒。确认后才应用。`);}
    else setRecommendation('目前没有找到能缩短全部来源最远路线的免费搬棚方案。可以先无损演练，查看具体瓶颈。');
  };
  const saveBlueprint=()=>{
    if(edit.type==='expand')return;
    const components=edit.type==='road'?(Object.keys(REGION_LABEL) as (keyof typeof REGION_LABEL)[]).flatMap(region=>{
      const cells=edit.cells.filter(at=>regionAt(at)===region);if(!cells.length)return [];
      const estimatedCost=edit.remove?0:cells.filter(at=>!p.layout.roads.some(road=>road.x===at.x&&road.z===at.z)).length;
      return [{id:`road-${region}`,region,estimatedCost,edit:{...edit,cells}}];
    }):[{id:'current-sketch',region:regionAt(edit.type==='place'||edit.type==='move'?edit:edit.type==='door'?edit.at:selected??point),estimatedCost:preview.cost,edit}];
    send('creation',{command:{id:crypto.randomUUID(),type:'blueprintDraft',scope:Object.keys(REGION_LABEL),baseVersion:p.layout.version,budget:preview.cost,components}});
  };
  return <>
    <div className="estate-stat-row"><span>金币 <b>{p.materials}</b></span><span>土地 <b>{p.layout.owned.length}格</b></span><span>棚位 <b>{preview.beforeMetrics.capacity}</b></span></div>
    {p.layout.construction?<section className="estate-callout"><b>正在施工 · 仅在线推进</b><progress max={p.layout.construction.durationMs} value={p.layout.construction.elapsedMs}/><p>还要{Math.ceil((p.layout.construction.durationMs-p.layout.construction.elapsedMs)/1000)}秒 · 已预留{p.layout.construction.reservedCost}金币</p><button className="actions-join" disabled={busy} onClick={()=>send('cancelBuild')}>取消施工，返还本次预留</button></section>:<>
    <button className="actions-join" disabled={busy||!!p.threat} onClick={recommend}>帮我看看 · 寻找更短的回棚路</button>{p.threat&&<p className="sheet-note">先在守护面板完成事件、收好记录，再预览改造。</p>}{recommendation&&<p className="sheet-note" role="status">{recommendation}</p>}
    <div className="estate-tool-tabs" aria-label="布置操作">{([{id:'place',text:'新建'},{id:'move',text:'搬迁'},{id:'remove',text:'拆除'},{id:'road',text:'修路'},{id:'door',text:'加入口'},{id:'door-state',text:'开关门'},{id:'expand',text:'拓荒'}] as const).map(item=><button key={item.id} className={mode===item.id?'selected':''} aria-pressed={mode===item.id} onClick={()=>{setMode(item.id);setRecommendation('');}}>{item.text}</button>)}</div>
    {mode==='place'?<label className="estate-field">选择设施<select value={kind} onChange={event=>setKind(event.target.value as BuildingKind)}>{(Object.keys(BUILDING_LABEL) as BuildingKind[]).map(id=><option key={id} value={id}>{BUILDING_LABEL[id]} · {BUILDING_RULES[id].cost}金币 · {BUILDING_RULES[id].width}×{BUILDING_RULES[id].depth}</option>)}</select></label>:!['road','expand'].includes(mode)&&<label className="estate-field">已有设施<select value={selected?.id??''} onChange={event=>{setSelectedId(event.target.value);setDoorId('');const b=p.layout.buildings.find(b=>b.id===event.target.value);if(b)setRotation(b.rotation);}}>{p.layout.buildings.filter(b=>!['door','door-state'].includes(mode)||b.kind==='shelter').map(b=><option key={b.id} value={b.id}>{BUILDING_LABEL[b.kind]} ({b.x},{b.z}) · 已付{b.paidCost}</option>)}</select></label>}
    {mode==='door-state'&&<div className="estate-coordinate-row"><label>入口<select value={doorId||selected?.doors[0]?.id||''} onChange={event=>setDoorId(event.target.value)}>{selected?.doors.map(d=><option value={d.id} key={d.id}>({d.x},{d.z}) · {d.open?'开启':'关闭'}</option>)}</select></label><label>状态<select value={doorOpen?'open':'closed'} onChange={event=>setDoorOpen(event.target.value==='open')}><option value="open">开启</option><option value="closed">关闭</option></select></label></div>}
    {mode==='road'&&<div className="estate-secondary"><button className={!removeRoad?'selected':''} onClick={()=>setRemoveRoad(false)}>铺路 · 1金币/格</button><button className={removeRoad?'selected':''} onClick={()=>setRemoveRoad(true)}>拆路 · 按实付返还</button></div>}
    {!['remove','door-state','expand'].includes(mode)&&<div className="estate-coordinate-row"><label>X<input aria-label="建造X坐标" type="number" min={0} max={17} value={point.x} onChange={event=>setPoint({...point,x:Number(event.target.value)})}/></label><label>Z<input aria-label="建造Z坐标" type="number" min={0} max={11} value={point.z} onChange={event=>setPoint({...point,z:Number(event.target.value)})}/></label>{(mode==='place'||mode==='move')&&<label>朝向<select value={rotation} onChange={event=>setRotation(Number(event.target.value) as Rotation)}>{[0,90,180,270].map(value=><option key={value} value={value}>{value}°</option>)}</select></label>}</div>}
    <div className="estate-map-wrap"><div className="estate-map" role="group" aria-label="庄园格点规划图" style={{gridTemplateColumns:`repeat(${columns},1fr)`}}>{Array.from({length:12},(_,z)=>Array.from({length:columns},(_,x)=>{
      const owned=p.layout.owned.some(c=>c.x===x&&c.z===z),building=p.layout.buildings.find(b=>buildingFootprint(b).some(c=>c.x===x&&c.z===z));
      const terrain=terrainAt({x,z}),ghost=ghostCells.some(c=>c.x===x&&c.z===z)&&!['remove','door-state','expand'].includes(mode),road=p.layout.roads.some(c=>c.x===x&&c.z===z);
      const actor=living(p).some(a=>round(a.position).x===x&&round(a.position).z===z);
      return <button type="button" key={`${x},${z}`} aria-label={`${REGION_LABEL[regionAt({x,z})]} ${x},${z} ${building?BUILDING_LABEL[building.kind]:terrain==='grass'?'陆地':'水域'}${ghost?preview.ok?' 可建':' 不可建':''}`} className={`${owned?'owned':'unowned'} ${regionAt({x,z})} ${terrain} ${road?'road':''} ${building?'occupied':''} ${ghost?preview.ok?'ghost-valid':'ghost-invalid':''}`} onClick={()=>{setPoint({x,z});if(mode==='road')setRoadCells(cells=>cells.some(c=>c.x===x&&c.z===z)?cells.filter(c=>c.x!==x||c.z!==z):[...cells,{x,z}]);}}>{building?(x===building.x+Math.floor((buildingFootprint(building).reduce((n,c)=>Math.max(n,c.x),building.x)-building.x)/2)&&z===building.z+Math.floor((buildingFootprint(building).reduce((n,c)=>Math.max(n,c.z),building.z)-building.z)/2)?<span className="estate-map-name">{BUILDING_LABEL[building.kind]}</span>:null):actor?'羊':round(p.position).x===x&&round(p.position).z===z?'我':terrain==='grass'?(road?'·':''):terrain==='deep'?'≈':'∿'}</button>;
    }))}</div></div>
    <p className="sheet-note">绿框可应用，红框显示原因。羊和LX不能走入水域；点击格点选位置{mode==='road'?'，再次点击取消道路格':''}。</p>
    {mode==='expand'&&<div className="estate-callout"><b>东侧相邻6×6 · 30金币 / 60在线秒</b><p>{p.surveyed?'边界已经勘察，拓荒后增加36格土地。':'先走到东侧边界X≥10，原地勘察5秒。勘察不花金币。'}</p><div className="estate-secondary"><button disabled={busy} onClick={()=>send('move',{to:{x:11,z:4}})}>走到勘察点</button><button disabled={busy||p.surveyed||p.position.x<10} onClick={()=>send('survey')}>{p.surveyed?'已勘察':'开始勘察'}</button></div></div>}
    <section className={`estate-preview ${preview.ok?'valid':'invalid'}`} aria-live="polite"><b>{preview.ok?'这份方案可以应用':'这份方案还不能应用'}</b><div className="estate-stat-row"><span>预留 <b>{preview.cost}金币</b></span><span>拆除返还 <b>{preview.refund}</b></span><span>耗时 <b>{preview.durationMs/1000}秒</b></span></div><p>最远回棚路线 {preview.beforeMetrics.maxReachablePath} → {preview.metrics.maxReachablePath}格 · 棚位{preview.metrics.capacity} · 不可达{preview.metrics.unreachable.length}处</p>{preview.reasons.map(reason=><p key={reason}>· {reason}</p>)}<button className="estate-primary" data-command="layout" disabled={busy||!preview.ok} onClick={()=>send('layout',{edit,baseVersion:p.layout.version})}>确认这次改造</button></section>
    <button className="actions-join" disabled={busy||!preview.ok||edit.type==='expand'} onClick={saveBlueprint}>保存当前预览为蓝图 · 暂不施工</button>
    <p className="sheet-note">蓝图保存在“主题”页，应用前会重新核验。搬迁免费，耗10在线秒。赠送设施拆除返0；自购物件返已付金币80%向下取整。</p>
    </>}
    <Inventory profile={p} busy={busy} send={send}/>
  </>;
}

function GuardianPanel({profile:p,busy,send,onUpgrades}:{profile:Profile;busy:boolean;send:Send;onUpgrades:()=>void}){
  const [participants,setParticipants]=useState<string[]>([]),[riskAcknowledged,setRiskAcknowledged]=useState(false),[ready,setReady]=useState(false);
  const event=p.threat,result=event?threatSummary(event):null,wolf=event?.wolves.find(w=>!['retreated','boundary'].includes(w.status));
  return <>
    <p className="sheet-note">{p.tutorial==='choose'?'选择时危险暂停。三位伙伴都能守住第一次小家。':'当前只启用一位伙伴。换岗准备20秒，间隔5分钟；关系会保留。'}</p>
    <div className="estate-guardian-choices">{GUARDIANS.map(g=>{const level=p.threat&&p.guardian===g.kind?p.threat.upgrades?.guardianLevel??p.upgrades?.guardians[g.kind]??1:p.upgrades?.guardians[g.kind]??1,copy=guardianCopy(g.kind,level);return <button key={g.kind} className={p.guardian===g.kind?'selected':''} disabled={busy||!!event&&p.tutorial!=='choose'} onClick={()=>send('guardian',{guardian:g.kind})}><img src={`/avatars/portraits/${g.asset}.webp`} alt=""/><div><b>{GUARDIAN_LABEL[g.kind]} · Lv.{level}{p.guardian===g.kind?' · 当前伙伴':''}</b><span>{copy.description}</span><small>{copy.limit}</small></div><ChevronRight size={15}/></button>;})}</div>
    <div className="estate-cycle-invite"><p>动物数量与稀有度决定狼群压力，离线不追算。单次最多损失开场暴露物资的20%；已入库物资受保护。领养前先准备粮食与安全位。</p><button className="actions-join" data-open-cycle onClick={onUpgrades}><Shield size={15}/>看看羊毛用途与保护设施</button></div>
    {p.guardian&&!event&&<div className="estate-secondary"><button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'follow'}})}>伙伴陪我散步</button><button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'station',target:round(p.position)}})}>驻守我这里</button><button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'patrol'}})}>自在巡游</button></div>}
    {p.guardian&&<section className="estate-lookout-control" aria-label="高台守望">
      <button className="actions-join" data-guardian-lookout disabled={busy||!p.layout.buildings.some(b=>b.kind==='tower')||p.guardianReadyMs>0} onClick={()=>send('guardianCommand',{command:{kind:'lookout'}})}><ScanEye size={18}/>登台眺望</button>
      <p className="sheet-note">{p.layout.buildings.some(b=>b.kind==='tower')?'沿阶梯到达台顶后才获得高台视野；离开高台会失去加成。守望时不在羊群身边，必要时可召回。':'先建观察台，再让伙伴登台守望。'}</p>
    </section>}
    {p.guardianReadyMs>0&&<p className="sheet-note">换岗准备还要{Math.ceil(p.guardianReadyMs/1000)}在线秒。</p>}
    {p.tutorial==='defend'&&<button className="estate-primary" disabled={busy||event?.phase!=='complete'||p.opening?.stage!=='done'} onClick={()=>send('finishTutorial')}>{event?.phase==='complete'&&p.opening?.stage!=='done'?'狼正在退走，先关闭面板看看':event?.phase==='complete'?'伙伴守住了，去喂第一口奶':'伙伴正在保护，沿实际路线回棚…'}</button>}
    {Object.entries(p.v7?.recovery??{}).filter(([,r])=>r.kind==='injury').map(([id])=><button key={id} className="actions-join" disabled={busy} onClick={()=>send('v7-recover',{target:id})}>照料{p.animals.find(a=>a.id===id)?.name??'伙伴'}的伤口 · 8金币＋2生产粮</button>)}
    {event&&<section className="estate-callout"><b>{event.mode==='challenge'?'独立演示挑战':event.mode==='tutorial'?'第一次守护':event.mode==='rehearsal'?'无损回家演练':'安心守护'} · {event.phase==='complete'?'已结束':event.phase==='rescue'?'在线追救中':'进行中'}</b><p>{event.discoveredAt===null?'还在巡查实际视线':'发现时间 '+sec(event.discoveredAt)} · 已进行{Math.floor(event.elapsed)}在线秒</p>{result&&<p>首轮及时{result.timely} / 已安全{result.safe} / 受伤{result.injured} / 救回{result.rescued} / 纪念{result.memorial}</p>}
      {event.phase!=='complete'&&<div className="estate-secondary">{p.guardian==='dog'&&<button disabled={busy||!wolf} onClick={()=>send('guardianCommand',{command:event.tacticalShield?{kind:'shield'}:{kind:'block',wolfId:wolf?.id,target:wolf?.position}})}>{event.tacticalShield?'去锚点展开盾':'守住这只狼'}</button>}{p.guardian==='cat'&&<button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'gather',target:p.animals[0]?.position}})}>走近归拢</button>}{p.guardian==='frog'&&<><button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'calm',target:p.position}})}>安抚集合点</button><button disabled={busy||!wolf} onClick={()=>send('guardianCommand',{command:{kind:'bubble',wolfId:wolf?.id,target:wolf?.position}})}>泡泡减速</button></>}<button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'follow'}})}>伙伴跟随LX</button><button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'station',target:round(p.position)}})}>驻守我这里</button></div>}
      {wolf&&<div className="estate-secondary"><button disabled={busy} onClick={()=>send('move',{to:round(wolf.position)})}>靠近这只狼</button><button disabled={busy} onClick={()=>send('rescue',{target:wolf.targetActorId??p.animals[0]?.id,wolfId:wolf.id})}>LX近身驱赶</button></div>}
      {event.actors.filter(a=>['carried','boundary','lost'].includes(a.status)).map(a=><div className="estate-rescue" key={a.id}><b>{p.animals.find(pet=>pet.id===a.id)?.name??a.id} · {a.reason}</b>{a.rescueRemaining!==null&&<p>还可追救{Math.ceil(a.rescueRemaining)}在线秒 · 连续靠近{a.rescueProgress}/3秒</p>}<div className="estate-secondary">{p.v7?.recovery[a.id]?<button disabled={busy} onClick={()=>send('v7-recover',{target:a.id})}>营救照料 · 16金币＋4生产粮</button>:a.status==='lost'?<button disabled={busy} onClick={()=>send('rescue',{target:a.id,findBack:true})}>免费找回</button>:<><button disabled={busy} onClick={()=>send('move',{to:a.rescuePoint??a.position})}>走到救援点</button><button disabled={busy} onClick={()=>send('rescue',{target:a.id})}>开始持续救援</button><button disabled={busy} onClick={()=>send('guardianCommand',{command:{kind:'rescue',actorId:a.id}})}>伙伴追救</button></>}</div></div>)}
      {result&&<details className="estate-details" open={event.phase==='complete'}><summary>每只动物的实际路线与结果</summary>{result.records.map(record=><div className="estate-event-record" key={record.id}><b>{p.animals.find(a=>a.id===record.id)?.name??record.id} · {record.status==='safe'?'已入棚':record.status==='memorial'?'保留纪念':record.status==='queued'?'门前排队':record.status==='lost'?'等待营救照料':'路上'}</b><p>发现 {sec(record.discoveredAt)} · 出发 {sec(record.departAt)} · 路长{record.pathLength}格</p><p>到门 {sec(record.doorArrivalAt)} · 入棚 {sec(record.enteredAt)} · 暴露 {sec(record.exposedAt)}</p><small>{record.reason||'等待本次实际记录'}</small></div>)}<p className="sheet-note">{result.recommendation}</p></details>}
      {event.phase==='complete'&&p.tutorial!=='defend'&&<button className="actions-join" disabled={busy} onClick={()=>send('endEvent')}>回到日常 · 保留这次记录</button>}
    </section>}
    {!event&&p.lastThreat&&<details className="estate-details"><summary>上一次守护的实际记录</summary><p>首轮及时{threatSummary(p.lastThreat).timely} / 已安全{threatSummary(p.lastThreat).safe} / 受伤{threatSummary(p.lastThreat).injured} / 救回{threatSummary(p.lastThreat).rescued}</p>{threatSummary(p.lastThreat).records.map(record=><div className="estate-event-record" key={record.id}><b>{p.animals.find(a=>a.id===record.id)?.name??record.id} · 路长{record.pathLength}格</b><p>发现{sec(record.discoveredAt)} · 到门{sec(record.doorArrivalAt)} · 入棚{sec(record.enteredAt)}</p><small>{record.reason}</small></div>)}</details>}
    <button className="estate-primary" disabled={busy||!p.guardian||!!event||p.guardianReadyMs>0} onClick={()=>send('rehearse')}>看看大家怎么回家 · 无损演练</button><p className="sheet-note">路线、棚位、门口队列都按实际计算。演练不消耗动物，也不重复发金币。</p>
    {p.guardian==='frog'&&<button className="actions-join" disabled={busy||!!event&&event.phase!=='complete'} onClick={()=>send('rhythm')}>与奶蛙一起合拍</button>}
    {p.id==='lab'&&<details className="estate-details estate-risk"><summary>独立演示档 · 主动风险挑战</summary><p>参与名单中的演示动物，追救失败后可能永久留下纪念。自然档的朋友和物品独立保留。</p><fieldset><legend>这一次参与的自己的动物</legend>{living(p).map(a=><label key={a.id}><input type="checkbox" checked={participants.includes(a.id)} onChange={event=>{setParticipants(list=>event.target.checked?[...list,a.id]:list.filter(id=>id!==a.id));setReady(false);}}/>{a.name}</label>)}</fieldset><label className="estate-check"><input type="checkbox" checked={riskAcknowledged} onChange={event=>{setRiskAcknowledged(event.target.checked);setReady(false);}}/>我理解仅以上名单可能永久失去原ID，并保留姓名纪念</label><button className="actions-join" disabled={busy||!participants.length||!riskAcknowledged} onClick={()=>setReady(true)}>核对这次名单与后果</button>{ready&&<div className="estate-callout"><p>仅参与：{participants.map(id=>p.animals.find(a=>a.id===id)?.name).join('、')}。救援窗口为180在线秒，离线暂停。</p><button className="estate-primary" disabled={busy||!!event||!p.guardian||p.guardianReadyMs>0} onClick={()=>{send('challenge',{participants,confirmed:true});setReady(false);setRiskAcknowledged(false);}}>确认开启这一次挑战</button></div>}</details>}
  </>;
}

type CreationInput = CreationCommand extends infer C ? C extends {id:string} ? Omit<C,'id'> : never : never;
function CreationPanel({profile:p,busy,create,onThemePreview}:{profile:Profile;busy:boolean;create:(command:CreationInput,actor?:string)=>void;onThemePreview?:(theme?:Theme)=>void}){
  const draft=p.creation.drafts.findLast(d=>d.kind==='theme'&&d.status==='draft'&&d.baseThemeVersion===p.creation.themeVersions.at(-1)?.version);
  const choices=<div className="estate-themes">{THEME_TEMPLATES.map(theme=><button key={theme.id} disabled={busy} aria-pressed={p.creation.theme===theme.id} className={`estate-theme ${theme.id} ${p.creation.theme===theme.id?'selected':''}`} onClick={()=>{onThemePreview?.(theme.id);create({type:'themePreview',theme:theme.id});}}><span className="estate-theme-art" aria-hidden="true"><i/><i/><span>⌂</span></span><b>{theme.title}</b><small>{theme.description} · 免费</small><span className="estate-theme-cta">{p.creation.theme===theme.id?'当前主题':'预览这个主题'}</span></button>)}</div>;
  return <>{draft?.kind==='theme'?<><section className={`estate-callout estate-theme-preview ${draft.theme}`}><b>场景预览：{THEME_TEMPLATES.find(t=>t.id===draft.theme)?.title}</b><p>看看上方的小家。只替换表面配色，关系、路线和棚位都会保留。</p><button className="estate-primary" disabled={busy} onClick={()=>{create({type:'themeApply',draftId:draft.id});onThemePreview?.();}}>应用这份主题预览 · 0金币</button></section><details className="estate-details"><summary>换一个主题预览</summary>{choices}</details></>:<><p className="sheet-note">从现成主题开始，让小家有自己的样子。先预览，确认后应用。</p>{choices}</>}<button className="actions-join" disabled={busy||p.creation.themeVersions.length<2||!!p.creation.themeVersions.at(-1)?.undoOf} onClick={()=>{create({type:'themeUndo'});onThemePreview?.();}}>恢复上一个主题</button><p className="sheet-note">当前使用官方预制主题。自由生成服务尚未连接；不影响照料和布置。</p>
    {p.creation.drafts.filter(d=>d.kind==='blueprint'&&d.status==='draft').map(blueprint=>{
      if(blueprint.kind!=='blueprint')return null;
      const plan=inspectComponents(p,blueprint.components),stale=blueprint.baseVersion!==p.layout.version;
      return <section className="estate-callout" key={blueprint.id}><b>{blueprint.source.kind==='local-remix'?'私有二创草图':'保存的布置草图'} · {blueprint.components.length}件组件</b><p>基于布局v{blueprint.baseVersion} · 金币上限{blueprint.budget}</p><p>重新核验：预留{plan.cost}金币 · 最远回棚{plan.before.maxReachablePath} → {plan.after.maxReachablePath}格</p><p>保护位{plan.after.capacity} · 不可达{plan.after.unreachable.length}处</p>{plan.reasons.map(reason=><p key={reason}>· {reason}</p>)}{stale&&<p>布局已经更新，请回到布置页重新预览保存。</p>}{blueprint.source.parent&&<p>二创来源：原作版本v{blueprint.source.parent.version} · {blueprint.source.parent.ownerId}</p>}<button className="actions-join" disabled={busy||stale||!!plan.reasons.length||plan.cost>blueprint.budget} onClick={()=>{create({type:'blueprintApply',draftId:blueprint.id});onThemePreview?.();}}>应用这份蓝图 · 确认后施工</button></section>;
    })}
  </>;
}

function WorksPanel({profile:p,busy,create}:{profile:Profile;busy:boolean;create:(command:CreationInput,actor?:string)=>void}){
  const [title,setTitle]=useState('第一次回家'),[eventIds,setEventIds]=useState<string[]>([]);
  return <><p className="sheet-note">把真实发生的相处和这次布局存进私有作品。保存后仍由你自己看见。</p><label className="estate-field">作品名字<input value={title} maxLength={100} onChange={event=>setTitle(event.target.value)}/></label><details className="estate-details"><summary>选入已经发生的故事 · {eventIds.length}条</summary>{p.events.length?p.events.slice(-12).map(event=><label className="estate-check" key={event.id}><input type="checkbox" checked={eventIds.includes(event.id)} onChange={e=>setEventIds(ids=>e.target.checked?[...ids,event.id]:ids.filter(id=>id!==event.id))}/>{event.text}</label>):<p className="sheet-note">先照顾一次朋友，再把那件事记进作品。</p>}</details><button className="estate-primary" disabled={busy||!title.trim()} onClick={()=>create({type:'saveWork',title,eventIds})}>私有保存当前小家</button><div className="estate-works">{p.creation.works.toReversed().map(work=><article className="estate-work" key={work.id}>{work.capture.thumbnail&&<img src={work.capture.thumbnail} alt={`${work.title}的私有场景记录`}/>}<b>{work.title}</b><small>私有 · {timestamp(work.createdAt)} UTC</small><p>布局v{work.capture.layoutVersion} · {THEME_TEMPLATES.find(t=>t.id===work.capture.theme)?.title} · {work.capture.animalIds.length}位朋友</p>{work.events.map(e=><p key={e.id}>· {e.title}</p>)}<small>来源：自己的庄园记录 · {work.source.license==='private'?'私有保存':'模板改作'}</small></article>)}</div></>;
}

function VisitsPanel({profile:p,busy,now,create}:{profile:Profile;busy:boolean;now:number;create:(command:CreationInput,actor?:string)=>void}){
  const [visitorId,setVisitorId]=useState(LOCAL_VISITORS[0].id),[scope,setScope]=useState<(keyof typeof REGION_LABEL)[]>(['meadow']),[budget,setBudget]=useState(8),[allowHelp,setAllowHelp]=useState(true),[allowRemix,setAllowRemix]=useState(false),[proposalNotice,setProposalNotice]=useState(''),[componentSelection,setComponentSelection]=useState<Record<string,string[]>>({});
  const activeGrant=p.creation.grants.findLast(g=>g.visitorId===visitorId&&g.revokedAt===undefined&&g.expiresAt>now);
  const proposal=(visitId:string,actor:string)=>{
    const grant=p.creation.grants.find(g=>g.visitorId===actor&&g.revokedAt===undefined&&g.expiresAt>now);
    if(!grant)return;
    for(const at of p.layout.owned){
      const region=regionAt(at);if(!grant.regions.includes(region))continue;
      const edit:LayoutEdit={type:'place',kind:'decor',id:`demo-decor-${p.layout.version}-${at.x}-${at.z}`,...at};
      const preview=layoutPreview({...p,materials:Math.min(p.materials,grant.budget)},edit);
      if(preview.ok){create({type:'submitProposal',visitId,scope:[region],baseVersion:p.layout.version,budget:grant.budget,components:[{id:'demo-decoration',region,estimatedCost:preview.cost,edit}]},actor);setProposalNotice(`已提交${REGION_LABEL[region]}的一件装饰建议，等待主人确认后才会施工。`);return;}
    }
    setProposalNotice('当前授权区域没有找到可用的合法装饰位置。先结束事件或调整预算。');
  };
  return <>
    <section className="estate-callout"><b>示例庄园 · 只读散步</b><p>沿示例路线看看、挥手、记一张相片。动物投影留在访问会话内。</p><button className="actions-join" disabled={busy} onClick={()=>create({type:'enterVisit',mode:'example'})}>逛逛示例庄园</button></section>
    <h3>本地访客演示</h3><p className="sheet-note">这是同一台Mac里的权限与共创演示。主人接受之前，帮助和提案都留在等待列表。</p>
    <label className="estate-field">演示访客<select value={visitorId} onChange={event=>setVisitorId(event.target.value)}>{LOCAL_VISITORS.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
    <fieldset className="estate-region-picks"><legend>仅开放这些区域</legend>{(Object.keys(REGION_LABEL) as (keyof typeof REGION_LABEL)[]).map(region=><label key={region}><input type="checkbox" checked={scope.includes(region)} onChange={event=>setScope(regions=>event.target.checked?[...regions,region]:regions.filter(r=>r!==region))}/>{REGION_LABEL[region]}</label>)}</fieldset>
    <label className="estate-field">本次共创金币上限<input type="number" min={0} max={p.materials} value={budget} onChange={event=>setBudget(Number(event.target.value))}/></label><label className="estate-check"><input type="checkbox" checked={allowHelp} onChange={event=>setAllowHelp(event.target.checked)}/>允许演示访客投递一份适配食物</label><label className="estate-check"><input type="checkbox" checked={allowRemix} onChange={event=>setAllowRemix(event.target.checked)}/>单独允许已接受作品继续二创</label>
    <button className="actions-join" disabled={busy||!scope.length||!!activeGrant} onClick={()=>create({type:'grant',visitorId,regions:scope,budget,editTypes:['place'],expiresAt:now+48*60*60*1000,allowView:true,allowHelp,allowRemix})}>{activeGrant?'当前授权已开启':'开放这次本地演示 · 48小时'}</button>
    {activeGrant&&<div className="estate-secondary"><button disabled={busy} onClick={()=>create({type:'enterVisit',mode:'local-visitor',grantId:activeGrant.id},visitorId)}>以演示访客进入</button><button disabled={busy} onClick={()=>create({type:'revokeGrant',grantId:activeGrant.id})}>撤回这次授权</button></div>}
    {p.creation.visits.filter(v=>v.status==='active').map(visit=><section className="estate-callout" key={visit.id}><b>{visit.label} · 只读投影</b><p>第{visit.routeIndex+1}/{visit.route.length}个路标 · 快照v{visit.snapshotVersion}</p><div className="estate-secondary"><button disabled={busy||visit.routeIndex>=visit.route.length-1} onClick={()=>create({type:'visitMove',visitId:visit.id},visit.visitorId)}>走到下一处</button><button disabled={busy} onClick={()=>create({type:'visitInteract',visitId:visit.id,interaction:'wave'},visit.visitorId)}>挥挥手</button><button disabled={busy} onClick={()=>create({type:'visitInteract',visitId:visit.id,interaction:'photo'},visit.visitorId)}>记录合影</button><button disabled={busy} onClick={()=>create({type:'leaveVisit',visitId:visit.id},visit.visitorId)}>离开访问</button></div>{visit.mode==='local-visitor'&&<><button className="actions-join" disabled={busy} onClick={()=>{const a=living(p)[0];if(a)create({type:'submitHelp',visitId:visit.id,targetId:a.id,food:a.life.stage==='baby'?'milk':'feed'},visit.visitorId);}}>为{living(p)[0]?.name??'幼崽'}投递1份适配食物</button><button className="actions-join" disabled={busy} onClick={()=>proposal(visit.id,visit.visitorId)}>提交一件装饰方案 · 待主人确认</button></>}</section>)}
    {proposalNotice&&<p className="sheet-note" role="status">{proposalNotice}</p>}
    {p.creation.help.filter(h=>h.status==='pending'||h.status==='waiting').map(help=><section className="estate-callout" key={help.id}><b>本地帮助礼物篮 · {p.animals.find(a=>a.id===help.targetId)?.name}</b><p>48小时内由主人选择。今日最多接受2份，帮助不会代替主人的关系与手动成长经历。</p><div className="estate-secondary"><button disabled={busy} onClick={()=>create({type:'acceptHelp',helpId:help.id})}>接受这份食物</button><button disabled={busy} onClick={()=>create({type:'rejectHelp',helpId:help.id})}>拒绝并退回</button></div></section>)}
    {p.creation.proposals.map(proposal=>{
      const selectedIds=componentSelection[proposal.id]??proposal.components.map(c=>c.id);
      const plan=proposal.status==='pending'?inspectComponents(p,proposal.components.filter(c=>selectedIds.includes(c.id))):null;
      const receipt=p.creation.proposalReceipts.find(r=>r.proposalId===proposal.id);
      const transaction=p.creationLayouts?.find(r=>r.transactionId===receipt?.transactionId);
      const undoable=receipt?.undoState==='available'&&transaction&&p.layout.version===transaction.afterVersion&&p.layout.history.at(-1)?.eventId===transaction.transactionId&&!p.layout.construction&&!p.threat&&p.materials+Math.max(0,transaction.paid-transaction.refunded)>=transaction.completionRefund;
      const grant=p.creation.grants.find(g=>g.id===proposal.grantId),canRemix=proposal.allowRemix&&grant?.revokedAt===undefined&&!!grant&&grant.expiresAt>now;
      return <section className="estate-callout" key={proposal.id}><b>本地布局提案 · {proposal.status==='pending'?'等待确认':proposal.status==='accepted'?'已接受':proposal.status==='revoked'?'授权已撤回':'已处理'}</b><p>基于v{proposal.baseVersion} · {proposal.components.length}件组件 · 金币上限{proposal.budget}</p>{proposal.components.map(c=>proposal.status==='pending'&&proposal.components.length>1?<label className="estate-check" key={c.id}><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={event=>setComponentSelection(selections=>({...selections,[proposal.id]:event.target.checked?[...selectedIds,c.id]:selectedIds.filter(id=>id!==c.id)}))}/>{REGION_LABEL[c.region]} · {c.edit.type==='place'?BUILDING_LABEL[c.edit.kind]:'布局调整'} · 预估{c.estimatedCost}金币</label>:<p key={c.id}>{REGION_LABEL[c.region]} · {c.edit.type==='place'?BUILDING_LABEL[c.edit.kind]:'布局调整'} · 预估{c.estimatedCost}金币</p>)}{plan&&<><p>重新核验：预留{plan.cost}金币 · 返还{plan.refund} · 最远回棚{plan.before.maxReachablePath} → {plan.after.maxReachablePath}格</p><p>保护位{plan.after.capacity} · 不可达{plan.after.unreachable.length}处</p>{plan.reasons.map(reason=><p key={reason}>· {reason}</p>)}</>}{proposal.status==='pending'&&<div className="estate-secondary"><button disabled={busy||!selectedIds.length||proposal.baseVersion!==p.layout.version||!!plan?.reasons.length||(plan?.cost??0)>proposal.budget} onClick={()=>create({type:'acceptProposal',proposalId:proposal.id,componentIds:selectedIds})}>确认并施工</button><button disabled={busy} onClick={()=>create({type:'rejectProposal',proposalId:proposal.id})}>拒绝提案</button></div>}{proposal.baseVersion!==p.layout.version&&proposal.status==='pending'&&<p>布局版本已改变，请重新提案。</p>}{proposal.status==='accepted'&&<><button className="actions-join" disabled={busy||!undoable} onClick={()=>create({type:'undoProposal',proposalId:proposal.id})}>撤销这份改造 · 核对原事务后恢复</button><button className="actions-join" disabled={busy} onClick={()=>create({type:'setProposalRemix',proposalId:proposal.id,allowRemix:!proposal.allowRemix})}>{proposal.allowRemix?'关闭这份作品的二创许可':'单独开放这份作品的二创许可'}</button><button className="actions-join" disabled={busy||!canRemix} onClick={()=>create({type:'remixProposal',proposalId:proposal.id})}>二创为私有蓝图 · 保留原作署名</button><p>二创草图保存在“主题”页，应用前会重新检查。</p></>}</section>;
    })}
  </>;
}

function ResetPanel({profile:p,busy,send,onCancel}:{profile:Profile;busy:boolean;send:Send;onCancel:()=>void}){
 const submitted=useRef(false);
 useEffect(()=>{if(!busy)submitted.current=false;},[busy]);
 return <div data-reset-confirmation={p.id}>
  <div className="estate-callout"><b>重置{p.id==='home'?'自然档':'独立演示档'}，重新开始？</b><p>这份存档的动物关系、习惯、名字、成长、游戏记忆、物品、布局和作品都会清空，回到最初的幼崽与开场。</p></div>
  <p className="sheet-note">另一个存档、你的设备身份和分身选择保留。此操作不能在游戏中撤销。</p>
  <button className="estate-primary" data-command="confirm-reset" disabled={busy} onClick={()=>{if(submitted.current||busy)return;submitted.current=true;send('resetProfile',{confirmed:true,profile:p.id});}}>确认清空，从头开始</button>
  <button className="farm-text-link" data-command="cancel-reset" disabled={busy} onClick={onCancel}>取消，保留现在的进度</button>
 </div>;
}

export default function EstateView(props:EstateViewProps){
  const {data,target,sheet,camera,reduced,busy:saving,error,message,assetStatus}=props,p=data.profile,busy=saving||!!error;
  const close=useCallback(()=>props.onSheet(sheet==='reset'&&p.tutorial==='done'?'settings':null),[props.onSheet,sheet,p.tutorial]);
  const send:Send=(type,extra={})=>props.onCommand(type,extra);
  const create=(command:CreationInput,actor?:string)=>send('creation',{command:{id:crypto.randomUUID(),...command},...(actor?{actor}:{})});
  const animal=p.animals.find(a=>a.id===target)??p.animals[0];
  const status=error?'保存待重试':busy?'保存中':'已保存';
  const activeEvent=!!p.threat&&p.threat.phase!=='complete',raidWarning=!p.threat&&(p.raidCycle?.phase==='warning'||p.raidCycle?.phase==='ready');
  const goal=currentJourneyGoal(p),basePrompt=playPrompt(p,data.now),craftNext=p.milestones.includes('first-meal')&&!p.workshop?.trialUsed&&!p.job, prompt=craftNext?{...basePrompt,title:'给伙伴做第一件披风',progress:'首件赠送 · 不用等产毛',label:'去做一件'}:basePrompt,compact=isSceneCardSheet(sheet),modal=!!sheet&&!compact;
  const followGoal=()=>{if(craftNext){props.onSheet('workshop');return;}const a=prompt.action;if(!a)return;if(a.kind==='inspect')props.onInspect(a.target);else if(a.kind==='move'){close();send('move',{to:a.to});}else if(a.kind==='refill'){close();send('refill');}else if(a.kind==='survey'){close();send('survey');}else if(a.kind==='guardian')props.onSheet('guardian');else if(a.kind==='expand')props.onSheet('planner');else if(a.kind==='development')props.onSheet('build');else if(a.kind==='cycle')props.onSheet('cycle');else props.onSheet('journey');};
  const failure=error?<div className="farm-sheet-error" role="alert">{error}<button disabled={saving} onClick={()=>send('retry')}>重试保存</button></div>:undefined;
  const titles:Record<Exclude<EstateSheet,null>,string>={animal:'小羊',animalDetails:'成长与回忆',planner:'自己摆放',actions:'一起相处',guardian:'守护小家',build:'建点什么？',creation:'给小家换个主题',visits:'拜访与共同创造',works:'我的私有作品',settings:'慢慢相处就好',reset:'从头演示',view:'看见你的庄园',avatar:'我的分身',journal:'相处手账',journey:'探索与发展',cycle:'收获与经营',workshop:'为小家做一件作品',encounter:'这一次，换我来守护你',harvest:'开放一次小小采收'};
  const tabs=['planner','creation','visits','works'] as const;
  const themePreview=sheet==='creation'&&p.creation.drafts.some(d=>d.kind==='theme'&&d.status==='draft'&&d.baseThemeVersion===p.creation.themeVersions.at(-1)?.version);
  return <main className="app-shell app-shell-v020"><PhoneViewport><section className={`feed-window feed-v020 farm-feed estate-feed joined ${compact?'has-scene-card':''} ${themePreview?'estate-theme-preview-active':''}`} aria-label="绒绒庄园互动空间">
    <section className="app-page feed-page" aria-label="首页" inert={modal||!!props.interactionLocked}>
      <div className="club-stage"><div className="farm-world" ref={props.worldRef}/></div><div className="stage-top-shade"/><div className="stage-bottom-shade"/>
      <header className="feed-header"><div className="feed-tabs" role="tablist" aria-label="庄园分类"><button role="tab" aria-selected={true} onClick={close}>农场</button><button role="tab" aria-selected={false} onClick={()=>animal&&props.onInspect(animal.id)}>住民</button></div><button className="header-icon bell" data-open-encounter onClick={()=>props.onSheet('encounter')} aria-label="查看高光偶遇卡"><img src="/feed-ui/icons/bell.svg" alt=""/></button><button className="header-icon settings" onClick={()=>props.onSheet('settings')} aria-label="庄园设置"><img src="/feed-ui/icons/settings.svg" alt=""/></button></header>
      <div className="farm-top-strip"><button className="estate-sound" data-sound-toggle onClick={props.onSound} aria-label={props.soundEnabled===false?'开启音乐与音效':'关闭音乐与音效'} aria-pressed={props.soundEnabled!==false}>{props.soundEnabled===false?<VolumeX size={16}/>:<Volume2 size={16}/>}<span>{props.soundStatus==='awaiting-gesture'?'听音乐':props.soundStatus==='unavailable'?'声音不可用':props.soundEnabled===false?'静音':'音乐'}</span></button><button className="farm-book-pill" aria-label="探索与发展" onClick={()=>props.onSheet('journey')}><Compass size={13}/>探索</button><button className="farm-cycle-pill" data-open-cycle onClick={()=>props.onSheet('cycle')}><Cloud size={13}/>羊毛·守护</button><button className="farm-target-pill" onClick={()=>props.onSheet('build')}><Hammer size={13}/>建东西 · {p.materials}<ChevronRight size={12}/></button></div>
      {/失败|无法|中断/.test(assetStatus)&&<div className="farm-scene-warning" role="alert">{assetStatus}</div>}
      {p.id==='lab'&&<button className="farm-demo-mode" onClick={()=>send('profile',{profile:'home'})}>独立演示档 · 年龄240倍 · 回自然档</button>}
      {(p.tutorial==='choose'||p.tutorial==='defend'||activeEvent)&&<button disabled={p.tutorial==='defend'&&p.threat?.phase==='complete'&&p.opening?.stage!=='done'} className={`estate-guide-chip ${p.id==='lab'?'under-demo':''}`} onClick={()=>props.onSheet('guardian')}><Shield size={14}/>{p.tutorial==='choose'?'选一位伙伴，幼崽正在等你':p.threat?.phase==='complete'?(p.opening?.stage==='done'?'小家守住了，去照顾幼崽':'狼正在退走…'):activeEvent?'守护进行中 · 查看路线与指令':'第一次守护'}<ChevronRight size={13}/></button>}
      {p.tutorial==='done'&&raidWarning&&<button className={`estate-raid-warning ${p.id==='lab'?'under-demo':''}`} data-raid-warning onClick={()=>props.onSheet('guardian')}><Shield size={17}/><span><b>{p.raidCycle?.phase==='ready'?'猛兽在远处徘徊':`猛兽靠近 · ${Math.ceil((p.raidCycle?.warningMs??0)/1000)}秒`}</b><small>让伙伴守护，带小羊回保护区</small></span><ChevronRight size={14}/></button>}
      {p.tutorial==='done'&&!activeEvent&&!raidWarning&&<div className={`estate-next-goal ${p.id==='lab'?'under-demo':''}`} data-journey-goal={goal.id}><button className="estate-next-main" disabled={busy||!prompt.action&&!craftNext} onClick={followGoal}><span><small>接下来 · {prompt.progress}</small><b>{prompt.title}</b></span><strong>{prompt.label}<ChevronRight size={12}/></strong></button></div>}
      {p.job&&<button className="estate-job-chip" onClick={()=>send('cancel')}><span>{p.job.type==='feed'?'照顾'+(p.animals.find(a=>a.id===p.job?.target)?.name??'小羊'):p.job.type==='survey'?'边界勘察':p.job.type==='delivery'?'沿路搬运食物':'去工作台补充'} · {p.job.phase==='walk'?'正在走近':`${Math.floor(p.job.progress/1000)}秒`}</span><small>点此取消</small></button>}
      <div className="creator-caption"><div className="creator-copy"><div className="creator-line"><button className="creator-name" onClick={()=>props.onSheet('avatar')}>@我的庄园</button><span className={`live-tag ${error?'is-connecting':''}`} role="status"><i/><span>{status}</span><span className="status-separator">·</span><span>{living(p).length} 位住民</span></span></div><p role="status">{props.commandFeedback||prompt.feedback||(p.job?prompt.title:p.lastThreat?.phase==='complete'?'给伙伴做件披风，留下小家的真实经历':'照顾小羊，走出家门，慢慢建起自己的庄园')}</p><span className="farm-learning-hint">{animal?`${animal.name} · ${STAGE_LABEL[animal.life.stage]} · 点小羊照料，点地面散步`:'去布置自己的小家'}</span></div><button className="feed-like" disabled={busy||!animal||!!animal.memorial} onClick={()=>send('play',{target:animal?.id,action:'love'})} aria-label="向朋友表达喜欢"><FeedHeart/><span className="feed-like-count">喜欢</span></button></div>
      {prompt.feedback&&!sheet&&<div className="estate-scene-feedback" role="status">{prompt.feedback}</div>}
      {props.commandFeedback&&!error&&<div className="farm-toast" role="alert">{props.commandFeedback}</div>}
      {error&&<div className="farm-toast" role="alert">{error}<button disabled={saving} onClick={()=>send('retry')}>重试保存</button></div>}
      <section className="lower-controls" aria-label="庄园互动控制"><div className="interaction-dock farm-dock"><ClubJoystick enabled={!modal&&!busy} resetKey={sheet?1:0} onInput={props.onMove} onStop={props.onStop}/><button className="join-control" onClick={()=>props.onSheet('avatar')} aria-label="管理我的分身"><img className="joined-avatar" src={`/avatars/portraits/${data.avatar}.webp`} alt=""/><span className="join-label">我的分身</span></button><button className="dock-control action-menu-button" onClick={()=>props.onSheet('actions')} aria-label="打开互动菜单" aria-haspopup="dialog" aria-expanded={sheet==='actions'}><PersonStanding/><span>互动</span></button><button className="dock-control" onClick={()=>animal&&props.onInspect(animal.id)} aria-label="住民照料与记忆"><Users/><span>住民</span></button><button className="dock-control camera-control" onClick={()=>props.onSheet('view')} aria-label="切换庄园视角">{camera==='overview'?<ScanEye/>:<Maximize/>}<span>{camera==='overview'?'视角':'全景'}</span></button></div></section>
    </section>
    <div className="status-bar" aria-hidden="true"><span className="status-time">{new Date(data.now).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})}</span><div className="status-symbols"><img className="signal" src="/feed-ui/icons/signal.svg" alt=""/><img className="wifi" src="/feed-ui/icons/wifi.svg" alt=""/><img className="battery" src="/feed-ui/icons/battery.svg" alt=""/></div></div>
    <nav className="bottom-nav" aria-label="主导航" inert={props.interactionLocked}><button className={!sheet?'selected':''} onClick={close}>首页</button><button className="create-button" onClick={()=>props.onSheet('build')} aria-label="打开布置与创作"><img src="/feed-ui/icons/plus.svg" alt=""/></button><button className={sheet==='avatar'?'selected':''} onClick={()=>props.onSheet('avatar')}>我的</button></nav>
    {sheet!=='reset'&&props.openingOverlay}
    {compact&&<SceneCard kind={sheet!} title={sheet==='animal'?`${animal?.name??'小羊'} · ${animal?STAGE_LABEL[animal.life.stage]:''}`:titles[sheet!]} onClose={close}>
      {sheet==='animal'&&animal&&<CompactAnimalCard key={animal.id} animal={animal} profile={p} busy={busy} send={send} onInspect={props.onInspect} onDetails={()=>props.onSheet('animalDetails')}/>}
      {sheet==='workshop'&&<WorkshopPanel profile={p} busy={busy} send={send} onPreview={props.onWorkshopPreview??(()=>{})} onGhost={props.onGhost} placementPoint={props.placementPoint}/>}
      {sheet==='build'&&<QuickBuildPanel profile={p} busy={busy} placementPoint={props.placementPoint} send={send} onGhost={props.onGhost} onClose={close} onPlanner={()=>props.onSheet('planner')} onTheme={()=>props.onSheet('workshop')} onExplore={()=>props.onSheet('journey')}/>}
      {sheet==='cycle'&&<FarmCyclePanel profile={p} now={data.now} busy={busy||!!error} send={send} onInspect={props.onInspect} onCraft={()=>props.onSheet('workshop')}/>}
      {sheet==='encounter'&&<EncounterPanel profile={p} avatar={data.avatar} busy={busy} onCommand={send} onClose={close}/>}
      {sheet==='harvest'&&<HarvestPanel onDone={close} onChanged={props.onRefresh}/>}
    </SceneCard>}
    {sheet&&!compact&&<FeedSheet title={titles[sheet]} subtitle={sheet==='animalDetails'?'照顾眼前的需要，记住一起度过的时光':undefined} onClose={close} notice={failure}>
      {tabs.includes(sheet as typeof tabs[number])&&<div className="estate-sheet-tabs" role="tablist" aria-label="庄园创作与共创">{tabs.map((tab,i)=><button key={tab} role="tab" aria-selected={sheet===tab} className={sheet===tab?'selected':''} onClick={()=>props.onSheet(tab)}>{['布置','主题','拜访','作品'][i]}</button>)}</div>}
      {sheet==='animalDetails'&&animal&&<><div className="farm-resident-picker">{p.animals.map(a=><button key={a.id} aria-label={`查看${a.name}的卡片`} className={animal.id===a.id?'selected':''} onClick={()=>props.onInspect(a.id)} style={{'--resident-color':a.color} as CSSProperties}><span className="farm-sheep-mark"><Cloud/></span><b>{a.name}</b><small>{STAGE_LABEL[a.life.stage]} · {PERSONALITY_LABEL[a.personality]}</small></button>)}</div><AnimalCard key={animal.id} animal={animal} profile={p} now={data.now} busy={busy||!!error} send={send}/><Inventory profile={p} busy={busy||!!error} send={send} onCraft={()=>props.onSheet('workshop')}/></>}
      {sheet==='actions'&&<><div className="farm-targets" aria-label="选择互动对象">{p.animals.map(a=><button key={a.id} className={a.id===animal?.id?'selected':''} onClick={()=>(props.onTarget??props.onInspect)(a.id)}>{a.name}</button>)}</div><div className="option-grid farm-action-grid">{ACTIONS.map(action=><button className="option-card" key={action} disabled={busy||!animal||!!animal.memorial} onClick={()=>send('play',{target:animal?.id,action})}>{action==='love'?<Heart/>:<FeedActionIcon kind={action}/>}<span>{ACTION_LABEL[action]}</span></button>)}</div><button className="actions-join" onClick={()=>props.onSheet('guardian')}><Shield size={16}/> 看看守护伙伴</button><button className="actions-join" onClick={()=>animal&&props.onInspect(animal.id)}>照顾{animal?.name}</button><Inventory profile={p} busy={busy} send={send} onCraft={()=>props.onSheet('workshop')}/></>}
      {sheet==='guardian'&&<GuardianPanel profile={p} busy={busy||!!error} send={send} onUpgrades={()=>props.onSheet('cycle')}/>}
      {sheet==='journey'&&<JourneyPanel profile={p} busy={busy} send={send} onGhost={props.onGhost} onClose={close} onBuild={()=>props.onSheet('planner')}/> }
      {sheet==='planner'&&<BuildPanel initialMode={goal.action.kind==='expand'?'expand':'place'} profile={p} busy={busy||!!error} send={send} onGhost={props.onGhost}/>}
      {sheet==='creation'&&<><button className="actions-join" onClick={()=>props.onSheet('workshop')}>做披风与庭院旗 · 可以真正装配</button><CreationPanel profile={p} busy={busy||!!error} create={create} onThemePreview={props.onThemePreview}/></>}
      {sheet==='visits'&&<><section className="estate-callout"><b>一起走一段护送路</b><p>本机双窗口协作：一位运货，一位开路。3分钟训练，不转移庄园资产，不冒充公网好友。</p><a className="actions-join" data-open-convoy href="/?convoy=new">开始联合护送</a><button className="actions-join" data-open-harvest onClick={()=>props.onSheet('harvest')}>开放普通成熟产物采收</button></section><details className="estate-details"><summary>旧版本地蓝图访客演示</summary><VisitsPanel profile={p} busy={busy||!!error} now={data.now} create={create}/></details></>}
      {sheet==='works'&&<WorksPanel profile={p} busy={busy||!!error} create={create}/>}
      {sheet==='journal'&&<><p className="sheet-note">每一步都来自当前存档。教学金币8+8+12各结算一次。</p><div className="estate-journal">{p.events.length?p.events.toReversed().map(event=><article key={event.id}><small>{timestamp(event.at)} UTC</small><p>{event.text}</p></article>):<p>先选一位伙伴，再给幼崽第一口奶。</p>}</div><button className="actions-join" onClick={()=>props.onSheet('works')}>把这次相处存成私有作品</button></>}
      {sheet==='avatar'&&<><p className="sheet-note">换个样子，它们仍然认得你。当前分身：{AVATAR_LABEL[data.avatar]}。</p><div className="option-grid farm-avatar-grid">{(['human-lx','miaocuijiao','banana-cat'] as const).map(id=><button key={id} className={`option-card ${data.avatar===id?'selected':''}`} aria-pressed={data.avatar===id} disabled={busy} onClick={()=>send('avatar',{avatar:id})}><img src={`/avatars/portraits/${id}.webp`} alt=""/><span>{AVATAR_LABEL[id]}</span></button>)}</div><button className="actions-join" onClick={()=>props.onSheet('works')}>看看我的私有作品</button><button className="actions-join" onClick={()=>props.onSheet('settings')}>存档与体验设置</button></>}
      {sheet==='view'&&<div className="option-grid view-grid">{([{id:'overview',label:'庄园总览',hint:'同一斜俯方向，看更大的邻域'},{id:'third-person',label:'斜俯随行',hint:'固定朝向，镜头随LX平移'}] as const).map(v=><button key={v.id} className={`option-card view-option ${camera===v.id?'selected':''}`} onClick={()=>{props.onCamera(v.id);close();}}>{v.id==='overview'?<Maximize/>:<ScanEye/>}<span>{v.label}</span><small>{v.hint}</small></button>)}</div>}
      {sheet==='reset'&&<ResetPanel key={`${p.id}:${p.session}`} profile={p} busy={busy} send={send} onCancel={close}/>}
      {sheet==='settings'&&<><button className="actions-join" data-sound-toggle onClick={props.onSound}>{props.soundEnabled===false?'开启':'关闭'}音乐与音效</button><p className="sheet-note">原创轻音乐与远处狼啸。首次点击后播放，切到后台暂停，声音偏好保存在设备上。</p><button className="actions-join" data-command="request-reset" disabled={busy} onClick={()=>send('requestReset')}>重置当前存档 · 从头演示</button><button className="actions-join" disabled={busy} onClick={()=>send('replayOpening')}>重看开场 · 独立演示，不改存档</button><div className="estate-callout"><b>{p.id==='home'?'自然档 · 安心相处':'独立演示档 · 年龄240倍'}</b><p>自然成长：幼崽至少24小时，少年再至少72小时，同时完成有效照料、探索与休息。离线不推进威胁、救援与施工。</p></div><div className="estate-secondary"><button className={p.id==='home'?'selected':''} disabled={busy||p.id==='home'} onClick={()=>send('profile',{profile:'home'})}>自然档</button><button className={p.id==='lab'?'selected':''} disabled={busy||p.id==='lab'} onClick={()=>send('profile',{profile:'lab'})}>独立演示档</button></div><p className="sheet-note">两个存档的动物、金币、作品和权限分别保存。演示档年龄门槛6/18分钟，照料条件仍要真实完成。</p><button className="actions-join" onClick={props.onReduced}>{reduced?'简化动效已开启':'简化动效'}<Check size={14} style={{opacity:reduced?1:0}}/></button><button className="actions-join" disabled={busy} onClick={()=>send('assistance',{enabled:!p.assistance})}>{p.assistance?'关闭基础提醒':'开启基础提醒'}</button><p className="sheet-note">记录保存在这台Mac。基础提醒不替你花金币、不替你开启挑战或发布作品。</p><p className="sheet-note">{assetStatus}</p></>}
      {message&&<p className="estate-sheet-message" role="status">{message}</p>}
    </FeedSheet>}
  </section></PhoneViewport></main>;
}

