import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState} from '../src/state.js';
import {renderPanel} from '../src/ui.js';
const fresh=()=>createState(Date.now(),'panel-layout');
for(const [panel,action] of [['bag','panel-create'],['build','blueprint-create']])test(`${panel} creation action is a non-scrolling bottom footer`,()=>{
 const html=renderPanel(fresh(),{panel,bagTab:'seeds'},{});
 assert.match(html,/<\/div><footer class="panel-action-rail">/);
 assert.ok(html.indexOf(`data-action="${action}"`)>html.indexOf('<div class="tray-content">'));
 assert.equal((html.match(new RegExp(`data-action="${action}"`,'g'))??[]).length,1);
 assert.ok(html.endsWith('</footer>'));
});
test('seed purchases stay direct even if a stale UI session exists',()=>{
 const html=renderPanel(fresh(),{panel:'bag',bagTab:'seeds',purchaseSession:{varietyId:'radish'}},{});
 assert.doesNotMatch(html,/purchase-rail|finish-purchase|repeat-buy-seed|\binert\b|aria-disabled="true"/);
 const cards=[...html.matchAll(/<div class="item-card seed-card[^\"]*"[^>]*>([\s\S]*?)<\/div>/g)];
 assert.ok(cards.length>=2);
 for(const [,card] of cards)for(const [button] of card.matchAll(/<button\b[^>]*>/g)){
  const action=button.match(/data-action="([^"]+)"/)[1];
  assert.ok(button.includes(`data-seed-control="${action}"`));
 }
 const stocked=cards[0][1];assert.match(stocked,/data-action="choose-seed"/);assert.match(stocked,/data-action="buy-seed"/);assert.match(stocked,/data-action="detail"/);
 let depth=0;for(const token of html.match(/<\/?button\b[^>]*>/g)??[]){if(token.startsWith('</'))depth--;else{assert.equal(depth,0);depth++;}}assert.equal(depth,0);
});
test('footer reserves flex layout space and scroll body clears its edge without overlaying dock',()=>{
 const css=readFileSync('styles.css','utf8');
 assert.match(css,/\.panel-action-rail\{[^}]*flex:none[^}]*border-top:/);
 assert.doesNotMatch(css,/\.panel-action-rail\{[^}]*(?:position:absolute|position:fixed)/);
 assert.match(css,/\.tray:has\(> \.panel-action-rail\) > \.tray-content\{[^}]*padding-bottom:12px[^}]*scroll-padding-bottom:12px/);
 assert.doesNotMatch(css,/purchase-rail|seed-grid\[inert\]/);
});
test('blocked navigation hint stays below garden title without intercepting controls',()=>{
 const css=readFileSync('styles.css','utf8'),rule=css.match(/\.navigation-note\{([^}]+)\}/)?.[1];
 assert.ok(rule);assert.match(rule,/pointer-events:none/);assert.match(rule,/top:max\(115px/);assert.match(rule,/left:18px/);assert.match(rule,/right:18px/);
});
