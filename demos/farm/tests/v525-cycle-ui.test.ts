import test from 'node:test';
import assert from 'node:assert/strict';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {createEstate,currentProfile,type Profile} from '../src/v5/estate.ts';
const T=1_800_000_000_000;
const stacks=(white=0)=>({white,green:0,blue:0,red:0,gold:0});
function profile(){const p=currentProfile(createEstate('cycle-ui',T));p.tutorial='done';p.threat=null;p.guardian='dog';p.milestones.push('first-meal');Object.assign(p,{economy:{version:1,warehouse:stacks(4)},upgrades:{guardians:{dog:1,cat:1,frog:1},shelters:{}}});for(const a of p.animals)Object.assign(a,{husbandry:{version:1,profile:'home',level:2,rarity:'white',settledAt:T,progressMs:0,pending:stacks(2),effectiveFeeds:1,lastEffectiveFeedAt:null}});return p;}
async function module(){const loaded=await import('../src/v5/FarmCyclePanel.tsx').catch(()=>null);assert.ok(loaded,'the farm cycle panel must expose real produce, protection and raid choices');return loaded;}
async function mount(p:Profile,busy=false){
 const {default:FarmCyclePanel}=await module();const browser=new Window(),keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));Object.defineProperties(globalThis,{window:{value:browser,configurable:true},document:{value:browser.document,configurable:true},navigator:{value:browser.navigator,configurable:true},IS_REACT_ACT_ENVIRONMENT:{value:true,configurable:true}});
 const host=browser.document.createElement('div');browser.document.body.append(host);const root=createRoot(host as unknown as HTMLElement),commands:{type:string;extra?:Record<string,unknown>}[]=[];
 const render=async(next:Profile,nextBusy=false)=>act(async()=>root.render(createElement(FarmCyclePanel,{profile:next,now:T,busy:nextBusy,send:(type,extra)=>commands.push({type,extra})})));
 await render(p,busy);return {host,commands,render,click:async(selector:string)=>act(async()=>{const b=host.querySelector<HappyButton>(selector);assert.ok(b,selector);b.click();}),cleanup:async()=>{await act(async()=>root.unmount());for(const k of keys){const d=previous.get(k);if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}await browser.happyDOM.close();}};
}
test('produce starts with five readable coloured grades and explicit claim/exchange actions',async()=>{
 const h=await mount(profile());try{assert.equal(h.host.querySelectorAll('[data-wool-tier]').length,5);for(const text of ['产物','守护','来袭','白','绿','蓝','红','金','羊毛','材料'])assert.ok(h.host.textContent.includes(text),text);assert.equal(h.commands.length,0);await h.click('[data-cycle-command="claim-all"]');assert.equal(h.commands[0].type,'claimWool');}finally{await h.cleanup();}
});
test('a warehouse exchange sends the selected visible grade once, never all inventory silently',async()=>{
 const h=await mount(profile());try{await h.click('[data-exchange-tier="white"]');await h.click('[data-exchange-tier="white"]');assert.deepEqual(h.commands,[{type:'exchangeWool',extra:{tier:'white',amount:1}}]);assert.ok(h.host.querySelector<HappyButton>('[data-exchange-tier="gold"]')?.disabled);}finally{await h.cleanup();}
});
test('guardian and enclosure upgrades carry their observed level and display actual differences',async()=>{
 const h=await mount(profile());try{await h.click('[data-cycle-tab="defense"]');assert.match(h.host.textContent,/24材料/);assert.match(h.host.textContent,/6秒.*8秒/);await h.click('[data-upgrade-guardian="dog"]');await h.click('[data-upgrade-guardian="dog"]');assert.deepEqual(h.commands,[{type:'upgradeGuardian',extra:{guardian:'dog',expectedLevel:1}}]);await h.render(profile());await h.click('[data-cycle-tab="defense"]');assert.match(h.host.textContent,/6个安全位/);assert.match(h.host.textContent,/1秒.*0\.8秒/);}finally{await h.cleanup();}
});
test('raid rules explain live variable pressure and offline safety without a fake exact arrival clock',async()=>{
 const h=await mount(profile());try{await h.click('[data-cycle-tab="raids"]');assert.match(h.host.textContent,/数量.*稀有度/);assert.match(h.host.textContent,/离线不/);assert.match(h.host.textContent,/预警/);assert.doesNotMatch(h.host.textContent,/距离下一次袭击[：:]?\s*\d+秒/);assert.equal(h.commands.length,0);}finally{await h.cleanup();}
});
test('no free bed or unfinished care keeps adoption unavailable with a reason',async()=>{
 const p=profile();p.layout.buildings=p.layout.buildings.filter(b=>b.kind!=='shelter');const h=await mount(p);try{assert.ok(h.host.querySelector<HappyButton>('[data-cycle-command="adopt"]')?.disabled);assert.match(h.host.textContent,/保护区|安全位/);await h.click('[data-cycle-command="adopt"]');assert.equal(h.commands.length,0);}finally{await h.cleanup();}
});
test('an active threat freezes purchases and upgrades rather than hiding why',async()=>{
 const p=profile();p.threat=createEstate('event',T).profiles.home.threat;const h=await mount(p);try{await h.click('[data-cycle-tab="defense"]');assert.ok(h.host.querySelector<HappyButton>('[data-upgrade-guardian="dog"]')?.disabled);assert.match(h.host.textContent,/守护.*结束/);await h.click('[data-upgrade-guardian="dog"]');assert.equal(h.commands.length,0);}finally{await h.cleanup();}
});


test('cultivation shows a real recipe and preserves the observed rarity in its command',async()=>{
 const h=await mount(profile());try{assert.match(h.host.textContent,/4份普通及以上羊毛/);await h.click('[data-cultivate="pipi"]');await h.click('[data-cultivate="pipi"]');assert.deepEqual(h.commands,[{type:'cultivate',extra:{target:'pipi',expectedRarity:'white'}}]);}finally{await h.cleanup();}
});
test('lab acceleration is clearly marked and high rarity changes the actual displayed risk',async()=>{
 const p=profile();p.id='lab';for(const animal of p.animals)Object.assign(animal,{husbandry:{version:1,profile:'lab',level:5,rarity:'gold',settledAt:T,progressMs:0,pending:stacks(),effectiveFeeds:9,lastEffectiveFeedAt:null}});
 const h=await mount(p);try{assert.match(h.host.textContent,/独立演示档.*产毛15秒.*来袭30–60在线秒/);await h.click('[data-cycle-tab="raids"]');assert.match(h.host.textContent,/当前压力：高/);assert.match(h.host.textContent,/通常 3 只狼/);}finally{await h.cleanup();}
});
test('active protection blocks cultivation with a reason while stored wool can still be claimed',async()=>{
 const p=profile();p.threat=createEstate('cultivate-event',T).profiles.home.threat;const h=await mount(p);try{assert.ok(h.host.querySelector<HappyButton>('[data-cultivate="pipi"]')?.disabled);assert.match(h.host.textContent,/守护结束后再培育/);assert.equal(h.host.querySelector<HappyButton>('[data-cycle-command="claim-all"]')?.disabled,false);}finally{await h.cleanup();}
});
