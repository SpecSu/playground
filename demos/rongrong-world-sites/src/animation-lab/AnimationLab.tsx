'use client';

import {useEffect,useRef,useState} from 'react';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import {createLabController,type LabController,type LabState} from './controller.ts';
import {LAB_ASSETS} from './manifest.ts';
import type {LabClipName,LabSpecies} from './types.ts';
import './animation-lab.css';

const clipLabels:Record<LabClipName,string>={idle:'站立',walk:'走路',drink_enter:'喝水 · 低头',drink_loop:'喝水 · 持续',drink_exit:'喝水 · 抬头',eat:'进食',rest:'休息',carried:'被举起',react:'回应',pet:'被抚摸',alert:'警觉',celebrate:'庆祝',takeoff:'起飞',fly:'飞行',land:'降落',perch:'栖息',pounce:'轻扑 · 无目标',recoil:'轻退'};
const initialState:LabState={species:null,clip:null,status:'loading',error:null,paused:false,time:0,duration:0};
const seconds=(value:number)=>value.toFixed(3);

/** Presentation only: the controller owns the current asset; nothing is persisted. */
export default function AnimationLab(){
 const canvas=useRef<HTMLCanvasElement>(null),controller=useRef<LabController|null>(null);
 const [species,setSpecies]=useState<LabSpecies>(LAB_ASSETS[0].id),[state,setState]=useState<LabState>(initialState);
 const [speed,setSpeed]=useState('1'),[skeleton,setSkeleton]=useState(false),[initializationAttempt,setInitializationAttempt]=useState(0);
 const selectedSpecies=useRef(species);selectedSpecies.current=species;
 useEffect(()=>{
  let active=true;
  try{
   const preview=createLabController(canvas.current!,next=>{if(active)setState(next);});controller.current=preview;
   void preview.selectSpecies(selectedSpecies.current);
  }catch(error){setState({...initialState,species:selectedSpecies.current,status:'error',error:error instanceof Error?error.message:'3D 预览暂时无法启动'});}
  return()=>{active=false;controller.current?.dispose();controller.current=null;};
 },[initializationAttempt]);
 const asset=LAB_ASSETS.find(candidate=>candidate.id===species)!;
 const ready=state.status==='ready';
 const chooseSpecies=(id:LabSpecies)=>{setSpecies(id);selectedSpecies.current=id;if(controller.current)void controller.current.selectSpecies(id);};
 const retry=()=>{if(controller.current)void controller.current.selectSpecies(species);else{setSpeed('1');setSkeleton(false);setState({...initialState,species});setInitializationAttempt(attempt=>attempt+1);}};
 const returnURL=new URL(window.location.href);returnURL.searchParams.delete('animationLab');
 const status=state.status==='loading'?`正在载入${asset.label}模型…`:state.status==='error'?`${asset.label}模型载入失败，可重试。`:`${asset.label} · ${state.clip?clipLabels[state.clip]:''} · ${state.paused?'已暂停':'播放中'}`;
 return <main className="app-shell animation-lab-shell"><PhoneViewport><section className="animation-lab" aria-label="动物动作预览">
  <header className="lab-header"><div className="lab-title-row"><h1>动作预览</h1><a aria-label="返回牧场" href={`${returnURL.pathname}${returnURL.search}${returnURL.hash}`}>返回牧场</a></div><p className="lab-prototype">临时模型 · Blender 骨骼动画</p><p className="lab-status" role="status" aria-live="polite" aria-atomic="true">{status}</p></header>
  <div className="lab-stage" data-lab-stage aria-busy={state.status==='loading'}>
   <canvas ref={canvas} role="img" aria-label={`${asset.label}的 3D 骨骼动画预览`} style={{visibility:ready?'visible':'hidden'}}/>
   {!ready&&<div className="lab-stage-message">{state.status==='error'?<><p role="alert">模型暂未载入：{state.error}</p><button type="button" aria-label="重试载入模型" onClick={retry}>重试载入</button></>:<p>正在准备{asset.label}…</p>}</div>}
   {ready&&<p className="lab-orbit-hint">拖拽转动 · 双指或滚轮缩放</p>}
  </div>
  <div className="lab-controls" aria-label="动画预览控制">
   <div className="lab-field"><label htmlFor="lab-species">动物 · 25 种</label><select id="lab-species" value={species} onChange={event=>chooseSpecies(event.target.value as LabSpecies)}>{LAB_ASSETS.map(animal=><option key={animal.id} value={animal.id}>{animal.label}</option>)}</select></div>
   <div className="lab-button-row"><button type="button" disabled={!ready} aria-label={state.paused?'播放动画':'暂停动画'} onClick={()=>controller.current?.setPaused(!state.paused)}>{state.paused?'播放':'暂停'}</button><button type="button" disabled={!ready} aria-label="从头播放当前动作" onClick={()=>controller.current?.seek(0)}>从头开始</button></div>
   <div className="lab-timeline"><div className="lab-timeline-heading"><label htmlFor="lab-timeline">动作进度</label><output htmlFor="lab-timeline" data-lab-duration>{seconds(state.time)} / {seconds(state.duration)} 秒</output></div><input id="lab-timeline" type="range" min="0" max={state.duration} step="any" value={state.time} disabled={!ready} aria-valuetext={`${seconds(state.time)} 秒，共 ${seconds(state.duration)} 秒`} onInput={event=>controller.current?.seek(Number(event.currentTarget.value))}/></div>
   <div className="lab-options"><div className="lab-field"><label htmlFor="lab-speed">播放速度</label><select id="lab-speed" value={speed} disabled={!ready} onChange={event=>{setSpeed(event.target.value);controller.current?.setSpeed(Number(event.target.value));}}>{['0.25','0.5','1','1.5'].map(value=><option key={value} value={value}>{value}×</option>)}</select></div><button type="button" disabled={!ready} aria-label={skeleton?'隐藏骨骼':'显示骨骼'} aria-pressed={skeleton} onClick={()=>{setSkeleton(!skeleton);controller.current?.setSkeletonVisible(!skeleton);}}>{skeleton?'隐藏骨骼':'显示骨骼'}</button><button type="button" disabled={!ready} aria-label="重置视角" onClick={()=>controller.current?.resetCamera()}>重置视角</button></div>
   <fieldset className="lab-clips"><legend>动作 · {asset.clips.length} 个</legend><div className="lab-clip-grid">{asset.clips.map(clip=><button type="button" key={clip.name} data-lab-clip={clip.name} aria-label={`${clipLabels[clip.name]} (${clip.name})`} aria-pressed={state.clip===clip.name} disabled={!ready} onClick={()=>controller.current?.selectClip(clip.name)}>{clipLabels[clip.name]}</button>)}</div></fieldset>
   <p className="lab-note">此页只预览临时模型，不改变牧场存档。飞行与轻扑均限定在展示台内。</p>
  </div>
 </section></PhoneViewport></main>;
}
