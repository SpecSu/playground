import {useId,useLayoutEffect,useRef} from 'react';
import {Check,PawPrint} from 'lucide-react';
import type {CanonicalFarm} from './cloud-contract.ts';
import type {BoardingParent} from './boarding-contract.ts';
import {SPECIES_LABELS} from './model.ts';
import {animalPortrait} from './species.ts';
import {RarityBadge} from './RarityBadge.tsx';
import {CREATIVE_CATALOG,creativeTemplate} from './creative-assets.ts';
import {boardingAnimalIssue} from './boarding-ui.ts';
/** The existing boarding portrait content is shared by read-only and selectable cards. */
function AnimalSummary({animal,caption,customTemplateId}:{animal:BoardingParent;caption?:string;customTemplateId?:string}){const custom=customTemplateId!==undefined,template=custom?creativeTemplate(CREATIVE_CATALOG,customTemplateId):undefined,portrait=custom?(template?.kind==='creature'?template.portraitUrl:undefined):animalPortrait(animal.species);return <>{portrait?<img src={portrait} alt="" width="48" height="48" draggable={false}/>:<PawPrint aria-hidden="true" size={32}/>}<span className="boarding-animal-copy">{caption&&<small>{caption}</small>}<strong>{animal.name}</strong><small>{custom?'自定义小伙伴':SPECIES_LABELS[animal.species]??animal.species} · {animal.sex==='female'?'♀ 母':'♂ 公'}</small><RarityBadge rarity={animal.rarity} fixed={custom}/></span></>;}
export function BoardingParentCard({animal,guest}:{animal:BoardingParent;guest:boolean}){return <div className="boarding-parent" data-boarding-parent><AnimalSummary animal={animal} caption={guest?'好友伙伴 · 寄养客人':'你的伙伴'}/></div>;}
export function BoardingAnimalChoices({farm,now,parent,label,selectedId,disabledReason,onSelect}:{farm:CanonicalFarm;now:number;parent?:BoardingParent;label:string;selectedId:string;disabledReason?:string|null;onSelect:(id:string)=>void}){
 const headingId=useId(),heading=useRef<HTMLHeadingElement>(null),focusedCard=useRef<HTMLButtonElement|null>(null);
 const options=farm.state.animals.map(animal=>({animal,issue:boardingAnimalIssue(farm,animal,now,parent),customTemplateId:animal.creative?.templateId??farm.creative?.assets.find(asset=>asset.id===animal.id)?.templateId}));
 useLayoutEffect(()=>{
  if(selectedId&&!options.some(option=>option.animal.id===selectedId&&!option.issue))onSelect('');
  const focused=focusedCard.current,active=document.activeElement;
  if(focused&&(!focused.isConnected||focused.disabled)&&(!active||active===document.body||active===focused||!active.isConnected)){
   focusedCard.current=null;if(!heading.current?.closest('[inert]')&&!document.querySelector('[data-panel-help]'))heading.current?.focus({preventScroll:true});
  }
 });
 return <section className="boarding-choice-section"><h4 id={headingId} ref={heading} tabIndex={-1} data-boarding-choice-heading>{label}</h4><div className="boarding-choices" role="group" aria-labelledby={headingId} data-boarding-choices>{options.map(({animal,issue,customTemplateId})=>{const reason=issue??disabledReason,selected=selectedId===animal.id&&!issue;return <button key={animal.id} type="button" className="boarding-choice" data-boarding-choice={animal.id} disabled={!!reason} aria-pressed={selected} onFocus={event=>{focusedCard.current=event.currentTarget;}} onClick={()=>onSelect(animal.id)}><AnimalSummary animal={animal} customTemplateId={customTemplateId}/>{selected&&<Check className="boarding-choice-check" aria-hidden="true" size={17}/>}<span className={`boarding-choice-state${reason?' is-unavailable':''}`}>{reason??(selected?'已选择':'可寄养')}</span></button>;})}</div>{!options.length&&<small className="boarding-reason">还没有可寄养的伙伴</small>}</section>;
}
