import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../components/DesertFeed.css', import.meta.url), 'utf8');
const feed = readFileSync(new URL('../components/DesertFeed.tsx', import.meta.url), 'utf8');

test('Festival chat uses the agreed placeholder in its only inline composer', () => {
  assert.equal((feed.match(/placeholder="说点什么\.\.\."/g) ?? []).length, 1);
  assert.doesNotMatch(feed, /说句话，和大家打个招呼/);
});

test('Festival input focus and tap resets override shared rules without blocking editing', () => {
  assert.match(css, /\.feed-v020\.desert-feed,\.feed-v020\.desert-feed \*\{-webkit-tap-highlight-color:transparent\}/);
  assert.match(css, /\.feed-v020\.desert-feed :is\(input,textarea,select\):focus,\s*\.feed-v020\.desert-feed :is\(input,textarea,select\):focus-visible\{outline:none;box-shadow:none\}/);
  assert.doesNotMatch(css, /user-select:none|caret-color:transparent|festival-chat-field:focus-within/);
});

test('mouse focus is quiet and keyboard focus remains subtle without clearing selected outlines', () => {
  assert.match(css, /:is\(button,a,\[tabindex\]\):focus:not\(:focus-visible\):not\(\.selected\)\{outline:none\}/);
  assert.match(css, /:is\(button,a,\[tabindex\]\):focus-visible:not\(\.selected\)\{outline:1px solid #ead7be80;outline-offset:2px\}/);
  assert.match(css, /\.installation-card\.selected\{[^}]*outline:1px solid var\(--art-color\)/);
  assert.match(css, /\.installation-card:focus-visible:not\(\.selected\)/);
  assert.match(css, /canvas:focus,\.feed-v020\.desert-feed canvas:focus-visible\{outline:none\}/);
});

test('active chat keeps the idle translucent field without an opaque keyboard plate', () => {
 assert.match(css,/\.chat-is-focused \.festival-chat\{[^}]*background:transparent[^}]*box-shadow:none/);
 assert.match(css,/\.chat-is-focused \.festival-chat-field\{height:44px\}/);
 assert.match(css,/\.festival-chat-field\{[^}]*background:rgba\(24,14,8,\.72\)/);
});

test('only the chat field background and send button adopt warm desert colors',()=>{
 assert.match(css,/\.festival-chat-field\{[^}]*background:rgba\(24,14,8,\.72\)[^}]*color:#ffffff/);
 assert.match(css,/\.festival-chat-send\{[^}]*width:28px;height:28px[^}]*background:#ead4b2;color:#4b3423/);
 assert.match(css,/\.festival-chat-send:disabled\{background:#80664e;color:#ffffff;opacity:1/);
 assert.match(css,/\.festival-chat input\{[^}]*color:#ffffff;caret-color:#ffffff;background:transparent/);
 assert.match(css,/input::placeholder\{color:rgba\(255,255,255,\.68\)/);
 assert.match(css,/\.festival-chat-cancel\{[^}]*color:#ffffff;background:rgba\(8,18,24,\.72\)/);
});
