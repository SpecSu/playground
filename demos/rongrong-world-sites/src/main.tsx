"use client";
import {selectFarmRoute} from './entry-route.ts';
import {lazy,Suspense,useEffect,useState} from 'react';
import {FarmBoundary} from './FarmBoundary.tsx';
import {AnimationLabBoundary} from './animation-lab/AnimationLabBoundary.tsx';
import PhoneViewport from './feed/PhoneViewport.tsx';
import './style.css';
import './v5/estate.css';
import './animation-lab/animation-lab.css';
const MinimalApp=lazy(()=>import('./minimal/FarmEntry.tsx'));
const AnimationLab=lazy(()=>import('./animation-lab/AnimationLab.tsx'));
const EstateApp=lazy(()=>import('./v5/EstateApp.tsx'));
const ConvoyApp=lazy(()=>import('./v7/ConvoyApp.tsx'));
const HarvestVisitApp=lazy(()=>import('./v7/HarvestVisitApp.tsx'));
type SiteRoute='minimal'|'animationLab'|'estate'|'convoy'|'harvest';
export function selectSiteRoute(search:string):SiteRoute{
 return selectFarmRoute(search);
}
/** Browser-only simulation behind a real SSR shell; no top-level window reads. */
export default function Farm(){
 const [route,setRoute]=useState<SiteRoute|null>(null);
 useEffect(()=>{setRoute(selectSiteRoute(window.location.search));},[]);
 const loading=<div className="farm-loading" role="status">正在准备绒绒世界…</div>;
 if(!route)return loading;
 if(route==='animationLab'){
  const pending=<main className="app-shell animation-lab-shell"><PhoneViewport><section className="animation-lab" aria-label="动物动作预览" aria-busy="true"><header className="lab-header"><div className="lab-title-row"><h1>动作预览</h1></div><p className="lab-prototype">临时模型 · Blender 骨骼动画</p></header><div className="lab-stage"><div className="lab-stage-message"><p role="status" aria-live="polite">正在载入动作预览…</p></div></div></section></PhoneViewport></main>;
  return <AnimationLabBoundary><Suspense fallback={pending}><AnimationLab/></Suspense></AnimationLabBoundary>;
 }
 return <FarmBoundary><Suspense fallback={loading}>{route==='harvest'?<HarvestVisitApp/>:route==='convoy'?<ConvoyApp/>:route==='estate'?<EstateApp/>:<MinimalApp/>}</Suspense></FarmBoundary>;
}
