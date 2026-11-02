/** View-only purchase continuity. No state writes, global event cancellation or timers. */
export function capturePurchaseScroll(container,excludeId=null){
 if(!container)return null;const top=container.scrollTop??0,rect=container.getBoundingClientRect?.();
 const anchor=rect?[...(container.querySelectorAll?.('[data-seed-id]')??[])].find(node=>node.dataset.seedId!==excludeId&&node.getBoundingClientRect().bottom>rect.top&&node.getBoundingClientRect().top<rect.bottom):null;
 return {top,anchorId:anchor?.dataset.seedId??null,offset:anchor?anchor.getBoundingClientRect().top-rect.top:0};
}
export function restorePurchaseScroll(container,snapshot){
 if(!container||!snapshot)return;container.scrollTop=snapshot.top;
 const anchor=snapshot.anchorId?[...(container.querySelectorAll?.('[data-seed-id]')??[])].find(node=>node.dataset.seedId===snapshot.anchorId):null;
 if(anchor&&container.getBoundingClientRect)container.scrollTop+=anchor.getBoundingClientRect().top-container.getBoundingClientRect().top-snapshot.offset;
}
export function patchPurchaseRail(rail,summary){
 if(!rail||!summary)return;const count=rail.querySelector('[data-purchase-count]'),repeat=rail.querySelector('[data-action="repeat-buy-seed"]');
 if(count)count.textContent=`已有 ${summary.count} 颗`;if(repeat){repeat.textContent=`+1 · ${summary.price} 金币`;repeat.disabled=!summary.canRepeat;}
}
/** Reconcile keyed cards and native controls; no modal/session or whole-grid input lock. */
export function patchSeedContent(container,html,doc=globalThis.document){
 const grid=container?.querySelector?.('.seed-grid');if(!grid||!doc?.createElement)return false;
 const template=doc.createElement('template');template.innerHTML=html;const fresh=template.content?.querySelector?.('.seed-grid');if(!fresh)return false;
 const active=doc.activeElement,restoreFocus=!!active?.dataset?.seedControl&&container.contains(active),oldCards=new Map([...grid.querySelectorAll('[data-seed-id]')].map(c=>[c.dataset.seedId,c]));
 for(const card of [...fresh.children]){const old=oldCards.get(card.dataset.seedId);if(!old)continue;const controls=new Map([...old.querySelectorAll('[data-seed-control]')].map(b=>[b.dataset.seedControl,b]));
  for(const next of [...card.querySelectorAll('[data-seed-control]')]){const button=controls.get(next.dataset.seedControl);if(!button)continue;for(const a of [...button.attributes])if(!next.hasAttribute(a.name))button.removeAttribute(a.name);for(const a of [...next.attributes])button.setAttribute(a.name,a.value);if(button.innerHTML!==next.innerHTML)button.innerHTML=next.innerHTML;next.replaceWith(button);}
  old.className=card.className;old.replaceChildren(...card.childNodes);card.replaceWith(old);
 }
 grid.replaceChildren(...fresh.childNodes);fresh.replaceWith(grid);container.replaceChildren(...template.content.childNodes);if(restoreFocus)active.focus({preventScroll:true});return true;
}
/** Invisible intent ownership only: no economic decision, timers, overlay or blanket inert mode. */
export function createPurchaseIntentGuard(){let reflow=null;const down=new Map(),canceled=new Set();return {
 down(event,button){if(event.pointerId!==undefined){down.set(event.pointerId,{action:button?.dataset?.action,id:button?.dataset?.id});canceled.delete(event.pointerId);}},cancel(event){if(event.pointerId!==undefined){down.delete(event.pointerId);canceled.add(event.pointerId);}},
 reflow(value){if(Number.isFinite(value?.x)&&Number.isFinite(value?.y))reflow=value;},clear(){reflow=null;down.clear();canceled.clear();},
 accept(event,button,at){if(event.detail===0&&!event.pointerType)return true;const prior=down.get(event.pointerId);down.delete(event.pointerId);if(canceled.delete(event.pointerId))return false;if(prior&&(prior.action!==button?.dataset?.action||prior.id!==button?.dataset?.id))return false;
  return !(reflow&&at-reflow.at<500&&Math.hypot(event.clientX-reflow.x,event.clientY-reflow.y)<26&&(button?.dataset?.action!=='buy-seed'||button?.dataset?.id!==reflow.id));}
};}
