import test from 'node:test';import assert from 'node:assert/strict';
import {capturePurchaseScroll,restorePurchaseScroll,patchPurchaseRail} from '../src/purchase-view.js';
test('repeat purchase patches count/affordability in existing native controls without replacing focus or DOM',()=>{
 const count={textContent:''},repeat={textContent:'',disabled:false},done={textContent:'完成'},rail={querySelector:s=>({'[data-purchase-count]':count,'[data-action="repeat-buy-seed"]':repeat,'[data-action="finish-purchase"]':done}[s])},identity=repeat;
 patchPurchaseRail(rail,{count:2,price:12,canRepeat:true});assert.equal(repeat,identity);assert.equal(count.textContent,'已有 2 颗');assert.match(repeat.textContent,/\+1.*12/);patchPurchaseRail(rail,{count:3,price:12,canRepeat:false});assert.equal(repeat.disabled,true);assert.equal(done.textContent,'完成');patchPurchaseRail(rail,{count:3,price:12,canRepeat:true});assert.equal(repeat.disabled,false);
});
test('purchase scrolling preserves visible nonmoving anchor rather than jumping to the newly resorted bought card',()=>{
 const nodes=[{dataset:{seedId:'bought'},getBoundingClientRect:()=>({top:110,bottom:240})},{dataset:{seedId:'neighbor'},getBoundingClientRect:()=>({top:250,bottom:380})}],container={scrollTop:320,getBoundingClientRect:()=>({top:100,bottom:420}),querySelectorAll:()=>nodes};const before=capturePurchaseScroll(container,'bought');assert.equal(before.anchorId,'neighbor');assert.equal(before.top,320);assert.equal(before.offset,150);
 nodes[1].getBoundingClientRect=()=>({top:280,bottom:410});restorePurchaseScroll(container,before);assert.equal(container.scrollTop,350);
});
