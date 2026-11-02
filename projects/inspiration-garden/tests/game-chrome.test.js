import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('game scene/chrome suppress native selection and callout while editable fields explicitly preserve text selection',()=>{
 const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');assert.match(css,/\.garden-shell\s*\{[^}]*user-select:none[^}]*-webkit-touch-callout:none/);assert.match(css,/\.garden-shell input,\.garden-shell textarea,[^{]+\{[^}]*user-select:text[^}]*-webkit-touch-callout:default/);assert.match(css,/\.garden-shell img,\.garden-shell canvas\s*\{[^}]*-webkit-user-drag:none/);
});
