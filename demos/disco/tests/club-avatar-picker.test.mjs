import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('join sheet places the nickname label and input before the avatar grid in DOM and keyboard order', async () => {
  const source = await readFile(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
  const form = source.match(/<form onSubmit=\{join\} className="join-form">([\s\S]*?)<\/form>/)?.[1];
  assert.ok(form, 'The join/profile form exists');
  const labelIndex = form.indexOf('htmlFor="nickname"');
  const inputIndex = form.indexOf('id="nickname"');
  const gridIndex = form.indexOf('className="avatar-options option-grid avatar-grid"');
  assert.ok(labelIndex >= 0 && labelIndex < inputIndex);
  assert.ok(inputIndex < gridIndex, 'A mobile visitor can enter a nickname before scrolling through avatars');
  assert.ok(form.includes('maxLength={24} aria-required="true" autoComplete="nickname" pattern="[^<>]+"'));
  assert.ok(form.includes('<small>{avatar.label}</small>'), 'Cards show only the requested name under the portrait');
});

test('the twelve choices fit a three-column four-row grid with breathing room below the nickname', async () => {
  const css = await readFile(new URL('../components/FeedInterface.css', import.meta.url), 'utf8');
  assert.match(css, /\.feed-v020 \.avatar-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\.avatar-option(?:-human)?[^{}]*\{[^}]*grid-column/);
  assert.match(css, /\.feed-v020 \.nickname-input\s*\{[^}]*margin-bottom:\s*16px/);
});
