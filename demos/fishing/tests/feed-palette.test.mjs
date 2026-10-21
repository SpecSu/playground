import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The scoped v0.2.0 stylesheet is authoritative over legacy global rules.
const stylesheet = (await readFile(new URL('../components/FeedInterface.css', import.meta.url), 'utf8')).replace(/\s+/g, '');

test('approved feed accent and selected controls use neutral white over charcoal', () => {
  assert.match(stylesheet, /--accent:#ffffff[;}]/);
  assert.match(stylesheet, /\.feed-v020\.feed-window\{[^}]*--lime:#fff[;}]/);
  assert.match(stylesheet, /\.option-card\.selected\{[^}]*background:#ffffff10/);
  assert.doesNotMatch(stylesheet, /#cbff68|#d8ff8e|#e0ffaf|#b9d45c|#616935/i);
});

test('local like color is distinct without changing shared stage lighting', () => {
  assert.match(stylesheet, /\.feed-like\[aria-pressed="true"\]svg\{color:#ff5a7f/);
  for (const mode of ['neon', 'sunset', 'ice', 'ember', 'acid', 'moon']) assert.ok(stylesheet.includes(`.swatch-${mode}`));
});

test('stage startup surface matches the dark interface and keeps loading text readable', async () => {
  const scene = await readFile(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
  assert.match(stylesheet, /\.club-stage\{[^}]*background:#111215/);
  assert.match(scene, /background: '#111215'/);
  assert.doesNotMatch(scene, /#d5caee|#675a7c/);
});

test('all avatar picker choices share equal three-column rows', () => {
  assert.match(stylesheet, /\.avatar-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);?\}/);
  assert.doesNotMatch(stylesheet, /\.avatar-option(?:-human)?[^{}]*\{[^}]*grid-column/);
});
