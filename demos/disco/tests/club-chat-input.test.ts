import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanChatDraft, isChatSendKey, canSubmitChat } from '../lib/club-chat-input.ts';

test('single-line drafts cap Unicode code points without breaking astral emoji', () => {
  assert.equal(cleanChatDraft('hi\nthere\r\nfriend\t!'), 'hi there friend !');
  assert.equal([...cleanChatDraft('🐸'.repeat(81))].length, 80);
  assert.equal(cleanChatDraft('👩‍💻').includes('\u200d'), true);
});
test('Enter and mobile submit respect IME state, keyCode 229 and composition-end delay', () => {
  const key = { key: 'Enter', isComposing: false, keyCode: 13, shiftKey: false };
  assert.equal(isChatSendKey(key, false, 1000, 0), true);
  for (const event of [{ ...key, isComposing: true }, { ...key, keyCode: 229 }, { ...key, shiftKey: true }, { ...key, key: 'a' }]) assert.equal(isChatSendKey(event, false, 1000, 0), false);
  assert.equal(isChatSendKey(key, true, 1000, 0), false);
  assert.equal(isChatSendKey(key, false, 1199, 1000), false);
  assert.equal(isChatSendKey(key, false, 1200, 1000), true);
});
test('membership, connection, in-flight and whitespace prevent sending', () => {
  const state = { joined: true, ready: true, pending: false, composing: false, now: 1000, lastCompositionEnd: 0, text: 'hello' };
  assert.equal(canSubmitChat(state), true);
  for (const change of [{ joined: false }, { ready: false }, { pending: true }, { composing: true }, { text: '  \n ' }, { text: '\u200d\u200c' }, { lastCompositionEnd: 900 }]) assert.equal(canSubmitChat({ ...state, ...change }), false);
});

test('clipboard insertion preserves word separation before native single-line sanitization', async () => {
  const { pasteChatDraft } = await import('../lib/club-chat-input.ts');
  assert.equal(typeof pasteChatDraft, 'function');
  assert.deepEqual(pasteChatDraft('hello world',6,11,'line one\r\nline two'), {text:'hello line one line two',caret:23});
  assert.deepEqual(pasteChatDraft('a🐸z',1,3,'<b>hi</b>\nthere'), {text:'a<b>hi</b> therez',caret:16});
  const long = pasteChatDraft('🐸'.repeat(80),0,0,'hello\n');
  assert.equal([...long.text].length,80);
  assert.equal(long.caret,6);
});
