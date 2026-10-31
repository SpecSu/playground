import NamedDemoTools from './NamedDemoTools.tsx';
import {useEffect,useState} from 'react';
import {Cloud,Copy,FolderHeart,Leaf,RefreshCw,ShieldCheck} from 'lucide-react';
import type {AccountClient} from './account-client.ts';
import {MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY,type MinimalState,type LegacyMinimalState} from './model.ts';
import './online-farm.css';
export function AccountCard({client}:{client:AccountClient}){
 const [copyHint,setCopyHint]=useState('复制 UID');return <div className="account-card"><strong>{client.account.handle}</strong><div className="account-uid">UID {client.account.uid}</div><button type="button" aria-label="复制账号 UID" onClick={()=>{if(!navigator.clipboard?.writeText){setCopyHint('长按 UID 复制');return;}void navigator.clipboard.writeText(client.account.uid).then(()=>setCopyHint('已复制')).catch(()=>setCopyHint('长按 UID 复制'));}}><Copy size={11}/> {copyHint}</button>{client.demoName&&<NamedDemoTools client={client}/>}</div>;
}
const hasLocalProgress=()=>{try{return !!(localStorage.getItem(MINIMAL_STORAGE_KEY)||localStorage.getItem(LEGACY_MINIMAL_STORAGE_KEY));}catch{return false;}};
export default function AccountGate({client,onReady}:{client:AccountClient;onReady:()=>void}){
 const [,render]=useState(0),[error,setError]=useState(''),[hasLegacy]=useState(()=>!client.demoName&&hasLocalProgress()),[working,setWorking]=useState(false),[confirmEmpty,setConfirmEmpty]=useState(false);
 useEffect(()=>client.subscribe(()=>render(n=>n+1)),[client]);
 const run=async(importOld:boolean)=>{if(working||client.busy||client.pending)return;setError('');setWorking(true);try{
  let result;
  if(importOld){if(client.demoName)throw new Error('测试账号不导入原牧场');const raw=localStorage.getItem(MINIMAL_STORAGE_KEY)??localStorage.getItem(LEGACY_MINIMAL_STORAGE_KEY);if(!raw)throw new Error('没有找到旧存档，原来的浏览器和地址可能不同');const legacySnapshot:unknown=JSON.parse(raw);result=await client.bootstrap({mode:'import',legacySnapshot:legacySnapshot as MinimalState|LegacyMinimalState});}
  else result=await client.bootstrap({mode:'new'});
  if(client.farm)onReady();else setError(result.message);
 }catch(error){setError(error instanceof Error?error.message:'连接暂时中断');}finally{setWorking(false);}};
 const retry=async()=>{setWorking(true);setError('');try{await client.retry();if(client.farm)onReady();}catch(error){setError(error instanceof Error?error.message:'连接暂时中断');}finally{setWorking(false);}};
 return <div className="account-gate"><section className="account-gate-card" aria-label="连接牧场账号"><span className="account-gate-badge"><ShieldCheck size={15}/>{client.demoName?'演示账号 · 独立测试存档':'已登录 · 账号独立存档'}</span><h2>把小家带在身边</h2><AccountCard client={client}/>
  {error&&<p className="online-message" role="alert">{error}</p>}
  {confirmEmpty&&!client.pending?<div className="account-empty-confirm" role="group" aria-label="确认新建空白云端牧场"><h3>另建一个空白云端牧场？</h3><p>本机原进度仍会保留。创建后，这个云端账号不能再导入原牧场。</p><button type="button" className="online-secondary" disabled={working} onClick={()=>setConfirmEmpty(false)}>保留原进度</button><button type="button" className="online-primary" disabled={working} onClick={()=>{setConfirmEmpty(false);void run(false);}}>创建空白云端牧场</button></div>:client.pending?<button type="button" className="online-primary" disabled={working||client.busy} onClick={()=>void retry()}><RefreshCw size={17}/>重试上次指令</button>:<>
   {hasLegacy&&<><button type="button" className="online-primary" disabled={working||!client.importLegacyAllowed} onClick={()=>void run(true)}><FolderHeart size={18}/>将原牧场带到云端</button><p>{client.importLegacyAllowed?'原本机存档完整保留，云端只导入一次。':'原牧场仍安全留在本机。绑定原牧场主 UID 后才能迁移。'}</p></>}
   <button type="button" className={hasLegacy?'online-secondary':'online-primary'} disabled={working} onClick={()=>hasLegacy||!client.demoName&&hasLocalProgress()?setConfirmEmpty(true):void run(false)}><Leaf size={18}/>创建新的小牧场</button>
  </>}
  <p><Cloud size={13}/>{client.demoName?'名称只选择此演示的测试存档，不是登录认证；与原账号、原本机牧场及另一部署的数据分开。':'UID 是账号标识，不是登录密码。输入别人的 UID 不会获得他的牧场。'}</p>
 </section></div>;
}
