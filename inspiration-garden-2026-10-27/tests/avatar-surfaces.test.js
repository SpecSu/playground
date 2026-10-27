import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../src/state.js';
import {renderHUD,renderPanel} from '../src/ui.js';
const avatars=JSON.parse(fs.readFileSync(new URL('../assets/avatar-manifest.json',import.meta.url))).avatars;
test('HUD selector and every friend card paint manifest portraits through Canvas, never old hardcoded screenshot URLs',()=>{
 const s=createState(Date.now(),'cast-surfaces'),hud=renderHUD(s,avatars),profile=renderPanel(s,{panel:'profile'},avatars,JSON.parse(fs.readFileSync('assets/wardrobe-manifest.json'))),visits=renderPanel(s,{panel:'visit'},avatars);
 assert.match(hud,/data-avatar-portrait="human-subeike"/);assert.equal((profile.match(/data-outfit-portrait=/g)??[]).length,6);
 for(const id of ['human-kelly','human-bear','human-jiji','human-lx'])assert.match(visits,new RegExp(`data-avatar-portrait="${id}"`));
 for(const html of [hud,profile,visits]){assert.doesNotMatch(html,/assets\/portraits\/|\.webp|\[object Object\]|<img/);assert.match(html,/role="img"/);}
});
test('approved cast changes artwork only: all twelve published IDs names and display heights remain stable',()=>{
 const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/v8-cast-identities.json',import.meta.url))),manifest=JSON.parse(fs.readFileSync(new URL('../assets/avatar-manifest.json',import.meta.url)));assert.equal(manifest.status,'approved-illustrated-2d-avatar-set');assert.deepEqual(Object.values(manifest.avatars).map(({id,name,displayHeight})=>({id,name,displayHeight})).sort((a,b)=>a.id.localeCompare(b.id)),expected.sort((a,b)=>a.id.localeCompare(b.id)));for(const a of Object.values(manifest.avatars)){assert.equal(a.front.image,a.back.image);assert.equal(a.front.image,a.portrait.image);assert.ok(a.portrait.frame);assert.match(a.front.image,/avatars-illustrated/);}
});
