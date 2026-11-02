'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {FishingTransport} from '@/lib/fishing-client';
import type {FishingInput,FishingSnapshot} from '@/lib/fishing-types';
export function useFishingRoom(onCatch?:(catchId:string)=>void,onCast?:(castId:string)=>void){
 const catchCallback=useRef(onCatch),castCallback=useRef(onCast);
 const transport=useRef<FishingTransport|null>(null);
 const [snapshot,setSnapshot]=useState<FishingSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[connected,setConnected]=useState(false),[offset,setOffset]=useState(0),[uncertain,setUncertain]=useState(false);
 const alive=useRef(true),busy=useRef(false);
 const apply=useCallback((next:FishingSnapshot,client:FishingTransport)=>{if(alive.current&&transport.current===client){setSnapshot(next);setOffset(client.clockOffsetMs);setError('');setConnected(true);}},[]);
 const refresh=useCallback(async()=>{const client=transport.current;if(!client)return;try{apply(await client.refresh(),client);}catch(e){if(alive.current&&transport.current===client){setError(e instanceof Error?e.message:'海上信号暂时中断');setConnected(false);}}},[apply]);
 const perform=useCallback(async(input:FishingInput)=>{const client=transport.current;if(busy.current||!client)return null;busy.current=true;setPending(true);try{const next=await client.send(input);if(!alive.current||transport.current!==client)return null;apply(next,client);setUncertain(false);return next;}catch(e){if(alive.current&&transport.current===client){setError(e instanceof Error?e.message:'操作没有完成，请重试。');setUncertain(client.hasPending);if(client.snapshot){setSnapshot(client.snapshot);setOffset(client.clockOffsetMs);}}return null;}finally{if(transport.current===client){busy.current=false;if(alive.current)setPending(false);}}},[apply]);
 useEffect(()=>{alive.current=true;const client=new FishingTransport(undefined,id=>{if(alive.current&&transport.current===client)catchCallback.current?.(id);},id=>{if(alive.current&&transport.current===client)castCallback.current?.(id);});transport.current=client;busy.current=false;let stopped=false;let timer:ReturnType<typeof setTimeout>;let heartbeat=Date.now();const poll=async()=>{if(stopped)return;if(!document.hidden){await refresh();if(stopped)return;if(client.snapshot?.self.role==='participant'&&Date.now()-heartbeat>18000&&!busy.current&&!client.hasPending){heartbeat=Date.now();await perform({type:'heartbeat'});}}
 if(stopped)return;const state=client.snapshot?.self.fishing.phase;timer=setTimeout(poll,document.hidden?3000:state==='waiting'||state==='bite'?700:1300);};void poll();const visible=()=>{if(!stopped&&!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);return()=>{stopped=true;alive.current=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};},[refresh,perform]);
 useEffect(()=>{catchCallback.current=onCatch;castCallback.current=onCast;},[onCatch,onCast]);
 return {snapshot,error,pending,connected,offset,uncertain,perform,refresh};
}
