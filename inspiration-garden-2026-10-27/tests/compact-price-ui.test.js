import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {renderPanel} from '../src/ui.js';
import {icon} from '../src/icons.js';

const buttons=(html,action)=>[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(m=>m[1].includes(`data-action="${action}"`));
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
// Loose text nodes in the flex button used to wrap the dot and Chinese unit
// independently. Keep the action and complete icon/number as two atomic groups.
function compactPrice(control,label,amount){
 assert.match(control[1],/\bprice-action\b/);
 assert.match(control[2],/^<span class="price-action-label">[^<]+<\/span>\s*<span class="price-amount">[\s\S]+<span class="price-value">\d+<\/span><\/span>$/);
 assert.equal(text(control[2]),`${label} ${amount}`);
 assert.ok(control[2].includes(icon('coin')));
 assert.match(control[1],new RegExp(`aria-label="[^"]*${amount}金币"`));
}
test('blueprint buttons keep compact visible prices, full accessible costs and original action identities',()=>{
 const now=Date.now();let s=createState(now,'compact-price');
 s=reduce(s,{type:'CREATE_BLUEPRINT',sampleId:'calico_reading_den',requestId:'compact-cat'},now).state;
 const before=structuredClone(s),controls=buttons(renderPanel(s,{panel:'build'},{}),'choose-blueprint');
 assert.equal(controls.length,Object.keys(s.blueprints).length);
 for(const c of controls){compactPrice(c,'建造',60);assert.match(c[1],/data-id="[^"]+"/);assert.doesNotMatch(c[1],/disabled/);}
 for(const c of buttons(renderPanel({...s,coins:59},{panel:'build'},{}),'choose-blueprint')){compactPrice(c,'建造',60);assert.match(c[1],/disabled/);}
 assert.deepEqual(s,before);
});
test('stocked and empty seed cards keep their +1 or purchase action grouped with the full coin price',()=>{
 const s=createState(Date.now(),'compact-seeds'),before=structuredClone(s);
 const controls=buttons(renderPanel(s,{panel:'bag',bagTab:'seeds'},{}),'buy-seed');
 assert.ok(controls.some(c=>c[1].includes('seed-repeat')));
 assert.ok(controls.some(c=>c[1].includes('card-buy')));
 for(const c of controls){const id=c[1].match(/data-id="([^"]+)"/)[1];compactPrice(c,c[1].includes('seed-repeat')?'+1':'购买',s.varieties[id].seedPrice);assert.match(c[1],/data-seed-control="buy-seed"/);}
 assert.deepEqual(s,before);
});
test('four-digit seed prices stay complete in both purchase and repeat controls',()=>{
 const now=Date.now();let s={...createState(now,'compact-tree'),sales:60,coins:20000};
 const treeButton=state=>buttons(renderPanel(state,{panel:'bag',bagTab:'seeds'},{}),'buy-seed').find(c=>c[1].includes('data-id="ancient_star_tree"'));
 compactPrice(treeButton(s),'购买',1800);
 const purchase=reduce(s,{type:'BUY_SEED',varietyId:'ancient_star_tree'},now);
 assert.equal(purchase.ok,true);s=purchase.state;
 compactPrice(treeButton(s),'+1',1800);
 compactPrice(treeButton({...s,coins:1799}),'+1',1800);
 assert.match(treeButton({...s,coins:1799})[1],/disabled/);
});
