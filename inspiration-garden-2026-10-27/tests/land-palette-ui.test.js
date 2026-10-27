import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/state.js';
import {renderPanel} from '../src/ui.js';
import {LAND_PALETTES} from '../src/terrain-palettes.js';
test('home build palette offers five free whole-island tones and exposes current selection',()=>{
 const s=createState(Date.now(),'palette-ui');s.settings.landPalette='mist';const before=structuredClone(s);
 const html=renderPanel(s,{panel:'build'},{});
 assert.match(html,/整岛地块色调/);assert.match(html,/免费/);
 assert.equal((html.match(/data-action="land-palette"/g)??[]).length,LAND_PALETTES.length);
 assert.match(html,/data-action="land-palette"[^>]*data-id="mist"[^>]*aria-pressed="true"/);
 for(const p of LAND_PALETTES)assert.ok(html.includes(p.name));
 assert.deepEqual(s,before);
});
test('visiting another garden never exposes owner land recoloring controls',()=>{
 const html=renderPanel(createState(Date.now(),'palette-visitor'),{panel:'build',visitId:'demo-bear-moon'},{});
 assert.doesNotMatch(html,/data-action="land-palette"/);
});
