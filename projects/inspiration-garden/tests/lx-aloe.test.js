import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEMO_VARIETIES,matchIdeas} from '../src/catalogue.js';
const source=JSON.parse(fs.readFileSync('assets/garden-compositions.json'));
const lx=source.gardens.find(g=>g.theme==='tech');
const aloe='lx_silver_biofern';
test('LX legacy plant identity now presents an unmistakable aloe without new economy or author',()=>{
 const v=DEMO_VARIETIES['demo-'+aloe];assert.equal(v.name,'银序芦荟');assert.equal(v.artKey,aloe);assert.equal(v.authorId,'demo-lx');assert.equal(v.rootId,v.id);assert.equal(v.interaction,'pulse');assert.deepEqual([v.seedPrice,v.salePrice,v.growMs],[90,140,720000]);assert.equal(matchIdeas('厚叶芦荟')[0].id,aloe);
 const sprite=JSON.parse(fs.readFileSync('assets/art-manifest.json')).sprites[aloe];assert.equal(sprite.displayName,'银序芦荟');assert.match(sprite.image,/aloe/);assert.ok(fs.statSync(sprite.image).size<150000);
});
test('LX aloe forms even facade and front border rows rather than mixed-scale scattered fern specimens',()=>{
 const plants=lx.plants.filter(p=>p.art===aloe);assert.equal(plants.length,9);assert.equal(new Set(plants.map(p=>p.scale)).size,1);
 for(const row of [[[0,2],[1,2],[2,2]],[[3,4],[4,4],[5,4]],[[2,0],[3,0]]])for(const [x,z]of row)assert.ok(plants.some(p=>p.x===x&&p.z===z),`missing aloe row cell ${x}:${z}`);
 assert.equal(new Set(lx.plants.filter(p=>p.art==='lx_orbital_bloom').map(p=>p.scale)).size,1);
});

test('aloe rearrangement leaves other islands, LX landmarks, support cells and all occupied cells unchanged',async()=>{
 const {createHash}=await import('node:crypto'),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 const expected={'demo-kelly-music':'428628fa0830c6604ed0ff3a7b5cccf883bc98e46b05cf55262de69f72665a46','demo-bear-moon':'f2878502a2136c89b0872dc665d0f84320dad4add6b628b34ada805765d9bb80','demo-frog-sea':'00cf0183c92a3337de956af6ddae22b66088b1444cd4882023f0920b94eca039'};
 for(const g of source.gardens.filter(g=>g.theme!=='tech'))assert.equal(hash(g),expected[g.id],g.id);
 assert.equal(hash(lx.buildings),'d7932de798254fa521c30a6b390943b8eece2963d686bdf183e4ab3c9ddbe5f9');
 assert.deepEqual(lx.plants.map(p=>[p.x,p.z]).sort(),[[-1,3],[0,2],[0,4],[0,5],[1,2],[1,4],[2,0],[2,2],[3,0],[3,4],[4,4],[5,1],[5,4],[6,5]].sort());
 assert.equal(lx.cells.length,36);assert.equal(hash(lx.cells),'e73a9b1d5bac7e63075f50c6440da71dbd2f1003b4493dbe0e4abc2c62b2f87b');
});

test('previously collected silver fern records load unchanged and share current aloe seed identity and quota',async()=>{
 const {createState,isValidVariety,sameVariety,getVariety,reduce}=await import('../src/state.js');const {saveGame,loadGame,validateState,SAVE_KEY}=await import('../src/storage.js');
 const current=DEMO_VARIETIES['demo-'+aloe],old={...current,name:'银序生物蕨',keywords:['银序生物蕨','银叶蕨','生物蕨'],description:'银色叶片按精密的节律展开，一点微光沿叶脉安静流动。',gesture:'轻碰银叶，看微光沿着叶脉旅行'};
 for(const tariff of [[90,140,720000],[18,28,90000]]){
  const legacy={...old,seedPrice:tariff[0],salePrice:tariff[1],growMs:tariff[2]};let s=createState(1000);s.varieties[legacy.id]=legacy;s.inventory[legacy.id]=2;s.discovered.push(legacy.id);
  assert.equal(isValidVariety(legacy),true);assert.equal(validateState(s),true);assert.equal(sameVariety(legacy,current),true);assert.equal(getVariety(s,legacy.id).name,'银序芦荟');
  const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};saveGame(storage,s);const raw=map.get(SAVE_KEY),loaded=loadGame(storage);assert.deepEqual(loaded.state.varieties[legacy.id],legacy);assert.equal(map.get(SAVE_KEY),raw);
  const g=(await import('../src/catalogue.js')).DEMO_GARDENS.find(g=>g.theme==='tech'),p=g.plants.find(p=>p.varietyId===legacy.id);
  for(const at of [1000,86401000]){s=reduce(s,{type:'INTERACT_DEMO',gardenId:g.id,plantId:p.id},at).state;const claim=reduce(s,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id},at);assert.equal(claim.ok,true);s=claim.state;assert.deepEqual(s.varieties[legacy.id],legacy);assert.equal(reduce(s,{type:'CLAIM_SEED',gardenId:g.id,plantId:p.id},at).ok,false);}
  assert.equal(s.inventory[legacy.id],4);
 }
 for(const changed of [{name:'伪造芦荟'},{artKey:'lx_orbital_bloom'},{interaction:'glow'},{authorId:'another-owner'},{rootId:'another-root'},{seedPrice:9999}])assert.equal(sameVariety({...old,...changed},current),false);
 assert.equal(isValidVariety({...old,name:'伪造芦荟'}),false);assert.equal(isValidVariety({...old,seedPrice:9999}),false);
});
