import assert from 'node:assert/strict';
import test from 'node:test';
import * as viewport from '../lib/phone-viewport.ts';
const sample=(extra={})=>({width:390,height:844,visibleHeight:844,zoom:1,focused:false,settled:false,...extra});
function session(){ let state; return extra => state=viewport.advancePhoneKeyboard(state,sample(extra)); }
test('nickname without chat props preserves 390px width throughout open, switch, IME, blur and close',()=>{
 const step=session(); assert.equal(step().scale,1);
 assert.equal(step({focused:true}).scale,1);
 for(const visibleHeight of [760,600,330,280]){
  const state=step({focused:true,visibleHeight}); assert.equal(state.scale,1); assert.equal(state.holding,true);
 }
 // Focus moves from nickname to search, then IME candidate bar changes height.
 assert.equal(step({focused:true,visibleHeight:250}).scale,1);
 for(const visibleHeight of [250,400,600,760]){
  const state=step({visibleHeight}); assert.equal(state.scale,1); assert.equal(state.holding,true);
 }
 assert.equal(step().holding,false); assert.equal(step().scale,1);
});
test('without VisualViewport a host resize also holds pre-keyboard scale',()=>{
 const step=session();step();step({focused:true});
 assert.equal(step({focused:true,height:320,visibleHeight:320}).scale,1);
 assert.equal(step({height:450,visibleHeight:450}).holding,true);
 assert.equal(step().holding,false);
});
test('desktop focus does not crop and blur releases immediately',()=>{
 const step=session();step(); assert.equal(step({focused:true}).scale,1);
 assert.equal(step().holding,false);
});
test('pinch is not a keyboard or a new resting scale',()=>{
 const step=session();step();
 assert.equal(step({zoom:2,visibleHeight:422}).scale,1);
 assert.equal(step({zoom:2,visibleHeight:160,focused:true}).scale,1);
 assert.equal(step({zoom:2,visibleHeight:422}).holding,false);
 assert.equal(step().scale,1);
});
test('blur animation cannot release until recovered; settled toolbar change can',()=>{
 const step=session();step();step({focused:true,visibleHeight:300});
 assert.equal(step({visibleHeight:400,settled:true}).holding,true);
 assert.equal(step({visibleHeight:800}).holding,true);
 assert.equal(step({visibleHeight:800,settled:true}).holding,false);
});
test('global focus subscription covers portal inputs, textareas and editable descendants',async()=>{
 const listeners=new Map(); const document={activeElement:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const input={tagName:'INPUT',type:'text',disabled:false,readOnly:false};
 const seen=[];const stop=viewport.observePhoneEditableFocus(document,value=>seen.push(value));
 document.activeElement=input;listeners.get('focusin')();
 assert.equal(seen.at(-1),true);
 // No containment requirement: a search field in a document portal is observed.
 document.activeElement={...input,type:'search'};listeners.get('focusout')();listeners.get('focusin')();await Promise.resolve();
 assert.equal(seen.at(-1),true);
 document.activeElement={tagName:'TEXTAREA'};listeners.get('focusin')();assert.equal(seen.at(-1),true);
 document.activeElement={tagName:'SPAN',isContentEditable:true};listeners.get('focusin')();assert.equal(seen.at(-1),true);
 document.activeElement={tagName:'BUTTON'};listeners.get('focusout')();await Promise.resolve();assert.equal(seen.at(-1),false);
 stop(); assert.equal(listeners.size,0);
});
test('readonly, disabled, checkbox and range controls do not trigger typing mode',()=>{
 for(const target of [{tagName:'INPUT',type:'checkbox'},{tagName:'INPUT',type:'range'},{tagName:'INPUT',type:'text',readOnly:true},{tagName:'TEXTAREA',disabled:true},null])assert.equal(viewport.isPhoneEditable(target),false);
});
test('screenshot regression: no chat prop, 330px visible area keeps phone and font scale',()=>{
 const insets={left:0,right:0,top:0,bottom:0};
 const visible={left:0,top:0,width:390,height:330};
 // The former generic-input path produces the screenshot's 152px miniature.
 const old=viewport.layoutPhoneViewport(390,844,insets,visible,false,1);
 assert.ok(old.width<160);
 const step=session();step();step({focused:true});
 const state=step({focused:true,visibleHeight:330});
 const fixed=viewport.layoutPhoneViewport(390,844,insets,visible,state.holding,state.scale);
 assert.equal(fixed.width,390);assert.equal(fixed.scale,1);assert.equal(fixed.visibleHeight,330);
});
test('focused fields scroll inside the panel only, above sticky heading and keyboard',()=>{
 const panel={scrollTop:100,getBoundingClientRect:()=>({top:0,bottom:320}),querySelector:()=>({getBoundingClientRect:()=>({bottom:70})})};
 let rect={top:290,bottom:330};
 const input={tagName:'INPUT',type:'text',closest:()=>panel,getBoundingClientRect:()=>rect};
 viewport.revealPhoneSheetInput({activeElement:input},1);assert.equal(panel.scrollTop,126);
 rect={top:20,bottom:60};viewport.revealPhoneSheetInput({activeElement:input},1);assert.equal(panel.scrollTop,68);
});
test('rotation during typing uses unoccluded geometry and restores after close',()=>{
 const step=session();step();step({focused:true,visibleHeight:330});
 const state=step({width:844,height:200,visibleHeight:200,focused:true});
 assert.equal(state.scale,390/844);assert.equal(state.holding,true);
 const closed=step({width:844,height:390,visibleHeight:390});
 assert.equal(closed.holding,false);assert.equal(closed.scale,390/844);
});
