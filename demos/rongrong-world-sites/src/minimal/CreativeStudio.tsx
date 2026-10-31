import {useEffect,useState} from 'react';
import {Box,Check,ChevronRight,Egg,Image,LoaderCircle,LockKeyhole,Plus,Sparkles,WandSparkles} from 'lucide-react';
import type {AccountClient} from './account-client.ts';
import {CREATIVE_CATALOG,creativeModelReady,creativeTemplate,creativeEggProgress,type CreativeAsset,type CreativeJob} from './creative-assets.ts';
import {MINIMAL_RULES,nearShop} from './model.ts';
import type {CreativeCommand} from './creative-authority.ts';
import {publicExchangeAsset,offerRef} from './exchange-authority.ts';
import GamePanel from './GamePanel.tsx';
import ExchangeAssetCard from './ExchangeAssetCard.tsx';
import {PanelHelp} from './PanelHelp.tsx';
const stageLabel:Record<CreativeJob['status'],string>={queued:'愿望已收到','image-ready':'参考图已就绪','model-pending':'等待模型接入',ready:'内容准备好了',claimed:'已装入蛋内',failed:'暂时没有完成'};
export default function CreativeStudio({client,onClose,onPlace,onBack,onEditLand,onOpenShop,mode='shop'}:{client?:AccountClient;onClose:()=>void;onPlace:(id:string)=>void;onBack?:()=>void;onEditLand?:()=>void;onOpenShop?:()=>void;mode?:'shop'|'collection'}){
 const [,render]=useState(0),[tab,setTab]=useState<'create'|'collection'>(mode==='shop'?'create':'collection'),[editingId,setEditingId]=useState<string|null>(null),[category,setCategory]=useState<'creature'|'prop'>('creature'),[templateId,setTemplateId]=useState('poop-pal'),[name,setName]=useState('便便小伙伴'),[prompt,setPrompt]=useState('一位圆滚滚、爱晒太阳的便便小伙伴'),[message,setMessage]=useState('');
 useEffect(()=>client?.subscribe(()=>render(n=>n+1)),[client]);
 const jobs=client?.farm?.creative?.jobs??[],assets=client?.farm?.creative?.assets??[],busy=!!client?.busy||!!client?.pending,template=creativeTemplate(CREATIVE_CATALOG,templateId)!,editing=assets.find(a=>a.id===editingId&&a.kind==='custom-egg'&&a.egg?.stage==='blank');
 const active=jobs.some(job=>['queued','image-ready'].includes(job.status)),incubating=assets.some(a=>a.kind==='custom-egg'&&a.location==='ground'&&a.egg?.stage==='ready');
 useEffect(()=>{if(!client||!active)return;const timer=window.setInterval(()=>{if(!client.busy&&!client.pending)void client.refresh().catch(()=>{});},1100);return()=>window.clearInterval(timer);},[client,active]);
 useEffect(()=>{if(!incubating)return;const timer=window.setInterval(()=>render(n=>n+1),250);return()=>window.clearInterval(timer);},[incubating]);
 const openEgg=(asset:CreativeAsset)=>{if(mode!=='shop'){onOpenShop?.();return;}setEditingId(asset.id);setCategory('creature');setTemplateId('poop-pal');setName('便便小伙伴');setPrompt('一位圆滚滚、爱晒太阳的便便小伙伴');setTab('create');};
 const act=async(command:CreativeCommand)=>{if(!client||busy)return;setMessage('');try{const result=await client.creative(command);setMessage(result.message);if(result.accepted){if(command.type==='buy-egg'){const egg=result.farm?.creative?.assets.at(-1);if(egg)openEgg(egg);}else{setEditingId(null);setTab('collection');}}}catch(error){setMessage(error instanceof Error?error.message:'连接暂时中断');}};
 const valid=!!name.trim()&&name.length<=24&&!!prompt.trim()&&prompt.length<=280&&!/[\u0000-\u001f\u007f]/.test(name+prompt),farm=client?.farm;
 const canBuy=!!farm&&!busy&&farm.state.coins>=MINIMAL_RULES.eggCost&&nearShop(farm.state)&&!farm.state.carriedAnimalId;
 const lockedId=client?.view.ownOffer?offerRef(client.view.ownOffer).id:null;
 const assetCard=(asset:CreativeAsset)=>{
  const locked=lockedId===asset.id,held=farm?.state.carriedAnimalId===asset.id,egg=asset.kind==='custom-egg',progress=creativeEggProgress(asset,client?.now()??0),newEgg=egg&&!!asset.egg;
  return <div key={asset.id}><ExchangeAssetCard asset={publicExchangeAsset({kind:asset.kind,data:asset,origin:'mock'})}/>
   {newEgg&&asset.egg?.stage==='ready'&&<div aria-label="自定义蛋孵化进度"><progress max={1} value={progress.progress}/><small>{asset.location==='bag'?'收在背包 · 孵化暂停':progress.ready?'孵化完成，可以打开啦':`孵化中 · ${Math.ceil(progress.remainingMs/1000)} 秒`}</small></div>}
   {locked?<small>许愿池托管中</small>:held?<small>举起中 · 请先放下</small>:newEgg&&asset.egg?.stage==='blank'?<button type="button" className="online-small-primary creative-asset-action" disabled={busy} onClick={()=>openEgg(asset)}>打开蛋 · 选择内容</button>:newEgg&&asset.egg?.stage==='configured'?<small>准备内容中 · 请在愿望小队查看</small>:newEgg&&asset.location==='ground'?<><button type="button" className="online-small-primary creative-asset-action" disabled={busy||!progress.ready} onClick={()=>void act({type:'hatch',assetId:asset.id})}>打开 · 孵化</button><button type="button" className="online-secondary" disabled={busy} onClick={()=>void act({type:'pickup',assetId:asset.id})}>收回蛋 · 保留进度</button></>:<button type="button" className="online-small-primary creative-asset-action" disabled={busy} onClick={()=>egg&&!newEgg?void act({type:'hatch',assetId:asset.id}):asset.location==='ground'?void act({type:'pickup',assetId:asset.id}):onPlace(asset.id)}>{egg?newEgg?'放到空地孵化':'孵化（旧蛋）':asset.location==='ground'?'收回背包':'摆到牧场'}</button>}
  </div>;
 };
 return <GamePanel title={mode==='shop'?'蛋蛋小铺 · 自定义':'我的作品'} icon={<WandSparkles size={23}/>} onClose={onClose} onBack={onBack} help={<PanelHelp title="创作说明"><p>先用 30 金币购买一颗自定义蛋，再打开蛋选择小伙伴或物件、填写愿望。取消配置或关闭面板不会丢蛋，也不会重复收费。</p><p>当前为固定真实样例：名称和愿望会保存，但不会按任意提示实时调用生成服务。参考图和模型准备好后装入同一颗蛋，还不是成品。</p><p>把蛋放到已开辟的空地，孵化 15 秒后才能打开；收回背包会暂停并保留进度。小伙伴在原地开始成长、照料和正常出售，物件成为摆件。</p><p>地表外观可以免费布置；提示词生成地皮尚未开放。旧版本已经获得的蛋和物件保留，不会补扣金币。许愿池只负责交换，不产生新的愿望。</p><p>自定义小伙伴使用固定真实模型和程序动作，不冒充骨骼动画。准备完成的蛋、伙伴和摆件可收回背包交换，进度与模型身份一起保留。</p></PanelHelp>}>
  <div className="online-stat-bar"><span><Sparkles size={16}/>UGC · 固定样例</span><span>{farm?`${farm.state.coins} 金币`:'需要云端账号'}</span></div>
  {onEditLand&&<div className="creative-land-editor"><button type="button" className="online-secondary" disabled={busy} onClick={onEditLand}>布置地表外观</button><small>免费换外观 · 生成地皮仍未开放</small></div>}
  {!client&&<p className="online-message">连接云端账号后可购买自定义蛋。</p>}
  {message&&<p className="online-message" role="status">{message}</p>}
  {client?.pending&&!client.busy&&<button type="button" className="online-secondary" onClick={()=>void client.retry().then(result=>setMessage(result.message)).catch(error=>setMessage(error.message))}>重试上次指令</button>}
  {mode==='shop'?<div className="online-tabs"><button type="button" aria-selected={tab==='create'} onClick={()=>setTab('create')}><Plus size={16}/>自定义蛋</button><button type="button" aria-selected={tab==='collection'} onClick={()=>setTab('collection')}>我的作品 <span>{assets.length}</span></button></div>:<button type="button" className="online-secondary" onClick={onOpenShop}>到蛋蛋小铺创建</button>}
  {mode==='shop'&&tab==='create'?!editing?<>
   <div className="online-empty"><Egg size={38}/><b>先买蛋，再把愿望放进去</b><p>小伙伴或物件都从同一颗蛋开始，孵化完成后才得到作品。</p></div>
   <button type="button" className="online-primary" disabled={!canBuy} onClick={()=>void act({type:'buy-egg'})}><Egg size={18}/>购买自定义蛋 · {MINIMAL_RULES.eggCost} 金币</button>
   {farm&&!nearShop(farm.state)&&<small>请先走到蛋蛋小铺柜台前。</small>}
   {assets.filter(a=>a.kind==='custom-egg'&&a.egg?.stage==='blank').map(assetCard)}
  </>:<>
   <p className="online-message">正在配置已购买的蛋 · 确认不会再扣金币</p>
   <div className="online-tabs creative-category-tabs" aria-label="自定义分类">{([{id:'creature',label:'小伙伴',Icon:Egg},{id:'prop',label:'物件',Icon:Box}] as const).map(item=><button key={item.id} type="button" aria-label={`自定义${item.label}`} aria-pressed={category===item.id} onClick={()=>{setCategory(item.id);const first=CREATIVE_CATALOG.find(t=>t.kind===item.id)!;setTemplateId(first.id);setName(first.name);setPrompt(first.kind==='creature'?'一位圆滚滚、爱晒太阳的便便小伙伴':'一件装点小牧场的温暖物件');}}><item.Icon size={16}/>{item.label}</button>)}<button type="button" disabled aria-label="生成地皮 · 未开放"><LockKeyhole size={16}/>生成地皮 · 未开放</button></div>
   <div className="creative-preset-grid">{CREATIVE_CATALOG.filter(item=>item.kind===category).map(item=><button type="button" key={item.id} aria-label={`选择${item.name}样例`} aria-pressed={templateId===item.id} onClick={()=>{setTemplateId(item.id);setName(item.name);setPrompt(item.kind==='creature'?'一位圆滚滚、爱晒太阳的便便小伙伴':item.id==='wish-tree'?'一棵能藏住小心愿的树':item.id==='wish-bush'?'一团圆滚滚、能躲猫猫的灌木':'一块来自月亮的圆石头');}}><img src={item.portraitUrl} alt=""/><b>{item.name}</b><small>{item.kind==='creature'?'自定义小伙伴':'自定义物件'}</small></button>)}</div>
   <div className="creative-readiness">{creativeModelReady(template)?<Check size={15}/>:<Box size={15}/>}<span>{creativeModelReady(template)?'真实 3D · 固定样例':'模型尚未就绪'}</span></div>
   <label className="creative-field"><span>给它起个名字</span><input value={name} maxLength={24} onChange={event=>setName(event.target.value)} placeholder="作品名称"/></label>
   <label className="creative-field"><span>你的小愿望 <small>{prompt.length}/280</small></span><textarea value={prompt} maxLength={280} onChange={event=>setPrompt(event.target.value)} rows={3} placeholder="它是什么样，喜欢做什么？"/></label>
   <div className="creative-pipeline" aria-label="样例创作流程"><span><Sparkles size={17}/>愿望</span><ChevronRight size={13}/><span><Image size={17}/>参考图</span><ChevronRight size={13}/><span><Box size={17}/>3D</span><ChevronRight size={13}/><span><Egg size={17}/>落地孵化</span></div>
   <button type="button" className="online-primary" disabled={!client||busy||!valid} onClick={()=>void act({type:'create',assetId:editing.id,templateId,name,prompt})}><Sparkles size={18}/>{busy?'保存中…':'确认蛋内愿望'}</button>
   <button type="button" className="online-secondary" disabled={busy} onClick={()=>{setEditingId(null);setTab('collection');}}>取消配置 · 保留蛋</button>
  </>:<>
   {!!jobs.filter(job=>job.status!=='claimed').length&&<section className="creative-jobs"><h3 className="online-section-title">愿望小队</h3>{[...jobs].reverse().filter(job=>job.status!=='claimed').map(job=><article key={job.id} className="creative-job"><img src={creativeTemplate(CREATIVE_CATALOG,job.templateId)?.portraitUrl} alt=""/><div><b>{job.name}</b><span>{stageLabel[job.status]}</span><small>固定样例流程</small></div>{job.status==='ready'?<button type="button" data-claim-job className="online-small-primary" disabled={busy} onClick={()=>void act({type:'claim',jobId:job.id})}>装入蛋</button>:<LoaderCircle size={19} className={job.status==='model-pending'?'':'creative-spinner'}/>}</article>)}</section>}
   <div className="exchange-grid">{assets.map(assetCard)}</div>
   {!assets.length&&!jobs.length&&<div className="online-empty"><Egg size={38}/><b>还没有自定义蛋或作品</b>{mode==='shop'&&<button type="button" className="online-secondary" onClick={()=>setTab('create')}>去买自定义蛋</button>}</div>}
  </>}
 </GamePanel>;
}
