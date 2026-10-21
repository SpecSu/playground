import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync(new URL('../components/FeedActionIcon.tsx', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const context = vm.createContext({ exports: {}, require: createRequire(import.meta.url) });
vm.runInContext(javascript, context);
const render = (kind, group = false) => renderToStaticMarkup(createElement(context.exports.default, { kind, group }));

test('spin uses clean paired circular arrows instead of the crossed hand-written rectangle', () => {
  const icon = render('spin');
  assert.match(icon, /lucide-refresh-cw/);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.doesNotMatch(icon, /M21 8H7l3-3/);
});

test('backflip uses one clear backward rotation with no crowded body inside the arrow', () => {
  const icon = render('wave');
  assert.match(icon, /lucide-rotate-ccw/);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.doesNotMatch(icon, /<circle/);
});

test('replacing personal icons leaves the separate group wave and other artwork unchanged', () => {
  const wave = render('wave', true);
  assert.match(wave, /viewBox="0 0 26 26"/);
  assert.match(wave, /M3 7c4-6/);
  for (const [kind, group] of [['dance', false], ['bounce', false], ['train', true], ['unison', true], ['battle', true], ['grid', true]]) {
    assert.match(render(kind, group), /aria-hidden="true"/);
    assert.match(render(kind, group), /<path/);
  }
});
