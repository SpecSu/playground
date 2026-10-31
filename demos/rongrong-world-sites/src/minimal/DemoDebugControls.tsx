import {useEffect,useRef,useState} from 'react';
import type {AccountClient} from './account-client.ts';

/** Presentation only. Coins change through the same durable command/receipt
 * channel as purchases; a query name or a local save never enables this panel. */
export default function DemoDebugControls({client,disabledReason=''}:{client:AccountClient;disabledReason?:string}){
 const [,render]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState(''),epoch=useRef(0);
 useEffect(()=>{epoch.current++;setMessage('');setError('');const unsubscribe=client.subscribe(()=>render(n=>n+1));return()=>{epoch.current++;unsubscribe();};},[client]);
 if(!client.demoName)return null;
 const reason=disabledReason||(!client.farm?'先创建演示牧场':client.busy?'正在确认上一条指令…':client.pending?'上一条指令待确认，请使用下方重试':'');
 const grant=(amount:10000|50000)=>{
  if(reason||!client.demoName)return;const current=epoch.current;setMessage('');setError('');
  void client.command({type:'demoCoins',amount}).then(result=>{if(epoch.current===current)setMessage(result.message);}).catch(error=>{if(epoch.current!==current)return;const message=error instanceof Error?error.message:'连接中断，请重试同一条指令';if(client.pending)setError(message);else setMessage(message);});
 };
 return <section className="egg-model-retry" aria-label="演示调试"><strong>演示调试</strong><small>仅演示账号 · 不影响正式金币或交易</small><div className="egg-settings-row"><button type="button" aria-label="演示金币 +1万" disabled={!!reason} onClick={()=>grant(10000)}>+1万 金币</button><button type="button" aria-label="演示金币 +5万" disabled={!!reason} onClick={()=>grant(50000)}>+5万 金币</button></div>{(reason||message||error&&client.pending)&&<small role="status">{reason||message||error}</small>}</section>;
}
