import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const chat=await import('../lib/fishing-chat.ts');
function harness(extra={}){
 let time=1000,refsIndex=0,stateIndex=0,effectIndex=0,tree,props={joined:true,disabled:false,interrupt:false,onSend:async()=>true,...extra};
 const refs=[],states=[],effects=[],pending=[],sent=[];let blurCount=0;const element={blur(){blurCount++;},setSelectionRange(){}};
 const react={useRef:value=>refs[refsIndex++]??(refs[refsIndex-1]={current:value}),useState:value=>{const i=stateIndex++;if(!(i in states))states[i]=value;return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useEffect:(fn,deps)=>{const i=effectIndex++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const jsx=(type,p)=>{if(type==='input'&&p.ref)p.ref.current=element;return {type,props:p};};
 const context=vm.createContext({exports:{},require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:id==='@/lib/fishing-chat'?chat:new Proxy({},{get:(_,key)=>String(key)}),queueMicrotask,Date:class extends Date{static now(){return time;}}});
 vm.runInContext(ts.transpileModule(readFileSync(new URL('../components/fishing/FishingChatComposer.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 function render(patch={}){props={...props,...patch};refsIndex=stateIndex=effectIndex=0;tree=context.exports.default(props);while(pending.length)pending.shift()();return tree;}
 function nodes(){const found=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){found.push(n);walk(n.props?.children);}};walk(tree);return found;}
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();render();};
 const input=()=>nodes().find(n=>n.type==='input');
 render();return {render,nodes,input,flush,get tree(){return tree;},get blurs(){return blurCount;},advance:ms=>time+=ms,change:value=>{input().props.onChange({target:{value}});render();},key:(key,patch={})=>{let prevented=false;input().props.onKeyDown({key,nativeEvent:{key,...patch},preventDefault(){prevented=true;}});return prevented;},submit:()=>tree.props.onSubmit({preventDefault(){}}),sent};
}
test('Enter sends confirmed text once, clears only after acknowledgement, and dismisses keyboard',async()=>{
 const sent=[];let resolve;const h=harness({onSend:text=>{sent.push(text);return new Promise(r=>{resolve=r;});}});h.change('  hello 🐟 ');assert.equal(h.key('Enter'),true);h.render();h.key('Enter');assert.deepEqual(sent,['hello 🐟']);assert.equal(h.input().props.value,' hello 🐟 ');resolve(true);await h.flush();assert.equal(h.input().props.value,'');assert.equal(h.blurs,1);
});
test('IME Enter and the immediate post-composition Enter never send; later Enter does',async()=>{
 const sent=[];const h=harness({onSend:async text=>{sent.push(text);return true;}});h.input().props.onCompositionStart();h.change('你好');h.key('Enter',{isComposing:true,keyCode:229});h.submit();assert.deepEqual(sent,[]);
 h.input().props.onCompositionEnd({currentTarget:{value:'你好'}});h.render();h.key('Enter');h.submit();assert.deepEqual(sent,[]);h.advance(251);h.key('Enter');await h.flush();assert.deepEqual(sent,['你好']);
});
test('bite, leave and Escape preserve draft and never issue chat, while pending or uncertain is disabled',async()=>{
 const sent=[];const h=harness({onSend:async text=>{sent.push(text);return true;}});h.change('等我收竿');h.key('Escape');h.render();assert.equal(h.input().props.value,'等我收竿');assert.equal(h.blurs,1);
 h.render({interrupt:true});h.submit();assert.equal(h.input().props.value,'等我收竿');assert.equal(h.input().props.disabled,true);h.render({interrupt:false,disabled:true});h.submit();assert.deepEqual(sent,[]);
 h.render({joined:false});assert.equal(h.tree,null);h.render({joined:true,disabled:false});assert.equal(h.input().props.value,'等我收竿');h.key('Enter');await h.flush();assert.deepEqual(sent,['等我收竿']);
});
test('failed or mismatched acknowledgement preserves draft for explicit retry',async()=>{
 const h=harness({onSend:async()=>false});h.change('再试一次');h.key('Enter');await h.flush();assert.equal(h.input().props.value,'再试一次');assert.equal(h.blurs,0);assert.equal(h.input().props.disabled,false);
});
test('blank text and multiline paste respect single-line Unicode cap',async()=>{
 const sent=[],h=harness({onSend:async text=>{sent.push(text);return true;}});h.change(' \n ');h.submit();assert.deepEqual(sent,[]);h.change('🐟'.repeat(81)+'\n结束');assert.equal([...h.input().props.value].length,80);assert.equal(h.input().props.enterKeyHint,'send');h.key('Enter');await h.flush();assert.equal([...sent[0]].length,80);
});
test('paste explicitly converts newlines to spaces at the current text selection',async()=>{
 const h=harness();h.change('天气不错');let prevented=false;h.input().props.onPaste({preventDefault(){prevented=true;},currentTarget:{selectionStart:2,selectionEnd:2},clipboardData:{getData:()=> '晴\n海风\t'}});await h.flush();assert.equal(prevented,true);assert.equal(h.input().props.value,'天气晴 海风 不错');
});
test('exceptional send failure and interrupted composition leave the draft retryable',async()=>{
 const h=harness({onSend:async()=>{throw new Error('network unavailable');}});h.input().props.onCompositionStart();h.change('留着草稿');h.key('Escape');h.key('Enter');await h.flush();assert.equal(h.input().props.value,'留着草稿');assert.equal(h.input().props.disabled,false);
});
test('Shift+Enter cannot fall through to native form submission',async()=>{
 const sent=[],h=harness({onSend:async text=>{sent.push(text);return true;}});h.change('先留着');assert.equal(h.key('Enter',{shiftKey:true}),true);await h.flush();assert.deepEqual(sent,[]);
});

test('chat uses the same short placeholder before, during and after focus',()=>{
 const h=harness();
 assert.equal(h.input().props.placeholder,'说点什么...');
 h.input().props.onFocus();h.render();assert.equal(h.input().props.placeholder,'说点什么...');
 h.input().props.onBlur();h.render();assert.equal(h.input().props.placeholder,'说点什么...');
});
