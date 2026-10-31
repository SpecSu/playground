import {RarityBadge} from './RarityBadge.tsx';
import {Egg,Gem,PawPrint,PackageOpen,TreePine} from 'lucide-react';
import type {PublicExchangeAsset,ExchangeKind} from './exchange-contract.ts';
export const EXCHANGE_LABELS:Record<ExchangeKind,string>={animal:'动物',egg:'动物蛋','custom-egg':'自定义蛋','custom-creature':'小伙伴',prop:'摆件'};
export function AssetPortrait({asset}:{asset:PublicExchangeAsset}){
 const Icon=asset.kind.includes('egg')?Egg:asset.kind==='prop'?['wish-tree','wish-bush'].includes(asset.templateId??'')?TreePine:Gem:asset.kind==='custom-creature'?PawPrint:PackageOpen;
 return <div className={`exchange-portrait kind-${asset.kind}`}>{asset.portraitUrl&&<img src={asset.portraitUrl} alt="" draggable={false}/>}<Icon className="exchange-kind-icon" size={asset.portraitUrl?18:38}/>{asset.origin==='mock'&&<span className="exchange-mock">样例</span>}</div>;
}
export default function ExchangeAssetCard({asset,onClick,disabled,selected,label}:{asset:PublicExchangeAsset;onClick?:()=>void;disabled?:boolean;selected?:boolean;label?:string}){
 const content=<><AssetPortrait asset={asset}/><div className="exchange-asset-copy"><b>{asset.name}</b>{asset.kind!=='prop'&&<RarityBadge rarity={asset.rarity} fixed={asset.origin==='mock'}/>}<small>{asset.kind==='animal'&&asset.origin==='mock'&&asset.templateId?'小伙伴':EXCHANGE_LABELS[asset.kind]}</small><span>{asset.detail}</span></div></>;
 return onClick?<button type="button" className={`exchange-asset ${selected?'selected':''}`} onClick={onClick} disabled={disabled} aria-label={label??`选择${asset.name}`}>{content}</button>:<article className="exchange-asset">{content}</article>;
}
