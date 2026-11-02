import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState} from '../src/state.js';
import {renderPanel,renderContext} from '../src/ui.js';
import {ACTIVE_BUILDING_SAMPLES} from '../src/blueprints.js';
const fresh=()=>createState(Date.now(),'creation-affordances');
test('seed idea has an accessible non-submit dice beside editable text, separate from paid confirmation',()=>{
 const html=renderPanel(fresh(),{panel:'create',creation:{path:'invent',idea:'我的点子'}},{});
 const form=html.match(/<form id="idea-form"[\s\S]*?<\/form>/)?.[0];assert.ok(form);
 assert.match(form,/<input[^>]*value="我的点子"/);
 assert.match(form,/<button type="button"[^>]*data-action="idea-dice"[^>]*aria-label="摇一个植物灵感"/);
 assert.doesNotMatch(form,/data-action="confirm-create"/);
 assert.match(html,/data-action="confirm-create"/);
});
test('both idea input placeholder and entered text keep one 16px size across focus',()=>{
 const css=readFileSync('styles.css','utf8');
 assert.match(css,/\.idea-form input\{font-size:16px\}/);
 assert.match(css,/\.idea-form input::placeholder\{font-size:inherit\}/);
 assert.doesNotMatch(css,/\.idea-form input::placeholder\{font-size:12px/);
 assert.doesNotMatch(css,/input:focus[^{}]*\{[^}]*font-size:/);
 assert.match(css,/var\(--keyboard-inset,0px\)/);
});
test('architecture helper count follows supported samples rather than old three-card copy',()=>{
 const html=renderPanel(fresh(),{panel:'blueprint-create',blueprintCreation:{idea:''}},{});
 assert.ok(html.includes(`${ACTIVE_BUILDING_SAMPLES.length} 个离线样例`));
 const source=readFileSync('src/ui.js','utf8');assert.doesNotMatch(source,/offline-note">3 个离线样例/);
});
test('building without a source photo uses artwork and honest inspiration metadata, not an empty photo frame',()=>{
 const e={id:'new-house',artKey:'calico_reading_den',displayName:'想象的小屋',sourceStory:'来自一段想法。',interaction:'purr'};
 const html=renderContext(fresh(),{selection:{kind:'exhibit',id:e.id}},{exhibits:[e],plants:[],tiles:[]});
 assert.doesNotMatch(html,/class="source-photo"|data-source=|示范相册|AI 生成的虚构照片/);
 assert.match(html,/data-art="calico_reading_den"/);assert.match(html,/灵感创作/);
});
test('hobby and illustration source types never masquerade as photos while legacy photo cards remain',()=>{
 for(const sourceType of ['hobby','illustration','photo']){
  const e={id:'source-house',artKey:'calico_reading_den',displayName:'小屋',sourceType,sourceFrameId:'bear-cat-photo',interaction:'purr'};
  const html=renderContext(fresh(),{selection:{kind:'exhibit',id:e.id}},{exhibits:[e],plants:[],tiles:[]});
  if(sourceType==='photo'){assert.match(html,/class="source-photo"/);assert.match(html,/data-source="bear-cat-photo"/);assert.match(html,/灵感相册/);assert.doesNotMatch(html,/虚构照片/);}
  else{assert.doesNotMatch(html,/data-source=|class="source-photo"|虚构照片/);assert.match(html,/data-art="calico_reading_den"/);assert.match(html,sourceType==='hobby'?/兴趣灵感/:/插画灵感/);}
 }
});
