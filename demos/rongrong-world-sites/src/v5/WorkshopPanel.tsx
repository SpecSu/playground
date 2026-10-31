import {useEffect,useRef,useState} from 'react';
import type {Profile} from './estate.ts';
import ResourceIcon from '../v7/ResourceIcon.tsx';
import '../v7/inventory.css';
import {DEFAULT_PATTERN,WORKSHOP_RECIPES,workshopPatternSvg,type WorkshopDraft,type WorkshopPattern,type WorkshopRecipe} from './workshop.ts';
import {isOwned,isWalkable,type GridPoint} from './layout.ts';
import {SHIELD_ANCHORS} from './tactical-shield.ts';
type Ghost={x:number;z:number;kind:'decor';valid:boolean;interactive?:boolean};
type Props={profile:Profile;busy:boolean;send:(type:string,extra?:Record<string,unknown>)=>void;onPreview:(draft:WorkshopDraft|null,position?:GridPoint)=>void;onGhost:(ghost?:Ghost)=>void;placementPoint?:GridPoint};
const NAMES:Record<WorkshopRecipe,string>={cape:'伙伴披风',banner:'庭院旗面',signpost:'路线标识',shield:'折翼拦路盾',signature:'动物签名'};
const COLOR_NAMES={white:'白',green:'绿',blue:'蓝',red:'红',gold:'金'};
const art=(p:WorkshopPattern)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(workshopPatternSvg(p));
export default function WorkshopPanel({profile:p,busy,send,onPreview,onGhost,placementPoint}:Props){
 const w=p.workshop,[tab,setTab]=useState<'make'|'items'|'connect'>('make');
 const [recipe,setRecipe]=useState<WorkshopRecipe>(w?.draft?.recipe??'cape'),[pattern,setPattern]=useState<WorkshopPattern>(w?.draft?.pattern??DEFAULT_PATTERN),[animalId,setAnimal]=useState(w?.draft?.animalId??p.animals[0]?.id??''),[eventId,setEvent]=useState(w?.draft?.eventId??'');
 const [preview,setPreview]=useState(false),[placing,setPlacing]=useState<string>(),[anchor,setAnchor]=useState(1),[confirmDismantle,setConfirmDismantle]=useState<string>();
 const submitted=useRef(false);useEffect(()=>{if(!busy)submitted.current=false;},[busy,p]);
 const act=(type:string,extra:Record<string,unknown>={})=>{if(busy||submitted.current)return;submitted.current=true;send(type,{workshopVersion:w?.version??0,worldVersion:p.layout.version,...extra});};
 const draft:WorkshopDraft={recipe,pattern,animalId,...(eventId?{eventId}:{})};
 const saved=!!w?.draft&&JSON.stringify(w.draft)===JSON.stringify(draft),cost=WORKSHOP_RECIPES[recipe],gift=!w?.trialUsed&&(recipe==='cape'||recipe==='banner');
 const point=placementPoint??{x:Math.round(p.position.x),z:Math.round(p.position.z)},valid=isOwned(p.layout,point)&&isWalkable(p.layout,point);
 const placedItem=w?.items.find(i=>i.id===placing&&!i.destroyed),placedAsset=placedItem&&w?.assets.find(a=>a.id===placedItem.assetId&&a.version===placedItem.assetVersion);
 useEffect(()=>{if(placedItem&&placedAsset){onGhost({...point,kind:'decor',valid,interactive:true});onPreview({recipe:placedItem.recipe,pattern:placedAsset.pattern},point);}else{const ground=preview&&(recipe==='banner'||recipe==='signpost');onGhost(ground?{...point,kind:'decor',valid,interactive:true}:undefined);onPreview(preview?{recipe,pattern,animalId,...(eventId?{eventId}:{})}:null,ground?point:undefined);}return()=>{onGhost();onPreview(null);};},[placing,placedItem?.id,placedAsset,point.x,point.z,valid,preview,recipe,pattern,animalId,eventId,onGhost,onPreview]);
 const items=w?.items.filter(i=>!i.destroyed)??[];
 const priorCount=useRef(items.length);useEffect(()=>{if(items.length>priorCount.current){setTab('items');setPreview(false);}priorCount.current=items.length;},[items.length]);
 return <div className="workshop-panel" data-workshop>
  <nav className="workshop-tabs">{(['make','items','connect'] as const).map((t,i)=><button key={t} aria-pressed={tab===t} onClick={()=>{setTab(t);setPreview(false);setPlacing(undefined);}}>{['做一件','我的作品','AI与朋友'][i]}</button>)}</nav>
  {tab==='make'&&<>
   <div className="workshop-choice">{(['cape','banner','shield'] as const).map(r=><button key={r} aria-pressed={recipe===r} onClick={()=>{setRecipe(r);setPreview(false);}}><ResourceIcon kind={r} size={42}/>{NAMES[r]}</button>)}</div>
   <div className="workshop-editor"><img src={art(pattern)} alt="正在编辑的纹样"/><div><strong>{NAMES[recipe]}</strong><p>{gift?'首件试制 · 赠送，不扣金币或羊毛':`${cost.materials}金币 + ${COLOR_NAMES[cost.tier]}毛1`}</p><div className="workshop-motifs">{(['star','leaf','sheep'] as const).map((motif,i)=><button key={motif} aria-label={['星星纹样','叶片纹样','小羊纹样'][i]} aria-pressed={pattern.motif===motif} onClick={()=>setPattern({...pattern,motif})}><ResourceIcon kind={motif} size={27}/></button>)}<input aria-label="图案颜色" type="color" value={pattern.color} onChange={e=>setPattern({...pattern,color:e.target.value})}/></div></div></div>
   <div className="workshop-actions"><button disabled={busy} onClick={()=>setPreview(v=>!v)}>{preview?'结束试穿':'在场景试穿'}</button>{saved?<button className="primary" data-workshop-craft disabled={busy||(!gift&&(p.materials<cost.materials||(p.economy?.warehouse[cost.tier]??0)<1))} onClick={()=>act('workshop-craft')}>{gift?'领取首件试制':'确认制作'}</button>:<button className="primary" data-workshop-save-draft disabled={busy} onClick={()=>act('workshop-draft',draft)}>保存这版图案</button>}</div>
   {recipe==='shield'&&<p className="workshop-hint">狗驻点形成6秒路障，替代贴身拦截；不叠加防御。蓝毛是这件配方的材料。</p>}
   <details><summary>调整图案与来源</summary><label>大小<input aria-label="图案大小" type="range" min="0.5" max="2" step="0.1" value={pattern.scale} onChange={e=>setPattern({...pattern,scale:Number(e.target.value)})}/></label><label>转角<input aria-label="图案转角" type="range" min="0" max="350" step="10" value={pattern.rotation} onChange={e=>setPattern({...pattern,rotation:Number(e.target.value)})}/></label><label>裁切<input aria-label="图案裁切" type="range" min="0.5" max="1" step="0.05" value={pattern.crop.width} onChange={e=>{const width=Number(e.target.value);setPattern({...pattern,crop:{x:(1-width)/2,y:(1-width)/2,width,height:width}});}}/></label><label>为谁做<select value={animalId} onChange={e=>setAnimal(e.target.value)}>{p.animals.filter(a=>!a.memorial).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>一段真实经历<select value={eventId} onChange={e=>setEvent(e.target.value)}><option value="">现在的日常</option>{p.events.filter(e=>!e.text.startsWith('本地访客')).slice(-10).map(e=><option key={e.id} value={e.id}>{e.text}</option>)}</select></label><label>更多用途<select value={recipe} onChange={e=>setRecipe(e.target.value as WorkshopRecipe)}>{Object.entries(NAMES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><p>普通图案与签名都不增加战力；金毛解锁这只动物的永久签名，之后换贴免费。</p></details>
  </>}
  {tab==='items'&&<>
   {!items.length&&<p>先做第一件披风或旗面吧，首件试制免费。</p>}
   {placing&&placedItem&&<div className="workshop-placement"><p>拖动场景中的半透明物件，放到喜欢的空地。</p><button disabled={busy||!valid} onClick={()=>{act('workshop-apply',{itemId:placing,position:point});}}>{valid?'放在这里':'这里放不下'}</button><button onClick={()=>setPlacing(undefined)}>取消</button></div>}
   {items.map(item=>{const asset=w!.assets.find(a=>a.id===item.assetId&&a.version===item.assetVersion),equipped=w?.equipment.cape===item.id||w?.equipment.shield===item.id,position=w?.placements[item.id];return <article className="workshop-item" key={item.id} data-workshop-item={item.recipe}>
    <div className="inventory-recipe-art"><ResourceIcon kind={item.recipe} size={50}/><img src={art(asset?.pattern??DEFAULT_PATTERN)} alt="这件作品的纹样"/></div><div><strong>{NAMES[item.recipe]} <small>v{item.assetVersion}{equipped?' · 已装配':position?' · 已摆放':''}</small></strong><p>{item.gift?'赠送试制':`实付${item.paid.materials}金币`} · {asset?.source==='official'?'官方纹样':'自己编辑'}{item.animalId?` · ${p.animals.find(a=>a.id===item.animalId)?.name??'动物作品'}`:''}</p>
    <div className="workshop-actions">
     {item.recipe==='cape'&&<button disabled={busy} onClick={()=>act(equipped?'workshop-unequip':'workshop-apply',equipped?{slot:'cape'}:{itemId:item.id})}>{equipped?'脱下':'穿给伙伴'}</button>}
     {item.recipe==='shield'&&<><select aria-label="盾的驻守点" value={anchor} onChange={e=>setAnchor(Number(e.target.value))}>{SHIELD_ANCHORS.map((q,i)=><option key={i} value={i}>{['保护区外','回家路口','草场路口','东侧路口'][i]} ({q.x},{q.z})</option>)}</select><button disabled={busy||!!p.threat} onClick={()=>act(equipped?'workshop-unequip':'workshop-apply',equipped?{slot:'shield'}:{itemId:item.id,position:SHIELD_ANCHORS[anchor]})}>{equipped?'卸下盾':'装盾并定点'}</button></>}
     {(item.recipe==='banner'||item.recipe==='signpost')&&<button disabled={busy} onClick={()=>position?act('workshop-unplace',{itemId:item.id}):setPlacing(item.id)}>{position?'收起来':'拖到场景'}</button>}
     {item.recipe==='signature'&&<small>永久解锁 · 在披风或旗面的“换图与来源”里免费使用</small>}
    </div>
    <details><summary>换图与来源</summary><p>来源动物：{p.animals.find(a=>a.id===asset?.animalId)?.name??'自选纹样'}。经历：{p.events.find(e=>e.id===asset?.eventId)?.text??'制作时的日常'}。仅此设备私有保存。</p><button disabled={busy} onClick={()=>act('workshop-update-pattern',{itemId:item.id,pattern})}>换成编辑器里的图案</button>{item.assetVersion>1&&<button disabled={busy} onClick={()=>act('workshop-revert',{itemId:item.id,assetVersion:1})}>恢复首版图案</button>}{['cape','banner'].includes(item.recipe)&&w?.signatures.map(id=><button key={id} disabled={busy} onClick={()=>act('workshop-use-signature',{itemId:item.id,signatureAnimalId:id})}>{p.animals.find(a=>a.id===id)?.name??id}的签名 · 免费换贴</button>)}{item.recipe!=='signature'&&(confirmDismantle===item.id?<button disabled={busy} onClick={()=>{act('workshop-dismantle',{itemId:item.id});setConfirmDismantle(undefined);}}>确认拆解 · 返{Math.floor(item.paid.materials*.8)}金币和原实付羊毛</button>:<button disabled={busy} onClick={()=>setConfirmDismantle(item.id)}>拆解这件作品</button>)}</details>
    </div></article>;})}
   {p.id==='lab'&&!w?.items.some(i=>i.id==='borrowed-shield')&&<button disabled={busy||!!p.threat} onClick={()=>act('workshop-borrow-shield')}>借一面狗盾演练 · 仅演示档</button>}
  </>}
  <div className={tab==='connect'?'workshop-connect':'workshop-connection-note'}><p>生成服务未连接 · 可先用官方纹样</p>{tab==='connect'&&<><p>账号生成预算尚未接通，与羊毛分开；不兑换即梦积分。当前没有发送任何生成请求。</p><button disabled data-workshop-generate>AI画图 · 等待连接</button><p>真人好友未连接。已有“本地访客演示”仅演示权限与提案，不是真人来访。</p><p>作品保持私有。以后接入需已授权的账号、生成与审核服务，以及持久素材存储。</p></>}{tab!=='connect'&&<button hidden disabled data-workshop-generate>AI画图未连接</button>}</div>
 </div>;
}
