import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
function rule(selector){return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].trim()===selector).map(m=>m[2]).join(';');}
test('both ranking panels use lobby dark surfaces with readable text',()=>{
  for(const selector of ['.friends-view','.results-view']){
    assert.match(rule(selector),/background:#171619(?:;|$)/);
    assert.match(rule(selector),/color:var\(--ivory\)/);
  }
});
test('shared leaderboard keeps dark ink on the lime self highlight',()=>{
  assert.match(rule('.leaderboard li.is-you'),/color:#171719/);
  assert.match(rule('.leaderboard li.is-you .rank'),/color:#454b32/);
  assert.match(rule('.friend-avatar'),/background:#353039/);
});
test('tab icon is a cache-distinct local dancing emoji SVG',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\/favicon-dancer-v10.svg">/);
  const svg=readFileSync(new URL('../public/favicon-dancer-v10.svg',import.meta.url),'utf8');
  assert.match(svg,/💃/);assert.match(svg,/viewBox="0 0 64 64"/);
});
test('results remain scrollable when a short viewport clips the final actions',()=>{
  assert.match(rule('.results-view'),/overflow-y:auto/);
});
