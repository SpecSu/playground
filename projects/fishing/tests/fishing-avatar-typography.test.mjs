import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const feed = read('components/fishing/FishingFeed.tsx'), css = read('components/fishing/FishingFeed.css');

test('avatar names have dedicated 12px labels instead of inheriting the legacy 30px emoji span rule', () => {
  assert.match(read('app/globals.css'), /\.avatar-option>span\{font-size:30px/);
  assert.match(feed, /<span className="fishing-avatar-label">\{a\.label\}<\/span>/);
  assert.match(css, /\.feed-v020 \.fishing-sheet \.avatar-option>\.fishing-avatar-label\{[^}]*font-size:12px;[^}]*line-height:16px/);
  assert.match(css, /\.feed-v020 \.fishing-sheet \.avatar-option>\.option-icon\{[^}]*font-size:29px/);
});

test('fishing avatar picker explicitly bounds heading, input and field typography', () => {
  assert.match(css, /\.feed-v020 \.fishing-sheet \.sheet-heading h2\{[^}]*font-size:18px;[^}]*line-height:26px/);
  assert.match(css, /\.feed-v020 \.fishing-sheet \.nickname-input\{[^}]*font-size:14px/);
  assert.match(css, /\.feed-v020 \.fishing-sheet \.field-label\{[^}]*font-size:11px/);
});
