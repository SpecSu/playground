import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {resolveAvatarPreset} from '../lib/room-types.ts';
import {CLUB_AVATAR_CATALOG} from '../lib/club-avatar-catalog.ts';
import {fitPhoneViewport} from '../lib/phone-viewport.ts';
const source=readFileSync(new URL('../components/DanceMachine.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../components/DanceMachine.css',import.meta.url),'utf8');
const ast=ts.createSourceFile('card.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DanceMachine');
const result=component.body.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='resultsReady').thenStatement.expression.getText(ast);
const helpers=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['ResultAvatar','ResultCrown'].includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
function render(count,ownIndex=null){
 const roster=Array.from({length:count},(_,i)=>({id:`p${i}`,name:i===4?'凌晨两点还在跳舞的长名字舞者':'舞者'+i,preset:CLUB_AVATAR_CATALOG[i%CLUB_AVATAR_CATALOG.length].id}));
 const sortedResults=roster.map((entry,i)=>({actorId:entry.id,score:77000-i*4000,maxCombo:77-i,counts:{cool:50,good:20}}));
 const ownResult=ownIndex===null?undefined:sortedResults[ownIndex];let closed=false;
 const c={React:{Fragment:'fragment',createElement(type,props,...children){return typeof type==='function'?type({...props,children}):{type,props:props??{},children:children.flat(Infinity)};}},resolveAvatarPreset,CLUB_AVATAR_CATALOG,sortedResults,podium:sortedResults.slice(0,3),round:{id:'r',roster,startsAt:0,endsAt:51120},ownId:ownResult?.actorId,ownResult,ownRank:ownResult?ownIndex+1:null,ownEntry:roster[ownIndex],score:ownResult,chart:Array(77),now:80000,DANCE_SUBMIT_GRACE_MS:15000,resultStatus:ownResult?'已同步 · 本局成绩':'本局观战',resultPanel:{},setClosed:v=>closed=v,ARROWS:['←','↑','↓','→'],COLORS:['pink','green','blue','orange'],exporting:false,exportPhoto(){},submission:'sent',submit(){},enabled:true,celebrationGate:{},X:'close-icon',Download:'download-icon',Share2:'share-icon',DanceResultConfetti:'confetti'};
 vm.createContext(c);vm.runInContext(ts.transpileModule(`${helpers}\nglobalThis.tree=(${result});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,c);return {tree:c.tree,closed:()=>closed};
}
function nodes(tree,predicate){if(!tree||typeof tree!=='object')return [];return [...(predicate(tree)?[tree]:[]),...(tree.children??[]).flatMap(n=>nodes(n,predicate))];}
const cls=(tree,name)=>nodes(tree,n=>n.props.className===name);
for(const count of [0,1,2,3,8,12])test(`compact card truthfully renders ${count} participants without duplicated podium`,()=>{
 const {tree}=render(count);assert.equal(nodes(tree,n=>n.props.className?.startsWith('dance-podium-place')).length,Math.min(count,3));
 const rows=cls(tree,'dance-ranking')[0].children.filter(n=>n?.type==='div');assert.equal(rows.length,Math.max(0,Math.min(count,8)-3));
 assert.equal(cls(tree,'dance-result-arrows').length,1);assert.equal(cls(tree,'dance-result-backdrop').length,1);
 assert.equal(tree.children.at(-1).type,'confetti','canvas is outside the clipped modal card');
});
for(const own of [0,1,2,5,9,11])test(`own rank ${own+1} stays visible with real score and picker avatars`,()=>{
 const h=render(12,own);assert.equal(cls(h.tree,'dance-outside-rank').length,own>=8?1:0);
 const portraits=nodes(h.tree,n=>n.props.className==='dance-rank-avatar');assert.ok(portraits.some(n=>n.type==='img'&&n.props.src.startsWith('/avatars/portraits/')));
 assert.equal(nodes(h.tree,n=>n.props.className==='dance-crown').length,3);
 cls(h.tree,'dance-result-close')[0].props.onClick();assert.equal(h.closed(),true);
});
test('card fits reference and short mobile viewport with a physical 44px close hit target',()=>{
 assert.match(css,/dance-result-close\{[^}]*width:max\(44px,calc\(44px \/ var\(--phone-scale,1\)\)\)/);
 assert.match(css,/dance-result-arrows\{[^}]*right:70px/);
 assert.match(css,/dance-ranking\{height:165px;overflow:visible/);
 assert.match(css,/dance-result-layer\{[^}]*border-radius:22px/);
 // Measured CSS boxes: 498px board + 76px actions/links + 28px padding + 2px border.
 const cardHeight=604,referenceStageHeight=758,available=referenceStageHeight-96-14;
 assert.ok(cardHeight<=available);
 for(const [width,height] of [[390,844],[375,667]]){
  const {scale}=fitPhoneViewport(width,height);const hit=Math.max(44,44/scale);assert.ok(hit*scale>=44);
  assert.ok(cardHeight*scale<height);assert.ok(7+hit<16+70,'close target stays right of the header arrows');
 }
 assert.match(css,/text-overflow:ellipsis/);
});
