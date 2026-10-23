import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife,feedingResult,type LifeState} from '../src/v5/life.ts';
const T=1_800_000_000_000,MINUTE=60_000;
async function rules(){const module=await import('../src/v5/herd-economy.ts').catch(()=>null);assert.ok(module,'the graded wool rules must exist');return module;}
const effectiveFeed=(life:LifeState,now:number)=>feedingResult({...life,hunger:55},{now,food:life.stage==='baby'?'milk':'feed',manual:true}).life;

test('legacy isolated rule: new husbandry separates baby stage, level, rarity and five named material tiers',async()=>{
 const m=await rules(),life=createLife(T),before=structuredClone(life),h=m.createHusbandry(T,'home',life,'plain');
 assert.equal(h.level,1);assert.equal(h.rarity,'white');assert.equal(h.effectiveFeeds,0);assert.deepEqual(h.pending,m.emptyStacks());assert.deepEqual(life,before);
 assert.deepEqual(m.TIERS,['white','green','blue','red','gold']);assert.deepEqual(m.TIERS.map(t=>m.TIER_VALUE[t]),[1,2,4,7,12]);assert.ok(m.TIERS.every(t=>m.TIER_LABEL[t]&&/^#[0-9a-f]{6}$/i.test(m.TIER_COLOR[t])));
});
test('legacy isolated rule: old earned wool imports once and starlit rarity survives later appearance changes',async()=>{
 const m=await rules(),life=createLife(T);life.products.stored=6;const h=m.createHusbandry(T,'home',life,'starlit');assert.equal(h.pending.white,6);assert.equal(h.rarity,'green');
 const synced=m.syncHusbandry(h,life,T);assert.equal(synced.pending.white,6);assert.equal(synced.rarity,'green');assert.equal(life.products.stored,6,'owner atomically retires old balance; pure rule does not mutate life');
 const first=m.claimWool(synced,m.createHerdEconomy(),T),second=m.claimWool(first.husbandry,first.economy,T);assert.equal(first.total,6);assert.equal(second.total,0);assert.equal(second.economy.warehouse.white,6);
});
test('legacy isolated rule: natural wool starts at level one, settles exact intervals and claims into a warehouse once',async()=>{
 const m=await rules(),h=m.createHusbandry(T,'home',createLife(T));let x=m.settleHusbandry(h,T+10*MINUTE-1);assert.equal(m.stackTotal(x.pending),0);
 x=m.settleHusbandry(x,T+10*MINUTE);assert.equal(x.pending.white,1);const first=m.claimWool(x,m.createHerdEconomy(),T+15*MINUTE);assert.equal(first.total,1);assert.equal(first.husbandry.progressMs,5*MINUTE);assert.equal(first.economy.warehouse.white,1);
 assert.equal(m.claimWool(first.husbandry,first.economy,T+15*MINUTE).total,0);assert.equal(m.settleHusbandry(first.husbandry,T+20*MINUTE).pending.white,1);assert.equal(h.pending.white,0);
});
test('legacy isolated rule: production fills at six and discards surplus time rather than releasing a hidden backlog',async()=>{
 const m=await rules();let h=m.createHusbandry(T,'home',createLife(T));h=m.settleHusbandry(h,T+100*24*60*MINUTE);assert.equal(h.pending.white,6);assert.equal(h.progressMs,0);
 const first=m.claimWool(h,m.createHerdEconomy(),T+101*24*60*MINUTE);assert.equal(first.total,6);assert.equal(m.claimWool(first.husbandry,first.economy,T+101*24*60*MINUTE).total,0);
 assert.equal(m.stackTotal(m.settleHusbandry(first.husbandry,first.husbandry.settledAt+10*MINUTE-1).pending),0);
});
test('legacy isolated rule: demonstration production is a separate 15-second clock and cannot be switched by settlement input',async()=>{
 const m=await rules(),life=createLife(T),home=m.createHusbandry(T,'home',life),lab=m.createHusbandry(T,'lab',life);
 assert.equal(m.settleHusbandry(home,T+15_000).pending.white,0);assert.equal(m.settleHusbandry(lab,T+15_000).pending.white,1);assert.equal(m.productSummary(lab,T).intervalMs,15_000);assert.equal(m.productSummary(home,T).intervalMs,10*MINUTE);
});
test('legacy isolated rule: level promotion settles historical production at the old grade, never recolors stored wool',async()=>{
 const m=await rules();let life=createLife(T),h=m.createHusbandry(T,'home',life);life=effectiveFeed(life,T+10*MINUTE);h=m.syncHusbandry(h,life,T+10*MINUTE);
 assert.equal(h.level,2);assert.equal(h.pending.white,1);assert.equal(h.pending.green,0);assert.equal(h.rarity,'white');h=m.settleHusbandry(h,T+20*MINUTE);assert.equal(h.pending.green,1);assert.equal(h.pending.white,1);
});
test('legacy isolated rule: valid feed timestamps advance husbandry once while ineffective supplements and repeated snapshots do not',async()=>{
 const m=await rules();let life=createLife(T),h=m.createHusbandry(T,'home',life);life=effectiveFeed(life,T);h=m.syncHusbandry(h,life,T);assert.equal(h.effectiveFeeds,1);
 for(let i=0;i<8;i++)h=m.syncHusbandry(h,life,T);assert.equal(h.effectiveFeeds,1);
 life=effectiveFeed(life,T+MINUTE);h=m.syncHusbandry(h,life,T+MINUTE);assert.equal(h.effectiveFeeds,1);assert.equal(h.level,2);
 life=effectiveFeed(life,T+30*MINUTE);h=m.syncHusbandry(h,life,T+30*MINUTE);assert.equal(h.effectiveFeeds,2);
});
test('legacy isolated rule: adult care can still reach level five without modifying life stages, bonds or growth records',async()=>{
 const m=await rules();let life=createLife(T,{stage:'adult'}),h=m.createHusbandry(T,'home',life);assert.equal(h.level,3);
 for(let i=0;i<9;i++){life=effectiveFeed(life,T+i*30*MINUTE);h=m.syncHusbandry(h,life,T+i*30*MINUTE);}
 assert.equal(h.level,5);assert.equal(h.effectiveFeeds,9);assert.equal(life.stage,'adult');assert.equal(life.care.baby.feeds,0);assert.equal(life.care.juvenile.feeds,0);assert.equal(m.productSummary(h,h.settledAt).tier,'gold');
});
test('legacy isolated rule: exchange uses actual grade values, rejects invalid or excessive amounts and never makes balances negative',async()=>{
 const m=await rules();let e=m.createHerdEconomy();e.warehouse={white:1,green:2,blue:3,red:4,gold:5};const before=structuredClone(e);
 for(const amount of [0,-1,1.5,Number.NaN,Infinity])assert.equal(m.exchangeWool(e,'gold',amount).accepted,false);
 assert.equal(m.exchangeWool(e,'gold',6).accepted,false);assert.equal(m.exchangeWool(e,'purple' as 'gold',1).accepted,false);
 const traded=m.exchangeWool(e,'gold',5,'legacy');assert.equal(traded.accepted,true);assert.equal(traded.materials,60);assert.equal(traded.economy.warehouse.gold,0);assert.equal(m.exchangeWool(traded.economy,'gold',5).accepted,false);assert.deepEqual(e,before);
 e=traded.economy;const spent=m.spendWool(e,{blue:2,red:1});assert.equal(spent.accepted,true);assert.equal(spent.economy.warehouse.blue,1);assert.equal(spent.economy.warehouse.red,3);assert.equal(m.spendWool(spent.economy,{gold:1}).accepted,false);assert.equal(m.spendWool(e,{white:-1}).accepted,false);
});
test('legacy isolated rule: V6 preserves old rarity labels without spending on pure label cultivation',async()=>{
 const m=await rules(),life=createLife(T);life.care.baby.feeds=3;const h=m.createHusbandry(T,'home',life,'starlit'),e=m.createHerdEconomy();e.warehouse.blue=4;const r=m.cultivateHusbandry(h,e,T,'green');assert.equal(r.accepted,false);assert.match(r.message,/已暂停/);assert.deepEqual(r.husbandry,h);assert.deepEqual(r.economy,e);
});
test('legacy isolated rule: summary supplies a truthful countdown, cap and typed grade without modifying settlement',async()=>{
 const m=await rules(),h=m.createHusbandry(T,'home',createLife(T)),before=structuredClone(h),s=m.productSummary(h,T+3*MINUTE);
 assert.equal(s.nextReadyInMs,7*MINUTE);assert.equal(s.total,0);assert.equal(s.cap,6);assert.equal(s.tier,'white');assert.equal(s.full,false);assert.deepEqual(h,before);
 const full=m.productSummary(h,T+60*MINUTE);assert.equal(full.full,true);assert.equal(full.nextReadyInMs,null);assert.equal(full.total,6);
});
test('legacy isolated rule: nonfinite time rejects and rollback cannot duplicate production or grant later care early',async()=>{
 const m=await rules(),life=createLife(T),h=m.createHusbandry(T,'home',life);assert.throws(()=>m.createHusbandry(NaN,'home',life),/finite/);assert.throws(()=>m.settleHusbandry(h,NaN),/finite/);assert.deepEqual(m.settleHusbandry(h,T-1),h);
 const fed=effectiveFeed(life,T+30*MINUTE);assert.equal(m.syncHusbandry(h,fed,T-1).effectiveFeeds,0);assert.equal(m.syncHusbandry(h,fed,T).effectiveFeeds,0);
});
