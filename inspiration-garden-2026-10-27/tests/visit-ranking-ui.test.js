import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../src/ui.js';
import {createState} from '../src/state.js';
const monday=Date.parse('2026-10-26T00:00:00+08:00');
test('mock ranking preserves stable Beijing day/week periods and three descending friend identities',()=>{
 assert.equal(typeof ui.mockVisitRanking,'function');
 for(const period of ['today','week']){
  const rows=ui.mockVisitRanking(period,monday+1000);
  assert.deepEqual(rows.map(r=>r.authorId),['demo-lx','demo-bear','demo-kelly','demo-frog']);
  assert.deepEqual(rows.map(r=>r.rank),[1,2,3,4]);
  assert.ok(rows.every((r,i)=>Number.isInteger(r.income)&&r.income>0&&(i===0||rows[i-1].income>=r.income)));
  assert.deepEqual(rows,ui.mockVisitRanking(period,monday+86399000));
 }
 assert.deepEqual(ui.mockVisitRanking('week',monday),ui.mockVisitRanking('week',monday+6*86400000));
 assert.notDeepEqual(ui.mockVisitRanking('week',monday-1),ui.mockVisitRanking('week',monday));
 assert.notDeepEqual(ui.mockVisitRanking('today',monday-1),ui.mockVisitRanking('today',monday));
 assert.ok(ui.mockVisitRanking('week',monday).every((r,i)=>r.income>ui.mockVisitRanking('today',monday)[i].income));
});
test('visit ranking integrates one native entry per friend and labels display-only earnings honestly',()=>{
 const state=createState(monday,'rank-ui'),before=structuredClone(state);
 for(const period of ['today','week']){
  const html=ui.renderPanel(state,{panel:'visit',visitPeriod:period},{});
  assert.match(html,/模拟收益排行/);assert.match(html,/示例数据/);assert.match(html,/不计入金币余额/);
  assert.equal((html.match(/data-action="visit-garden"/g)??[]).length,4);
  assert.match(html,new RegExp(`data-action="visit-period-${period}"[^>]*aria-pressed="true"`));
  assert.ok(html.indexOf('data-id="demo-bear-moon"')<html.indexOf('data-id="demo-kelly-music"'));
  assert.ok(html.indexOf('data-id="demo-kelly-music"')<html.indexOf('data-id="demo-frog-sea"'));
  assert.equal((html.match(/class="friend-income"/g)??[]).length,5);
  let depth=0;for(const token of html.match(/<\/?button\b[^>]*>/g)??[]){if(token.startsWith('</'))depth--;else{assert.equal(depth,0);depth++;}}assert.equal(depth,0);
 }
 assert.deepEqual(state,before);
});
