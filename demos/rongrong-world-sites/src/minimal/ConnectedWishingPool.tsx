import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowRightLeft,Check,Droplets,Gift,Plus,RefreshCw,Sparkles} from 'lucide-react';
import type {AccountClient} from './account-client.ts';
import {assetAvailable,ownedAsset,offerRef,publicExchangeAsset} from './exchange-authority.ts';
import {EXCHANGE_KINDS,type ExchangeAssetRef,type ExchangeKind,type PublicExchangeOffer} from './exchange-contract.ts';
import GamePanel from './GamePanel.tsx';
import ExchangeAssetCard,{EXCHANGE_LABELS} from './ExchangeAssetCard.tsx';
import {PanelHelp} from './PanelHelp.tsx';
export default function ConnectedWishingPool({client,onClose,onBack}:{client:AccountClient;onClose:()=>void;onBack?:()=>void}){
 const [,refresh]=useState(0),[offers,setOffers]=useState<PublicExchangeOffer[]>([]),[listState,setListState]=useState<{status:'loading'|'ready'}|{status:'error';message:string}>({status:'loading'}),[message,setMessage]=useState(''),[tab,setTab]=useState<'pool'|'give'>('pool'),[selected,setSelected]=useState<ExchangeAssetRef|null>(null),[target,setTarget]=useState<PublicExchangeOffer|null>(null),[accepts,setAccepts]=useState<ExchangeKind[]>([...EXCHANGE_KINDS]);
 const readGeneration=useRef(0),lifetime=useRef(0),body=useRef<HTMLDivElement>(null),confirmation=useRef<HTMLElement>(null),choices=useRef<HTMLDivElement>(null),focusedChoice=useRef<ExchangeAssetRef|null>(null),focusedTarget=useRef<string|null>(null);
 useEffect(()=>client.subscribe(()=>refresh(n=>n+1)),[client]);
 // Reads may be retried independently of the durable mutation outbox. Only the
 // latest mounted read can publish its result; an error is never an empty list.
 const load=useCallback(async(refreshFarm=true)=>{const generation=++readGeneration.current;setListState({status:'loading'});try{if(refreshFarm)await client.refresh();if(generation!==readGeneration.current)return;const page=await client.offers();if(generation!==readGeneration.current)return;setOffers(page.offers);setListState({status:'ready'});}catch(error){if(generation===readGeneration.current)setListState({status:'error',message:error instanceof Error?error.message:'许愿池暂时无法连接'});}},[client]);
 useEffect(()=>{void load();return()=>{readGeneration.current++;lifetime.current++;};},[load]);
 const loading=listState.status==='loading';
 const farm=client.farm!,ownOffer=client.view.ownOffer,busy=client.busy||!!client.pending;
 const references:ExchangeAssetRef[]=[...farm.state.animals.map(a=>({kind:'animal' as const,id:a.id})),...farm.state.eggs.map(e=>({kind:'egg' as const,id:e.id})),...(farm.creative?.assets??[]).map(a=>({kind:a.kind,id:a.id}))];
 const assets=references.map(ref=>ownedAsset(farm,ref)!).filter(Boolean),chosen=selected?ownedAsset(farm,selected):null,ownAsset=ownOffer?ownedAsset(farm,offerRef(ownOffer)):null;
 useEffect(()=>{if(selected&&(!chosen||!assetAvailable(farm,chosen))){setSelected(null);setMessage('这件物品的状态变了，请重新选择');}},[farm,selected?.id]);
 useLayoutEffect(()=>{
  const previous=focusedChoice.current;
  if(chosen){
   if(previous?.id!==chosen.data.id||previous.kind!==chosen.kind){if(!body.current?.closest('[inert]'))confirmation.current?.focus({preventScroll:true});focusedChoice.current={kind:chosen.kind,id:chosen.data.id};}
  }else if(previous){
   const index=assets.findIndex(asset=>asset.kind===previous.kind&&asset.data.id===previous.id),control=choices.current?.children.item(index) as HTMLButtonElement|null;
   if(!body.current?.closest('[inert]'))(control?.isConnected&&!control.disabled?control:body.current)?.focus({preventScroll:true});
   focusedChoice.current=null;
  }else if(target&&focusedTarget.current!==target.offerId&&!body.current?.closest('[inert]')){
   (choices.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')??body.current)?.focus({preventScroll:true});
  }
  focusedTarget.current=target?.offerId??null;
 });
 const start=()=>{setTab('give');setSelected(null);setTarget(null);setMessage('');};
 const act=async(action:()=>ReturnType<AccountClient['wishing']>)=>{const currentLifetime=lifetime.current;setMessage('');try{const result=await action();if(currentLifetime!==lifetime.current)return;setMessage(result.message);if(result.accepted){setSelected(null);setTarget(null);setTab('pool');}await load(false);}catch(error){if(currentLifetime===lifetime.current)setMessage(error instanceof Error?error.message:'连接中断，请重试同一条指令');}};
 const submit=()=>{if(!chosen||busy)return;if(target)void act(()=>client.wishing({type:'acceptAsset',offerId:target.offerId,offerRevision:target.revision,asset:{kind:chosen.kind,id:chosen.data.id}}));else void act(()=>client.wishing({type:'depositAsset',asset:{kind:chosen.kind,id:chosen.data.id},accepts,consent:'listed-kinds'}));};
 const toggleKind=(kind:ExchangeKind)=>setAccepts(current=>current.includes(kind)?current.length===1?current:current.filter(k=>k!==kind):[...current,kind]);
 return <GamePanel title="许愿池" icon={<Droplets size={23}/>} onClose={onClose} onBack={onBack} help={<PanelHelp title="许愿池规则"><p>可交换动物、背包里的蛋、自定义小伙伴与摆件。已摆放的物件先收回，举着的动物先放下。</p><p>放入后即同意按你选择的种类交换。成功交换不可撤回；双方物品会同时移交，未成功不扣次数。</p><p>每天成功交换 1 次，双方各计一次。北京时间次日 00:00 刷新；未成交的许愿自动收回。</p><p>许愿中的物品不能孵化、出售或摆放。断网时保留原指令，重试不会重复交换。</p><p>这是账号间异步交换，不是实时同屏联机。带“样例”的作品使用固定模型，并非根据愿望重新生成。</p></PanelHelp>}>
  <div ref={body} tabIndex={-1} role="region" aria-label="许愿池内容">
  <div className="online-stat-bar"><span><Sparkles size={16}/>{client.view.usedToday?'今日已交换':'今日可交换 1 次'}</span><button type="button" className="online-icon" aria-label="刷新许愿池" disabled={loading||client.busy} onClick={()=>void load()}><RefreshCw size={17}/></button></div>
  {message&&<p className="online-message" role="status">{message}</p>}
  {client.pending&&!client.busy&&<button type="button" className="online-primary" onClick={()=>void act(()=>client.retry())}><RefreshCw size={16}/>重试上次指令</button>}
  {chosen?<section data-exchange-confirm className="exchange-confirm" aria-label="许愿交换确认" ref={confirmation} tabIndex={-1}><div className="exchange-confirm-pair"><ExchangeAssetCard asset={publicExchangeAsset(chosen)}/><ArrowRightLeft size={22}/>{target?<ExchangeAssetCard asset={target.asset}/>:<div className="exchange-mystery"><Gift size={38}/><b>新的惊喜</b><small>{accepts.length===5?'任意种类':accepts.map(k=>EXCHANGE_LABELS[k]).join(' · ')}</small></div>}</div>
   {!target&&<><h3 className="online-section-title">想换什么</h3><div className="exchange-kind-pills">{EXCHANGE_KINDS.map(kind=><button type="button" key={kind} aria-pressed={accepts.includes(kind)} onClick={()=>toggleKind(kind)}>{accepts.includes(kind)&&<Check size={13}/>} {EXCHANGE_LABELS[kind]}</button>)}</div></>}
   <p className="exchange-consent">{target?'双方物品立即互换 · 成功后不可撤回':'放入后可被交换 · 成功后不可撤回'}</p>
   <button type="button" className="online-primary" disabled={busy||client.view.usedToday} onClick={submit}><ArrowRightLeft size={18}/>{busy?'正在处理…':target?'确认交换':'放入许愿池'}</button><button type="button" className="online-secondary" disabled={busy} onClick={()=>setSelected(null)}>重新选择</button>
  </section>:<>
   {ownOffer&&ownAsset?<section className="exchange-own"><div className="online-section-row"><h3>我的许愿</h3><span>等待相遇</span></div><ExchangeAssetCard asset={publicExchangeAsset(ownAsset)}/><button type="button" className="online-secondary" disabled={busy} onClick={()=>void act(()=>client.wishing({type:'withdraw',offerId:ownOffer.offerId,offerRevision:ownOffer.revision}))}>收回物品</button></section>:<div className="online-tabs"><button type="button" aria-selected={tab==='pool'} onClick={()=>{setTab('pool');setTarget(null);}}>许愿广场</button><button type="button" aria-selected={tab==='give'} disabled={busy||client.view.usedToday} onClick={start}><Plus size={16}/>发起许愿</button></div>}
   {target&&<div className="exchange-target"><small>想换回</small><ExchangeAssetCard asset={target.asset}/><h3 className="online-section-title">选择送出的物品</h3></div>}
   {tab==='give'||target?<><div className="exchange-grid" ref={choices}>{assets.map(asset=>{const available=assetAvailable(farm,asset)&&(!ownOffer||offerRef(ownOffer).id!==asset.data.id)&&(!target||target.accepts.includes(asset.kind));return <ExchangeAssetCard key={asset.data.id} asset={publicExchangeAsset(asset)} disabled={!available||busy||client.view.usedToday} onClick={()=>setSelected({kind:asset.kind,id:asset.data.id})}/>;})}</div>{!assets.length&&<div className="online-empty"><Gift size={34}/><b>背包还空着</b><span>先买一颗蛋，或去创作工坊许个愿。</span></div>}</>:<>
    {loading?<div className="online-empty" role="status"><Droplets size={32}/><span>正在寻找许愿…</span></div>:listState.status==='error'?<div className="online-empty" role="status"><Droplets size={32}/><b>许愿池暂时无法读取</b><span>{listState.message}</span><button type="button" className="online-secondary" disabled={client.busy} onClick={()=>{body.current?.focus({preventScroll:true});void load();}}>重试读取许愿池</button></div>:offers.filter(offer=>!offer.own).length?<div className="exchange-grid">{offers.filter(offer=>!offer.own).map(offer=><div key={offer.offerId} data-public-offer><ExchangeAssetCard asset={offer.asset} label={`查看${offer.asset.name}的许愿`} disabled={busy||!!ownOffer||client.view.usedToday} onClick={()=>{setTarget(offer);setTab('give');setMessage('');}}/><span className="exchange-wants">想换 · {offer.accepts.length===5?'任意种类':offer.accepts.map(k=>EXCHANGE_LABELS[k]).join(' / ')}</span></div>)}</div>:<div className="online-empty"><Droplets size={36}/><b>池里还没有许愿</b><span>放入一份礼物，等待下一位牧场主。</span></div>}
   </>}
  </>}
  </div>
 </GamePanel>;
}
