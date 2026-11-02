import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
test('semantic neutral UI colors have equal RGB channels while ivory and gold remain',()=>{
 for(const key of ['page','ink','secondary','accent','action','count','count-active']){
  const hex=css.match(new RegExp('--ui-'+key+':#([0-9a-f]{6})'))?.[1];assert.ok(hex,key);assert.equal(hex.slice(0,2),hex.slice(2,4),key);assert.equal(hex.slice(2,4),hex.slice(4,6),key);
 }
 assert.match(css,/--tank-active-bg:#e3edf4/);assert.match(css,/--ui-surface:#fdf9eb/);assert.match(css,/background:var\(--gold-alert\)/);assert.doesNotMatch(css,/rgba\((?:16,20,28|23,26,29),/);
});
test('overflow trigger stays transparent without a click ring but retains keyboard focus',()=>{
 assert.match(css,/\.overflow-toggle\{background:transparent;border:0;box-shadow:none\}/);
 assert.match(css,/\.overflow-toggle\[data-pointer-focus=true\]:focus\{outline:none\}/);
 assert.match(css,/button:focus-visible,input:focus-visible\{outline:2px solid var\(--ui-accent\)/);
 assert.match(css,/\.item-overflow-popover button[^}]*background:var\(--ui-accent-soft\)/);
});
test('empty stock and harvest use vertically stacked content centred in remaining tray space',()=>{
 assert.match(css,/\.empty-stock,\.harvest-empty\{[^}]*flex-direction:column[^}]*align-items:center[^}]*justify-content:center/);
 assert.match(css,/\.harvest-list:has\(>\.harvest-empty\)\{display:flex;flex:1;min-height:0\}/);
});

test('only operation surfaces use softly warm gray; neutral ink and tank exception remain',()=>{assert.match(css,/--ui-accent-soft:#dedbd4/);assert.match(css,/--ui-ink:#1a1a1a/);assert.match(css,/--tank-active-bg:#e3edf4/);assert.match(css,/gather-sheen 10s/);});
