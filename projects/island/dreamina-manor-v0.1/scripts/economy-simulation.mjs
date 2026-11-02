import {ECONOMY} from '../lib/game/economy.js';
import {rollProduct,seededRandom} from '../lib/game/random.js';
const candidate={...ECONOMY,version:'pm-review-20261022',growSeconds:[15,45,120,300,540],giantSize:[1.3,1.3],mutationChance:{giant:.06,gold:.02}};
function yields(cfg){const rows=[];for(let tier=1;tier<=5;tier++){let sum=0,min=Infinity,max=0,up=0,gold=0,giant=0;const n=20000;for(let k=0;k<n;k++){const p=rollProduct('plant',tier,k,'sample',0,cfg);sum+=p.value;min=Math.min(min,p.value);max=Math.max(max,p.value);up+=p.tier>tier;gold+=p.mutation==='gold';giant+=p.mutation==='giant';}rows.push({tier,cost:cfg.inputCosts[tier-1],seconds:cfg.growSeconds[tier-1],meanSale:+(sum/n).toFixed(2),minSale:min,maxSale:max,netPerOccupiedSecond:+((sum/n-cfg.inputCosts[tier-1])/cfg.growSeconds[tier-1]).toFixed(4),upgradeObserved:+(up/n).toFixed(4),goldObserved:+(gold/n).toFixed(4),giantObserved:+(giant/n).toFixed(4)});}return rows;}
function journey(seed,keepRate,limit=1800){
 const rng=seededRandom(seed),cfg=candidate;let now=0,coins=24,free=1,firstPlant=true,nextId=0,slots=4,land=false,dock=false,keepValue=0,kept=0;
 const jobs=[],first={},marks={};let emergencyClaims=0;
 const remember=(seconds)=>{if(!marks[seconds])marks[seconds]={coins,collectibleSaleValue:keepValue,liquidPlusCollection:coins+keepValue,productiveInputs:jobs.reduce((n,j)=>n+j.cost,0),land:slots,dock,kept,emergencyClaims};};
 const maybeBuild=()=>{if(!land&&coins>=60+(slots+1)*8){coins-=60;slots++;land=true;first.land=now;}else if(land&&!dock&&coins>=60+(slots+1)*8){coins-=60;dock=true;first.dock=now;}};
 const fill=()=>{
  let empty=slots+(dock?1:0)-jobs.length;
  while(empty>0){
   const occupied=new Set(jobs.map(j=>j.slot));const slot=Array.from({length:slots+(dock?1:0)},(_,i)=>i).find(i=>!occupied.has(i));const kind=slot===slots?'fish':'plant';
   let tier=1,cost=8;if(free&&kind==='plant'){cost=0;free--;}
   else if(land&&dock){for(let t=5;t>=1;t--)if(coins>=cfg.inputCosts[t-1]+Math.max(0,empty-1)*8){tier=t;cost=cfg.inputCosts[t-1];break;}}
   if(coins<cost){if(!jobs.length&&coins<8&&kind==='plant'){cost=0;tier=1;emergencyClaims++;}else break;}
   coins-=cost;now+=4;const duration=kind==='plant'&&firstPlant?10:cfg.growSeconds[tier-1];if(kind==='plant')firstPlant=false;
   const product=rollProduct(kind,tier,Math.floor(rng()*4294967296),`sim-${nextId++}`,now*1000,cfg);
   if(kind==='fish')first.cast??=now;
   jobs.push({slot,kind,cost,ready:now+duration,product});empty--;
  }
 };
 fill();
 for(let count=0;count<3000&&now<limit;count++){
  if(!jobs.length)break;jobs.sort((a,b)=>a.ready-b.ready);const job=jobs.shift();const done=Math.max(now,job.ready)+4;
  if(now<600&&done>=600)remember(600);if(done>=limit){remember(limit);break;}now=done;
  first.harvest??=now;if(job.kind==='fish')first.fish??=now;if(job.product.tier>=3)first.rare??=now;
  if(rng()<keepRate){keepValue+=job.product.value;kept++;}else coins+=job.product.value;
  maybeBuild();fill();if(now>=600)remember(600);
 }
 remember(600);remember(limit);return{first,marks};
}
const quantiles=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {n:v.length,p10:v[Math.floor((v.length-1)*.1)],p50:v[Math.floor((v.length-1)*.5)],p90:v[Math.floor((v.length-1)*.9)]};};
function portfolio(keepRate){const runs=Array.from({length:1000},(_,i)=>journey(i+1,keepRate));const report={};for(const k of ['harvest','land','cast','fish','rare'])report[k+'Seconds']=quantiles(runs.map(r=>r.first[k]));for(const seconds of [600,1800])report[seconds+'s']={coins:quantiles(runs.map(r=>r.marks[seconds].coins)),liquidPlusCollection:quantiles(runs.map(r=>r.marks[seconds].liquidPlusCollection)),productiveInputs:quantiles(runs.map(r=>r.marks[seconds].productiveInputs))};return report;}
console.log(JSON.stringify({notice:'Simulation, not measured player experience. Server fixed rolls are sampled; policy is an active reinvestor, not a human forecast.',assumptions:{samplesPerTier:20000,journeysPerPolicy:1000,approachAndPlantSeconds:4,approachAndHarvestSeconds:4,firstPlantGrowSeconds:10,firstLandPrice:60,firstDockPrice:60,noTankPurchase:true,collectionStaysInBackpack:true,firstRareMeansTier3OrHigher:true,mutationsDoNotCountAsRare:true,noTheftOrGifts:true},oldCandidate:yields(ECONOMY),pmCandidate:yields(candidate),sellAll:portfolio(0),keepQuarter:portfolio(.25)},null,2));
