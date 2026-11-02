import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('mobile browser chrome matches root and safe-area shell without a colored band',()=>{
 const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(layout,/themeColor: '#0c0d0f'/);
 assert.match(css,/html,body\{[^}]*background:#0c0d0f/);
 assert.match(css,/@media\(max-width:699px\)\{html body \.app-shell\.app-shell-v020\{background:#0c0d0f\}\}/);
 assert.match(layout,/maximumScale: 5/);
});
