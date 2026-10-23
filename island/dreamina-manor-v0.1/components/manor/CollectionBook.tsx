'use client';
import {useState,useRef,useEffect} from 'react';
import ItemThumb from './ItemThumb';
import {CATALOGUE} from '../../lib/game/catalogue.js';
import {TIER_LABELS} from '../../lib/game/economy.js';
export default function CollectionBook({game}:{game:any}){
 const[kind,setKind]=useState('plant');const grid=useRef<HTMLDivElement>(null);useEffect(()=>{if(grid.current)grid.current.scrollTop=0;},[kind]);
 const entries=CATALOGUE.filter(s=>s.kind===kind);
 return <div className="collection-book">
  <div className="section-label">图鉴 · {CATALOGUE.filter(s=>game?.discovered?.[s.id]).length} / 30</div>
  <div className="collection-tabs" aria-label="图鉴类别">
   {(['plant','fish'] as const).map(value=><button key={value} aria-pressed={kind===value} onClick={()=>setKind(value)}>{value==='plant'?'植物':'鱼'} <small>{CATALOGUE.filter(s=>s.kind===value&&game?.discovered[s.id]).length}/{value==='plant'?10:20}</small></button>)}
  </div>
  <div className="collection-grid" ref={grid} aria-label={kind==='plant'?'植物图鉴':'鱼图鉴'}>
   {entries.map(s=>{
    const found=!!game?.discovered[s.id],variants=game?.discoveredVariants?.[s.id]??[];
    return <div className={`item-card ${found?'':'undiscovered'}`} key={s.id}>
     <ItemThumb defer fit silhouette={!found} item={{id:s.id,kind:s.kind,speciesId:s.id,finalSize:s.standardSize,standardSize:s.standardSize,mutation:'normal'}}/>
     <b>{found?s.name:'未发现'}</b><small>{TIER_LABELS[s.tier-1]}</small>
     <div className="collection-badges">{found&&variants.includes('giant')&&<small>巨型</small>}{found&&variants.includes('gold')&&<small className="gold">金色</small>}</div>
    </div>;
   })}
  </div>
 </div>;
}
