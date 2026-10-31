import {PanelHelp} from './PanelHelp.tsx';
import type {MinimalCommand,MinimalState} from './model.ts';
import {isAnimalProviderReady,isLegacySpecies} from './species.ts';
import {alpacaProvider,alpacaProviderStatusLabel} from './alpaca-provider.ts';
import {penguinProvider} from './penguin-provider.ts';
export type AlpacaResourceControlsProps={state:MinimalState;disabled?:boolean;onCommand:(command:MinimalCommand)=>unknown};
/** Command presentation only: the existing model/authority owns validation,
 * persistence and retries. No account-local optimistic or pending state lives here. */
export default function AlpacaResourceControls({state,disabled=false,onCommand}:AlpacaResourceControlsProps){
 const demos=[{species:'alpaca',label:'羊驼',status:alpacaProvider.status()},{species:'penguin',label:'企鹅',status:penguinProvider.status()}].filter(item=>item.status.state==='demo-ready');
 const held=state.animals.find(a=>a.id===state.carriedAnimalId&&!isLegacySpecies(a.species)&&a.activity==='carried'&&!a.resourceSuspended&&!isAnimalProviderReady(a.species));
 const suspended=state.animals.filter(a=>!isLegacySpecies(a.species)&&a.resourceSuspended===true);
 if(!held&&!suspended.length&&!demos.length)return null;
 return <section className="egg-model-retry" aria-label={held||suspended.length?'伙伴资源恢复':'伙伴演示资源'}>
  {demos.map(({species,label,status})=><div key={species} role="status"><strong>{label} · {alpacaProviderStatusLabel(status)}</strong><p>{status.admission?.mobilePerformance?.status==='unmeasured'?'演示版本，未做移动端 GPU/FPS 测量，不代表完整生产验收。':'演示版本，不代表完整生产验收。'}</p>{species==='alpaca'&&<PanelHelp title="羊驼水源"><p>羊驼使用池塘；体型达到 0.75 后可用高碗，更小体型只用池塘；浅溪本版未开放。</p></PanelHelp>}{species==='penguin'&&<PanelHelp title="企鹅水源"><p>企鹅只使用浅溪和池塘水源，暂不使用高水碗。</p></PanelHelp>}</div>)}
  {(held||suspended.length>0)&&<p>伙伴仍归你所有，继续占用动物名额；暂停不会出售或删除它，也不会改变金币。</p>}
  {held&&<div key={held.id}><strong>{held.name}</strong><p>模型暂不可用。暂停携带后可以继续照料其他伙伴，稍后再恢复放置。</p><button type="button" aria-label={`暂停携带 ${held.name}`} disabled={disabled} onClick={()=>{if(!disabled&&!isAnimalProviderReady(held.species))onCommand({type:'suspendUnavailableCarry'});}}>暂停携带</button></div>}
  {suspended.map(animal=>{const available=isAnimalProviderReady(animal.species);return <div key={animal.id}><strong>{animal.name}</strong><p>{available?'恢复时会在你身边寻找安全空地；没有合适位置时仍保留暂停状态。':'模型暂不可用，请先重试动物模型。恢复后不会自动放置。'}</p><button type="button" aria-label={`恢复放置 ${animal.name}`} disabled={disabled||!available} onClick={()=>{if(!disabled&&isAnimalProviderReady(animal.species))onCommand({type:'resumeSuspendedAnimal',animalId:animal.id});}}>恢复放置</button></div>;})}
 </section>;
}
