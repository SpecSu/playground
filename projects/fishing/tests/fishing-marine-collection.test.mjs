import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import {MARINE_SPECIES,RARITIES} from '../lib/fishing-catalog.ts';

const feed=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8');
const jsx=(type,props)=>({type,props});
const elements=tree=>Array.isArray(tree)?tree.flatMap(elements):tree?.props?[tree,...elements(tree.props.children)]:[];
const visibleText=tree=>Array.isArray(tree)?tree.map(visibleText).join(''):tree?.props?visibleText(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';
function renderCollection(inventory={total:0,species:{}},collectionOnly=false,notify=()=>{}){
 const declaration=feed.match(/ const visibleSpecies=[^\n]+/)[0];
 const bag=feed.match(/ const renderBag=([\s\S]*?);\n/)[1];
 const compiled=ts.transpileModule(`${declaration}; exports.render=()=>(${bag})();`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require:()=>({jsx,jsxs:jsx,Fragment:'fragment'}),MARINE_SPECIES,RARITIES,inventory,collectionOnly,query:'',discovered:Object.keys(inventory.species).length,Waves:'waves',Check:'check',setCollectionOnly(){},setQuery(){},notify});
 return elements(exports.render()).filter(n=>n.type==='button'&&n.props.className?.startsWith('marine-card'));
}
test('unknown collection cards show black silhouettes, discovery status and rarity without size metrics',()=>{
 const cards=renderCollection();assert.equal(cards.length,20);
 cards.forEach((card,i)=>{
  const nodes=elements(card),statusIndex=nodes.findIndex(n=>n.type==='small'),rarityIndex=nodes.findIndex(n=>n.props.className==='marine-rarity');
  assert.ok(nodes.some(n=>n.props.className==='marine-image'),'image has its own transparent silhouette container');
  assert.ok(rarityIndex>statusIndex,'rarity follows discovery status instead of top badge');
  assert.equal(nodes[statusIndex].props.children,'尚未发现');
  assert.equal(nodes[rarityIndex].props.children,RARITIES[MARINE_SPECIES[i].rarity].label);
  assert.doesNotMatch(visibleText(card),/\d(?:[.,]\d+)?\s*(?:cm|m|kg)\b|最大|尺寸|长度|体长|重量/);
  assert.match(card.props['aria-label'],/尚未发现/);
 });
 assert.match(css,/\.marine-card:not\(\.collected\) \.marine-image\{[^}]*background:transparent/);
 assert.match(css,/\.marine-card:not\(\.collected\) img\{[^}]*filter:brightness\(0\)/);
 assert.doesNotMatch(css,/\.marine-card img\{[^}]*(?:mix-blend-mode:screen|grayscale)/);
});
test('my catches remains owned-only with color images and counts while hiding legacy size records',()=>{
 const inventory={total:3,species:{clownfish:{count:3,largest:{lengthCm:13}}}};
 const cards=renderCollection(inventory,true);assert.equal(cards.length,1);
 assert.match(cards[0].props.className,/collected/);
 const nodes=elements(cards[0]);assert.equal(nodes.find(n=>n.type==='small').props.children,'3 只');
 assert.equal(nodes.find(n=>n.type==='img').props.src,'/marine-previews/clownfish.png');
 assert.doesNotMatch(visibleText(cards[0]),/cm|kg|最大|13\.0/);
 assert.equal(inventory.species.clownfish.largest.lengthCm,13,'presentation preserves legacy inventory');
 assert.match(css,/\.marine-card \.marine-image\{[^}]*background:transparent/);
});
test('catalog and owned-card toasts retain species, rarity and counts without measurements',()=>{
 const notifications=[];
 const unknown=renderCollection(undefined,false,message=>notifications.push(message));unknown[0].props.onClick();
 const species=MARINE_SPECIES[0];assert.equal(notifications[0],`${species.name} · ${RARITIES[species.rarity].label} · 尚未发现`);
 const inventory={total:3,species:{clownfish:{count:3,largest:{lengthCm:999,weightKg:123}}}};
 renderCollection(inventory,true,message=>notifications.push(message))[0].props.onClick();
 assert.equal(notifications[1],`${MARINE_SPECIES.find(s=>s.id==='clownfish').name} · 常见 · 3 只`);
 assert.doesNotMatch(notifications.join(' '),/cm|kg|最大|999|123/);
});
test('all twenty thumbnail PNGs preserve alpha, visible fish, and safe transparent margins',async()=>{
 let totalBytes=0;
 for(const species of MARINE_SPECIES){
  const input=readFileSync(new URL(`../public/marine-previews/${species.id}.png`,import.meta.url));totalBytes+=input.length;
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha=[];for(let i=3;i<data.length;i+=4)alpha.push(data[i]);
  assert.ok(alpha.some(v=>v>200),`${species.id}: visible fish`);
  assert.ok(alpha.filter(v=>v===0).length>alpha.length*.15,`${species.id}: transparent background`);
  for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0,`${species.id}: top margin`);assert.equal(data[((info.height-1)*info.width+x)*4+3],0,`${species.id}: bottom margin`);}
  for(let y=0;y<info.height;y++){assert.equal(data[(y*info.width)*4+3],0,`${species.id}: left margin`);assert.equal(data[(y*info.width+info.width-1)*4+3],0,`${species.id}: right margin`);}
  assert.ok(info.width<=384&&info.height<=384,`${species.id}: thumbnail dimensions`);
 }
 assert.ok(totalBytes<1800000,`all thumbnails remain lightweight: ${totalBytes}`);
});
